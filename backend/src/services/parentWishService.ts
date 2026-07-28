import { PrismaClient, WishStatus } from '@prisma/client';
import { approveWishTransaction } from '../utils/transaction';

const prisma = new PrismaClient();

/**
 * 家长端愿望审批服务
 */
export class ParentWishService {
  /**
   * 获取愿望列表
   * @param parentId 家长 ID
   * @param filters 筛选条件
   * @returns 愿望列表和总数
   */
  async getWishes(
    parentId: string,
    filters: {
      studentId?: string;
      status?: WishStatus;
      page?: number;
      limit?: number;
    }
  ) {
    const { studentId, status, page = 1, limit = 10 } = filters;

    // 验证家长是否有权限查看该学员的愿望
    if (studentId) {
      const relation = await prisma.parentChildRelation.findFirst({
        where: {
          parentId,
          studentId,
          status: 'ACTIVE',
        },
      });

      if (!relation) {
        throw new Error('无权限查看该学员的愿望');
      }
    }

    // 构建查询条件
    const where: any = {};

    // 如果指定了学员 ID，直接筛选
    if (studentId) {
      where.studentId = studentId;
    } else {
      // 否则查询所有绑定学员的愿望
      const relations = await prisma.parentChildRelation.findMany({
        where: {
          parentId,
          status: 'ACTIVE',
        },
        select: {
          studentId: true,
        },
      });

      const studentIds = relations.map((r) => r.studentId);
      where.studentId = { in: studentIds };
    }

    if (status) {
      where.status = status;
    }

    // 查询总数
    const total = await prisma.wish.count({ where });

    // 查询愿望列表
    const wishes = await prisma.wish.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            username: true,
            studentProfile: {
              select: {
                realName: true,
              },
            },
          },
        },
      },
      orderBy: {
        submittedAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      wishes,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 审批愿望
   * @param wishId 愿望 ID
   * @param parentId 家长 ID
   * @param approved 是否同意
   * @param reason 审批理由（可选）
   * @returns 更新后的愿望
   */
  async approveWish(
    wishId: string,
    parentId: string,
    approved: boolean,
    reason?: string
  ) {
    // 验证家长权限
    const wish = await prisma.wish.findUnique({
      where: { id: wishId },
      include: {
        student: true,
      },
    });

    if (!wish) {
      throw new Error('愿望不存在');
    }

    const relation = await prisma.parentChildRelation.findFirst({
      where: {
        parentId,
        studentId: wish.studentId,
        status: 'ACTIVE',
      },
    });

    if (!relation) {
      throw new Error('无权限审批该愿望');
    }

    // 使用事务管理器执行审批操作（带重试机制）
    await approveWishTransaction(wishId, parentId, approved, reason);

    // 查询更新后的愿望
    const updatedWish = await prisma.wish.findUnique({
      where: { id: wishId },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            studentProfile: {
              select: {
                realName: true,
              },
            },
          },
        },
        reviewer: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // TODO: 发送通知给学员
    // await notificationService.sendWishReviewNotification(wish.studentId, updatedWish);

    return updatedWish;
  }

  /**
   * 获取单个愿望详情
   * @param wishId 愿望 ID
   * @param parentId 家长 ID
   * @returns 愿望详情
   */
  async getWishById(wishId: string, parentId: string) {
    const wish = await prisma.wish.findUnique({
      where: { id: wishId },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            studentProfile: {
              select: {
                realName: true,
              },
            },
          },
        },
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

    // 验证家长权限
    const relation = await prisma.parentChildRelation.findFirst({
      where: {
        parentId,
        studentId: wish.studentId,
        status: 'ACTIVE',
      },
    });

    if (!relation) {
      throw new Error('无权限查看该愿望');
    }

    return wish;
  }
}

export const parentWishService = new ParentWishService();
