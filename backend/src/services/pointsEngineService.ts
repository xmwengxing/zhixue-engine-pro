import { PrismaClient, TransactionType } from '@prisma/client';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

/**
 * 积分引擎 V2
 * - 1 积分 = 1 元；所有任务可获得积分
 * - 只奖励「参与 + 答对」，准确率不惩罚（答错不加分、不扣分）
 * - 参与度惩罚：连续未达标递增 -5/-10/-30；余额不扣成负
 * - 幂等防刷：同 (studentId, type, relatedId, 日期) 只发一次
 */

/** 积分规则（前端「积分规则」页数据源） */
export const POINTS_RULES = [
  { type: 'DAILY_GOAL_MET', name: '学科总任务每日训练达标', amount: 5, desc: '完成每日题量或时长目标（每天 1 次）' },
  { type: 'STREAK_BONUS', name: '连续达标 7 天', amount: 10, desc: '额外奖励，断档清零重计' },
  { type: 'WEEKLY_ATTENDANCE', name: '周满勤', amount: 20, desc: '7 天每天至少训练 1 次' },
  { type: 'STAGE_COMPLETE', name: '完成训练阶段', amount: 10, desc: '基础/提升/应用每阶段 1 次' },
  { type: 'FINAL_EXAM_DONE', name: '参加期末测试', amount: 20, desc: '提交终测即得' },
  { type: 'FINAL_EXAM_PASS', name: '终测达标', amount: 30, desc: '正确率 ≥ 目标' },
  { type: 'SPECIAL_CORRECT', name: '专项任务答对一题', amount: 2, desc: '单元/知识点/错题/组卷专项（题量 ≥5 的任务计分）' },
  { type: 'PAPER_COMPLETE', name: '整卷完成', amount: 10, desc: '组卷专项一次性完成' },
  { type: 'WORD_CORRECT', name: '单词答对一词', amount: 1, desc: '听写/默写答对（每轮 ≥10 词的任务计分）' },
  { type: 'WORD_ROUND_DONE', name: '单词整轮完成', amount: 5, desc: '每轮完成 + 轮内答对率 ≥ 60%（答对率 ≥ 80% 得 10 分）' },
  { type: 'WORD_REVIEW_CORRECT', name: '单词复习答对', amount: 2, desc: '到期复习的旧词答对（艾宾浩斯）' },
  { type: 'GUIDED_SOLVE', name: 'AI 引导后独立解出', amount: 3, desc: '苏格拉底引导' },
  { type: 'SIGNUP_BONUS', name: '开户基础分', amount: 50, desc: '新学员一次性' },
  { type: 'PARENT_ADJUST', name: '家长调整', amount: 0, desc: '家长手动奖励/调整（记录原因）' },
] as const;

/** 参与度惩罚档位（连续未达标）：第 1 次 -5 / 第 2 次 -10 / 第 3 次起 -30 */
export function penaltyForOccurrence(occurrence: number): number {
  if (occurrence <= 0) return 0;
  if (occurrence === 1) return 5;
  if (occurrence === 2) return 10;
  return 30;
}

/** 当日 UTC 键（yyyy-mm-dd） */
export function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** 获取余额 */
export async function getBalance(studentId: string): Promise<number> {
  const last = await prisma.pointsTransaction.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    select: { balance: true },
  });
  return last?.balance ?? 0;
}

/** 开户基础分（惰性发放，幂等） */
export async function ensureSignupBonus(studentId: string): Promise<void> {
  const exists = await prisma.pointsTransaction.findFirst({
    where: { studentId, type: 'SIGNUP_BONUS' },
  });
  if (exists) return;
  await reward(studentId, 'SIGNUP_BONUS', 50, null, '新学员开户基础分');
}

/**
 * 幂等发放（同 studentId+type+relatedId+日期 只发一次）
 * @param allowMultiPerDay 同类型同日可多次（如单词逐词计分）
 */
export async function reward(
  studentId: string,
  type: TransactionType,
  amount: number,
  relatedId?: string | null,
  memo?: string,
  opts?: { allowMultiPerDay?: boolean }
): Promise<boolean> {
  if (amount <= 0) return false;
  const allowMulti = opts?.allowMultiPerDay === true;
  if (!allowMulti) {
    const exists = await prisma.pointsTransaction.findFirst({
      where: {
        studentId,
        type,
        ...(relatedId ? { relatedId } : {}),
        createdAt: { gte: new Date(dayKey() + 'T00:00:00.000Z'), lt: new Date(dayKey() + 'T23:59:59.999Z') },
      },
    });
    if (exists) return false; // 防刷
  }
  await prisma.$transaction(async (tx) => {
    const last = await tx.pointsTransaction.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      select: { balance: true },
    });
    const newBalance = (last?.balance ?? 0) + amount;
    await tx.pointsTransaction.create({
      data: { studentId, amount, type, relatedId, balance: newBalance, memo },
    });
  });
  return true;
}

