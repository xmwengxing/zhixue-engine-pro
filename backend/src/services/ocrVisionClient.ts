import { OcrMethod } from '@prisma/client';

export interface VisionProviderLike {
  method: OcrMethod;
  endpoint: string;
  apiKey?: string | null;
  model?: string | null;
  extra?: any; // BAIDU_OCR: {secretKey, ocrType}；PADDLE_OCR_VL: {useDocOrientationClassify,useDocUnwarping,useChartRecognition}
}

/** 统一的图片→文本提示词（题目/公式/手写转录） */
export const OCR_PROMPT =
  '请识别并完整转录图片中的所有题目文字、公式与手写内容，保持原有排版顺序，直接输出文本，不要解释、不要使用 markdown 代码块。';

// 1x1 白色 PNG，仅用于连通性测试（模型能返回描述即视为可用）
const TEST_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// ==================== 百度智能云 OAuth token 缓存（有效期约 30 天，提前 1 天刷新） ====================
const BAIDU_TOKEN_CACHE = new Map<string, { token: string; expiresAt: number }>();

async function getBaiduAccessToken(apiKey: string, secretKey: string): Promise<string> {
  const cacheKey = `${apiKey}:${secretKey}`;
  const cached = BAIDU_TOKEN_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 86400000) return cached.token;
  const url =
    `https://aip.baidubce.com/oauth/2.0/token` +
    `?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`百度 access_token 获取失败 ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as any;
  if (!json.access_token) {
    throw new Error(`百度 access_token 获取失败: ${JSON.stringify(json).slice(0, 200)}`);
  }
  const expiresIn = Number(json.expires_in) || 2592000;
  BAIDU_TOKEN_CACHE.set(cacheKey, { token: json.access_token, expiresAt: Date.now() + expiresIn * 1000 });
  return json.access_token;
}

/**
 * 百度智能云官方 OCR API（文档解析 Unlimited-OCR，异步任务式）
 * 流程：换 access_token → 提交 task（file_data base64 + file_name）→ 轮询 query → 下载 markdown_url
 */
async function callBaiduOcr(
  provider: VisionProviderLike,
  imageBuffer: Buffer,
  mime: string,
  fileName: string
): Promise<string> {
  const apiKey = provider.apiKey || '';
  const secretKey = provider.extra?.secretKey || '';
  if (!apiKey || !secretKey) throw new Error('百度智能云 OCR 需要配置 API Key 与 Secret Key');
  const token = await getBaiduAccessToken(apiKey, secretKey);
  const base = 'https://aip.baidubce.com/rest/2.0/brain/online/v2/unlimited-ocr-parser';
  const name = fileName && /\.(pdf|jpg|jpeg|png|bmp|tif|tiff|ofd|doc|docx|txt|wps|ppt|pptx)$/i.test(fileName)
    ? fileName
    : `ocr_${Date.now()}.${mime === 'application/pdf' ? 'pdf' : 'png'}`;

  // 1) 提交任务
  const submit = await fetch(`${base}/task?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      file_data: imageBuffer.toString('base64'),
      file_name: name,
    }).toString(),
  });
  if (!submit.ok) {
    const t = await submit.text().catch(() => '');
    throw new Error(`百度文档解析提交失败 ${submit.status}: ${t.slice(0, 200)}`);
  }
  const sj = (await submit.json()) as any;
  const taskId = sj?.result?.task_id;
  if (!taskId) {
    throw new Error(`百度文档解析提交失败: ${JSON.stringify(sj).slice(0, 200)}`);
  }

  // 2) 轮询任务结果（提交后 5~10 秒开始查询；总超时 10 分钟）
  const deadline = Date.now() + 10 * 60 * 1000;
  const firstWait = 6000;
  await new Promise((r) => setTimeout(r, firstWait));
  while (Date.now() < deadline) {
    const q = await fetch(`${base}/task/query?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ task_id: taskId }).toString(),
    });
    if (q.ok) {
      const qj = (await q.json()) as any;
      const st = qj?.result?.status;
      if (st === 'success') {
        const mdUrl = qj?.result?.markdown_url;
        if (!mdUrl) throw new Error('百度文档解析成功但未返回 markdown_url');
        const md = await fetch(mdUrl);
        if (!md.ok) throw new Error(`百度结果下载失败 ${md.status}`);
        const text = await md.text();
        if (!text.trim()) throw new Error('百度文档解析结果为空');
        return text;
      }
      if (st === 'failed') {
        throw new Error(`百度文档解析失败: ${qj?.result?.task_error || '未知错误'}`);
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('百度文档解析超时（10 分钟）');
}

/**
 * 飞桨 PaddleOCR-VL 异步任务 API
 * 流程：提交 job（multipart file + model）→ 轮询 jobId → done 取 resultUrl.jsonUrl → 下载 jsonl 解析 markdown 文本
 */
async function callPaddleOcrVl(
  provider: VisionProviderLike,
  imageBuffer: Buffer,
  mime: string,
  fileName: string
): Promise<string> {
  const token = provider.apiKey || '';
  if (!token) throw new Error('飞桨 PaddleOCR-VL 需要配置 Token');
  const model = provider.extra?.model || provider.model || 'PaddleOCR-VL-1.6';
  const jobUrl = (provider.endpoint || 'https://paddleocr.aistudio-app.com').replace(/\/$/, '') + '/api/v2/ocr/jobs';
  const headers: Record<string, string> = { Authorization: `bearer ${token}` };
  const optionalPayload = {
    useDocOrientationClassify: provider.extra?.useDocOrientationClassify ?? false,
    useDocUnwarping: provider.extra?.useDocUnwarping ?? false,
    useChartRecognition: provider.extra?.useChartRecognition ?? false,
  };

  // 1) 提交 job（本地文件模式 multipart）
  const form = new FormData();
  const name = fileName && fileName.trim() ? fileName : `ocr_${Date.now()}.${mime === 'application/pdf' ? 'pdf' : 'png'}`;
  form.append('file', new Blob([imageBuffer], { type: mime }), name);
  form.append('model', model);
  form.append('optionalPayload', JSON.stringify(optionalPayload));
  const submit = await fetch(jobUrl, { method: 'POST', headers, body: form });
  if (!submit.ok) {
    const t = await submit.text().catch(() => '');
    throw new Error(`PaddleOCR-VL 提交失败 ${submit.status}: ${t.slice(0, 200)}`);
  }
  const sj = (await submit.json()) as any;
  const jobId = sj?.data?.jobId;
  if (!jobId) {
    throw new Error(`PaddleOCR-VL 提交失败: ${JSON.stringify(sj).slice(0, 200)}`);
  }

  // 2) 轮询 job 状态（每 5 秒；总超时 10 分钟）
  const deadline = Date.now() + 10 * 60 * 1000;
  let jsonlUrl = '';
  while (Date.now() < deadline) {
    const r = await fetch(`${jobUrl}/${jobId}`, { headers });
    if (r.ok) {
      const j = (await r.json()) as any;
      const state = j?.data?.state;
      if (state === 'done') {
        jsonlUrl = j?.data?.resultUrl?.jsonUrl || j?.data?.resultUrl?.jsonlUrl || '';
        break;
      }
      if (state === 'failed') {
        throw new Error(`PaddleOCR-VL 任务失败: ${j?.data?.errorMsg || '未知错误'}`);
      }
    }
    await new Promise((r2) => setTimeout(r2, 5000));
  }
  if (!jsonlUrl) throw new Error('PaddleOCR-VL 任务超时（10 分钟）');

  // 3) 下载 jsonl 并解析 markdown 文本（每页 layoutParsingResults[].markdown.text）
  const dl = await fetch(jsonlUrl);
  if (!dl.ok) throw new Error(`PaddleOCR-VL 结果下载失败 ${dl.status}`);
  const lines = (await dl.text()).split('\n').filter((l) => l.trim());
  const pages: string[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const results = obj?.result?.layoutParsingResults;
      if (Array.isArray(results)) {
        for (const res of results) {
          const md = res?.markdown?.text;
          if (md && md.trim()) pages.push(md.trim());
        }
      }
    } catch {
      /* 忽略坏行 */
    }
  }
  if (pages.length === 0) throw new Error('PaddleOCR-VL 未解析到文本内容');
  return pages.join('\n\n');
}

