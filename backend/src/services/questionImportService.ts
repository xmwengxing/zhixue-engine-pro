import { QuestionType } from '@prisma/client';
import * as mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { aiServiceManager } from './aiServiceManager';
import { adminOcrService } from './adminOcrService';
import { callVisionApi } from './ocrVisionClient';
import type { OcrProvider } from '@prisma/client';
import {
  createImportJob,
  updateImportJob,
  getImportJob,
  createQuestionsFromNormalized,
  createPaper,
  NormalizedQuestion,
} from './questionBankService';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'question-bank');

// 标准题元 schema（强制 LLM 输出结构）
const TYPE_VALUES = Object.values(QuestionType) as [string, ...string[]];
const NormalizedQuestionSchema = z.object({
  type: z.enum(TYPE_VALUES as [QuestionType, ...QuestionType[]]),
  stem: z.string().min(1),
  options: z.array(z.string()).optional(),
  answer: z.string().min(1),
  analysis: z.string().optional(),
  difficulty: z.number().int().min(1).max(5),
  knowledgePoints: z.array(z.string()),
  score: z.number().optional(),
});

// ============ 解析层（OCR+大模型两段式的"第一段"：提取文本/版面） ============

/**
 * 从上传文件中提取纯文本。
 * - docx: mammoth 提取正文
 * - pdf(数字版): pdf-parse 提取文本层
 * - txt/md: 直接读取
 * - 图片 / 扫描版 PDF: 走 OCR 抽象层（优先使用管理端配置的 OCR 服务商，否则回退环境变量）
 *
 * @param provider 管理端解析出的 OCR 服务商（可为 null）。null 时回退 OCR_PROVIDER 环境变量行为。
 */
export async function extractText(
  file: Express.Multer.File,
  provider?: OcrProvider | null
): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.docx') {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return value;
  }
  if (ext === '.pdf') {
    const data = await pdfParse(file.buffer);
    const text = (data.text || '').trim();
    // 数字版 PDF 文本层充足；文本过少视为扫描件，转 OCR
    if (text.length < 50) {
      return ocrFromImage(file, provider);
    }
    return text;
  }
  if (['.txt', '.text', '.md', '.markdown'].includes(ext)) {
    return file.buffer.toString('utf-8');
  }
  if (['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'].includes(ext)) {
    return ocrFromImage(file, provider);
  }
  // 未知类型：尝试按文本读
  return file.buffer.toString('utf-8');
}

/** 题目切块正则：匹配「换行 + 数字序号 + 标点」的题首（兼容「1.【单选题】」与「1. 题干」两种格式） */
const QUESTION_SPLIT_RE = /(?=\n\s*\d{1,3}\s*[.、．]\s*)/;

/**
 * 试卷文本按题目切块（每块最多 maxPerBlock 题）。
 * 规避本地推理模型（如 Qwen3.5-9B）长文本归一化时"思考未结束即截断
 * （done_reason=length，输出全进 thinking，content 为空）"的健壮性问题。
 * - 题号切分成功：按题切块（说明/非题目块由 zod 校验丢弃，容错跳过）
 * - 题号切分失败（无题号标记/单块过大）：按字符分块兜底（尽量在换行处切）
 */
