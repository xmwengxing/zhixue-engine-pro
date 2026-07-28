import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateAccessToken } from '../utils/jwt';
import { logger } from '../middlewares/logger';
import { studentIdService } from './studentIdService';

const prisma = new PrismaClient();

/**
 * 注册数据接口
 */
interface RegisterData {
  role: 'PARENT' | 'STUDENT';
  username: string;
  password: string;
  email?: string;
  authCode?: string;
  profile?: {
    // 家长特有字段
    name?: string;
    gender?: string;
    phone?: string;
    address?: string;
    industry?: string;
    
    // 学员特有字段
    birthDate?: string;
    grade?: string;
    school?: string;
    learningFoundation?: string;
    interests?: string;
  };
}

/**
 * 注册返回结果接口
 */
interface RegisterResult {
  success: boolean;
  userId: string;
  username: string;
  role: string;
  studentIdNumber?: string; // 仅学员返回
}

/**
 * 验证授权码
 * @param code 授权码
 * @param role 用户角色
 * @returns 是否验证通过
 */
export async function validateAuthCode(
  code: string | undefined,
  role: 'PARENT' | 'STUDENT'
): Promise<boolean> {
  // 家长注册不需要授权码
  if (role === 'PARENT') {
    return true;
  }

  // 学员注册需要验证授权码
  if (!code) {
    throw new Error('学员注册需要提供授权码');
  }

  const authCode = await prisma.authCode.findUnique({
    where: { code },
  });

  if (!authCode) {
    throw new Error('授权码不存在');
  }

  if (authCode.status !== 'UNUSED') {
    throw new Error('授权码已被使用或已过期');
  }

  if (authCode.expiryDate < new Date()) {
    await prisma.authCode.update({
      where: { id: authCode.id },
      data: { status: 'EXPIRED' },
    });
    throw new Error('授权码已过期');
  }

  return true;
}

/**
 * 认证服务类
 * 处理用户登录、注册等认证相关业务逻辑
 */
