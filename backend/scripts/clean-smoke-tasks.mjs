/**
 * 清理历史冒烟任务（title 含「冒烟」）：连带清理会话/记录/错题/归档等依赖，防 FK 残留。
 * 一次性工程工具：node scripts/clean-smoke-tasks.mjs
 */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  const tasks = await db.task.findMany({ where: { title: { contains: '冒烟' } }, select: { id: true, title: true } });
  console.log(`找到 ${tasks.length} 个冒烟任务`);
  for (const t of tasks) {
    await db.$transaction(async (tx) => {
      const sessions = await tx.trainingSession.findMany({ where: { taskId: t.id }, select: { id: true } });
      const sids = sessions.map((s) => s.id);
      if (sids.length) {
        const answers = await tx.answer.findMany({ where: { sessionId: { in: sids } }, select: { id: true } });
        const aids = answers.map((a) => a.id);
        if (aids.length) {
          await tx.errorQuestion.deleteMany({ where: { answerId: { in: aids } } });
          await tx.answer.deleteMany({ where: { id: { in: aids } } });
        }
        await tx.aIConversation.deleteMany({ where: { sessionId: { in: sids } } });
        await tx.trainingSession.deleteMany({ where: { id: { in: sids } } });
      }
      const wSessions = await tx.wordSession.findMany({ where: { taskId: t.id }, select: { id: true, wordIds: true, studentId: true } });
      for (const ws of wSessions) {
        if (Array.isArray(ws.wordIds) && ws.wordIds.length) {
          await tx.wordMistake.deleteMany({ where: { studentId: ws.studentId, wordId: { in: ws.wordIds } } });
        }
      }
      await tx.wordSession.deleteMany({ where: { taskId: t.id } });
      await tx.report.deleteMany({ where: { taskId: t.id } }).catch(() => {});
      await tx.taskArchive.deleteMany({ where: { taskId: t.id } }).catch(() => {});
      await tx.specialTaskRecord.deleteMany({ where: { taskId: t.id } }).catch(() => {});
      await tx.dailyTrainingRecord.deleteMany({ where: { taskId: t.id } }).catch(() => {});
      await tx.task.deleteMany({ where: { id: t.id } });
    });
    console.log(`  ✓ 已清理: ${t.title}`);
  }
  const left = await db.task.count({ where: { title: { contains: '冒烟' } } });
  console.log(`剩余冒烟任务: ${left}`);
  await db.$disconnect();
}
main().catch((e) => { console.error('💥', e.message); process.exit(1); });
