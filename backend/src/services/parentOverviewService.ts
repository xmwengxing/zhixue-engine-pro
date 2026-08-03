import { logger } from '../middlewares/logger';
import { prisma } from '../lib/prisma';

/**
 * 学情概览统计口径说明（供前端展示"数据来源"）
 *
 * 1) 能力雷达 abilityRadar
 *    数据源：已完成训练会话（TrainingSession.status = COMPLETED）中的全部答题记录 Answer。
 *    学科归属：Answer -> Question -> MaterialNode，沿 parentId 上溯到 type='SUBJECT' 的节点名。
 *    分值：该学科正确率 ×100，四舍五入取整；同时返回样本量 sampleSize，样本 < 5 时前端应标注"样本不足"。
 *    无数据时返回空数组（不再伪造"语文/数学/英语/物理/化学 全 0"的假雷达）。
 *
 * 2) 错题攻克 errorStats
 *    数据源：ErrorQuestion.mastery 分组计数（UNMASTERED / MASTERING / MASTERED）。
 *
 * 3) 学习连续性 learningStreak
 *    连续天数：以"有已完成会话"的自然日计算；若今天尚未学习，则从昨天开始回溯（不打断连续记录）。
 *    本周时长：本周（周一起）内 Answer.timeSpent 之和，按实际答题耗时统计，
 *    不使用 会话结束时间-开始时间（会话可能长时间挂起导致严重高估）。
 *
 * 4) 总体概况 overall
 *    累计答题量 / 累计正确率 / 已完成会话数 / 任务完成率（COMPLETED 任务占比）。
 *
 * 5) 近期趋势 recentTrend
 *    最近 7 个自然日，每日答题量与正确率。
 */

interface SubjectAccuracy {
  subject: string;
  score: number;
  sampleSize: number;
}

export class ParentOverviewService {
  /**
   * 获取学员的学情概览数据
   */
  async getStudentOverview(studentId: string) {
    try {
      const [radarData, errorStats, learningStreak, taskStats] = await Promise.all([
        this.calculateSubjectAccuracy(studentId),
        this.calculateErrorStats(studentId),
        this.calculateLearningStreak(studentId),
        this.calculateTaskStats(studentId),
      ]);

      return {
        // 兼容原有前端结构
        abilityRadar: {
          subjects: radarData.subjects.map((s) => s.subject),
          scores: radarData.subjects.map((s) => s.score),
          /** 每个学科的样本量，用于前端标注可信度 */
          sampleSizes: radarData.subjects.map((s) => s.sampleSize),
          hasData: radarData.subjects.length > 0,
        },
        errorStats,
        learningStreak,
        overall: {
          totalAnswered: radarData.totalAnswered,
          totalCorrect: radarData.totalCorrect,
          correctRate:
            radarData.totalAnswered > 0
              ? Math.round((radarData.totalCorrect / radarData.totalAnswered) * 100)
              : 0,
          completedSessions: learningStreak.completedSessions,
          ...taskStats,
        },
        recentTrend: radarData.recentTrend,
        /** 统计口径说明，前端可直接展示 */
        methodology: {
          radar: '按已完成训练会话的答题正确率，沿教材树归属到学科',
          error: '按错题本掌握度（未掌握/攻克中/已掌握）分组计数',
          streak: '按"有已完成会话"的自然日连续回溯；本周时长按实际答题耗时累计',
        },
      };
    } catch (error) {
      logger.error('获取学情概览失败:', error);
      throw new Error('获取学情概览失败');
    }
  }

  /**
   * 计算各学科正确率 + 累计统计 + 近 7 日趋势
   * 说明：一次性取出教材节点构建内存索引，避免逐条答题向上递归查询（原实现存在严重 N+1）
   */
  private async calculateSubjectAccuracy(studentId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(0, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const answers = await prisma.answer.findMany({
      where: {
        session: {
          studentId,
          status: 'COMPLETED',
        },
      },
      select: {
        isCorrect: true,
        answeredAt: true,
        question: { select: { materialNodeId: true } },
      },
    });

    if (answers.length === 0) {
      return {
        subjects: [] as SubjectAccuracy[],
        totalAnswered: 0,
        totalCorrect: 0,
        recentTrend: this.buildEmptyTrend(sevenDaysAgo),
      };
    }

    // 构建教材节点索引（id -> {name, type, parentId}）
    const nodes = await prisma.materialNode.findMany({
      select: { id: true, name: true, type: true, parentId: true },
    });
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    /** 沿 parentId 上溯找到 SUBJECT 节点名（带缓存，防环） */
    const subjectCache = new Map<string, string>();
    const resolveSubject = (nodeId: string | null | undefined): string => {
      if (!nodeId) return '';
      const cached = subjectCache.get(nodeId);
      if (cached !== undefined) return cached;

      const chain: string[] = [];
      let cursor = nodeId;
      let result = '';
      const visited = new Set<string>();

      while (cursor && !visited.has(cursor)) {
        visited.add(cursor);
        chain.push(cursor);
        const node = nodeMap.get(cursor);
        if (!node) break;
        if (node.type === 'SUBJECT') {
          result = node.name;
          break;
        }
        cursor = node.parentId as string;
      }

      chain.forEach((id) => subjectCache.set(id, result));
      return result;
    };

    const subjectStats: Record<string, { correct: number; total: number }> = {};
    const trendMap = new Map<string, { total: number; correct: number }>();
    let totalCorrect = 0;

    for (const answer of answers) {
      if (answer.isCorrect) totalCorrect += 1;

      const subject = resolveSubject(answer.question?.materialNodeId);
      if (subject) {
        if (!subjectStats[subject]) subjectStats[subject] = { correct: 0, total: 0 };
        subjectStats[subject].total += 1;
        if (answer.isCorrect) subjectStats[subject].correct += 1;
      }

      // 近 7 日趋势
      if (answer.answeredAt >= sevenDaysAgo) {
        const key = this.dateKey(answer.answeredAt);
        const bucket = trendMap.get(key) ?? { total: 0, correct: 0 };
        bucket.total += 1;
        if (answer.isCorrect) bucket.correct += 1;
        trendMap.set(key, bucket);
      }
    }

    const subjects: SubjectAccuracy[] = Object.entries(subjectStats)
      .map(([subject, s]) => ({
        subject,
        score: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
        sampleSize: s.total,
      }))
      .sort((a, b) => b.sampleSize - a.sampleSize);

    const recentTrend = this.buildEmptyTrend(sevenDaysAgo).map((d) => {
      const bucket = trendMap.get(d.date);
      return bucket
        ? {
            date: d.date,
            answered: bucket.total,
            correctRate: Math.round((bucket.correct / bucket.total) * 100),
          }
        : d;
    });

    return {
      subjects,
      totalAnswered: answers.length,
      totalCorrect,
      recentTrend,
    };
  }

  /** 生成近 7 日空趋势骨架 */
  private buildEmptyTrend(start: Date) {
    const list: Array<{ date: string; answered: number; correctRate: number }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      list.push({ date: this.dateKey(d), answered: 0, correctRate: 0 });
    }
    return list;
  }

