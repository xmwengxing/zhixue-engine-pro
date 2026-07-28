import { Prisma, PrismaClient, TransactionType } from '@prisma/client';

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
   * 在事务内锁定并读取学员最新积分余额。
   * 通过 SELECT ... FOR UPDATE 对最新一条积分流水加行级锁，
   * 阻止并发事务读到过期余额，从而避免丢失更新（积分超扣/重复加分）。
   */
  private async readLockedBalance(
    tx: Prisma.TransactionClient,
    studentId: string
  ): Promise<number> {
    const rows = await tx.$queryRawUnsafe<{ balance: number }[]>(
      `SELECT "balance" FROM "points_transactions" WHERE "student_id" = $1 ORDER BY "created_at" DESC, "id" DESC LIMIT 1 FOR UPDATE`,
      studentId
    );
    return rows.length ? Number(rows[0].balance) : 0;
  }

  /**
   * 原子化添加积分交易（防并发丢失更新 / 超扣）
   * 在交互式事务内对学员最新积分流水加行级锁(FOR UPDATE)，
   * 读取实时余额后再计算新余额并写入，确保并发写入串行化。
   */
  async addTransaction(
    studentId: string,
    amount: number,
    type: TransactionType,
    relatedId?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const currentBalance = await this.readLockedBalance(tx, studentId);
      const newBalance = currentBalance + amount;
      if (newBalance < 0) {
        throw new Error('积分余额不足');
      }
      return tx.pointsTransaction.create({
        data: {
          studentId,
          amount,
          type,
          relatedId,
          balance: newBalance,
        },
      });
    });
  }

  /**
   * 在外部传入的事务内扣除积分（供心愿确认等跨服务事务复用）。
   * 与 readLockedBalance 共用同一把行锁，确保愿望状态更新与积分扣减原子化，
   * 从根本上杜绝并发下的「重复兑换」。
   */
  async deductWithinTx(
    tx: Prisma.TransactionClient,
    studentId: string,
    points: number,
    relatedId?: string
  ) {
    const currentBalance = await this.readLockedBalance(tx, studentId);
    if (currentBalance < points) {
      throw new Error('积分不足');
    }
    return tx.pointsTransaction.create({
      data: {
        studentId,
        amount: -points,
        type: TransactionType.WISH_REDEEM,
        relatedId,
        balance: currentBalance - points,
      },
    });
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
   * 扣除愿望积分（原子化，防并发超扣）
   * 在事务内加行级锁读取实时余额并校验，避免「读-判-写」非原子导致的超扣。
   */
  async deductWishPoints(studentId: string, wishId: string, points: number) {
    return prisma.$transaction(async (tx) => {
      const currentBalance = await this.readLockedBalance(tx, studentId);
      if (currentBalance < points) {
        throw new Error('积分不足');
      }
      return tx.pointsTransaction.create({
        data: {
          studentId,
          amount: -points,
          type: TransactionType.WISH_REDEEM,
          relatedId: wishId,
          balance: currentBalance - points,
        },
      });
    });
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
