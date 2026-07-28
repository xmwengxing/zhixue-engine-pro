import { PrismaClient, TransactionType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 学员积分服务
 */
export class StudentPointsService {
  /**
   * 获取学员积分信息
   */
  async getPoints(studentId: string) {
    // 获取最新的积分余额
    const latestTransaction = await prisma.pointsTransaction.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });

    const available = latestTransaction?.balance || 0;

    // 计算累计积分（所有正数交易的总和）
    const totalEarned = await prisma.pointsTransaction.aggregate({
      where: {
        studentId,
        amount: { gt: 0 },
      },
      _sum: {
        amount: true,
      },
    });

    const total = totalEarned._sum.amount || 0;

    // 获取积分历史记录
    const history = await prisma.pointsTransaction.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 50, // 最近 50 条记录
    });

    return {
      available,
      total,
      history: history.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        relatedId: t.relatedId,
        balance: t.balance,
        createdAt: t.createdAt,
      })),
    };
  }

  /**
   * 计算积分（基于难度和表现）
   * @param difficulty 难度等级 (1-5)
   * @param correctRate 正确率 (0-1)
   * @param timeSpent 用时（秒）
   * @param basePoints 基础积分
   */
  calculatePoints(
    difficulty: number,
    correctRate: number,
    timeSpent: number,
    basePoints: number = 10
  ): number {
    // 如果答错，不给积分
    if (correctRate === 0) {
      return 0;
    }

    // 基础积分 × 难度系数 × 正确率
    let points = basePoints * difficulty * correctRate;

    // 时间奖励：如果用时少于平均时间，额外奖励
    const averageTime = 60 * difficulty; // 假设平均时间为难度 × 60 秒
    if (timeSpent < averageTime) {
      const timeBonus = 1 + (averageTime - timeSpent) / averageTime * 0.5;
      points *= timeBonus;
    }

    // 四舍五入到整数
    return Math.round(points);
  }

  /**
   * 添加积分交易记录
   */
  async addTransaction(
    studentId: string,
    amount: number,
    type: TransactionType,
    relatedId?: string
  ) {
    // 获取当前余额
    const latestTransaction = await prisma.pointsTransaction.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });

    const currentBalance = latestTransaction?.balance || 0;
    const newBalance = currentBalance + amount;

    // 创建交易记录
    const transaction = await prisma.pointsTransaction.create({
      data: {
        studentId,
        amount,
        type,
        relatedId,
        balance: newBalance,
      },
    });

    return transaction;
  }

  /**
   * 任务完成奖励积分
   */
  async rewardTaskCompletion(
    studentId: string,
    taskId: string,
    difficulty: number,
    correctRate: number,
    timeSpent: number
  ) {
    const points = this.calculatePoints(difficulty, correctRate, timeSpent, 10);

    if (points > 0) {
      return await this.addTransaction(
        studentId,
        points,
        TransactionType.TASK_COMPLETE,
        taskId
      );
    }

    return null;
  }

  /**
   * 错题重做奖励积分
   */
  async rewardErrorRetry(
    studentId: string,
    errorQuestionId: string,
    difficulty: number
  ) {
    // 错题重做奖励固定积分
    const points = difficulty * 5;

    return await this.addTransaction(
      studentId,
      points,
      TransactionType.ERROR_RETRY,
      errorQuestionId
    );
  }

  /**
   * 扣除愿望积分
   */
  async deductWishPoints(studentId: string, wishId: string, points: number) {
    // 检查余额是否足够
    const { available } = await this.getPoints(studentId);

    if (available < points) {
      throw new Error('积分不足');
    }

    return await this.addTransaction(
      studentId,
      -points,
      TransactionType.WISH_REDEEM,
      wishId
    );
  }

  /**
   * 检查积分是否足够
   */
  async hasEnoughPoints(studentId: string, requiredPoints: number): Promise<boolean> {
    const { available } = await this.getPoints(studentId);
    return available >= requiredPoints;
  }
}

export const studentPointsService = new StudentPointsService();
