import { PrismaClient } from '@prisma/client';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

/** 每日训练体量约束（Task.config.dailyGoal） */
export interface DailyGoal {
  questions?: number | null; // 每日目标题数（可空 = 不设）
  minutes?: number | null;   // 每日目标时长（分钟，可空 = 不设）
}

/** 解析任务每日目标（兼容未配置） */
export function getDailyGoal(taskConfig: any): DailyGoal {
  const g = taskConfig?.dailyGoal;
  if (!g || typeof g !== 'object') return {};
  return {
    questions: Number.isFinite(Number(g.questions)) && Number(g.questions) > 0 ? Number(g.questions) : null,
    minutes: Number.isFinite(Number(g.minutes)) && Number(g.minutes) > 0 ? Number(g.minutes) : null,
  };
}

/** 校验家长提交的每日目标（1-200 题 / 1-180 分钟，可留空） */
export function validateDailyGoal(raw: any): DailyGoal {
  const q = raw?.questions;
  const m = raw?.minutes;
  const questions = q === '' || q == null || q === undefined ? null : Number(q);
  const minutes = m === '' || m == null || m === undefined ? null : Number(m);
  if (questions !== null && (!Number.isFinite(questions) || questions < 1 || questions > 200)) {
    throw new Error('每日目标题数需在 1-200 之间（可留空）');
  }
  if (minutes !== null && (!Number.isFinite(minutes) || minutes < 1 || minutes > 180)) {
    throw new Error('每日目标时长需在 1-180 分钟之间（可留空）');
  }
  return { questions, minutes };
}

/** 某日是否已达标（题量或时长任一满足即达标；无目标 = 恒达标） */
export function isDailyMet(goal: DailyGoal, record: { questions: number; minutes: number } | null): boolean {
  if (!goal.questions && !goal.minutes) return true; // 未设置约束 → 恒达标
  const q = record?.questions ?? 0;
  const m = record?.minutes ?? 0;
  if (goal.questions && q >= goal.questions) return true;
  if (goal.minutes && m >= goal.minutes) return true;
  return false;
}

/** 当日记录（北京时间） */
function todayDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** 答题落库后聚合每日统计（幂等 upsert，诊断/训练/终测均计入） */
export async function recordDailyTraining(
  taskId: string,
  studentId: string,
  options: { questions?: number; timeSpent?: number }
): Promise<void> {
  try {
    const date = todayDate();
    const q = options.questions ?? 1;
    const minutes = Math.max(1, Math.round((options.timeSpent ?? 0) / 60));
    await prisma.dailyTrainingRecord.upsert({
      where: { taskId_studentId_date: { taskId, studentId, date } },
      create: { taskId, studentId, date, questions: q, minutes },
      update: { questions: { increment: q }, minutes: { increment: minutes } },
    });
  } catch (e: any) {
    // 非致命：聚合失败不影响答题
    logger.warn('[daily] 每日训练记录聚合失败:', e.message);
  }
}

/** 获取任务最近 N 天日程表（含目标与达标状态）——统一 UTC 日期，避免本地/UTC 序列化偏移 */
export async function getDailyCalendar(taskId: string, studentId: string, days = 14) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.studentId !== studentId) return null;
  const goal = getDailyGoal(task.config as any);
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1))
  );
  const records = await prisma.dailyTrainingRecord.findMany({
    where: { taskId, studentId, date: { gte: start } },
    orderBy: { date: 'asc' },
  });
  const map = new Map(records.map((r) => [r.date.toISOString().slice(0, 10), r]));
  const out: Array<{
    date: string;
    weekday: string;
    questions: number;
    minutes: number;
    questionsGoal: number | null;
    minutesGoal: number | null;
    met: boolean;
  }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const r = map.get(key);
    out.push({
      date: key,
      weekday: '周' + '日一二三四五六'[d.getUTCDay()],
      questions: r?.questions ?? 0,
      minutes: r?.minutes ?? 0,
      questionsGoal: goal.questions ?? null,
      minutesGoal: goal.minutes ?? null,
      met: isDailyMet(goal, r ?? null),
    });
  }
  return {
    taskId,
    dailyGoal: goal,
    days: out,
    todayMet: isDailyMet(goal, map.get(new Date().toISOString().slice(0, 10)) ?? null),
  };
}

export const dailyTrainingService = {
  getDailyGoal,
  validateDailyGoal,
  isDailyMet,
  recordDailyTraining,
  getDailyCalendar,
};