  /** 本地日期 key（YYYY-MM-DD），避免 toISOString 时区偏移 */
  private dateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * 计算错题统计数据（未掌握 / 攻克中 / 已掌握）
   */
  private async calculateErrorStats(studentId: string) {
    try {
      const grouped = await prisma.errorQuestion.groupBy({
        by: ['mastery'],
        where: { studentId },
        _count: { id: true },
      });

      const stats = { unmastered: 0, mastering: 0, mastered: 0, total: 0 };

      for (const item of grouped) {
        if (item.mastery === 'UNMASTERED') stats.unmastered = item._count.id;
        else if (item.mastery === 'MASTERING') stats.mastering = item._count.id;
        else if (item.mastery === 'MASTERED') stats.mastered = item._count.id;
      }
      stats.total = stats.unmastered + stats.mastering + stats.mastered;

      return stats;
    } catch (error) {
      logger.error('计算错题统计失败:', error);
      throw error;
    }
  }

  /**
   * 计算学习连续性：连续天数 + 本周实际答题时长
   */
  private async calculateLearningStreak(studentId: string) {
    try {
      const sessions = await prisma.trainingSession.findMany({
        where: { studentId, status: 'COMPLETED', completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 学习日集合（本地日期）
      const learningDays = new Set<string>();
      for (const s of sessions) {
        if (s.completedAt) learningDays.add(this.dateKey(s.completedAt));
      }

      // 若今天还没学习，从昨天开始回溯（避免"今天还没做题"就把连续记录清零）
      let cursor = new Date(today);
      if (!learningDays.has(this.dateKey(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
      }

      let streakDays = 0;
      while (learningDays.has(this.dateKey(cursor))) {
        streakDays += 1;
        cursor.setDate(cursor.getDate() - 1);
      }

      // 本周（周一起）实际答题时长：按 Answer.timeSpent 累计
      const weekStart = new Date(today);
      const weekday = (today.getDay() + 6) % 7; // 周一=0
      weekStart.setDate(today.getDate() - weekday);
      weekStart.setHours(0, 0, 0, 0);

      const weekAgg = await prisma.answer.aggregate({
        where: {
          session: { studentId },
          answeredAt: { gte: weekStart },
        },
        _sum: { timeSpent: true },
        _count: { _all: true },
      });

      const weeklySeconds = weekAgg._sum.timeSpent ?? 0;

      return {
        days: streakDays,
        weeklyHours: Math.round((weeklySeconds / 3600) * 10) / 10,
        weeklyMinutes: Math.round(weeklySeconds / 60),
        weeklyAnswered: weekAgg._count._all,
        totalLearningDays: learningDays.size,
        completedSessions: sessions.length,
      };
    } catch (error) {
      logger.error('计算学习连续性失败:', error);
      throw error;
    }
  }

  /**
   * 任务完成情况统计
   */
  private async calculateTaskStats(studentId: string) {
    const grouped = await prisma.task.groupBy({
      by: ['status'],
      where: { studentId },
      _count: { _all: true },
    });

    const countOf = (status: string) => grouped.find((g) => g.status === status)?._count._all ?? 0;

    const completed = countOf('COMPLETED');
    const pending = countOf('PENDING');
    const inProgress = countOf('IN_PROGRESS');
    const totalTasks = completed + pending + inProgress;

    return {
      totalTasks,
      completedTasks: completed,
      pendingTasks: pending + inProgress,
      taskCompletionRate: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0,
    };
  }
}

export const parentOverviewService = new ParentOverviewService();