export class AuthService {
  /**
   * 用户登录
   * @param username 用户名
   * @param password 密码
   * @returns 用户信息和 JWT token
   */
  async login(username: string, password: string): Promise<{
    token: string;
    user: {
      id: string;
      username: string;
      role: string;
      email: string | null;
    };
  }> {
    // 查找用户
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        role: true,
        email: true,
        status: true,
      },
    });

    // 验证用户是否存在
    if (!user) {
      throw new Error('用户名或密码错误');
    }

    // 验证用户状态
    if (user.status !== 'ACTIVE') {
      throw new Error('账户已被锁定或删除');
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('用户名或密码错误');
    }

    // 更新最后登录时间
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // 记录登录审计日志
    await this.logAudit(user.id, 'LOGIN', '用户登录成功');

    // 生成 JWT token
    const token = generateAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role, // 保持大写格式
    });

    // 返回用户信息和 token
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role, // 保持大写格式
        email: user.email,
      },
    };
  }

  /**
   * 用户注册（新版本 - 支持角色选择和差异化字段）
   * @param data 注册数据
   * @returns 注册结果
   */
  async registerUser(data: RegisterData): Promise<RegisterResult> {
    // 验证授权码
    await validateAuthCode(data.authCode, data.role);

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existingUser) {
      throw new Error('用户名已存在');
    }

    // 哈希密码
    const passwordHash = await bcrypt.hash(data.password, 10);

    // 使用事务确保原子性
    const result = await prisma.$transaction(async (tx) => {
      // 创建用户基础信息
      const userData: any = {
        username: data.username,
        passwordHash,
        role: data.role,
        status: 'ACTIVE',
        email: data.email || null,
      };

      // 如果是家长，添加家长特有字段
      if (data.role === 'PARENT' && data.profile) {
        userData.realName = data.profile.name || null;
        userData.gender = data.profile.gender || null;
        userData.phone = data.profile.phone || null;
        userData.address = data.profile.address || null;
        userData.industry = data.profile.industry || null;
      }

      // 创建用户
      const newUser = await tx.user.create({
        data: userData,
      });

      logger.info(`用户创建成功: ${newUser.id}, role: ${newUser.role}, 是否有authCode: ${!!data.authCode}, 是否有profile: ${!!data.profile}`);

      let studentIdNumber: string | undefined;

      // 如果是学员，创建学号和学员档案
      if (data.role === 'STUDENT' && data.profile) {
        // 生成学号
        studentIdNumber = await studentIdService.generateStudentId();

        // 创建学号记录
        await tx.studentID.create({
          data: {
            studentIdNumber,
            userId: newUser.id,
            status: 'ASSIGNED',
            assignedAt: new Date(),
          },
        });

        // 创建学员档案
        await tx.studentProfile.create({
          data: {
            userId: newUser.id,
            realName: data.profile.name || '',
            gender: data.profile.gender || '',
            birthDate: data.profile.birthDate ? new Date(data.profile.birthDate) : new Date(),
            grade: data.profile.grade || '',
            materialVersion: '', // 默认空字符串
            school: data.profile.school || null,
            learningFoundation: data.profile.learningFoundation || null,
            interests: data.profile.interests || null,
            subjectLevels: {},
            completeness: 0,
          },
        });

        // 标记授权码为已使用
        if (data.authCode) {
          const authCodeRecord = await tx.authCode.findUnique({
            where: { code: data.authCode },
          });

          if (authCodeRecord) {
            await tx.authCode.update({
              where: { id: authCodeRecord.id },
              data: {
                status: 'USED',
                usedBy: newUser.id,
                usedAt: new Date(),
              },
            });
          }
        }
      }

      // 如果是学员但没有提供profile,仍需标记授权码为已使用
      if (data.role === 'STUDENT' && data.authCode && !data.profile) {
        logger.info(`学员注册无profile,准备更新授权码: ${data.authCode}`);
        const authCodeRecord = await tx.authCode.findUnique({
          where: { code: data.authCode },
        });

        if (authCodeRecord) {
          logger.info(`找到授权码记录,当前状态: ${authCodeRecord.status}`);
          await tx.authCode.update({
            where: { id: authCodeRecord.id },
            data: {
              status: 'USED',
              usedBy: newUser.id,
              usedAt: new Date(),
            },
          });
          logger.info(`授权码已更新为USED`);
        } else {
          logger.warn(`未找到授权码记录: ${data.authCode}`);
        }
      }

      // 记录注册审计日志
      await this.logAudit(
        newUser.id,
        'REGISTER',
        `${data.role === 'PARENT' ? '家长' : '学员'}注册成功${studentIdNumber ? ` (学号: ${studentIdNumber})` : ''}`
      );

      return {
        userId: newUser.id,
        username: newUser.username,
        role: newUser.role,
        studentIdNumber,
      };
    });

    return {
      success: true,
      ...result,
    };
  }

  /**
   * 用户注册（旧版本 - 保持向后兼容）
   * @param username 用户名
   * @param password 密码
   * @param role 用户角色
   * @param authCode 授权码（学员注册必需）
   * @returns 新创建的用户信息
   */
  async register(
    username: string,
    password: string,
    role: 'PARENT' | 'STUDENT',
    authCode?: string
  ): Promise<{ success: boolean; userId: string }> {
    // 验证授权码
    await validateAuthCode(authCode, role);

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new Error('用户名已存在');
    }

    // 哈希密码
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户（使用事务确保原子性）
    const result = await prisma.$transaction(async (tx) => {
      // 创建新用户
      const newUser = await tx.user.create({
        data: {
          username,
          passwordHash,
          role,
          status: 'ACTIVE',
        },
      });

      // 如果是学员注册，标记授权码为已使用
      if (role === 'STUDENT' && authCode) {
        const authCodeRecord = await tx.authCode.findUnique({
          where: { code: authCode },
        });

        if (authCodeRecord) {
          await tx.authCode.update({
            where: { id: authCodeRecord.id },
            data: {
              status: 'USED',
              usedBy: newUser.id,
              usedAt: new Date(),
            },
          });
        }
      }

      // 记录注册审计日志
      await this.logAudit(newUser.id, 'REGISTER', `${role === 'PARENT' ? '家长' : '学员'}注册成功`);

      return newUser;
    });

    return {
      success: true,
      userId: result.id,
    };
  }

  /**
   * 记录审计日志
   * @param userId 用户 ID
   * @param action 操作类型
   * @param description 操作描述
   */
  private async logAudit(
    userId: string,
    action: string,
    description: string
  ): Promise<void> {
    try {
      // 记录到日志系统
      logger.info('审计日志', {
        userId,
        action,
        description,
        timestamp: new Date().toISOString(),
      });

      // TODO: 如果需要，可以将审计日志存储到数据库
      // await prisma.auditLog.create({ ... });
    } catch (error) {
      logger.error('记录审计日志失败:', error);
      // 审计日志失败不应影响主流程
    }
  }
}

export const authService = new AuthService();
