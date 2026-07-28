import { PrismaClient, Role, UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { logger } from '../middlewares/logger';
import { studentIdService } from './studentIdService';

const prisma = new PrismaClient();

/**
 * 管理员用户管理服务
 */
export class AdminUserService {
  /**
   * 获取用户列表（分页查询）
   */
  async getUsers(params: {
    role?: Role;
    status?: UserStatus;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const {
      role,
      status,
      page = 1,
      limit = 10,
      search,
    } = params;

    // 构建查询条件
    const where: any = {};
    
    if (role) {
      where.role = role;
    }
    
    // 如果指定了状态，使用指定的状态；否则默认排除已删除用户
    if (status) {
      where.status = status;
    } else {
      // 默认只显示活跃和锁定的用户，不显示已删除的用户
      where.status = {
        not: UserStatus.DELETED,
      };
    }
    
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 计算分页
    const skip = (page - 1) * limit;

    try {
      // 并行查询总数和数据
      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            username: true,
            role: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            lastLoginAt: true,
            studentId: {
              select: {
                studentIdNumber: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        }),
      ]);

      // 格式化用户数据，将学号提取到顶层
      const formattedUsers = users.map(user => ({
        ...user,
        studentIdNumber: user.studentId?.studentIdNumber || null,
        studentId: undefined,
      }));

      return {
        users: formattedUsers,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('获取用户列表失败:', error);
      throw new Error('获取用户列表失败');
    }
  }

  /**
   * 根据 ID 获取用户详情
   */
  async getUserById(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          role: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
          studentProfile: true, // 包含学员档案
          studentId: {
            select: {
              studentIdNumber: true,
            },
          },
        },
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      // 格式化返回数据，将学号提取到顶层
      const result: any = {
        ...user,
        studentIdNumber: user.studentId?.studentIdNumber || null,
      };
      delete result.studentId;

      return result;
    } catch (error) {
      logger.error('获取用户详情失败:', error);
      throw error;
    }
  }

  /**
   * 创建新用户
   */
  async createUser(data: {
    username: string;
    password: string;
    role: Role;
    email?: string;
    phone?: string;
    authCode?: string;
    // 家长特有字段
    realName?: string;
    gender?: string;
    address?: string;
    industry?: string;
    // 学员特有字段
    studentName?: string;
    studentGender?: string;
    birthDate?: string;
    grade?: string;
    school?: string;
    learningFoundation?: string;
    interests?: string;
  }) {
    const { 
      username, 
      password, 
      role, 
      email, 
      phone,
      authCode,
      realName,
      gender,
      address,
      industry,
      studentName,
      studentGender,
      birthDate,
      grade,
      school,
      learningFoundation,
      interests
    } = data;

    try {
      // 检查用户名是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser) {
        throw new Error('用户名已存在');
      }

      // 检查邮箱是否已存在
      if (email) {
        const existingEmail = await prisma.user.findFirst({
          where: { email },
        });

        if (existingEmail) {
          throw new Error('邮箱已被使用');
        }
      }

      // 学员角色需要验证授权码
      if (role === Role.STUDENT) {
        if (!authCode) {
          throw new Error('学员注册需要授权码');
        }

        const authCodeRecord = await prisma.authCode.findUnique({
          where: { code: authCode },
        });

        if (!authCodeRecord) {
          throw new Error('授权码不存在');
        }

        if (authCodeRecord.status !== 'UNUSED') {
          throw new Error('授权码已被使用或已过期');
        }

        if (authCodeRecord.expiryDate < new Date()) {
          await prisma.authCode.update({
            where: { id: authCodeRecord.id },
            data: { status: 'EXPIRED' },
          });
          throw new Error('授权码已过期');
        }
      }

      // 哈希密码
      const passwordHash = await bcrypt.hash(password, 10);

      // 使用事务创建用户及相关数据
      const result = await prisma.$transaction(async (tx) => {
        // 创建用户基础信息
        const userData: any = {
          username,
          passwordHash,
          role,
          email,
          phone,
          status: UserStatus.ACTIVE,
        };

        // 家长特有字段
        if (role === Role.PARENT) {
          if (realName) userData.realName = realName;
          if (gender) userData.gender = gender;
          if (address) userData.address = address;
          if (industry) userData.industry = industry;
        }

        const user = await tx.user.create({
          data: userData,
          select: {
            id: true,
            username: true,
            role: true,
            email: true,
            phone: true,
            realName: true,
            gender: true,
            address: true,
            industry: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        // 学员角色需要创建学号和档案
        if (role === Role.STUDENT) {
          // 使用 studentIdService 生成学号（确保并发安全）
          const studentIdNumber = await studentIdService.generateStudentId();

          // 创建学号记录
          await tx.studentID.create({
            data: {
              studentIdNumber,
              userId: user.id,
              status: 'ASSIGNED',
              assignedAt: new Date(),
            },
          });

          logger.info(`为用户 ${username} 生成学号: ${studentIdNumber}`);

          // 创建学员档案
          await tx.studentProfile.create({
            data: {
              userId: user.id,
              realName: studentName || '',
              gender: studentGender || '',
              birthDate: birthDate ? new Date(birthDate) : new Date(),
              grade: grade || '',
              school: school || '',
              learningFoundation: learningFoundation || '',
              interests: interests || '',
              materialVersion: '',
              subjectLevels: {},
              completeness: 0,
            },
          });

          // 标记授权码为已使用
          if (authCode) {
            await tx.authCode.update({
              where: { code: authCode },
              data: {
                status: 'USED',
                usedBy: user.id,
                usedAt: new Date(),
              },
            });
          }

          // 返回包含学号的用户信息
          return {
            ...user,
            studentIdNumber,
          };
        }

        return user;
      });

      logger.info(`管理员创建用户成功: ${username} (${role})`);
      return result;
    } catch (error) {
      logger.error('创建用户失败:', error);
      throw error;
    }
  }

  /**
   * 更新用户信息
   */
  async updateUser(
    userId: string,
    data: {
      email?: string;
      phone?: string;
      status?: UserStatus;
      password?: string;
      // 家长特有字段
      realName?: string;
      gender?: string;
      address?: string;
      industry?: string;
      // 学员档案字段（旧格式，向后兼容）
      grade?: string;
      school?: string;
      learningFoundation?: string;
      interests?: string;
      // 学员档案对象（新格式）
      studentProfile?: {
        realName?: string;
        gender?: string;
        birthDate?: string;
        grade?: string;
        school?: string;
        learningFoundation?: string;
        interests?: string;
        materialVersion?: string;
      };
    }
  ) {
    try {
      // 检查用户是否存在
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          studentProfile: true,
        },
      });

      if (!existingUser) {
        throw new Error('用户不存在');
      }

      // 管理员角色仅可修改密码
      if (existingUser.role === Role.ADMIN) {
        if (data.password) {
          const passwordHash = await bcrypt.hash(data.password, 10);
          const user = await prisma.user.update({
            where: { id: userId },
            data: { passwordHash },
            select: {
              id: true,
              username: true,
              role: true,
              email: true,
              phone: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          });
          logger.info(`管理员更新用户密码成功: ${user.username}`);
          return user;
        } else {
          throw new Error('管理员角色仅可修改密码');
        }
      }

      // 构建更新数据
      const updateData: any = {};

      if (data.email !== undefined) {
        // 检查邮箱是否被其他用户使用
        if (data.email) {
          const emailUser = await prisma.user.findFirst({
            where: {
              email: data.email,
              id: { not: userId },
            },
          });

          if (emailUser) {
            throw new Error('邮箱已被其他用户使用');
          }
        }
        updateData.email = data.email;
      }

      if (data.phone !== undefined) {
        updateData.phone = data.phone;
      }

      if (data.status !== undefined) {
        updateData.status = data.status;
      }

      if (data.password) {
        // 哈希新密码
        updateData.passwordHash = await bcrypt.hash(data.password, 10);
      }

      // 家长特有字段
      if (existingUser.role === Role.PARENT) {
        if (data.realName !== undefined) updateData.realName = data.realName;
        if (data.gender !== undefined) updateData.gender = data.gender;
        if (data.address !== undefined) updateData.address = data.address;
        if (data.industry !== undefined) updateData.industry = data.industry;
      }

      // 使用事务更新用户和学员档案
      const result = await prisma.$transaction(async (tx) => {
        // 更新用户基础信息
        const user = await tx.user.update({
          where: { id: userId },
          data: updateData,
          select: {
            id: true,
            username: true,
            role: true,
            email: true,
            phone: true,
            realName: true,
            gender: true,
            address: true,
            industry: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        // 学员角色需要更新档案
        if (existingUser.role === Role.STUDENT && existingUser.studentProfile) {
          const profileUpdateData: any = {};
          
          // 优先使用新格式的 studentProfile 对象
          if (data.studentProfile) {
            if (data.studentProfile.realName !== undefined) profileUpdateData.realName = data.studentProfile.realName;
            if (data.studentProfile.gender !== undefined) profileUpdateData.gender = data.studentProfile.gender;
            if (data.studentProfile.birthDate !== undefined) {
              profileUpdateData.birthDate = new Date(data.studentProfile.birthDate);
            }
            if (data.studentProfile.grade !== undefined) profileUpdateData.grade = data.studentProfile.grade;
            if (data.studentProfile.school !== undefined) profileUpdateData.school = data.studentProfile.school;
            if (data.studentProfile.learningFoundation !== undefined) {
              profileUpdateData.learningFoundation = data.studentProfile.learningFoundation;
            }
            if (data.studentProfile.interests !== undefined) profileUpdateData.interests = data.studentProfile.interests;
            if (data.studentProfile.materialVersion !== undefined) {
              profileUpdateData.materialVersion = data.studentProfile.materialVersion;
            }
          } else {
            // 向后兼容旧格式
            if (data.grade !== undefined) profileUpdateData.grade = data.grade;
            if (data.school !== undefined) profileUpdateData.school = data.school;
            if (data.learningFoundation !== undefined) profileUpdateData.learningFoundation = data.learningFoundation;
            if (data.interests !== undefined) profileUpdateData.interests = data.interests;
          }

          if (Object.keys(profileUpdateData).length > 0) {
            await tx.studentProfile.update({
              where: { userId },
              data: profileUpdateData,
            });
            logger.info(`更新学员档案成功: ${user.username}`);
          }
        }

        return user;
      });

      logger.info(`管理员更新用户成功: ${result.username}`);
      return result;
    } catch (error) {
      logger.error('更新用户失败:', error);
      throw error;
    }
  }

  /**
   * 删除用户（软删除并释放用户名）
   */
  async deleteUser(userId: string) {
    try {
      // 检查用户是否存在
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          studentId: true, // 包含学号信息
        },
      });

      if (!existingUser) {
        throw new Error('用户不存在');
      }

      // 检查用户是否已经被删除
      if (existingUser.status === UserStatus.DELETED) {
        throw new Error('用户已被删除');
      }

      // 检查是否存在活跃的亲子绑定关系
      if (existingUser.role === 'PARENT') {
        // 检查家长是否有绑定的学员
        const activeRelations = await prisma.parentChildRelation.count({
          where: {
            parentId: userId,
            status: 'ACTIVE',
          },
        });

        if (activeRelations > 0) {
          throw new Error(`该家长账户存在 ${activeRelations} 个活跃的亲子绑定关系，请先在亲子关系管理中解绑后再删除`);
        }
      } else if (existingUser.role === 'STUDENT') {
        // 检查学员是否有绑定的家长
        const activeRelations = await prisma.parentChildRelation.count({
          where: {
            studentId: userId,
            status: 'ACTIVE',
          },
        });

        if (activeRelations > 0) {
          throw new Error(`该学员账户存在 ${activeRelations} 个活跃的亲子绑定关系，请先在亲子关系管理中解绑后再删除`);
        }
      }

      // 使用事务确保原子性
      await prisma.$transaction(async (tx) => {
        // 如果是学员且有学号，释放学号
        if (existingUser.role === 'STUDENT' && existingUser.studentId) {
          await tx.studentID.update({
            where: { id: existingUser.studentId.id },
            data: {
              status: 'AVAILABLE', // 将学号状态改为可用
              userId: null, // 解除与用户的关联
              assignedAt: null,
            },
          });
          logger.info(`释放学号: ${existingUser.studentId.studentIdNumber}`);
        }

        // 软删除：将状态设置为 DELETED，并修改用户名以释放原用户名
        // 新用户名格式：原用户名_deleted_时间戳
        const deletedUsername = `${existingUser.username}_deleted_${Date.now()}`;
        
        await tx.user.update({
          where: { id: userId },
          data: {
            status: UserStatus.DELETED,
            username: deletedUsername, // 修改用户名以释放原用户名
          },
        });

        logger.info(`管理员删除用户成功: ${existingUser.username} -> ${deletedUsername}`);
      });

      return { 
        success: true, 
        user: {
          id: userId,
          username: existingUser.username, // 返回原用户名供前端显示
          status: UserStatus.DELETED,
        }
      };
    } catch (error) {
      logger.error('删除用户失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户统计信息
   */
  async getUserStats() {
    try {
      const [totalUsers, adminCount, parentCount, studentCount, activeCount, lockedCount] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { role: Role.ADMIN } }),
        prisma.user.count({ where: { role: Role.PARENT } }),
        prisma.user.count({ where: { role: Role.STUDENT } }),
        prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
        prisma.user.count({ where: { status: UserStatus.LOCKED } }),
      ]);

      return {
        totalUsers,
        byRole: {
          admin: adminCount,
          parent: parentCount,
          student: studentCount,
        },
        byStatus: {
          active: activeCount,
          locked: lockedCount,
        },
      };
    } catch (error) {
      logger.error('获取用户统计失败:', error);
      throw new Error('获取用户统计失败');
    }
  }
}

export const adminUserService = new AdminUserService();
