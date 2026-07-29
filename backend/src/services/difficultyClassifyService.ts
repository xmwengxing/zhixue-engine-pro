/**
 * AI 题目难度一键归类服务（P2）
 *
 * - 判定标准来自 AgentDocument（type=STANDARD, subject=数学/英语），管理端可编辑
 * - 后台批量任务：全量 / 仅未标注 / 按试卷范围
 * - 写回 Question.difficulty + difficultyMeta（理由/置信度/标准版本），低置信度进复核列表
 */
import { PrismaClient } from '@prisma/client';
import { aiServiceManager } from './aiServiceManager';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

export interface ClassifyJobInput {
  scope: 'ALL' | 'UNLABELED' | 'PAPER';
  subject?: string;  // 限定学科（ALL/UNLABELED 时建议给）
  paperId?: string;  // PAPER 范围必填
  startedBy: string;
}

export interface ClassifyJobState {
  id: string;
  scope: string;
  subject?: string;
  paperId?: string;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  total: number;
  processed: number;
  updated: number;
  lowConfidence: number;
  failed: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

// 单实例内存任务注册表（开发/单机部署够用）
const jobs = new Map<string, ClassifyJobState>();
let running = false;

export function getJob(id: string): ClassifyJobState | null {
  return jobs.get(id) ?? null;
}

export function listJobs(): ClassifyJobState[] {
  return [...jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

async function loadStandard(subject: string): Promise<{ content: string; version: number } | null> {
  const doc = await prisma.agentDocument.findFirst({
    where: { type: 'STANDARD', subject, enabled: true, title: { contains: '难度' } },
    orderBy: { priority: 'asc' },
  });
  if (doc) return { content: doc.content, version: doc.version };
  // 学科专属缺失时回退全局
  const global = await prisma.agentDocument.findFirst({
    where: { type: 'STANDARD', subject: null, enabled: true, title: { contains: '难度' } },
    orderBy: { priority: 'asc' },
  });
  return global ? { content: global.content, version: global.version } : null;
}

function extractJson(text: string): any {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

export async function startClassifyJob(input: ClassifyJobInput): Promise<ClassifyJobState> {
  if (running) throw new Error('已有归类任务在运行中，请稍后再试');
  if (input.scope === 'PAPER' && !input.paperId) throw new Error('按试卷归类需要 paperId');

  // 圈定题目范围
  const where: any = {};
  if (input.subject) where.materialNode = { name: input.subject, type: 'SUBJECT' };
  if (input.scope === 'UNLABELED') {
    // 未标注 = difficultyMeta 为空（导入时 difficulty 常被默认置 3，不可靠）
    where.difficultyMeta = { equals: null } as any;
  }
  if (input.scope === 'PAPER') {
    const items = await prisma.questionPaperItem.findMany({
      where: { paperId: input.paperId! },
      select: { questionId: true },
    });
    where.id = { in: items.map((i) => i.questionId) };
  }

  const targets = await prisma.question.findMany({
    where,
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  const job: ClassifyJobState = {
    id: `clsfy_${Date.now()}`,
    scope: input.scope,
    subject: input.subject,
    paperId: input.paperId,
    status: 'RUNNING',
    total: targets.length,
    processed: 0,
    updated: 0,
    lowConfidence: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);

  // 异步执行，不阻塞请求
  running = true;
  void runClassify(job, targets.map((t) => t.id)).finally(() => { running = false; });

  return job;
}

async function runClassify(job: ClassifyJobState, questionIds: string[]) {
  const standardCache = new Map<string, { content: string; version: number } | null>();

  try {
    for (const qid of questionIds) {
      try {
        const q = await prisma.question.findUnique({
          where: { id: qid },
          include: { materialNode: { select: { name: true } } },
        });
        if (!q) { job.processed++; continue; }

        const subject = q.materialNode?.name ?? job.subject ?? '数学';
        if (!standardCache.has(subject)) standardCache.set(subject, await loadStandard(subject));
        const standard = standardCache.get(subject);
        if (!standard) {
          job.processed++; job.failed++;
          continue;
        }

        const content = q.content as { stem?: string; options?: string[] };
        const answerConfig = (q.answerConfig ?? {}) as { options?: string[]; explanation?: string };
        const options = content?.options ?? answerConfig?.options ?? [];

        const prompt = `${standard.content}

---
请依据上述标准，判定下面这道${subject}题的难度等级。

题型：${q.type}
知识点：${q.knowledgePoints.join('、') || '未标注'}
题干：${content?.stem ?? ''}
${options.length > 0 ? `选项：${options.join(' / ')}` : ''}
答案：${q.answer}
${answerConfig?.explanation ? `解析：${answerConfig.explanation}` : ''}

只输出 JSON：{"difficulty": 1-5整数, "reason": "一句话理由", "confidence": 0到1}`;

        const response = await aiServiceManager.callAI(prompt, {
          temperature: 0.1,
          maxTokens: 300,
          timeout: 20000,
        });
        const parsed = extractJson(response);
        const difficulty = Number(parsed?.difficulty);
        const confidence = Number(parsed?.confidence ?? 0);

        if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
          job.processed++; job.failed++;
          continue;
        }

        const needsReview = confidence < 0.6;
        await prisma.question.update({
          where: { id: qid },
          data: {
            difficulty,
            difficultyMeta: {
              reason: String(parsed?.reason ?? ''),
              confidence,
              classifiedAt: new Date().toISOString(),
              standardVersion: standard.version,
              needsReview,
            },
          },
        });
        job.updated++;
        if (needsReview) job.lowConfidence++;
        job.processed++;
      } catch (err) {
        job.processed++;
        job.failed++;
        logger.error(`难度归类失败 question=${qid}:`, err);
      }
    }
    job.status = 'DONE';
  } catch (err: any) {
    job.status = 'FAILED';
    job.error = err?.message ?? String(err);
  } finally {
    job.finishedAt = new Date().toISOString();
    logger.info(
      `难度归类任务 ${job.id} 结束: 共${job.total} 成功${job.updated} 低置信${job.lowConfidence} 失败${job.failed}`
    );
  }
}

/** 待人工复核列表（低置信度） */
export async function listNeedsReview(subject?: string, page = 1, limit = 20) {
  const where: any = { difficultyMeta: { path: ['needsReview'], equals: true } };
  if (subject) where.materialNode = { name: subject, type: 'SUBJECT' };
  const [items, total] = await Promise.all([
    prisma.question.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { materialNode: { select: { name: true } } },
    }),
    prisma.question.count({ where }),
  ]);
  return {
    items: items.map((q) => ({
      id: q.id,
      subject: q.materialNode?.name,
      stem: (q.content as { stem?: string })?.stem ?? '',
      difficulty: q.difficulty,
      difficultyMeta: q.difficultyMeta,
      knowledgePoints: q.knowledgePoints,
    })),
    total,
    page,
    limit,
  };
}
