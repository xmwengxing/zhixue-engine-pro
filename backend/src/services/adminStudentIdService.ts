import { PrismaClient, StudentIDStatus } from '@prisma/client';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

/**
 * 管理员学号管理服务
 */
export class AdminStudentIdService {
  /**
   * 获取学号列表（分页查询）
   */
  async getStudentIds(params: {
    status?: StudentIDStatus;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const {
      status,
      page = 1,
      limit = 10,
      search,
    } = params;

    // 构建查询条件
    const where: any = {};
    
    if (status) {
      where.status = status;
    }
    
    if (search) {
      where.studentIdNumber = {
        contains: search,
        mode: 'insensitive',
      };
    }

    // 计算分页
    const skip = (page - 1) * limit;

    try {
      // 并行查询总数和数据
      const [total, studentIds] = await Promise.all([
        prisma.studentID.count({ where }),
        prisma.studentID.findMany({
          where,
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                realName: true,
                role: true,
                status: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        }),
      ]);

      return {
        studentIds,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('获取学号列表失败:', error);
      throw new Error('获取学号列表失败');
    }
  }

  /**
   * 根据 ID 获取学号详情
   */
  async getStudentIdById(studentIdId: string) {
    try {
      const studentId = await prisma.studentID.findUnique({
        where: { id: studentIdId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              realName: true,
              role: true,
              email: true,
              phone: true,
              status: true,
              createdAt: true,
            },
          },
        },
      });

      if (!studentId) {
        throw new Error('学号不存在');
      }

      return studentId;
    } catch (error) {
      logger.error('获取学号详情失败:', error);
      throw error;
    }
  }

  /**
   * 分配学号给用户
   */
  async assignStudentId(data: {
    studentIdId: string;
    userId: string;
  }) {
    const { studentIdId, userId } = data;

    try {
      // 检查学号是否存在
      const studentId = await prisma.studentID.findUnique({
        where: { id: studentIdId },
      });

      if (!studentId) {
        throw new Error('学号不存在');
      }

      // 检查学号状态
      if (studentId.status !== StudentIDStatus.AVAILABLE) {
        throw new Error('学号不可用，当前状态为: ' + studentId.status);
      }

      // 检查用户是否存在
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      // 检查用户是否已有学号
      const existingStudentId = await prisma.studentID.findFirst({
        where: { userId },
      });

      if (existingStudentId) {
        throw new Error('该用户已分配学号');
      }

      // 分配学号
      const updatedStudentId = await prisma.studentID.update({
        where: { id: studentIdId },
        data: {
          userId,
          status: StudentIDStatus.ASSIGNED,
          assignedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              role: true,
            },
          },
        },
      });

      logger.info(`学号分配成功: ${studentId.studentIdNumber} -> ${user.username}`);
      return updatedStudentId;
    } catch (error) {
      logger.error('分配学号失败:', error);
      throw error;
    }
  }

  /**
   * 锁定学号
   */
  async lockStudentId(studentIdId: string) {
    try {
      // 检查学号是否存在
      const studentId = await prisma.studentID.findUnique({
        where: { id: studentIdId },
      });

      if (!studentId) {
        throw new Error('学号不存在');
      }

      // 检查学号状态
      if (studentId.status === StudentIDStatus.LOCKED) {
        throw new Error('学号已被锁定');
      }

      // 锁定学号
      const updatedStudentId = await prisma.studentID.update({
        where: { id: studentIdId },
        data: {
          status: StudentIDStatus.LOCKED,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      logger.info(`学号锁定成功: ${studentId.studentIdNumber}`);
      return updatedStudentId;
    } catch (error) {
      logger.error('锁定学号失败:', error);
      throw error;
    }
  }

  /**
   * 解锁学号
   */
  async unlockStudentId(studentIdId: string) {
    try {
      // 检查学号是否存在
      const studentId = await prisma.studentID.findUnique({
        where: { id: studentIdId },
      });

      if (!studentId) {
        throw new Error('学号不存在');
      }

      // 检查学号状态
      if (studentId.status !== StudentIDStatus.LOCKED) {
        throw new Error('学号未被锁定');
      }

      // 解锁学号（恢复到之前的状态）
      const newStatus = studentId.userId 
        ? StudentIDStatus.ASSIGNED 
        : StudentIDStatus.AVAILABLE;

      const updatedStudentId = await prisma.studentID.update({
        where: { id: studentIdId },
        data: {
          status: newStatus,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      logger.info(`学号解锁成功: ${studentId.studentIdNumber}`);
      return updatedStudentId;
    } catch (error) {
      logger.error('解锁学号失败:', error);
      throw error;
    }
  }

  /**
   * 解绑学号
   */
  async unbindStudentId(studentIdId: string) {
    try {
      // 检查学号是否存在
      const studentId = await prisma.studentID.findUnique({
        where: { id: studentIdId },
        include: {
          user: true,
        },
      });

      if (!studentId) {
        throw new Error('学号不存在');
      }

      // 检查学号是否已分配
      if (!studentId.userId) {
        throw new Error('学号未分配给任何用户');
      }

      // 解绑学号
      const updatedStudentId = await prisma.studentID.update({
        where: { id: studentIdId },
        data: {
          userId: null,
          status: StudentIDStatus.AVAILABLE,
          assignedAt: null,
        },
      });

      logger.info(`学号解绑成功: ${studentId.studentIdNumber} (原用户: ${studentId.user?.username})`);
      return updatedStudentId;
    } catch (error) {
      logger.error('解绑学号失败:', error);
      throw error;
    }
  }

  /**
   * 获取学号统计信息
   */
  async getStudentIdStats() {
    try {
      const [total, available, assigned, locked] = await Promise.all([
        prisma.studentID.count(),
        prisma.studentID.count({ where: { status: StudentIDStatus.AVAILABLE } }),
        prisma.studentID.count({ where: { status: StudentIDStatus.ASSIGNED } }),
        prisma.studentID.count({ where: { status: StudentIDStatus.LOCKED } }),
      ]);

      return {
        total,
        byStatus: {
          available,
          assigned,
          locked,
        },
      };
    } catch (error) {
      logger.error('获取学号统计失败:', error);
      throw new Error('获取学号统计失败');
    }
  }
}

export const adminStudentIdService = new AdminStudentIdService();
