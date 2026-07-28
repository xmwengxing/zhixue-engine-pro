/**
 * 艾宾浩斯遗忘曲线 · 间隔重复错题复习服务（Spaced Repetition）
 *
 * 业务规则（对应《业务逻辑与功能改善_1.md》建议 2）：
 * - 错题不再"一次答对即消除"，而是进入复习周期：第 1 / 3 / 7 / 15 天
 * - 每个周期到期后重练：
 *   · 答对 → 推进到下一周期，连续答对数 +1
 *   · 答错 → 周期与连续答对数全部重置，回到第 1 天周期
 * - 只有【连续 3 个周期均答对】才从"高频错题库"归档为 MASTERED（彻底掌握）
 * - 连续答对 1~2 次为 MASTERING（正在掌握），0 次为 UNMASTERED
 */
import { PrismaClient, MasteryLevel } from '@prisma/client';

const prisma = new PrismaClient();

/** 复习周期间隔（天）：第 1、3、7、15 天 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 15] as const;

/** 归档所需的连续答对周期数 */
export const CYCLES_TO_MASTER = 3;

export interface ReviewHistoryEntry {
  stage: number;
  isCorrect: boolean;
  reviewedAt: string;
}

export interface ReviewProgress {
  reviewStage: number;
  consecutiveCorrect: number;
  nextReviewAt: Date | null;
  mastery: MasteryLevel;
}

/**
 * 计算某阶段的下次复习时间
 * stage 0 → +1 天，stage 1 → +3 天，stage 2 → +7 天，stage 3+ → +15 天
 */
export function nextReviewDate(stage: number, from: Date = new Date()): Date {
  const idx = Math.min(Math.max(stage, 0), REVIEW_INTERVALS_DAYS.length - 1);
  const days = REVIEW_INTERVALS_DAYS[idx];
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * 纯函数：根据本次复习结果计算新的复习进度
 */
export function computeReviewProgress(
  current: { reviewStage: number; consecutiveCorrect: number },
  isCorrect: boolean,
  now: Date = new Date()
): ReviewProgress {
  if (!isCorrect) {
    // 答错：全部重置，回到第 1 天周期
    return {
      reviewStage: 0,
      consecutiveCorrect: 0,
      nextReviewAt: nextReviewDate(0, now),
      mastery: 'UNMASTERED',
    };
  }

  const consecutiveCorrect = current.consecutiveCorrect + 1;
  const reviewStage = current.reviewStage + 1;

  if (consecutiveCorrect >= CYCLES_TO_MASTER) {
    // 连续 3 个周期答对 → 彻底掌握，归档，不再排期
    return {
      reviewStage,
      consecutiveCorrect,
      nextReviewAt: null,
      mastery: 'MASTERED',
    };
  }

  return {
    reviewStage,
    consecutiveCorrect,
    nextReviewAt: nextReviewDate(reviewStage, now),
    mastery: 'MASTERING',
  };
}

/**
 * 记录一次错题复习结果（训练舱重做 / 错题重练提交后调用）
 * 返回更新后的错题记录；若错题不存在返回 null
 */
export async function recordReviewResult(
  studentId: string,
  questionId: string,
  isCorrect: boolean
) {
  const existing = await prisma.errorQuestion.findFirst({
    where: { studentId, questionId },
  });
  if (!existing) return null;

  // 已归档的错题答错会被重新激活；答对则忽略（保持归档）
  if (existing.mastery === 'MASTERED' && isCorrect) {
    return existing;
  }

  const now = new Date();
  const progress = computeReviewProgress(
    {
      reviewStage: existing.reviewStage,
      consecutiveCorrect: existing.consecutiveCorrect,
    },
    isCorrect,
    now
  );

  const history: ReviewHistoryEntry[] = Array.isArray(existing.reviewHistory)
    ? (existing.reviewHistory as unknown as ReviewHistoryEntry[])
    : [];
  history.push({
    stage: existing.reviewStage,
    isCorrect,
    reviewedAt: now.toISOString(),
  });

  return prisma.errorQuestion.update({
    where: { id: existing.id },
    data: {
      reviewStage: progress.reviewStage,
      consecutiveCorrect: progress.consecutiveCorrect,
      nextReviewAt: progress.nextReviewAt,
      mastery: progress.mastery,
      reviewHistory: history.slice(-20) as unknown as object,
      lastRetryAt: now,
      retryCount: { increment: 1 },
      updatedAt: now,
    },
  });
}

/**
 * 初始化新错题的复习排期（收集错题时调用）
 */
export function initialReviewFields(now: Date = new Date()) {
  return {
    reviewStage: 0,
    consecutiveCorrect: 0,
    nextReviewAt: nextReviewDate(0, now),
    reviewHistory: [] as unknown as object,
  };
}

/**
 * 获取今日到期待复习的错题列表
 */
export async function getDueReviews(studentId: string, limit = 20) {
  const now = new Date();
  const [items, total] = await Promise.all([
    prisma.errorQuestion.findMany({
      where: {
        studentId,
        mastery: { not: 'MASTERED' },
        nextReviewAt: { lte: now },
      },
      take: limit,
      orderBy: { nextReviewAt: 'asc' },
      include: {
        question: { include: { materialNode: true } },
      },
    }),
    prisma.errorQuestion.count({
      where: {
        studentId,
        mastery: { not: 'MASTERED' },
        nextReviewAt: { lte: now },
      },
    }),
  ]);

  return { items, total, cyclesToMaster: CYCLES_TO_MASTER };
}
