import { PrismaClient, WishStatus } from '@prisma/client';
import { studentPointsService } from './studentPointsService';

const prisma = new PrismaClient();

/**
 * 学员愿望服务
 */
export class StudentWishService {
  /**
   * 获取学员愿望列表
   */
  async getWishes(
    studentId: string,
    status?: WishStatus,
    page: number = 1,
    limit: number = 20
  ) {
    const skip = (page - 1) * limit;

    const where: { studentId: string; status?: WishStatus } = { studentId };
    if (status) {
      where.status = status;
    }

    const [wishes, total] = await Promise.all([
      prisma.wish.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
        include: {
          reviewer: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      }),
      prisma.wish.count({ where }),
    ]);

    return {
      wishes: wishes.map((wish) => ({
        id: wish.id,
        description: wish.description,
        requiredPoints: wish.requiredPoints,
        imageUrl: wish.imageUrl,
        status: wish.status,
        reviewedBy: wish.reviewer
          ? {
              id: wish.reviewer.id,
              username: wish.reviewer.username,
            }
          : null,
        reviewReason: wish.reviewReason,
        submittedAt: wish.submittedAt,
        reviewedAt: wish.reviewedAt,
        fulfilledAt: wish.fulfilledAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取愿望详情
   */
  async getWish(wishId: string, studentId: string) {
    const wish = await prisma.wish.findFirst({
      where: {
        id: wishId,
        studentId, // 确保只能查看自己的愿望
      },
      include: {
        reviewer: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!wish) {
      throw new Error('愿望不存在');
    }

    return {
      id: wish.id,
      description: wish.description,
      requiredPoints: wish.requiredPoints,
      imageUrl: wish.imageUrl,
      status: wish.status,
      reviewedBy: wish.reviewer
        ? {
            id: wish.reviewer.id,
            username: wish.reviewer.username,
          }
        : null,
      reviewReason: wish.reviewReason,
      submittedAt: wish.submittedAt,
      reviewedAt: wish.reviewedAt,
      fulfilledAt: wish.fulfilledAt,
    };
  }

  /**
   * 提交愿望
   */
  async createWish(
    studentId: string,
    type: 'CASH' | 'CUSTOM',
    description: string,
    requiredPoints: number,
    imageUrl?: string
  ) {
    // 验证必填字段
    if (!description || description.trim().length === 0) {
      throw new Error('愿望描述不能为空');
    }

    if (requiredPoints <= 0) {
      throw new Error('所需积分必须大于 0');
    }

    // 检查积分是否足够（提示用户）
    const hasEnough = await studentPointsService.hasEnoughPoints(studentId, requiredPoints);
    const { available } = await studentPointsService.getPoints(studentId);

    // 创建愿望
    const wish = await prisma.wish.create({
      data: {
        studentId,
        type,
        description: description.trim(),
        requiredPoints,
        imageUrl,
        status: 'PENDING',
      },
    });

    return {
      wish: {
        id: wish.id,
        type: wish.type,
        description: wish.description,
        requiredPoints: wish.requiredPoints,
        imageUrl: wish.imageUrl,
        status: wish.status,
        submittedAt: wish.submittedAt,
      },
      hasEnoughPoints: hasEnough,
      currentPoints: available,
      pointsNeeded: hasEnough ? 0 : requiredPoints - available,
    };
  }

  /**
   * 学员确认已批准的愿望（原子化扣除积分，防并发重复兑换）
   *
   * 在同一交互式事务内：
   *  1. 对愿望行加 FOR UPDATE 行锁 —— 串行化同一愿望的多次确认，杜绝重复兑换；
   *  2. 复用 studentPointsService.deductWithinTx 在「同一把积分行锁」下扣减，
   *     杜绝并发超扣与余额为负。
   */
  async confirmWish(wishId: string, studentId: string) {
    return prisma.$transaction(async (tx) => {
      // 行级锁愿望行，确保同一愿望不会被并发重复确认/兑换
      const wishRows = await tx.$queryRawUnsafe<{
        status: string;
        confirmed_at: Date | null;
        required_points: number;
      }[]>(
        `SELECT "status", "confirmed_at", "required_points" FROM "wishes" WHERE "id" = $1 AND "student_id" = $2 FOR UPDATE`,
        wishId,
        studentId
      );

      if (!wishRows.length) {
        throw new Error('愿望不存在');
      }

      const wish = wishRows[0];
      if (wish.status !== 'APPROVED') {
        throw new Error('只能确认已批准的愿望');
      }
      if (wish.confirmed_at) {
        throw new Error('愿望已确认');
      }

      // 在同一事务、同一把锁下扣减积分，杜绝重复兑换与超扣
      await studentPointsService.deductWithinTx(
        tx,
        studentId,
        wish.required_points,
        wishId
      );

      const updatedWish = await tx.wish.update({
        where: { id: wishId },
        data: {
          status: 'FULFILLED',
          confirmedAt: new Date(),
          fulfilledAt: new Date(),
        },
      });

      return updatedWish;
    });
  }

  /**
   * 验证愿望提交数据
   */
  validateWishSubmission(description: string, requiredPoints: number): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!description || description.trim().length === 0) {
      errors.push('愿望描述不能为空');
    }

    if (description.length > 500) {
      errors.push('愿望描述不能超过 500 字');
    }

    if (requiredPoints <= 0) {
      errors.push('所需积分必须大于 0');
    }

    if (requiredPoints > 10000) {
      errors.push('所需积分不能超过 10000');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 获取愿望统计信息
   */
  async getWishStats(studentId: string) {
    const [pending, approved, rejected, fulfilled] = await Promise.all([
      prisma.wish.count({ where: { studentId, status: WishStatus.PENDING } }),
      prisma.wish.count({ where: { studentId, status: WishStatus.APPROVED } }),
      prisma.wish.count({ where: { studentId, status: WishStatus.REJECTED } }),
      prisma.wish.count({ where: { studentId, status: WishStatus.FULFILLED } }),
    ]);

    return {
      pending,
      approved,
      rejected,
      fulfilled,
      total: pending + approved + rejected + fulfilled,
    };
  }
}

export const studentWishService = new StudentWishService();