function toDataUrl(buffer: Buffer, mime: string): string {
  return `data:${mime || 'image/png'};
${buffer.toString('base64')}`;
}

function withSuffix(endpoint: string, suffix: string): string {
  const e = endpoint.replace(/\/$/, '');
  return e.endsWith(suffix) ? e : `${e}${suffix}`;
}

/**
 * 调用视觉模型把图片转为文本。
 * - LOCAL_VISION：Ollama 原生 /api/chat（content + images[base64] + think:false）
 * - CUSTOM_API：OpenAI 兼容 /chat/completions（image_url data URL + Bearer）
 * - BAIDU_OCR：百度智能云官方 OCR（文档解析异步任务，需 extra.secretKey）
 * - PADDLE_OCR_VL：飞桨 PaddleOCR-VL（异步任务，需 apiKey=TOKEN）
 * - LOCAL_SERVICE：非视觉对话接口，调用方应走 OCR 服务，这里直接报错。
 */
export async function callVisionApi(
  provider: VisionProviderLike,
  imageBuffer: Buffer,
  mime: string,
  prompt: string = OCR_PROMPT,
  timeoutMs = 60000,
  fileName?: string
): Promise<string> {
  if (provider.method === 'LOCAL_SERVICE') {
    throw new Error('LOCAL_SERVICE 不是视觉对话接口，请使用 LOCAL_VISION 或 CUSTOM_API');
  }
  if (provider.method === 'BAIDU_OCR') {
    return callBaiduOcr(provider, imageBuffer, mime, fileName || '');
  }
  if (provider.method === 'PADDLE_OCR_VL') {
    return callPaddleOcrVl(provider, imageBuffer, mime, fileName || '');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (provider.method === 'LOCAL_VISION') {
      const url = withSuffix(provider.endpoint, '/api/chat');
      const body = {
        model: provider.model,
        messages: [{ role: 'user', content: prompt, images: [imageBuffer.toString('base64')] }],
        think: false,
        stream: false,
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`视觉模型调用失败 ${res.status}: ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as any;
      const text = json?.message?.content || json?.choices?.[0]?.message?.content || '';
      if (!text) throw new Error('视觉模型未返回文本内容');
      return text;
    }

    // CUSTOM_API：OpenAI 兼容视觉接口
    const url = withSuffix(provider.endpoint, '/chat/completions');
    const body = {
      model: provider.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: toDataUrl(imageBuffer, mime) } },
          ],
        },
      ],
      max_tokens: 2048,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey || ''}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`视觉模型调用失败 ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = (await res.json()) as any;
    const text = json?.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('视觉模型未返回文本内容');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export function getTestImage(): { buffer: Buffer; mime: string } {
  return { buffer: Buffer.from(TEST_PNG_B64, 'base64'), mime: 'image/png' };
}

export { getBaiduAccessToken };
