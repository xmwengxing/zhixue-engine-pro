/**
 * 数据库事务管理工具
 * 提供事务操作的封装，确保操作的原子性
 */

import { PrismaClient } from '@prisma/client';
import prisma from '../config/database';

/**
 * 事务操作回调函数类型
 */
export type TransactionCallback<T> = (tx: PrismaClient) => Promise<T>;

/**
 * 事务管理器类
 */
export class TransactionManager {
  /**
   * 执行事务操作
   * @param callback 事务回调函数
   * @returns 事务执行结果
   */
  public static async execute<T>(callback: TransactionCallback<T>): Promise<T> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        return await callback(tx as PrismaClient);
      });

      return result;
    } catch (error) {
      console.error('事务执行失败:', error);
      throw error;
    }
  }

  /**
   * 执行带重试的事务操作
   * @param callback 事务回调函数
   * @param maxRetries 最大重试次数
   * @param retryDelay 重试延迟（毫秒）
   * @returns 事务执行结果
   */
  public static async executeWithRetry<T>(
    callback: TransactionCallback<T>,
    maxRetries = 3,
    retryDelay = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.execute(callback);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('事务执行失败');

        // 如果是最后一次尝试，直接抛出错误
        if (attempt === maxRetries) {
          break;
        }

        // 检查是否是可重试的错误
        if (!this.isRetryableError(error)) {
          throw error;
        }

        console.warn(`事务执行失败，${retryDelay}ms 后重试 (${attempt + 1}/${maxRetries})`);
        await this.delay(retryDelay * (attempt + 1));
      }
    }

    throw lastError;
  }

  /**
   * 判断错误是否可重试
   * @param error 错误对象
   * @returns 是否可重试
   */
  private static isRetryableError(error: unknown): boolean {
    // Prisma 事务冲突错误代码
    const retryableErrorCodes = [
      'P2034', // 事务冲突
      'P2028', // 事务 API 错误
    ];

    // 类型守卫：检查是否是 Prisma 错误
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as { code: string };
      return retryableErrorCodes.includes(prismaError.code);
    }

    // 检查是否是网络错误
    if (error && typeof error === 'object' && 'message' in error) {
      const errorWithMessage = error as { message: string };
      return errorWithMessage.message.includes('ECONNRESET') || 
             errorWithMessage.message.includes('ETIMEDOUT');
    }

    return false;
  }

  /**
   * 延迟函数
   * @param ms 延迟毫秒数
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 愿望审批事务
 * 家长审批通过后，愿望状态变为 APPROVED，等待学员确认
 * 学员确认后才扣除积分并变为 FULFILLED
 */
export async function approveWishTransaction(
  wishId: string,
  reviewerId: string,
  approved: boolean,
  reason?: string
): Promise<void> {
  await TransactionManager.execute(async (tx) => {
    // 获取愿望信息
    const wish = await tx.wish.findUnique({
      where: { id: wishId },
      include: { student: true },
    });

    if (!wish) {
      throw new Error('愿望不存在');
    }

    if (wish.status !== 'PENDING') {
      throw new Error('愿望已被审批');
    }

    if (approved) {
      // 更新愿望状态为已批准（等待学员确认）
      await tx.wish.update({
        where: { id: wishId },
        data: {
          status: 'APPROVED',
          reviewedBy: reviewerId,
          reviewReason: reason,
          reviewedAt: new Date(),
        },
      });
    } else {
      // 更新愿望状态为已拒绝
      await tx.wish.update({
        where: { id: wishId },
        data: {
          status: 'REJECTED',
          reviewedBy: reviewerId,
          reviewReason: reason,
          reviewedAt: new Date(),
        },
      });
    }
  });
}

/**
 * 任务完成事务
 * 包含任务状态更新和积分发放
 */
