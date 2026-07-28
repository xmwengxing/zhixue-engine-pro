// 通知服务
import { PrismaClient } from '@prisma/client';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

/**
 * 通知类型
 */
export enum NotificationType {
  TASK_ASSIGNED = 'TASK_ASSIGNED', // 任务分配
  REPORT_GENERATED = 'REPORT_GENERATED', // 报告生成完成
  WISH_REVIEWED = 'WISH_REVIEWED', // 愿望审批
  POINTS_EARNED = 'POINTS_EARNED', // 获得积分
}

/**
 * 通知服务类
 * 注意：这是一个简化的实现，生产环境应该使用专门的通知系统
 */
export class NotificationService {
  /**
   * 发送通知
   */
  async sendNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    relatedId?: string
  ) {
    try {
      // 这里可以实现多种通知方式：
      // 1. 站内通知（存储到数据库）
      // 2. 邮件通知
      // 3. 短信通知
      // 4. 推送通知

      // 目前只记录日志
      logger.info(`发送通知: 用户 ${userId}, 类型 ${type}, 标题 ${title}`);

      // TODO: 实现实际的通知发送逻辑
      // 例如：保存到通知表、发送邮件、推送等

      return {
        success: true,
        userId,
        type,
        title,
        message,
        relatedId,
        sentAt: new Date(),
      };
    } catch (error: any) {
      logger.error('发送通知失败:', error);
      throw error;
    }
  }

  /**
   * 发送报告生成完成通知
   */
  async notifyReportGenerated(studentId: string, reportId: string, taskTitle: string) {
    try {
      // 通知学员
      await this.sendNotification(
        studentId,
        NotificationType.REPORT_GENERATED,
        '学习报告已生成',
        `您的"${taskTitle}"学习报告已经生成完成，快来查看吧！`,
        reportId
      );

      // 查找学员的家长
      const parentRelations = await prisma.parentChildRelation.findMany({
        where: {
          studentId,
          status: 'ACTIVE',
        },
        include: {
          parent: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      // 通知所有家长
      for (const relation of parentRelations) {
        await this.sendNotification(
          relation.parentId,
          NotificationType.REPORT_GENERATED,
          '学员学习报告已生成',
          `您的孩子完成了"${taskTitle}"训练，学习报告已生成，请查看。`,
          reportId
        );
      }

      logger.info(`报告生成通知已发送: 报告 ${reportId}, 学员 ${studentId}, ${parentRelations.length} 位家长`);
    } catch (error: any) {
      logger.error('发送报告生成通知失败:', error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 发送任务分配通知
   */
  async notifyTaskAssigned(studentId: string, taskId: string, taskTitle: string) {
    try {
      await this.sendNotification(
        studentId,
        NotificationType.TASK_ASSIGNED,
        '新任务分配',
        `您有一个新的学习任务："${taskTitle}"，快来开始训练吧！`,
        taskId
      );

      logger.info(`任务分配通知已发送: 任务 ${taskId}, 学员 ${studentId}`);
    } catch (error: any) {
      logger.error('发送任务分配通知失败:', error);
    }
  }

  /**
   * 发送愿望审批通知
   */
  async notifyWishReviewed(
    studentId: string,
    wishId: string,
    approved: boolean,
    reason?: string
  ) {
    try {
      const title = approved ? '愿望已同意' : '愿望被拒绝';
      const message = approved
        ? '恭喜！您的愿望申请已被家长同意。'
        : `很抱歉，您的愿望申请被拒绝。${reason ? `原因：${reason}` : ''}`;

      await this.sendNotification(
        studentId,
        NotificationType.WISH_REVIEWED,
        title,
        message,
        wishId
      );

      logger.info(`愿望审批通知已发送: 愿望 ${wishId}, 学员 ${studentId}, 结果 ${approved ? '同意' : '拒绝'}`);
    } catch (error: any) {
      logger.error('发送愿望审批通知失败:', error);
    }
  }

  /**
   * 发送积分获得通知
   */
  async notifyPointsEarned(studentId: string, points: number, reason: string) {
    try {
      await this.sendNotification(
        studentId,
        NotificationType.POINTS_EARNED,
        '获得积分',
        `恭喜！您获得了 ${points} 积分。${reason}`,
        undefined
      );

      logger.info(`积分获得通知已发送: 学员 ${studentId}, 积分 ${points}`);
    } catch (error: any) {
      logger.error('发送积分获得通知失败:', error);
    }
  }
}

export const notificationService = new NotificationService();
