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
   * 学员确认已批准的愿望（扣除积分）
   */
  async confirmWish(wishId: string, studentId: string) {
    // 获取愿望信息
    const wish = await prisma.wish.findFirst({
      where: {
        id: wishId,
        studentId, // 确保只能确认自己的愿望
      },
    });

    if (!wish) {
      throw new Error('愿望不存在');
    }

    if (wish.status !== 'APPROVED') {
      throw new Error('只能确认已批准的愿望');
    }

    if (wish.confirmedAt) {
      throw new Error('愿望已确认');
    }

    // 检查积分是否足够
    const hasEnough = await studentPointsService.hasEnoughPoints(studentId, wish.requiredPoints);
    if (!hasEnough) {
      throw new Error('积分不足');
    }

    // 使用事务：扣除积分并更新愿望状态
    const result = await prisma.$transaction(async (tx) => {
      // 获取当前积分余额
      const latestTransaction = await tx.pointsTransaction.findFirst({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
      });

      const currentBalance = latestTransaction?.balance || 0;

      // 扣除积分
      await tx.pointsTransaction.create({
        data: {
          studentId,
          amount: -wish.requiredPoints,
          type: 'WISH_REDEEM',
          relatedId: wishId,
          balance: currentBalance - wish.requiredPoints,
        },
      });

      // 更新愿望状态为已兑现
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

    return result;
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
