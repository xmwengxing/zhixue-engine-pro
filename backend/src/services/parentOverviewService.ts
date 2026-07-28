import { PrismaClient } from '@prisma/client';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

/**
 * 家长端学情概览服务
 */
export class ParentOverviewService {
  /**
   * 获取学员的学情概览数据
   * @param studentId 学员 ID
   * @returns 学情概览数据
   */
  async getStudentOverview(studentId: string) {
    try {
      // 并行获取各项数据
      const [abilityRadar, errorStats, learningStreak] = await Promise.all([
        this.calculateAbilityRadar(studentId),
        this.calculateErrorStats(studentId),
        this.calculateLearningStreak(studentId),
      ]);

      return {
        abilityRadar,
        errorStats,
        learningStreak,
      };
    } catch (error) {
      logger.error('获取学情概览失败:', error);
      throw new Error('获取学情概览失败');
    }
  }

  /**
   * 计算能力雷达图数据
   * 基于学员在各科目的答题正确率
   */
  private async calculateAbilityRadar(studentId: string) {
    try {
      // 获取学员所有答题记录，按科目分组
      const answers = await prisma.answer.findMany({
        where: {
          session: {
            studentId,
            status: 'COMPLETED',
          },
        },
        include: {
          question: {
            include: {
              materialNode: true,
            },
          },
        },
      });

      // 按科目统计正确率
      const subjectStats: { [subject: string]: { correct: number; total: number } } = {};

      for (const answer of answers) {
        // 向上查找科目节点
        let currentNode: any = answer.question.materialNode;
        let subject = '';

        // 查找父节点直到找到科目级别
        while (currentNode) {
          if (currentNode.type === 'SUBJECT') {
            subject = currentNode.name;
            break;
          }

          if (currentNode.parentId) {
            currentNode = await prisma.materialNode.findUnique({
              where: { id: currentNode.parentId },
            });
          } else {
            break;
          }
        }

        if (subject) {
          if (!subjectStats[subject]) {
            subjectStats[subject] = { correct: 0, total: 0 };
          }

          subjectStats[subject].total += 1;
          if (answer.isCorrect) {
            subjectStats[subject].correct += 1;
          }
        }
      }

      // 转换为雷达图数据格式
      const subjects: string[] = [];
      const scores: number[] = [];

      for (const [subject, stats] of Object.entries(subjectStats)) {
        subjects.push(subject);
        // 计算正确率百分比（0-100）
        const score = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        scores.push(score);
      }

      // 如果没有数据，返回默认科目
      if (subjects.length === 0) {
        return {
          subjects: ['语文', '数学', '英语', '物理', '化学'],
          scores: [0, 0, 0, 0, 0],
        };
      }

      return {
        subjects,
        scores,
      };
    } catch (error) {
      logger.error('计算能力雷达图失败:', error);
      throw error;
    }
  }

  /**
   * 计算错题统计数据
   * 统计未掌握、攻克中、已掌握的错题数量
   */
  private async calculateErrorStats(studentId: string) {
    try {
      // 按掌握度分组统计错题数量
      const errorStats = await prisma.errorQuestion.groupBy({
        by: ['mastery'],
        where: {
          studentId,
        },
        _count: {
          id: true,
        },
      });

      // 初始化统计数据
      const stats = {
        unmastered: 0,
        mastering: 0,
        mastered: 0,
      };

      // 填充统计数据
      for (const stat of errorStats) {
        if (stat.mastery === 'UNMASTERED') {
          stats.unmastered = stat._count.id;
        } else if (stat.mastery === 'MASTERING') {
          stats.mastering = stat._count.id;
        } else if (stat.mastery === 'MASTERED') {
          stats.mastered = stat._count.id;
        }
      }

      return stats;
    } catch (error) {
      logger.error('计算错题统计失败:', error);
      throw error;
    }
  }

  /**
   * 计算学习连续性统计
   * 统计连续学习天数和本周学习时长
   */
  private async calculateLearningStreak(studentId: string) {
    try {
      // 获取所有已完成的训练会话
      const sessions = await prisma.trainingSession.findMany({
        where: {
          studentId,
          status: 'COMPLETED',
          completedAt: {
            not: null,
          },
        },
        orderBy: {
          completedAt: 'desc',
        },
        select: {
          completedAt: true,
          startedAt: true,
        },
      });

      // 计算连续学习天数
      let streakDays = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (sessions.length > 0) {
        // 按日期分组
        const learningDates = new Set<string>();
        for (const session of sessions) {
          if (session.completedAt) {
            const date = new Date(session.completedAt);
            date.setHours(0, 0, 0, 0);
            learningDates.add(date.toISOString());
          }
        }

        // 从今天开始往前计算连续天数
        let currentDate = new Date(today);
        while (true) {
          const dateStr = currentDate.toISOString();
          if (learningDates.has(dateStr)) {
            streakDays++;
            currentDate.setDate(currentDate.getDate() - 1);
          } else {
            break;
          }
        }
      }

      // 计算本周学习时长（分钟）
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // 本周周日
      weekStart.setHours(0, 0, 0, 0);

      const weekSessions = sessions.filter((session) => {
        if (!session.completedAt) return false;
        const completedDate = new Date(session.completedAt);
        return completedDate >= weekStart;
      });

      let weeklyMinutes = 0;
      for (const session of weekSessions) {
        if (session.completedAt && session.startedAt) {
          const duration = session.completedAt.getTime() - session.startedAt.getTime();
          weeklyMinutes += Math.floor(duration / 1000 / 60); // 转换为分钟
        }
      }

      return {
        days: streakDays,
        weeklyHours: Math.round((weeklyMinutes / 60) * 10) / 10, // 保留一位小数
      };
    } catch (error) {
      logger.error('计算学习连续性失败:', error);
      throw error;
    }
  }
}

export const parentOverviewService = new ParentOverviewService();
