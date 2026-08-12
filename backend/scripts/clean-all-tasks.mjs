/**
 * 清空全部任务与历史记录（一次性工程工具，谨慎使用）：
 * 删除所有 Task 及其依赖（会话/答题/错题关联/报告/归档/训练记录/每日记录/AI 会话）。
 * 保留：错题本（WordMistake/ErrorQuestion 关联答案会删，仅清任务相关）、
 * 积分流水（pointsTransaction，relatedId 非 FK）、学情（learningState）。
 * 用法：node scripts/clean-all-tasks.mjs
 */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  const before = await db.task.count();
  console.log(`清理前任务数: ${before}`);
  await db.$transaction(async (tx) => {
    // 会话级联清理
    const sessions = await tx.trainingSession.findMany({ select: { id: true } });
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
    await tx.wordSession.deleteMany({});
    await tx.specialTaskRecord.deleteMany({});
    await tx.dailyTrainingRecord.deleteMany({});
    await tx.taskArchive.deleteMany({}).catch(() => {});
    await tx.report.deleteMany({}).catch(() => {});
    await tx.task.deleteMany({});
  });
  const after = await db.task.count();
  console.log(`清理后任务数: ${after}`);
  console.log('保留：错题本/积分流水/学情档案');
  await db.$disconnect();
}
main().catch((e) => { console.error('💥', e.message); process.exit(1); });
