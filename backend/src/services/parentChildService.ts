import { PrismaClient, RelationStatus, Role } from '@prisma/client';
import { logger } from '../middlewares/logger';
import bcrypt from 'bcryptjs';
import { studentIdService } from './studentIdService';
import { validateAuthCode } from './authService';

const prisma = new PrismaClient();

/**
 * 家长端亲子关系管理服务
 */
export class ParentChildService {
  /**
   * 获取家长的所有子女列表
   */
  async getChildren(parentId: string) {
    try {
      // 查询亲子关系
      const relations = await prisma.parentChildRelation.findMany({
        where: {
          parentId,
          status: RelationStatus.ACTIVE,
        },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true,
              status: true,
              createdAt: true,
              studentProfile: {
                select: {
                  realName: true,
                  gender: true,
                  birthDate: true,
                  grade: true,
                  school: true,
                  learningFoundation: true,
                  interests: true,
                  materialVersion: true,
                  subjectLevels: true,
                  completeness: true,
                },
              },
              studentId: {
                select: {
                  studentIdNumber: true,
                },
              },
            },
          },
        },
        orderBy: {
          bindedAt: 'desc',
        },
      });

      // 转换数据格式
      const children = relations.map((relation) => ({
        relationId: relation.id,
        relation: relation.relation,
        bindedAt: relation.bindedAt,
        student: {
          id: relation.student.id,
          username: relation.student.username,
          email: relation.student.email,
          phone: relation.student.phone,
          status: relation.student.status,
          createdAt: relation.student.createdAt,
          studentIdNumber: relation.student.studentId?.studentIdNumber || null,
          profile: relation.student.studentProfile,
        },
      }));

      return children;
    } catch (error) {
      logger.error('获取子女列表失败:', error);
      throw new Error('获取子女列表失败');
    }
  }

  /**
   * 通过授权码或学号绑定学员
   */
  async bindChild(data: {
    parentId: string;
    authCode?: string;
    studentIdNumber?: string;
    relation: string;
  }) {
    const { parentId, authCode, studentIdNumber, relation } = data;

    try {
      // 验证家长用户存在且角色正确
      const parent = await prisma.user.findUnique({
        where: { id: parentId },
      });

      if (!parent) {
        throw new Error('家长用户不存在');
      }

      if (parent.role !== Role.PARENT) {
        throw new Error('只有家长角色可以绑定学员');
      }

      let studentId: string | null = null;

      // 通过授权码查找学员
      if (authCode) {
        const authCodeRecord = await prisma.authCode.findUnique({
          where: { code: authCode },
          include: {
            user: true,
          },
        });

        if (!authCodeRecord) {
          throw new Error('授权码不存在');
        }

        if (authCodeRecord.status !== 'USED') {
          throw new Error('授权码未被使用或已过期');
        }

        if (!authCodeRecord.user) {
          throw new Error('授权码未关联任何用户');
        }

        if (authCodeRecord.user.role !== Role.STUDENT) {
          throw new Error('授权码关联的用户不是学员');
        }

        studentId = authCodeRecord.user.id;
      }
      // 通过学号查找学员
      else if (studentIdNumber) {
        const studentIdRecord = await prisma.studentID.findUnique({
          where: { studentIdNumber },
          include: {
            user: true,
          },
        });

        if (!studentIdRecord) {
          throw new Error('学号不存在');
        }

        if (studentIdRecord.status !== 'ASSIGNED') {
          throw new Error('学号未分配给任何用户');
        }

        if (!studentIdRecord.user) {
          throw new Error('学号未关联任何用户');
        }

        if (studentIdRecord.user.role !== Role.STUDENT) {
          throw new Error('学号关联的用户不是学员');
        }

        studentId = studentIdRecord.user.id;
      } else {
        throw new Error('必须提供授权码或学号');
      }

      // 检查是否已经绑定
      const existingRelation = await prisma.parentChildRelation.findFirst({
        where: {
          parentId,
          studentId,
          status: RelationStatus.ACTIVE,
        },
      });

      if (existingRelation) {
        throw new Error('该学员已经绑定');
      }

      // 创建亲子关系
      const newRelation = await prisma.parentChildRelation.create({
        data: {
          parentId,
          studentId,
          relation,
          status: RelationStatus.ACTIVE,
        },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true,
              status: true,
              createdAt: true,
              studentProfile: {
                select: {
                  realName: true,
                  grade: true,
                  materialVersion: true,
                  subjectLevels: true,
                  completeness: true,
                },
              },
              studentId: {
                select: {
                  studentIdNumber: true,
                },
              },
            },
          },
        },
      });

      logger.info(`家长 ${parentId} 成功绑定学员 ${studentId}`);

      return {
        relationId: newRelation.id,
        relation: newRelation.relation,
        bindedAt: newRelation.bindedAt,
        student: {
          id: newRelation.student.id,
          username: newRelation.student.username,
          email: newRelation.student.email,
          phone: newRelation.student.phone,
          status: newRelation.student.status,
          createdAt: newRelation.student.createdAt,
          studentIdNumber: newRelation.student.studentId?.studentIdNumber || null,
          profile: newRelation.student.studentProfile,
        },
      };
    } catch (error) {
      logger.error('绑定学员失败:', error);
      throw error;
    }
  }

  /**
   * 解绑学员（保留历史数据）
   */
  async unbindChild(parentId: string, relationId: string) {
    try {
      // 查找亲子关系
      const relation = await prisma.parentChildRelation.findUnique({
        where: { id: relationId },
      });

      if (!relation) {
        throw new Error('亲子关系不存在');
      }

      // 验证是否是该家长的关系
      if (relation.parentId !== parentId) {
        throw new Error('无权解绑该学员');
      }

      // 检查关系状态
      if (relation.status === RelationStatus.UNBOUND) {
        throw new Error('该学员已经解绑');
      }

      // 更新关系状态为解绑（保留历史数据）
      const updatedRelation = await prisma.parentChildRelation.update({
        where: { id: relationId },
        data: {
          status: RelationStatus.UNBOUND,
        },
      });

      logger.info(`家长 ${parentId} 成功解绑学员关系 ${relationId}`);

      return {
        success: true,
        relationId: updatedRelation.id,
        status: updatedRelation.status,
      };
    } catch (error) {
      logger.error('解绑学员失败:', error);
      throw error;
    }
  }

  /**
   * 验证家长是否有权访问学员数据
   */
  async verifyParentChildRelation(parentId: string, studentId: string): Promise<boolean> {
    try {
      const relation = await prisma.parentChildRelation.findFirst({
        where: {
          parentId,
          studentId,
          status: RelationStatus.ACTIVE,
        },
      });

      return !!relation;
    } catch (error) {
      logger.error('验证亲子关系失败:', error);
      return false;
    }
  }

  /**
   * 家长创建学员账户并自动绑定
   * 完整流程: 验证授权码 -> 创建用户 -> 生成学号 -> 创建档案 -> 建立绑定
   */
  async createStudentByParent(data: {
    parentId: string;
    authCode: string;
    username: string;
    password: string;
    profile: {
      name: string;
      gender: string;
      birthDate: string;
      grade: string;
      materialVersion?: string; // 添加materialVersion字段
      school?: string;
      learningFoundation?: string;
      interests?: string;
      subjectLevels?: Record<string, string>; // 添加subjectLevels字段
    };
    relation: string;
  }) {
    const { parentId, authCode, username, password, profile, relation } = data;

    try {
      // 验证家长用户存在且角色正确
      const parent = await prisma.user.findUnique({
        where: { id: parentId },
      });

      if (!parent) {
        throw new Error('家长用户不存在');
      }

      if (parent.role !== Role.PARENT) {
        throw new Error('只有家长角色可以创建学员账户');
      }

      // 验证授权码
      await validateAuthCode(authCode, 'STUDENT');

      // 检查用户名是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser) {
        throw new Error('用户名已存在');
      }

      // 使用事务确保原子性
      const result = await prisma.$transaction(async (tx) => {
        // 1. 创建用户账户
        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = await tx.user.create({
          data: {
            username,
            passwordHash,
            role: Role.STUDENT,
            status: 'ACTIVE',
          },
        });

        // 2. 生成并分配学号
        const studentIdNumber = await studentIdService.generateStudentId();
        await tx.studentID.create({
          data: {
            studentIdNumber,
            userId: newUser.id,
            status: 'ASSIGNED',
            assignedAt: new Date(),
          },
        });

        // 3. 创建学员档案
        await tx.studentProfile.create({
          data: {
            userId: newUser.id,
            realName: profile.name,
            gender: profile.gender,
            birthDate: new Date(profile.birthDate),
            grade: profile.grade,
            materialVersion: profile.materialVersion || '', // 使用传入的materialVersion
            school: profile.school || null,
            learningFoundation: profile.learningFoundation || null,
            interests: profile.interests || null,
            subjectLevels: profile.subjectLevels || {}, // 使用传入的subjectLevels
            completeness: 0,
          },
        });

        // 4. 标记授权码为已使用
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

        // 5. 建立亲子绑定关系
        const newRelation = await tx.parentChildRelation.create({
          data: {
            parentId,
            studentId: newUser.id,
            relation,
            status: RelationStatus.ACTIVE,
          },
        });

        logger.info(
          `家长 ${parentId} 成功创建学员账户 ${newUser.id} (学号: ${studentIdNumber}) 并建立绑定关系`
        );

        return {
          studentId: newUser.id,
          username: newUser.username,
          studentIdNumber,
          initialPassword: password,
          relationId: newRelation.id,
        };
      });

      return result;
    } catch (error) {
      logger.error('家长创建学员账户失败:', error);
      throw error;
    }
  }
}

export const parentChildService = new ParentChildService();
