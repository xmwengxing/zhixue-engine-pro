/**
 * 学员记忆文档服务（P5）
 * ------------------------------------------------------------------
 * - StudentMemory：每生每科一份（subject=null 为全局记忆），Markdown，AI 维护，限长 4000 字。
 * - 写入时机：训练会话结束（报告生成钩子）→ AI 按 MEMORY_SPEC 规范生成增量并与旧记忆合并压缩。
 * - 每次修订写 StudentMemoryLog 快照（审计/回滚）。
 * - 可见性（Q4）：管理端可增删改查；家长端只读；学员端不可见。
 */
import { PrismaClient } from '@prisma/client';
import { logger } from '../middlewares/logger';
import { aiServiceManager } from './aiServiceManager';
import { wrapUserInput } from './aiPromptBuilder';

const prisma = new PrismaClient();

/** 记忆上限（字符） */
const MEMORY_MAX_CHARS = 4000;

/** 默认记忆撰写规范（无 MEMORY_SPEC 文档时的兜底） */
const DEFAULT_MEMORY_SPEC = `记忆文档撰写规范（默认）：
1. 使用 Markdown，四个固定小节：## 掌握变化 / ## 有效教学方式 / ## 情绪与习惯观察 / ## 未完成事项
2. 只记录跨会话仍有价值的信息（稳定的强弱项、有效讲解方式、习惯特征、待跟进事项）
3. 不记录一次性细节（具体某题的对错、当次时间戳流水）
4. 客观中性表述，禁止贴标签或价值评判（如"笨""懒"一律禁止）
5. 总长不超过 4000 字，超出时优先压缩最旧、最不重要的内容`;

export interface MemoryDTO {
  id: string;
  studentId: string;
  subject: string | null;
  content: string;
  version: number;
  updatedAt: string;
}

function toDTO(m: any): MemoryDTO {
  return {
    id: m.id,
    studentId: m.studentId,
    subject: m.subject,
    content: m.content,
    version: m.version,
    updatedAt: m.updatedAt instanceof Date ? m.updatedAt.toISOString() : m.updatedAt,
  };
}

/** 读取某学员的记忆（全局 + 指定学科），供装配器/家长端使用 */
export async function getMemories(studentId: string, subject?: string | null): Promise<MemoryDTO[]> {
  const rows = await prisma.studentMemory.findMany({
    where: {
      studentId,
      ...(subject !== undefined
        ? { OR: subject ? [{ subject: null }, { subject }] : [{ subject: null }] }
        : {}),
    },
    orderBy: [{ subject: 'asc' }, { updatedAt: 'desc' }],
  });
  return rows.map(toDTO);
}

/**
 * 内部 upsert：subject 可为 null，Prisma 复合唯一键不接受 null，
 * 因此用 findFirst + create/update 实现。
 */
async function upsertRow(studentId: string, subject: string | null, content: string) {
  const existing = await prisma.studentMemory.findFirst({ where: { studentId, subject } });
  if (existing) {
    return prisma.studentMemory.update({
      where: { id: existing.id },
      data: { content, version: { increment: 1 } },
    });
  }
  return prisma.studentMemory.create({
    data: { studentId, subject, content, version: 1 },
  });
}

/** 管理端：直接写入/覆盖某份记忆（人工修正），并留快照 */
export async function upsertMemory(
  studentId: string,
  subject: string | null,
  content: string,
  summary = '管理员人工修订'
): Promise<MemoryDTO> {
  const trimmed = content.slice(0, MEMORY_MAX_CHARS);
  const row = await upsertRow(studentId, subject, trimmed);
  await prisma.studentMemoryLog.create({
    data: { memoryId: row.id, content: trimmed, summary },
  });
  return toDTO(row);
}

/** 管理端：删除记忆（连带日志级联删除） */
export async function deleteMemory(id: string): Promise<void> {
  await prisma.studentMemory.delete({ where: { id } });
}

