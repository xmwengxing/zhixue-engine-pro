import { QuestionType } from '@prisma/client';
import * as mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { aiServiceManager } from './aiServiceManager';
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
const NormalizedListSchema = z.array(NormalizedQuestionSchema);

// ============ 解析层（OCR+大模型两段式的"第一段"：提取文本/版面） ============

/**
 * 从上传文件中提取纯文本。
 * - docx: mammoth 提取正文
 * - pdf(数字版): pdf-parse 提取文本层
 * - txt/md: 直接读取
 * - 图片: 走 OCR 抽象层（当前未接入视觉模型，给出可操作提示）
 */
export async function extractText(file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.docx') {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return value;
  }
  if (ext === '.pdf') {
    const data = await pdfParse(file.buffer);
    return data.text || '';
  }
  if (['.txt', '.text', '.md', '.markdown'].includes(ext)) {
    return file.buffer.toString('utf-8');
  }
  if (['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'].includes(ext)) {
    return ocrFromImage(file);
  }
  // 未知类型：尝试按文本读
  return file.buffer.toString('utf-8');
}

/**
 * OCR 抽象层：扫描件/图片 → 文本。
 * 当前为可插拔接口，默认实现需要配置视觉模型/商业 OCR。
 * 环境变量 OCR_PROVIDER 可用于切换实现（预留）。
 */
async function ocrFromImage(_file: Express.Multer.File): Promise<string> {
  const provider = process.env.OCR_PROVIDER;
  if (provider && provider !== 'none') {
    // TODO: 接入腾讯云/百度 OCR 或视觉大模型，将图片转为文本
    throw new Error(
      `已配置 OCR_PROVIDER=${provider}，但对应实现尚未接入。请实现 ocrProvider 后重试。`
    );
  }
  throw new Error(
    '图片/扫描件 OCR 暂未接入（需配置 OCR/视觉模型）。请改用 docx/PDF/纯文本导入，或在导入页粘贴题目文本。'
  );
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
    maxTokens: 4000,
    systemPrompt:
      '你是题库结构化抽取引擎，只输出符合要求的 JSON 数组，不要任何额外文字。',
  });

  // 容错：剥离可能的 markdown 代码块与前后说明
  const cleaned = extractJsonArray(raw);
  const parsed = NormalizedListSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error('LLM 返回结构校验失败：' + parsed.error.message);
  }
  return parsed.data.map((q) => ({
    ...q,
    config: buildAnswerConfig(q),
  }));
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
  // 截取第一个 [ 到最后一个 ]
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start >= 0 && end > start) {
    s = s.slice(start, end + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    throw new Error('无法从 LLM 响应中解析出 JSON 数组');
  }
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
  unitIds?: string[];
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
    unitIds: params.unitIds,
  }).catch((e) => {
    console.error('试卷导入处理失败:', e);
    void updateImportJob(job.id, { status: 'FAILED', error: String(e.message || e) });
  });

  return { jobId: job.id, fileName: safeName };
}

async function processImport(
  jobId: string,
  file: Express.Multer.File,
  subject: string,
  opts?: { textbookId?: string; paperType?: string; unitIds?: string[] }
): Promise<void> {
  // 1) 解析/ OCR 提取文本
  let rawText: string;
  try {
    rawText = await extractText(file);
  } catch (e: any) {
    await updateImportJob(jobId, { status: 'FAILED', error: e.message });
    return;
  }
  await updateImportJob(jobId, { rawText });

  // 2) LLM 归一化
  let normalized: NormalizedQuestion[];
  try {
    normalized = await normalizeWithLLM(subject, rawText);
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
    paperType: (opts?.paperType as any) || 'UNIT',
    unitIds: opts?.unitIds,
  });
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
