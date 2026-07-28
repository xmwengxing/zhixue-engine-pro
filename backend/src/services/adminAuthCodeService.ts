import { PrismaClient, AuthCodeStatus } from '@prisma/client';
import { logger } from '../middlewares/logger';
import { Parser } from 'json2csv';

const prisma = new PrismaClient();

/**
 * 管理员授权码管理服务
 */
export class AdminAuthCodeService {
  /**
   * 获取授权码列表（分页查询）
   */
  async getAuthCodes(params: {
    status?: AuthCodeStatus;
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
      where.code = {
        contains: search,
        mode: 'insensitive',
      };
    }

    // 计算分页
    const skip = (page - 1) * limit;

    try {
      // 并行查询总数和数据
      const [total, authCodes] = await Promise.all([
        prisma.authCode.count({ where }),
        prisma.authCode.findMany({
          where,
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                username: true,
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
        authCodes,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('获取授权码列表失败:', error);
      throw new Error('获取授权码列表失败');
    }
  }

  /**
   * 根据 ID 获取授权码详情
   */
  async getAuthCodeById(authCodeId: string) {
    try {
      const authCode = await prisma.authCode.findUnique({
        where: { id: authCodeId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              role: true,
              email: true,
              status: true,
              createdAt: true,
            },
          },
        },
      });

      if (!authCode) {
        throw new Error('授权码不存在');
      }

      return authCode;
    } catch (error) {
      logger.error('获取授权码详情失败:', error);
      throw error;
    }
  }

  /**
   * 批量生成授权码
   */
  async generateAuthCodes(data: {
    count: number;
    expiryDays: number;
  }) {
    const { count, expiryDays } = data;

    // 验证参数
    if (count < 1 || count > 1000) {
      throw new Error('生成数量必须在 1-1000 之间');
    }

    if (expiryDays < 1 || expiryDays > 365) {
      throw new Error('有效期必须在 1-365 天之间');
    }

    try {
      // 计算过期时间
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + expiryDays);

      // 批量生成授权码
      const authCodes = [];
      for (let i = 0; i < count; i++) {
        const code = this.generateUniqueCode();
        authCodes.push({
          code,
          status: AuthCodeStatus.UNUSED,
          expiryDate,
        });
      }

      // 批量插入数据库
      const result = await prisma.authCode.createMany({
        data: authCodes,
        skipDuplicates: true, // 跳过重复的授权码
      });

      logger.info(`批量生成授权码成功: ${result.count} 个`);

      // 返回生成的授权码
      const createdCodes = await prisma.authCode.findMany({
        where: {
          code: {
            in: authCodes.map(ac => ac.code),
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return {
        count: result.count,
        authCodes: createdCodes,
      };
    } catch (error) {
      logger.error('批量生成授权码失败:', error);
      throw error;
    }
  }

  /**
   * 生成唯一授权码
   * 格式: XXXX-XXXX-XXXX-XXXX (16 位大写字母和数字)
   */
  private generateUniqueCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除易混淆字符 I, O, 0, 1
    const segments = 4;
    const segmentLength = 4;
    
    const code = [];
    for (let i = 0; i < segments; i++) {
      let segment = '';
      for (let j = 0; j < segmentLength; j++) {
        segment += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      code.push(segment);
    }
    
    return code.join('-');
  }

  /**
   * 导出授权码为 CSV
   */
  async exportAuthCodes(params: {
    status?: AuthCodeStatus;
  }) {
    const { status } = params;

    try {
      // 构建查询条件
      const where: any = {};
      if (status) {
        where.status = status;
      }

      // 查询授权码
      const authCodes = await prisma.authCode.findMany({
        where,
        include: {
          user: {
            select: {
              username: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // 转换为 CSV 格式
      const fields = [
        { label: '授权码', value: 'code' },
        { label: '状态', value: 'status' },
        { label: '过期时间', value: 'expiryDate' },
        { label: '使用者', value: 'usedBy' },
        { label: '使用时间', value: 'usedAt' },
        { label: '创建时间', value: 'createdAt' },
      ];

      const data = authCodes.map(ac => ({
        code: ac.code,
        status: this.translateStatus(ac.status),
        expiryDate: ac.expiryDate.toISOString().split('T')[0],
        usedBy: ac.user?.username || '',
        usedAt: ac.usedAt ? ac.usedAt.toISOString().split('T')[0] : '',
        createdAt: ac.createdAt.toISOString().split('T')[0],
      }));

      const parser = new Parser({ fields });
      const csv = parser.parse(data);

      logger.info(`导出授权码成功: ${authCodes.length} 个`);
      return csv;
    } catch (error) {
      logger.error('导出授权码失败:', error);
      throw new Error('导出授权码失败');
    }
  }

  /**
   * 翻译授权码状态
   */
  private translateStatus(status: AuthCodeStatus): string {
    const statusMap: Record<AuthCodeStatus, string> = {
      UNUSED: '未使用',
      USED: '已使用',
      EXPIRED: '已过期',
    };
    return statusMap[status] || status;
  }

  /**
   * 获取授权码统计信息
   */
  async getAuthCodeStats() {
    try {
      const [total, unused, used, expired] = await Promise.all([
        prisma.authCode.count(),
        prisma.authCode.count({ where: { status: AuthCodeStatus.UNUSED } }),
        prisma.authCode.count({ where: { status: AuthCodeStatus.USED } }),
        prisma.authCode.count({ where: { status: AuthCodeStatus.EXPIRED } }),
      ]);

      return {
        total,
        byStatus: {
          unused,
          used,
          expired,
        },
      };
    } catch (error) {
      logger.error('获取授权码统计失败:', error);
      throw new Error('获取授权码统计失败');
    }
  }

  /**
   * 删除授权码
   */
  async deleteAuthCode(authCodeId: string) {
    try {
      // 检查授权码是否存在
      const authCode = await prisma.authCode.findUnique({
        where: { id: authCodeId },
      });

      if (!authCode) {
        throw new Error('授权码不存在');
      }

      // 检查授权码是否已使用
      if (authCode.status === AuthCodeStatus.USED) {
        throw new Error('已使用的授权码不能删除');
      }

      // 删除授权码
      await prisma.authCode.delete({
        where: { id: authCodeId },
      });

      logger.info(`删除授权码成功: ${authCode.code}`);
      return { success: true };
    } catch (error) {
      logger.error('删除授权码失败:', error);
      throw error;
    }
  }
}

export const adminAuthCodeService = new AdminAuthCodeService();
