// 学员档案服务
import { PrismaClient } from '@prisma/client';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

/**
 * 学员档案服务类
 * 处理学员个人档案的创建、更新和查询
 */
export class StudentProfileService {
  /**
   * 获取学员档案
   * @param userId 用户 ID
   * @returns 学员档案信息
   */
  async getProfile(userId: string) {
    try {
      logger.info(`获取学员档案: userId=${userId}`);

      // 查询学员档案
      const profile = await prisma.studentProfile.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true,
              createdAt: true,
              studentId: {
                select: {
                  studentIdNumber: true,
                },
              },
            },
          },
        },
      });

      if (!profile) {
        logger.warn(`学员档案不存在: userId=${userId}`);
        return null;
      }

      logger.info(`成功获取学员档案: userId=${userId}`);
      return profile;
    } catch (error) {
      logger.error(`获取学员档案失败: userId=${userId}`, error);
      throw new Error('获取学员档案失败');
    }
  }

  /**
   * 更新学员档案（仅允许更新部分字段）
   * @param userId 用户 ID
   * @param profileData 档案数据
   * @returns 更新后的档案信息
   */
  async updateProfile(
    userId: string,
    profileData: {
      grade?: string;
      school?: string;
      learningFoundation?: string;
      interests?: string;
      materialVersion?: string;
    }
  ) {
    try {
      logger.info(`更新学员档案: userId=${userId}`, profileData);

      // 获取现有档案
      const existingProfile = await prisma.studentProfile.findUnique({
        where: { userId },
      });

      if (!existingProfile) {
        throw new Error('学员档案不存在');
      }

      // 更新档案（仅更新允许的字段）
      const profile = await prisma.studentProfile.update({
        where: { userId },
        data: {
          ...(profileData.grade && { grade: profileData.grade }),
          ...(profileData.school !== undefined && { school: profileData.school }),
          ...(profileData.learningFoundation && { learningFoundation: profileData.learningFoundation }),
          ...(profileData.interests !== undefined && { interests: profileData.interests }),
          ...(profileData.materialVersion !== undefined && { materialVersion: profileData.materialVersion }),
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true,
              createdAt: true,
              studentId: {
                select: {
                  studentIdNumber: true,
                },
              },
            },
          },
        },
      });

      logger.info(`成功更新学员档案: userId=${userId}`);
      return profile;
    } catch (error) {
      logger.error(`更新学员档案失败: userId=${userId}`, error);
      throw error;
    }
  }

  /**
   * 修改密码
   * @param userId 用户 ID
   * @param oldPassword 原密码
   * @param newPassword 新密码
   */
  async updatePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ) {
    try {
      logger.info(`修改密码: userId=${userId}`);

      // 导入bcrypt
      const bcrypt = require('bcrypt');

      // 获取用户信息
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      // 验证原密码
      const isPasswordValid = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!isPasswordValid) {
        throw new Error('原密码错误');
      }

      // 加密新密码
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // 更新密码
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
        },
      });

      logger.info(`成功修改密码: userId=${userId}`);
    } catch (error) {
      logger.error(`修改密码失败: userId=${userId}`, error);
      throw error;
    }
  }

  /**
   * 创建或更新学员档案
   * @param userId 用户 ID
   * @param profileData 档案数据
   * @returns 更新后的档案信息
   */
  async upsertProfile(
    userId: string,
    profileData: {
      realName?: string;
      grade?: string;
      materialVersion?: string;
      subjectLevels?: Record<string, string>;
    }
  ) {
    try {
      logger.info(`更新学员档案: userId=${userId}`, profileData);

      // 验证用户是否存在且为学员角色
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      if (user.role !== 'STUDENT') {
        throw new Error('只有学员可以创建档案');
      }

      // 获取现有档案（如果存在）
      const existingProfile = await prisma.studentProfile.findUnique({
        where: { userId },
      });

      // 计算档案完整度
      const completeness = this.calculateCompleteness({
        ...existingProfile,
        ...profileData,
      });

      // 创建或更新档案
      const profile = await prisma.studentProfile.upsert({
        where: { userId },
        create: {
          userId,
          realName: profileData.realName || '',
          gender: '', // 默认空字符串
          grade: profileData.grade || '',
          materialVersion: profileData.materialVersion || '',
          subjectLevels: profileData.subjectLevels || {},
          completeness,
        },
        update: {
          ...(profileData.realName && { realName: profileData.realName }),
          ...(profileData.grade && { grade: profileData.grade }),
          ...(profileData.materialVersion && { materialVersion: profileData.materialVersion }),
          ...(profileData.subjectLevels && { subjectLevels: profileData.subjectLevels }),
          completeness,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true,
              createdAt: true,
              studentId: {
                select: {
                  studentIdNumber: true,
                },
              },
            },
          },
        },
      });

      logger.info(`成功更新学员档案: userId=${userId}, completeness=${completeness}%`);
      return profile;
    } catch (error) {
      logger.error(`更新学员档案失败: userId=${userId}`, error);
      throw error;
    }
  }

  /**
   * 学习基础自评
   * @param userId 用户 ID
   * @param subject 科目
   * @param level 能力等级
   * @returns 更新后的档案信息
   */
  async selfAssessment(
    userId: string,
    subject: string,
    level: 'weak' | 'average' | 'good' | 'excellent'
  ) {
    try {
      logger.info(`学习基础自评: userId=${userId}, subject=${subject}, level=${level}`);

      // 获取现有档案
      const existingProfile = await prisma.studentProfile.findUnique({
        where: { userId },
      });

      if (!existingProfile) {
        throw new Error('请先创建学员档案');
      }

      // 更新科目水平
      const subjectLevels = existingProfile.subjectLevels as Record<string, string>;
      subjectLevels[subject] = level;

      // 计算新的完整度
      const completeness = this.calculateCompleteness({
        ...existingProfile,
        subjectLevels,
      });

      // 更新档案
      const profile = await prisma.studentProfile.update({
        where: { userId },
        data: {
          subjectLevels,
          completeness,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              studentId: {
                select: {
                  studentIdNumber: true,
                },
              },
            },
          },
        },
      });

      logger.info(`成功更新科目自评: userId=${userId}, subject=${subject}`);
      return profile;
    } catch (error) {
      logger.error(`学习基础自评失败: userId=${userId}`, error);
      throw error;
    }
  }

  /**
   * 计算档案完整度
   * @param profile 档案数据
   * @returns 完整度百分比 (0-100)
   */
  private calculateCompleteness(profile: any): number {
    let score = 0;
    const weights = {
      realName: 20,
      grade: 20,
      materialVersion: 20,
      subjectLevels: 40, // 假设需要评估 4 个主要科目，每个 10 分
    };

    // 真实姓名
    if (profile.realName && profile.realName.trim() !== '') {
      score += weights.realName;
    }

    // 年级
    if (profile.grade && profile.grade.trim() !== '') {
      score += weights.grade;
    }

    // 教材版本
    if (profile.materialVersion && profile.materialVersion.trim() !== '') {
      score += weights.materialVersion;
    }

    // 科目水平（假设主要科目：语文、数学、英语、物理）
    const mainSubjects = ['语文', '数学', '英语', '物理'];
    const subjectLevels = profile.subjectLevels || {};
    const assessedSubjects = mainSubjects.filter(
      (subject) => subjectLevels[subject]
    );
    score += (assessedSubjects.length / mainSubjects.length) * weights.subjectLevels;

    return Math.round(score);
  }

  /**
   * 获取档案更新历史
   * @param userId 用户 ID
   * @param limit 返回数量限制
   * @returns 更新历史记录
   */
  async getProfileHistory(userId: string, limit: number = 10) {
    try {
      logger.info(`获取档案更新历史: userId=${userId}, limit=${limit}`);

      // 注意：这里需要一个单独的历史记录表来存储档案变更
      // 当前 schema 中没有历史表，这里返回当前档案的更新时间
      const profile = await prisma.studentProfile.findUnique({
        where: { userId },
        select: {
          updatedAt: true,
          createdAt: true,
        },
      });

      if (!profile) {
        return [];
      }

      // 简化版本：返回创建和最后更新时间
      return [
        {
          timestamp: profile.updatedAt,
          action: '档案更新',
        },
        {
          timestamp: profile.createdAt,
          action: '档案创建',
        },
      ];
    } catch (error) {
      logger.error(`获取档案历史失败: userId=${userId}`, error);
      throw new Error('获取档案历史失败');
    }
  }
}

export const studentProfileService = new StudentProfileService();