export async function completeTaskTransaction(
  sessionId: string,
  pointsEarned: number
): Promise<void> {
  await TransactionManager.execute(async (tx) => {
    // 获取训练会话信息
    const session = await tx.trainingSession.findUnique({
      where: { id: sessionId },
      include: { task: true },
    });

    if (!session) {
      throw new Error('训练会话不存在');
    }

    if (session.status === 'COMPLETED') {
      throw new Error('训练会话已完成');
    }

    // 更新训练会话状态
    await tx.trainingSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
      },
    });

    // 更新任务状态
    await tx.task.update({
      where: { id: session.taskId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // 获取当前积分余额
    const latestTransaction = await tx.pointsTransaction.findFirst({
      where: { studentId: session.studentId },
      orderBy: { createdAt: 'desc' },
    });

    const currentBalance = latestTransaction?.balance || 0;

    // 发放积分
    await tx.pointsTransaction.create({
      data: {
        studentId: session.studentId,
        amount: pointsEarned,
        type: 'TASK_COMPLETE',
        relatedId: session.taskId,
        balance: currentBalance + pointsEarned,
      },
    });
  });
}

/**
 * 错题重做完成事务
 * 包含错题掌握度更新和积分奖励
 */
export async function completeErrorRetryTransaction(
  errorQuestionId: string,
  isCorrect: boolean,
  pointsEarned: number
): Promise<void> {
  await TransactionManager.execute(async (tx) => {
    // 获取错题信息
    const errorQuestion = await tx.errorQuestion.findUnique({
      where: { id: errorQuestionId },
    });

    if (!errorQuestion) {
      throw new Error('错题不存在');
    }

    // 更新错题信息
    const newRetryCount = errorQuestion.retryCount + 1;
    let newMastery = errorQuestion.mastery;

    if (isCorrect) {
      // 根据重做次数更新掌握度
      if (newRetryCount === 1) {
        newMastery = 'MASTERING';
      } else if (newRetryCount >= 2) {
        newMastery = 'MASTERED';
      }
    }

    await tx.errorQuestion.update({
      where: { id: errorQuestionId },
      data: {
        retryCount: newRetryCount,
        mastery: newMastery,
        lastRetryAt: new Date(),
      },
    });

    // 如果答对了，发放积分
    if (isCorrect && pointsEarned > 0) {
      const latestTransaction = await tx.pointsTransaction.findFirst({
        where: { studentId: errorQuestion.studentId },
        orderBy: { createdAt: 'desc' },
      });

      const currentBalance = latestTransaction?.balance || 0;

      await tx.pointsTransaction.create({
        data: {
          studentId: errorQuestion.studentId,
          amount: pointsEarned,
          type: 'ERROR_RETRY',
          relatedId: errorQuestionId,
          balance: currentBalance + pointsEarned,
        },
      });
    }
  });
}

/**
 * 创建用户事务
 * 包含用户创建和授权码标记
 */
export async function createUserTransaction(
  username: string,
  passwordHash: string,
  role: string,
  authCode: string
): Promise<{ userId: string }> {
  return await TransactionManager.execute(async (tx) => {
    // 验证授权码
    const authCodeRecord = await tx.authCode.findUnique({
      where: { code: authCode },
    });

    if (!authCodeRecord) {
      throw new Error('授权码不存在');
    }

    if (authCodeRecord.status !== 'UNUSED') {
      throw new Error('授权码已被使用或已过期');
    }

    if (new Date() > authCodeRecord.expiryDate) {
      throw new Error('授权码已过期');
    }

    // 创建用户
    const user = await tx.user.create({
      data: {
        username,
        passwordHash,
        role: role as 'ADMIN' | 'PARENT' | 'STUDENT',
      },
    });

    // 标记授权码为已使用
    await tx.authCode.update({
      where: { id: authCodeRecord.id },
      data: {
        status: 'USED',
        usedBy: user.id,
        usedAt: new Date(),
      },
    });

    return { userId: user.id };
  });
}

/**
 * 绑定学员事务
 * 包含亲子关系创建和学号分配
 */
export async function bindStudentTransaction(
  parentId: string,
  studentId: string,
  relation: string
): Promise<void> {
  await TransactionManager.execute(async (tx) => {
    // 检查学员是否存在
    const student = await tx.user.findUnique({
      where: { id: studentId },
    });

    if (!student || student.role !== 'STUDENT') {
      throw new Error('学员不存在');
    }

    // 检查是否已绑定
    const existingRelation = await tx.parentChildRelation.findFirst({
      where: {
        parentId,
        studentId,
        status: 'ACTIVE',
      },
    });

    if (existingRelation) {
      throw new Error('已绑定该学员');
    }

    // 创建亲子关系
    await tx.parentChildRelation.create({
      data: {
        parentId,
        studentId,
        relation,
      },
    });
  });
}