export function splitQuestionBlocks(text: string, maxPerBlock = 6, charChunk = 2400): string[] {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(QUESTION_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const blocks: string[] = [];
  if (parts.length >= 2) {
    for (let i = 0; i < parts.length; i += maxPerBlock) {
      blocks.push(parts.slice(i, i + maxPerBlock).join('\n'));
    }
  }
  if (blocks.length === 0) {
    // 字符分块兜底：尽量在换行处切，避免从句子中间断开
    for (let i = 0; i < trimmed.length; i += charChunk) {
      let end = Math.min(i + charChunk, trimmed.length);
      if (end < trimmed.length) {
        const nl = trimmed.lastIndexOf('\n', end);
        if (nl > i + charChunk * 0.6) end = nl;
      }
      const chunk = trimmed.slice(i, end).trim();
      if (chunk) blocks.push(chunk);
    }
  }
  return blocks;
}

/** 未配置视觉模型时的标准报错文案（与管理端导入提示一致） */
export const NO_VISION_MODEL_MESSAGE =
  '未配置视觉模型，无法识别图片/扫描件。请上传 .doc/.docx/.xlsx/.md/.txt 等文本格式或数字版（PDF）试卷。';

/**
 * OCR 抽象层：扫描件/图片 → 文本。
 * 1) 若传入管理端 provider，按其方式分派：
 *    - LOCAL_SERVICE：本地 Unlimited-OCR 推理服务
 *    - LOCAL_VISION：本地视觉模型（Ollama 原生 /api/chat）
 *    - CUSTOM_API：自定义厂商视觉模型（OpenAI 兼容 /chat/completions）
 * 2) 否则回退 OCR_PROVIDER 环境变量行为（兼容旧逻辑），未配置则抛出标准报错。
 */
async function ocrFromImage(
  file: Express.Multer.File,
  provider?: OcrProvider | null
): Promise<string> {
  if (provider) {
    if (provider.method === 'LOCAL_SERVICE') {
      return ocrViaLocalService(file, provider.endpoint);
    }
    // LOCAL_VISION / CUSTOM_API / BAIDU_OCR / PADDLE_OCR_VL：统一走视觉/文档解析接口
    return callVisionApi(provider, file.buffer, file.mimetype, undefined, 1000 * 60 * 10, file.originalname);
  }

  // 回退环境变量行为（兼容旧逻辑）
  const envProvider = process.env.OCR_PROVIDER;
  if (envProvider === 'local') {
    return ocrViaLocalService(file, process.env.OCR_ENDPOINT);
  }
  if (envProvider && envProvider !== 'none') {
    throw new Error(
      `已配置 OCR_PROVIDER=${envProvider}，但对应实现尚未接入。请实现后重试。`
    );
  }
  throw new Error(NO_VISION_MODEL_MESSAGE);
}

/**
 * 调用本地 OCR 推理服务（services/ocr-unlimited）。
 * 单图 → POST /ocr；PDF → POST /ocr-pdf。返回识别出的文本。
 */
async function ocrViaLocalService(
  file: Express.Multer.File,
  endpoint?: string
): Promise<string> {
  const base = (endpoint || process.env.OCR_ENDPOINT || 'http://localhost:8002').replace(/\/$/, '');
  const isPdf = path.extname(file.originalname).toLowerCase() === '.pdf';
  const url = `${base}${isPdf ? '/ocr-pdf' : '/ocr'}`;

  const form = new FormData();
  const blob = new Blob([file.buffer], {
    type: file.mimetype || 'application/octet-stream',
  });
  form.append('file', blob, file.originalname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000 * 60 * 10); // OCR 最多 10 分钟
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`本地 OCR 服务调用失败 ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as { text?: string; pages?: string[] };
    return (json.pages ? json.pages.join('\n\n') : json.text) || '';
  } finally {
    clearTimeout(timer);
  }
}

// ============ 归一化层（第二段：LLM 结构化） ============

function buildNormalizePrompt(subject: string, text: string): string {
  return `你是一名严谨的题库录入专家。下面是一份${subject}试卷的纯文本（可能含题干、选项、答案、解析）。
请将其拆分为独立题目，并严格输出一个 JSON 数组，不要输出任何解释文字，也不要用 markdown 代码块包裹。

每个题目对象的字段：
- type: 必须是以下之一：${TYPE_VALUES.join(', ')}
  （说明：CHOICE=单选, MULTIPLE_CHOICE=多选, JUDGE=判断, FILL=填空, FORMULA=含公式的计算/填空, GEOMETRY=几何作图, GRAPHING=函数绘图, PROOF=证明/说理, ESSAY=简答/作文, SORTING=排序, MATCHING=连线）
- stem: 题干文本（公式用 LaTeX 表示，例如 \\frac{1}{2}）
- options: 仅 CHOICE/MULTIPLE_CHOICE/JUDGE 需要；JUDGE 给 ["正确","错误"]；选项写成 "A. xxx" 形式
- answer: 标准答案。CHOICE 用选项字母如 "A"；MULTIPLE_CHOICE 用 "A,C"；JUDGE 用 "正确" 或 "错误"；其余用答案文本（公式用 LaTeX）
- analysis: 解析（可选）
- difficulty: 1-5 的整数
- knowledgePoints: 知识点字符串数组（至少 1 个）
- score: 分值（可选，数字）

示例：
[
  {"type":"CHOICE","stem":"1+1=?", "options":["A. 1","B. 2","C. 3"],"answer":"B","analysis":"基础加法","difficulty":1,"knowledgePoints":["加法"],"score":5}
]

试卷文本：
"""
${text}
"""`;
}

/**
 * 调用 LLM 将文本归一化为标准题元数组，并做 zod 校验。
 */
export async function normalizeWithLLM(
  subject: string,
  text: string
): Promise<NormalizedQuestion[]> {
  const prompt = buildNormalizePrompt(subject, text);
  const raw = await aiServiceManager.callAI(prompt, {
    temperature: 0.2,
    // 输出预算给足，避免推理模型把最终 JSON 截进 thinking 导致 content 为空。
    maxTokens: 6000,
    // 抽取走独立 provider（本地 Qwen 等指令模型，稳定输出 JSON），
    // 与智能体对话用的推理模型解耦。该 provider 不存在时回退到默认故障转移。
    providerName: process.env.IMPORT_EXTRACT_PROVIDER || 'Ollama-Qwen-Extract',
    // 本地小模型（如 1080 Ti 上的 9B Q6_K）单块生成可能需 1~4 分钟，
    // 故放大超时到 5 分钟；关闭重试（慢生成重试只会重复耗时，无意义）。
    timeout: 300000,
    maxRetries: 1,
    systemPrompt:
      '你是题库结构化抽取引擎，只输出符合要求的 JSON 数组，不要任何额外文字。',
  });

  // 容错：剥离可能的 markdown 代码块与前后说明，定位 JSON 数组
  const cleaned = extractJsonArray(raw);
  const list = Array.isArray(cleaned) ? cleaned : [cleaned];

  // 单题级容错：逐题校验，丢弃畸形项、保留合法题，避免一道格式错误拖垮整份试卷。
  // （推理模型偶尔会把某题输出成字符串/缺字段，整体抛错会损失其余题目。）
  const ok: NormalizedQuestion[] = [];
  const bad: string[] = [];
  for (const item of list) {
    const r = NormalizedQuestionSchema.safeParse(item);
    if (r.success) {
      ok.push({ ...r.data, config: buildAnswerConfig(r.data) });
    } else {
      bad.push(typeof item === 'string' ? item.slice(0, 40) : JSON.stringify(item).slice(0, 40));
    }
  }

  if (ok.length === 0) {
    throw new Error('LLM 返回结构校验失败：' + (bad[0] || '无合法题目'));
  }
  if (bad.length > 0) {
    console.warn(`[import] 归一化跳过 ${bad.length} 道畸形题，保留 ${ok.length} 道：`, bad.slice(0, 3));
  }
  return ok;
}

function buildAnswerConfig(q: z.infer<typeof NormalizedQuestionSchema>): Record<string, unknown> {
  if (q.type === 'CHOICE' || q.type === 'MULTIPLE_CHOICE') {
    return { options: q.options ?? [], correct: q.answer };
  }
  if (q.type === 'JUDGE') {
    return { options: q.options ?? ['正确', '错误'], correct: q.answer };
  }
  if (q.type === 'FORMULA' || q.type === 'GEOMETRY' || q.type === 'GRAPHING') {
    return { expectedLatex: q.answer };
  }
  return {};
}

function extractJsonArray(raw: string): unknown {
  let s = raw.trim();
  // 去掉 ```json ... ``` 包裹
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // 平衡括号扫描：从每个 '[' 出发找其匹配 ']'，尝试解析；
  // 优先返回首个能成功 JSON.parse 的数组。这样即使推理模型的思维链里
  // 混有 "[A]"、"选项[正确]" 之类的假括号，也能准确命中真正的题目 JSON 数组。
  // 同时兼容答案落在 reasoning 字段（content 为空）的情况。
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '[') continue;
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          const candidate = s.slice(i, j + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed)) return parsed;
          } catch {
            // 不是合法数组，继续往下找
          }
          break;
        }
      }
    }
  }

  // 兜底：直接整段解析
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* ignore */
  }
  throw new Error('无法从 LLM 响应中解析出 JSON 数组');
}

// ============ 导入任务编排 ============

export interface StartImportResult {
  jobId: string;
  fileName: string;
}

/**
 * 启动一次试卷导入：保存原件 → 建任务 → 异步解析+归一化。
 */
export async function startImport(params: {
  file: Express.Multer.File;
  subject: string;
  createdBy: string;
  textbookId?: string;
  paperType?: string;
  category?: 'EXERCISE' | 'ASSESSMENT';
  unitIds?: string[];
  ocrProviderId?: string;
  categoryId?: string; // 目标目录节点（V2 文件夹导入）
}): Promise<StartImportResult> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const safeName = `${Date.now()}_${params.file.originalname.replace(/[^\w.\-一-龥]/g, '_')}`;
  await fs.writeFile(path.join(UPLOAD_DIR, safeName), params.file.buffer);

  const job = await createImportJob({
    subject: params.subject,
    fileName: safeName,
    createdBy: params.createdBy,
    status: 'PROCESSING',
  });

  // 异步处理，不阻塞上传响应
  void processImport(job.id, params.file, params.subject, {
    textbookId: params.textbookId,
    paperType: params.paperType,
    category: params.category,
    unitIds: params.unitIds,
    ocrProviderId: params.ocrProviderId,
    categoryId: params.categoryId,
  }).catch((e) => {
    console.error('试卷导入处理失败:', e);
    void updateImportJob(job.id, { status: 'FAILED', error: String(e.message || e) });
  });

  return { jobId: job.id, fileName: safeName };
}

/**
 * 文件夹导入（V2）：多文件 + 相对路径 → 自动生成目录树 → 每文件建子任务
 * - 立即返回全部 jobId（不阻塞上传请求）
 * - 后台**串行**处理（本地 Ollama 归一化无法承受多文件并发分块，并发必 fetch failed）
 */
export async function startFolderImport(params: {
  files: Express.Multer.File[];
  paths: string[]; // 与 files 对应的相对路径（可缺省）
  subject: string;
  createdBy: string;
  textbookId?: string;
  paperType?: string;
  category?: 'EXERCISE' | 'ASSESSMENT';
  ocrProviderId?: string;
}): Promise<{ jobIds: string[]; total: number; skipped: number }> {
  const { ensurePathCategories } = await import('./paperCategoryService');
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const RE = /\.(pdf|jpg|jpeg|png|bmp|tif|tiff|ofd|doc|docx|txt|wps|ppt|pptx)$/i;
  const queue: Array<{ file: Express.Multer.File; categoryId?: string }> = [];
  const jobIds: string[] = [];
  let skipped = 0;

  // 第一遍：建目录 + 建 job + 落盘（同步，立即返回）
  for (let i = 0; i < params.files.length; i++) {
    const file = params.files[i];
    if (!RE.test(file.originalname || '')) {
      skipped++;
      continue;
    }
    const rel = params.paths[i] ? params.paths[i].replace(/\\/g, '/') : '';
    const segs = rel ? rel.split('/').filter((s) => s && s.trim()).slice(0, -1) : [];
    let categoryId: string | undefined;
    if (segs.length > 0) {
      const node = await ensurePathCategories(params.subject, segs);
      categoryId = node?.id;
    }
    const safeName = `${Date.now()}_${file.originalname.replace(/[^\w.\-一-龥]/g, '_')}`;
    await fs.writeFile(path.join(UPLOAD_DIR, safeName), file.buffer);
    const job = await createImportJob({
      subject: params.subject,
      fileName: safeName,
      createdBy: params.createdBy,
      status: 'PROCESSING',
    });
    jobIds.push(job.id);
    queue.push({ file, categoryId });
  }

  // 第二遍：后台串行处理（不阻塞响应）
  void (async () => {
    for (let i = 0; i < queue.length; i++) {
      const { file, categoryId } = queue[i];
      const jobId = jobIds[i];
      try {
        await processImport(jobId, file, params.subject, {
          textbookId: params.textbookId,
          paperType: params.paperType,
          category: params.category,
          ocrProviderId: params.ocrProviderId,
          categoryId,
        });
      } catch (e: any) {
        console.error('文件夹导入单文件处理失败:', e);
        await updateImportJob(jobId, { status: 'FAILED', error: String(e.message || e) }).catch(() => {});
      }
    }
  })();

  return { jobIds, total: params.files.length, skipped };
}

async function processImport(
  jobId: string,
  file: Express.Multer.File,
  subject: string,
  opts?: {
    textbookId?: string;
    paperType?: string;
    category?: 'EXERCISE' | 'ASSESSMENT';
    unitIds?: string[];
    ocrProviderId?: string;
    categoryId?: string;
  }
): Promise<void> {
  // 解析管理端配置的 OCR 服务商（优先指定 id，否则取默认；无则返回 null → 回退 env 或报错）
  const ocrProvider = await adminOcrService.resolveForImport(opts?.ocrProviderId);

  // 1) 解析/ OCR 提取文本
  let rawText: string;
  try {
    rawText = await extractText(file, ocrProvider);
  } catch (e: any) {
    await updateImportJob(jobId, { status: 'FAILED', error: e.message });
    return;
  }
  await updateImportJob(jobId, { rawText });

  // 2) LLM 归一化（分块执行，规避本地推理模型长文本思考截断；坏块跳过，保留合法题）
  let normalized: NormalizedQuestion[] = [];
  try {
    const blocks = splitQuestionBlocks(rawText);
    let badBlocks = 0;
    for (const [i, block] of blocks.entries()) {
      try {
        const part = await normalizeWithLLM(subject, block);
        normalized = normalized.concat(part);
        console.log(`[import] 分块 ${i + 1}/${blocks.length} 归一化完成：${part.length} 题`);
      } catch (e: any) {
        badBlocks += 1;
        console.warn(`[import] 分块 ${i + 1}/${blocks.length} 归一化失败（跳过该块）:`, e.message);
      }
    }
    if (normalized.length === 0) {
      throw new Error(
        `AI 归一化失败：${blocks.length} 个分块均未产出合法题目${badBlocks ? `（${badBlocks} 块失败）` : ''}（原文已保留，可手动录入题目）`
      );
    }
  } catch (e: any) {
    // 解析成功但归一化失败：保留原文，等待人工录入
    await updateImportJob(jobId, {
      status: 'FAILED',
      error: 'AI 归一化失败：' + e.message + '（原文已保留，可手动录入题目）',
    });
    return;
  }

  // 3) 建卷 + 建题 + 关联
  const paperTitle = `${subject}导入卷 ${new Date().toLocaleDateString('zh-CN')}`;
  const paper = await createPaper({
    subject,
    title: paperTitle,
    createdBy: (await getImportJob(jobId))?.createdBy ?? 'system',
    sourceFile: (await getImportJob(jobId))?.fileName,
    textbookId: opts?.textbookId,
    paperType: ((): 'UNIT' | 'MIDTERM' | 'FINAL' | 'ZHONGKAO' | 'GAOKAO' => {
      const v = opts?.paperType;
      return v && ['UNIT', 'MIDTERM', 'FINAL', 'ZHONGKAO', 'GAOKAO'].includes(v) ? (v as any) : 'UNIT';
    })(),
    category: opts?.category === 'ASSESSMENT' ? 'ASSESSMENT' : 'EXERCISE',
    unitIds: opts?.unitIds,
  });
  // 目录关联（V2）：移动/挂载到目录并同步 category 字段（初测目录 → ASSESSMENT）
  if (opts?.categoryId) {
    const { syncPaperCategoryField } = await import('./paperCategoryService');
    await syncPaperCategoryField(paper.id, opts.categoryId);
  }
  const created = await createQuestionsFromNormalized(
    subject,
    normalized,
    paper.id,
    0,
    { textbookId: opts?.textbookId, unitIds: opts?.unitIds }
  );

  await updateImportJob(jobId, {
    status: 'DONE',
    result: normalized as any,
    paperId: paper.id,
  });
  console.log(`导入完成：试卷 ${paper.id}，共 ${created.length} 题`);
}

export { getImportJob, updateImportJob };
