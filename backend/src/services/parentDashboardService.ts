import { logger } from '../middlewares/logger';
import { prisma } from '../lib/prisma';

/**
 * 家长端首页统计数据
 */
export interface ParentDashboardStats {
  /** 已绑定子女数 */
  totalChildren: number;
  /** 待完成任务数（PENDING + IN_PROGRESS） */
  pendingTasks: number;
  /** 其中未开始 */
  notStartedTasks: number;
  /** 其中进行中 */
  inProgressTasks: number;
  /** 已完成任务数 */
  completedTasks: number;
  /** 待审批愿望数 */
  pendingWishes: number;
  /** 近 7 天新增报告数 */
  recentReports: number;
  /** 报告总数 */
  totalReports: number;
}

/**
 * 家长端首页统计服务
 * 说明：统计口径以「亲子关系（ACTIVE）绑定的学员」为准，
 * 而非仅按 task.createdBy，避免管理员/学员自建任务被漏统计。
 */
class ParentDashboardService {
  /**
   * 获取家长首页统计数据
   */
  async getStats(parentId: string): Promise<ParentDashboardStats> {
    try {
      // 1. 取该家长绑定的全部有效学员
      const relations = await prisma.parentChildRelation.findMany({
        where: { parentId, status: 'ACTIVE' },
        select: { studentId: true },
      });

      const studentIds = relations.map((r) => r.studentId);
      const totalChildren = studentIds.length;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // 与 parentTaskService.getTasks 保持完全一致的可见性口径：
      // 亲子关系名下的任务 ∪ 家长本人创建的任务
      const taskVisibility = {
        OR: [{ studentId: { in: studentIds } }, { createdBy: parentId }],
      };

      // 2. 并行统计
      const [taskGroups, pendingWishes, recentReports, totalReports] = await Promise.all([
        prisma.task.groupBy({
          by: ['status'],
          where: taskVisibility,
          _count: { _all: true },
        }),
        prisma.wish.count({
          where: { studentId: { in: studentIds }, status: 'PENDING' },
        }),
        prisma.report.count({
          where: { studentId: { in: studentIds }, generatedAt: { gte: sevenDaysAgo } },
        }),
        prisma.report.count({
          where: { studentId: { in: studentIds } },
        }),
      ]);

      const countOf = (status: string) =>
        taskGroups.find((g) => g.status === status)?._count._all ?? 0;

      const notStartedTasks = countOf('PENDING');
      const inProgressTasks = countOf('IN_PROGRESS');
      const completedTasks = countOf('COMPLETED');

      return {
        totalChildren,
        pendingTasks: notStartedTasks + inProgressTasks,
        notStartedTasks,
        inProgressTasks,
        completedTasks,
        pendingWishes,
        recentReports,
        totalReports,
      };
    } catch (error) {
      logger.error('获取家长首页统计失败:', error);
      throw error;
    }
  }
}

export const parentDashboardService = new ParentDashboardService();
