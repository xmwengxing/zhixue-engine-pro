import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 为任务列表附带最近一条专项训练记录（历史任务表正确率/摘要展示） */
export async function attachLastRecords(tasks: any[]): Promise<any[]> {
  const specialIds = tasks.filter((t) => t.category === 'SPECIAL').map((t) => t.id);
  const map = new Map<string, any>();
  if (specialIds.length > 0) {
    const recs = await prisma.specialTaskRecord.findMany({
      where: { taskId: { in: specialIds } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    for (const r of recs) {
      if (!map.has(r.taskId)) map.set(r.taskId, r);
    }
  }
  return tasks.map((t) => ({ ...t, lastRecord: map.get(t.id) || null }));
}

/**
 * 删除任务（家长/学员共用）：按依赖顺序清理全部关联数据，**保留积分流水**
 * - 不删除 PointsTransaction（relatedId 非 FK，已获积分不受影响）
 * - 进行中会话拦截：TrainingSession ACTIVE / WordSession IN_PROGRESS
 *   （让学员先结束训练，避免误删进行中的数据）
 * - WordSession「进行中」判定加 30 分钟活跃窗口：学员正常退出（保存进度）时
 *   WordSession 保持 IN_PROGRESS 以便恢复，但 updatedAt 随答题实时刷新；
 *   离开训练超过窗口视为已放弃 → 允许删除并顺带清理残留会话（防孤儿任务卡死删除）
 */
const WORD_ACTIVE_WINDOW_MS = 30 * 60 * 1000; // 30 分钟活跃窗口

export async function deleteTaskWithDeps(
  taskId: string,
  opts: { checkActive: boolean }
): Promise<{ success: boolean; message: string }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { trainingSessions: { select: { id: true, status: true } } },
  });
  if (!task) throw new Error('任务不存在');

  // 单词会话无 Task 关系字段，单独查询
  const wordSessions = await prisma.wordSession.findMany({
    where: { taskId },
    select: { id: true, status: true, updatedAt: true },
  });

  if (opts.checkActive) {
    const hasActive = task.trainingSessions.some((s) => s.status === 'ACTIVE');
    if (hasActive) throw new Error('该任务有正在进行的训练会话，请让学员先结束训练后再删除');
    // 仅在 30 分钟活跃窗口内的 IN_PROGRESS 会话才视为「正在训练」；陈旧残留允许删除
    const now = Date.now();
    const hasActiveWord = wordSessions.some(
      (s) => s.status === 'IN_PROGRESS' && now - new Date(s.updatedAt).getTime() < WORD_ACTIVE_WINDOW_MS
    );
    if (hasActiveWord) throw new Error('该任务有正在进行的训练会话（学员 30 分钟内活跃），请先结束训练后再删除');
  }

  const sessionIds = task.trainingSessions.map((s) => s.id);
  const wordSessionIds = wordSessions.map((s) => s.id);

  await prisma.$transaction(async (tx) => {
    if (sessionIds.length > 0) {
      const answers = await tx.answer.findMany({ where: { sessionId: { in: sessionIds } }, select: { id: true } });
      const answerIds = answers.map((a) => a.id);
      if (answerIds.length > 0) {
        await tx.errorQuestion.deleteMany({ where: { answerId: { in: answerIds } } });
        await tx.answer.deleteMany({ where: { id: { in: answerIds } } });
      }
      await tx.aIConversation.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.trainingSession.deleteMany({ where: { id: { in: sessionIds } } });
    }
    // 单词训练会话（听写/默写/选择）
    if (wordSessionIds.length > 0) {
      await tx.wordSession.deleteMany({ where: { id: { in: wordSessionIds } } });
    }
    // 报告（引用 task 与 session）
    await tx.report.deleteMany({ where: { taskId } });
    // 学期归档
    await tx.taskArchive.deleteMany({ where: { taskId } }).catch(() => {});
    // 专项训练历史记录
    await tx.specialTaskRecord.deleteMany({ where: { taskId } }).catch(() => {});
    // 每日训练记录
    await tx.dailyTrainingRecord.deleteMany({ where: { taskId } }).catch(() => {});
    // 最后删除任务本身（积分流水保留：relatedId 非外键，不级联）
    await tx.task.delete({ where: { id: taskId } });
  });

  return { success: true, message: '任务删除成功' };
}
