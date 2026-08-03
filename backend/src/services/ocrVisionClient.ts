import { OcrMethod } from '@prisma/client';

export interface VisionProviderLike {
  method: OcrMethod;
  endpoint: string;
  apiKey?: string | null;
  model?: string | null;
}

/** 统一的图片→文本提示词（题目/公式/手写转录） */
export const OCR_PROMPT =
  '请识别并完整转录图片中的所有题目文字、公式与手写内容，保持原有排版顺序，直接输出文本，不要解释、不要使用 markdown 代码块。';

// 1x1 白色 PNG，仅用于连通性测试（模型能返回描述即视为可用）
const TEST_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
 * - LOCAL_SERVICE：非视觉对话接口，调用方应走 OCR 服务，这里直接报错。
 */
export async function callVisionApi(
  provider: VisionProviderLike,
  imageBuffer: Buffer,
  mime: string,
  prompt: string = OCR_PROMPT,
  timeoutMs = 60000
): Promise<string> {
  if (provider.method === 'LOCAL_SERVICE') {
    throw new Error('LOCAL_SERVICE 不是视觉对话接口，请使用 LOCAL_VISION 或 CUSTOM_API');
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
