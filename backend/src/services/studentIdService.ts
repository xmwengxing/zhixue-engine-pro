import { PrismaClient } from '@prisma/client';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

/**
 * 学号生成服务
 */
export class StudentIdService {
  /**
   * 生成学号
   * 格式: STU + 年份后两位 + 6位流水号
   * 例如: STU26000001 (2026年第1个学号)
   * 
   * 使用重试机制处理并发冲突
   * 
   * @returns 生成的学号字符串
   */
  async generateStudentId(): Promise<string> {
    const maxRetries = 10; // 最多重试10次
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 使用事务确保并发安全
        return await prisma.$transaction(async (tx) => {
          // 获取当前年份的后两位
          const currentYear = new Date().getFullYear();
          const yearSuffix = (currentYear % 100).toString().padStart(2, '0');
          const yearPrefix = `STU${yearSuffix}`;

          // 查询当年已生成的最大学号(使用FOR UPDATE锁定行,防止并发)
          const lastStudent = await tx.studentID.findFirst({
            where: {
              studentIdNumber: {
                startsWith: yearPrefix,
              },
            },
            orderBy: {
              studentIdNumber: 'desc',
            },
          });

          // 计算新的流水号
          let sequence = 1;
          if (lastStudent) {
            // 提取最后6位流水号并加1
            const lastSequence = parseInt(lastStudent.studentIdNumber.slice(-6));
            sequence = lastSequence + 1;
          }

          // 格式化流水号为6位，不足补0
          const sequenceStr = sequence.toString().padStart(6, '0');
          const studentIdNumber = `${yearPrefix}${sequenceStr}`;

          // 验证学号格式
          if (studentIdNumber.length !== 11) {
            throw new Error(`学号格式错误: ${studentIdNumber}, 长度应为11位`);
          }

          // 验证学号唯一性（双重保险）
          const existing = await tx.studentID.findUnique({
            where: { studentIdNumber },
          });

          if (existing) {
            throw new Error(`学号已存在: ${studentIdNumber}, 需要重试`);
          }

          logger.info(`生成新学号: ${studentIdNumber} (年份: ${currentYear}, 流水号: ${sequence})`);
          return studentIdNumber;
        });
      } catch (error: any) {
        lastError = error;
        
        // 如果是学号已存在的错误,等待一小段时间后重试
        if (error.message && error.message.includes('学号已存在')) {
          logger.warn(`学号生成冲突,第${attempt + 1}次重试...`);
          // 随机等待10-50ms,避免多个请求同时重试
          await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 40));
          continue;
        }
        
        // 其他错误直接抛出
        throw error;
      }
    }

    // 重试次数用尽
    logger.error(`学号生成失败: 重试${maxRetries}次后仍然冲突`);
    throw new Error(`学号生成失败: ${lastError?.message || '未知错误'}`);
  }

  /**
   * 创建学号记录
   * 生成学号并在数据库中创建记录
   * 
   * @param userId 可选的用户ID，如果提供则直接分配给该用户
   * @returns 创建的学号记录
   */
  async createStudentId(userId?: string) {
    try {
      // 生成学号
      const studentIdNumber = await this.generateStudentId();

      // 创建学号记录
      const studentId = await prisma.studentID.create({
        data: {
          studentIdNumber,
          status: userId ? 'ASSIGNED' : 'AVAILABLE',
          userId: userId || null,
          assignedAt: userId ? new Date() : null,
        },
      });

      logger.info(`学号记录创建成功: ${studentIdNumber}${userId ? ` (已分配给用户: ${userId})` : ' (可用状态)'}`);
      return studentId;
    } catch (error) {
      logger.error('创建学号记录失败:', error);
      throw error;
    }
  }

  /**
   * 批量生成学号
   * 用于管理员批量创建学号
   * 
   * @param count 要生成的学号数量
   * @returns 生成的学号列表
   */
  async batchGenerateStudentIds(count: number): Promise<string[]> {
    if (count <= 0 || count > 1000) {
      throw new Error('批量生成数量必须在1-1000之间');
    }

    const studentIds: string[] = [];

    try {
      for (let i = 0; i < count; i++) {
        const studentIdNumber = await this.generateStudentId();
        
        // 创建学号记录
        await prisma.studentID.create({
          data: {
            studentIdNumber,
            status: 'AVAILABLE',
          },
        });

        studentIds.push(studentIdNumber);
      }

      logger.info(`批量生成学号成功: 共${count}个`);
      return studentIds;
    } catch (error) {
      logger.error('批量生成学号失败:', error);
      throw error;
    }
  }

  /**
   * 获取指定年份的学号统计
   * 
   * @param year 年份，默认为当前年份
   * @returns 统计信息
   */
  async getYearlyStats(year?: number) {
    const targetYear = year || new Date().getFullYear();
    const yearSuffix = (targetYear % 100).toString().padStart(2, '0');
    const yearPrefix = `STU${yearSuffix}`;

    try {
      const total = await prisma.studentID.count({
        where: {
          studentIdNumber: {
            startsWith: yearPrefix,
          },
        },
      });

      const assigned = await prisma.studentID.count({
        where: {
          studentIdNumber: {
            startsWith: yearPrefix,
          },
          status: 'ASSIGNED',
        },
      });

      const available = await prisma.studentID.count({
        where: {
          studentIdNumber: {
            startsWith: yearPrefix,
          },
          status: 'AVAILABLE',
        },
      });

      return {
        year: targetYear,
        total,
        assigned,
        available,
        nextSequence: total + 1,
      };
    } catch (error) {
      logger.error('获取年度学号统计失败:', error);
      throw error;
    }
  }
}

export const studentIdService = new StudentIdService();
