import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

/**
 * 家长个人中心服务
 */
export class ParentProfileService {
  /**
   * 获取家长个人信息
   */
  async getProfile(parentId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: parentId },
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          realName: true,
          gender: true,
          address: true,
          industry: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
        },
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      if (user.role !== Role.PARENT) {
        throw new Error('用户不是家长角色');
      }

      return user;
    } catch (error) {
      logger.error('获取家长个人信息失败:', error);
      throw error;
    }
  }

  /**
   * 更新家长个人信息
   */
  async updateProfile(
    parentId: string,
    data: {
      email?: string;
      phone?: string;
      realName?: string;
      gender?: string;
      address?: string;
      industry?: string;
    }
  ) {
    try {
      // 验证用户存在且是家长角色
      const user = await prisma.user.findUnique({
        where: { id: parentId },
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      if (user.role !== Role.PARENT) {
        throw new Error('用户不是家长角色');
      }

      // 如果更新邮箱，检查邮箱是否已被其他用户使用
      if (data.email && data.email !== user.email) {
        const existingUser = await prisma.user.findFirst({
          where: { email: data.email },
        });

        if (existingUser && existingUser.id !== parentId) {
          throw new Error('邮箱已被使用');
        }
      }

      // 更新用户信息
      const updatedUser = await prisma.user.update({
        where: { id: parentId },
        data: {
          email: data.email,
          phone: data.phone,
          realName: data.realName,
          gender: data.gender,
          address: data.address,
          industry: data.industry,
        },
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          realName: true,
          gender: true,
          address: true,
          industry: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
        },
      });

      logger.info(`家长 ${parentId} 更新个人信息成功`);

      return updatedUser;
    } catch (error) {
      logger.error('更新家长个人信息失败:', error);
      throw error;
    }
  }

  /**
   * 修改密码
   */
  async changePassword(
    parentId: string,
    data: {
      oldPassword: string;
      newPassword: string;
    }
  ) {
    try {
      // 获取用户信息
      const user = await prisma.user.findUnique({
        where: { id: parentId },
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      if (user.role !== Role.PARENT) {
        throw new Error('用户不是家长角色');
      }

      // 验证原密码
      const isPasswordValid = await bcrypt.compare(data.oldPassword, user.passwordHash);

      if (!isPasswordValid) {
        throw new Error('原密码错误');
      }

      // 加密新密码
      const newPasswordHash = await bcrypt.hash(data.newPassword, 10);

      // 更新密码
      await prisma.user.update({
        where: { id: parentId },
        data: {
          passwordHash: newPasswordHash,
        },
      });

      logger.info(`家长 ${parentId} 修改密码成功`);

      return {
        success: true,
        message: '密码修改成功，请重新登录',
      };
    } catch (error) {
      logger.error('修改密码失败:', error);
      throw error;
    }
  }
}

export const parentProfileService = new ParentProfileService();