/** 扣分（余额不扣成负；幂等同类型同日一次） */
export async function penalize(
  studentId: string,
  type: 'PARTICIPATION_PENALTY',
  amount: number,
  relatedId?: string | null,
  memo?: string
): Promise<boolean> {
  if (amount <= 0) return false;
  const exists = await prisma.pointsTransaction.findFirst({
    where: {
      studentId,
      type,
      ...(relatedId ? { relatedId } : {}),
      memo: { contains: dayKey() }, // 同一原因同日只扣一次
    },
  });
  if (exists) return false;
  await prisma.$transaction(async (tx) => {
    const last = await tx.pointsTransaction.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      select: { balance: true },
    });
    const balance = last?.balance ?? 0;
    const actual = Math.min(amount, balance); // 不扣成负
    if (actual <= 0) return;
    await tx.pointsTransaction.create({
      data: { studentId, amount: -actual, type, relatedId, balance: balance - actual, memo: `${memo || ''}（${dayKey()}）` },
    });
  });
  return true;
}

/** 将功补过：被扣分后 3 天内完成 1 个专项任务，返还最近一次扣分的 50% */
export async function returnHalfPenalty(studentId: string, _relatedId?: string | null): Promise<void> {
  const lastPenalty = await prisma.pointsTransaction.findFirst({
    where: { studentId, type: 'PARTICIPATION_PENALTY' },
    orderBy: { createdAt: 'desc' },
  });
  if (!lastPenalty) return;
  const daysSince = (Date.now() - lastPenalty.createdAt.getTime()) / 86400000;
  if (daysSince > 3) return;
  const returned = await prisma.pointsTransaction.findFirst({
    where: { studentId, type: 'PENALTY_RETURN', relatedId: lastPenalty.id },
  });
  if (returned) return;
  const half = Math.ceil(Math.abs(lastPenalty.amount) / 2);
  await prisma.$transaction(async (tx) => {
    const last = await tx.pointsTransaction.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      select: { balance: true },
    });
    await tx.pointsTransaction.create({
      data: {
        studentId,
        amount: half,
        type: 'PENALTY_RETURN',
        relatedId: lastPenalty.id,
        balance: (last?.balance ?? 0) + half,
        memo: '将功补过：完成专项任务，返还 50% 扣分',
      },
    });
  });
}

/** 流水明细 */
export async function listTransactions(studentId: string, type?: string, page = 1, pageSize = 30) {
  const where: any = { studentId };
  if (type && type !== 'ALL') where.type = type as TransactionType;
  const [rows, total] = await Promise.all([
    prisma.pointsTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.pointsTransaction.count({ where }),
  ]);
  return { total, page, pageSize, rows };
}

/**
 * 参与度惩罚惰性结算（在答题/训练提交时调用）
 * - 学科总任务：连续 N 天未完成每日训练量 → 每满 3 天递增 -5/-10/-30
 * - 单词任务：连续 3 天未训练 → 递增 -5/-10/-30
 * - 终测拖延：引导训练完成后 7 天未参加终测 → -30
 */