/** 管理端：查看修订历史 */
export async function getMemoryLogs(memoryId: string, limit = 20) {
  return prisma.studentMemoryLog.findMany({
    where: { memoryId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/** 读取 MEMORY_SPEC 文档（管理端可编辑），无则用默认规范 */
async function loadMemorySpec(subject?: string | null): Promise<string> {
  try {
    const docs = await prisma.agentDocument.findMany({
      where: {
        type: 'MEMORY_SPEC' as any,
        enabled: true,
        OR: subject ? [{ subject: null }, { subject }] : [{ subject: null }],
      },
      orderBy: { priority: 'asc' },
    });
    if (docs.length > 0) return docs.map((d) => d.content.trim()).join('\n\n');
  } catch (e) {
    logger.warn('加载 MEMORY_SPEC 失败，使用默认规范:', e);
  }
  return DEFAULT_MEMORY_SPEC;
}

/**
 * 会话结束时更新学员记忆（非致命：失败只记日志）。
 * 由 reportGenerationService 在报告保存后调用。
 */
export async function updateFromSession(sessionId: string): Promise<void> {
  try {
    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: {
        task: true,
        answers: {
          include: { question: { select: { knowledgePoints: true, difficulty: true } } },
          orderBy: { answeredAt: 'asc' },
        },
        aiConversations: { orderBy: { timestamp: 'desc' }, take: 20 },
      },
    });
    if (!session) return;
    if (!session.answers || session.answers.length === 0) return; // 无作答不产生记忆

    const studentId = session.studentId;
    const task: any = session.task;
    const subject: string | null = task?.subject ?? null;
    const category: string = task?.category ?? 'SUBJECT_MAIN';

    // ---- 会话事实摘要（程序生成，供 AI 提炼记忆增量） ----
    const total = session.answers.length;
    const correct = session.answers.filter((a: any) => a.isCorrect).length;
    const byKp = new Map<string, { total: number; correct: number }>();
    for (const a of session.answers as any[]) {
      const kps: string[] = a.question?.knowledgePoints ?? [];
      for (const kp of kps) {
        const cur = byKp.get(kp) || { total: 0, correct: 0 };
        cur.total += 1;
        if (a.isCorrect) cur.correct += 1;
        byKp.set(kp, cur);
      }
    }
    const kpLines = [...byKp.entries()]
      .map(([kp, s]) => `${kp}：${s.correct}/${s.total}`)
      .join('；');
    const recentChat = (session.aiConversations as any[])
      .slice(0, 10)
      .reverse()
      .map((c) => `${c.role === 'USER' ? '学员' : 'AI'}：${String(c.message).slice(0, 80)}`)
      .join('\n');

    const factSummary = [
      `任务：《${task?.title ?? '未知'}》（${category === 'SPECIAL' ? '专项攻克' : '学科总任务'}${subject ? `·${subject}` : ''}）`,
      `本次作答：${total} 题，正确 ${correct} 题（${total > 0 ? Math.round((correct / total) * 100) : 0}%）`,
      kpLines ? `知识点表现：${kpLines}` : '',
      recentChat ? `近期对话节选：\n${recentChat}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // ---- 旧记忆 + 规范 → AI 合并 ----
    const existing = await prisma.studentMemory.findFirst({
      where: { studentId, subject },
    });
    const spec = await loadMemorySpec(subject);

    const prompt = `你是学员的长期学习档案维护者。请根据「撰写规范」，把「本次会话事实」中值得长期保留的信息合并进「现有记忆」，输出合并后的完整记忆文档。

## 撰写规范
${spec}

## 现有记忆（${subject ?? '全局'}）
${existing?.content?.trim() || '（暂无，请新建）'}

## 本次会话事实
${wrapUserInput('会话事实摘要', factSummary)}

要求：
- 直接输出合并后的完整 Markdown 记忆文档，不要输出任何解释或前后缀
- 总长度不超过 ${MEMORY_MAX_CHARS} 字，超出时自行摘要压缩
- 若本次会话没有值得长期保留的新信息，原样输出现有记忆`;

    const merged = await aiServiceManager.callAI(prompt, {
      maxTokens: 4096,
      temperature: 0.3,
      timeout: 90000,
    });
    const content = String(merged).trim().slice(0, MEMORY_MAX_CHARS);
    if (!content) return;

    const row = await upsertRow(studentId, subject, content);
    await prisma.studentMemoryLog.create({
      data: {
        memoryId: row.id,
        sessionId,
        content,
        summary: `会话结束自动更新（${total}题/${correct}对）`,
      },
    });
    logger.info(`学员记忆已更新: student=${studentId} subject=${subject ?? '全局'} v${row.version}`);
  } catch (error) {
    logger.error('updateFromSession 更新学员记忆失败（不阻断主流程）:', error);
  }
}

export const studentMemoryService = {
  getMemories,
  upsertMemory,
  deleteMemory,
  getMemoryLogs,
  updateFromSession,
};