export async function settleParticipationPenalties(
  studentId: string,
  taskId: string,
  taskCategory: string,
  taskConfig: any,
  lastActiveAt?: Date | null
): Promise<void> {
  try {
    logger.info(`[points] settle 触发: task=${taskId.slice(0,8)} category=${taskCategory} dailyGoal=${JSON.stringify(taskConfig?.dailyGoal)}`);
    // 1) 学科总任务：连续未达标天数
    if (taskCategory === 'SUBJECT_MAIN') {
      const goal = taskConfig?.dailyGoal;
      if (!goal?.questions && !goal?.minutes) return; // 未配置每日约束不惩罚
      const today = dayKey();
      const record = await prisma.dailyTrainingRecord.findUnique({
        where: {
          taskId_studentId_date: {
            taskId,
            studentId,
            date: new Date(today + 'T00:00:00.000Z'),
          },
        },
      });
      // 今日达标判定（未配置的维度不参与）：题量或时长任一达标
      const qGoal = goal.questions ? Number(goal.questions) : 0;
      const mGoal = goal.minutes ? Number(goal.minutes) : 0;
      const todayMet = !!record && ((qGoal > 0 && record.questions >= qGoal) || (mGoal > 0 && record.minutes >= mGoal));
      if (todayMet) return; // 今日已达标
      // 连续未达标天数（从 task startedAt 或最近一次达标/训练算起）
      const missed = await countMissedDays(taskId, studentId);
      logger.info(`[points] 学科任务未达标天数 missed=${missed}`);
      if (missed >= 3) {
        const occ = Math.floor(missed / 3);
        const amt = penaltyForOccurrence(occ);
        const memo = `学科总任务连续 ${occ * 3} 天未完成每日训练量`;
        await penalize(studentId, 'PARTICIPATION_PENALTY', amt, taskId, memo);
      }
    }

    // 2) 单词任务：连续 3 天未训练
    if (taskCategory === 'SPECIAL' && taskConfig?.specialType === 'WORD') {
      const lastSession = await prisma.wordSession.findFirst({
        where: { studentId, taskId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      });
      const last = lastSession?.updatedAt ?? lastActiveAt ?? taskConfig.createdAt;
      if (!last) return;
      const daysSince = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
      if (daysSince >= 3) {
        const occ = Math.floor(daysSince / 3);
        const amt = penaltyForOccurrence(occ);
        const memo = `单词任务连续 ${occ * 3} 天未训练`;
        await penalize(studentId, 'PARTICIPATION_PENALTY', amt, taskId, memo);
      }
    }

    // 3) 终测拖延：引导训练完成但未参加终测超过 7 天
    if (taskCategory === 'SUBJECT_MAIN') {
      const done = await prisma.trainingSession.findFirst({
        where: { taskId, studentId, status: 'ACTIVE', phase: { in: ['FINAL_EXAM', 'COMPLETED'] } },
        select: { id: true },
      });
      if (!done) {
        // 引导训练停留时间 ≈ 该任务最后一次答题时间（Answer.answeredAt）
        const lastAnswer = await prisma.answer.findFirst({
          where: { session: { taskId, studentId } },
          orderBy: { answeredAt: 'desc' },
          select: { answeredAt: true },
        });
        if (lastAnswer) {
          const daysSince = Math.floor((Date.now() - new Date(lastAnswer.answeredAt).getTime()) / 86400000);
          if (daysSince >= 7) {
            const memo = `引导训练完成 ${daysSince} 天未参加期末测试`;
            await penalize(studentId, 'PARTICIPATION_PENALTY', 30, taskId, memo);
          }
        }
      }
    }
  } catch (e: any) {
    logger.warn('[points] 参与度结算失败:', e.message);
  }
}

/** 学科总任务连续未达标天数（自任务创建或最近一次达标起）；未配置 dailyGoal 返回 0（不惩罚） */
async function countMissedDays(taskId: string, studentId: string): Promise<number> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { startedAt: true, createdAt: true, config: true },
  });
  const g = (task?.config as any)?.dailyGoal;
  if (!g?.questions && !g?.minutes) return 0; // 未配置每日约束不参与惩罚
  const since = task?.startedAt ?? task?.createdAt ?? new Date(Date.now() - 90 * 86400000);
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86400000) + 1;
  // 反向扫描：从昨天往前数连续未达标天数
  let missed = 0;
  for (let i = 1; i <= days; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const rec = await prisma.dailyTrainingRecord.findUnique({
      where: {
        taskId_studentId_date: { taskId, studentId, date: new Date(key + 'T00:00:00.000Z') },
      },
    });
    const met = rec && ((g.questions ? rec.questions >= Number(g.questions) : false) || (g.minutes ? rec.minutes >= Number(g.minutes) : false));
    if (met) break;
    missed++;
  }
  return missed;
}

/** 待提醒状态（前端红点）：连续未达标 ≥2 天 / 终测拖延 ≥5 天 */
export async function getPenaltyWarnings(studentId: string): Promise<Array<{ taskId: string; reason: string; severity: 'WARN' | 'DANGER' }>> {
  const warnings: Array<{ taskId: string; reason: string; severity: 'WARN' | 'DANGER' }> = [];
  const tasks = await prisma.task.findMany({
    where: { studentId, category: 'SUBJECT_MAIN', status: { in: ['PENDING', 'IN_PROGRESS'] } },
    select: { id: true, config: true, startedAt: true, createdAt: true },
  });
  for (const t of tasks) {
    const missed = await countMissedDays(t.id, studentId);
    if (missed >= 2) {
      warnings.push({
        taskId: t.id,
        reason: `已连续 ${missed} 天未完成每日训练量${missed >= 3 ? '，将扣除积分' : '，请尽快完成'}`,
        severity: missed >= 3 ? 'DANGER' : 'WARN',
      });
    }
  }
  return warnings;
}

export const pointsEngineService = {
  POINTS_RULES,
  penaltyForOccurrence,
  getBalance,
  ensureSignupBonus,
  reward,
  penalize,
  returnHalfPenalty,
  listTransactions,
  settleParticipationPenalties,
  getPenaltyWarnings,
};
