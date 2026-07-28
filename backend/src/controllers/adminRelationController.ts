import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { logger } from '../middlewares/logger';
import { RelationStatus } from '@prisma/client';

/**
 * 管理员亲子关系管理控制器
 */
class AdminRelationController {
  /**
   * 获取亲子关系列表
   * GET /api/admin/relations
   */
  async getRelations(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        page = '1',
        limit = '10',
        search,
        parentId,
        studentId,
        status,
      } = req.query;

      // 验证分页参数
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);

      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '页码必须是大于 0 的整数',
          },
        });
      }

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '每页数量必须在 1-100 之间',
          },
        });
      }

      // 构建查询条件
      const where: any = {};

      // 状态筛选
      if (status && Object.values(RelationStatus).includes(status as RelationStatus)) {
        where.status = status as RelationStatus;
      }

      // 家长ID筛选
      if (parentId && typeof parentId === 'string') {
        where.parentId = parentId;
      }

      // 学员ID筛选
      if (studentId && typeof studentId === 'string') {
        where.studentId = studentId;
      }

      // 搜索功能 - 搜索家长或学员的姓名、账户名、学号
      if (search && typeof search === 'string' && search.trim()) {
        where.OR = [
          // 搜索家长姓名
          {
            parent: {
              realName: {
                contains: search.trim(),
                mode: 'insensitive',
              },
            },
          },
          // 搜索家长账户名
          {
            parent: {
              username: {
                contains: search.trim(),
                mode: 'insensitive',
              },
            },
          },
          // 搜索学员姓名
          {
            student: {
              studentProfile: {
                realName: {
                  contains: search.trim(),
                  mode: 'insensitive',
                },
              },
            },
          },
          // 搜索学员账户名
          {
            student: {
              username: {
                contains: search.trim(),
                mode: 'insensitive',
              },
            },
          },
          // 搜索学号
          {
            student: {
              studentId: {
                studentIdNumber: {
                  contains: search.trim(),
                  mode: 'insensitive',
                },
              },
            },
          },
        ];
      }

      // 计算分页
      const skip = (pageNum - 1) * limitNum;

      // 查询数据
      const [relations, total] = await Promise.all([
        prisma.parentChildRelation.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: {
            bindedAt: 'desc',
          },
          include: {
            parent: {
              select: {
                id: true,
                username: true,
                realName: true,
                email: true,
                phone: true,
              },
            },
            student: {
              select: {
                id: true,
                username: true,
                studentId: {
                  select: {
                    studentIdNumber: true,
                  },
                },
                studentProfile: {
                  select: {
                    realName: true,
                    gender: true,
                    grade: true,
                    school: true,
                  },
                },
              },
            },
          },
        }),
        prisma.parentChildRelation.count({ where }),
      ]);

      // 格式化返回数据
      const formattedRelations = relations.map((relation: any) => ({
        id: relation.id,
        parentId: relation.parentId,
        parentName: relation.parent.realName || relation.parent.username,
        parentUsername: relation.parent.username,
        parentEmail: relation.parent.email,
        parentPhone: relation.parent.phone,
        studentId: relation.studentId,
        studentName: relation.student.studentProfile?.realName || relation.student.username,
        studentUsername: relation.student.username,
        studentIdNumber: relation.student.studentId?.studentIdNumber || '未分配',
        studentGender: relation.student.studentProfile?.gender,
        studentGrade: relation.student.studentProfile?.grade,
        studentSchool: relation.student.studentProfile?.school,
        relation: relation.relation,
        bindedAt: relation.bindedAt,
        status: relation.status,
      }));

      return res.json({
        success: true,
        data: {
          relations: formattedRelations,
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      logger.error('获取亲子关系列表失败:', error);
      return next(error);
    }
  }

  /**
   * 获取亲子关系详情
   * GET /api/admin/relations/:id
   */
  async getRelationById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '关系 ID 不能为空',
          },
        });
      }

      const relation = await prisma.parentChildRelation.findUnique({
        where: { id },
        include: {
          parent: {
            select: {
              id: true,
              username: true,
              realName: true,
              email: true,
              phone: true,
              gender: true,
              address: true,
              industry: true,
              createdAt: true,
            },
          },
          student: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true,
              createdAt: true,
              studentId: {
                select: {
                  studentIdNumber: true,
                  assignedAt: true,
                },
              },
              studentProfile: {
                select: {
                  realName: true,
                  gender: true,
                  birthDate: true,
                  grade: true,
                  school: true,
                  learningFoundation: true,
                  interests: true,
                },
              },
            },
          },
        },
      });

      if (!relation) {
        return res.status(404).json({
          error: {
            code: 'RELATION_NOT_FOUND',
            message: '亲子关系不存在',
          },
        });
      }

      return res.json({
        success: true,
        data: { relation },
      });
    } catch (error: any) {
      logger.error('获取亲子关系详情失败:', error);
      return next(error);
    }
  }

  /**
   * 解绑亲子关系
   * DELETE /api/admin/relations/:id/unbind
   */
  async unbindRelation(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '关系 ID 不能为空',
          },
        });
      }

      // 查询关系是否存在
      const relation = await prisma.parentChildRelation.findUnique({
        where: { id },
        include: {
          parent: {
            select: {
              id: true,
              username: true,
              realName: true,
            },
          },
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
      });

      if (!relation) {
        return res.status(404).json({
          error: {
            code: 'RELATION_NOT_FOUND',
            message: '亲子关系不存在',
          },
        });
      }

      // 检查关系状态
      if (relation.status === RelationStatus.UNBOUND) {
        return res.status(400).json({
          error: {
            code: 'ALREADY_UNBOUND',
            message: '该亲子关系已经解绑',
          },
        });
      }

      // 更新关系状态为解绑（软删除，保留历史数据）
      await prisma.parentChildRelation.update({
        where: { id },
        data: {
          status: RelationStatus.UNBOUND,
        },
      });

      logger.info('管理员解绑亲子关系:', {
        relationId: id,
        parentId: relation.parentId,
        parentName: relation.parent.realName || relation.parent.username,
        studentId: relation.studentId,
        studentName: relation.student.studentProfile?.realName || relation.student.username,
        adminId: req.user?.userId,
      });

      return res.json({
        success: true,
        message: '亲子关系解绑成功',
        data: {
          relationId: id,
          parentName: relation.parent.realName || relation.parent.username,
          studentName: relation.student.studentProfile?.realName || relation.student.username,
        },
      });
    } catch (error: any) {
      logger.error('解绑亲子关系失败:', error);
      return next(error);
    }
  }

  /**
   * 获取亲子关系统计信息
   * GET /api/admin/relations/stats
   */
  async getRelationStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const [
        totalRelations,
        activeRelations,
        unboundRelations,
        totalParents,
        totalStudents,
      ] = await Promise.all([
        // 总关系数
        prisma.parentChildRelation.count(),
        // 活跃关系数
        prisma.parentChildRelation.count({
          where: { status: RelationStatus.ACTIVE },
        }),
        // 已解绑关系数
        prisma.parentChildRelation.count({
          where: { status: RelationStatus.UNBOUND },
        }),
        // 有绑定关系的家长数
        prisma.parentChildRelation.groupBy({
          by: ['parentId'],
          where: { status: RelationStatus.ACTIVE },
        }).then((result: any) => result.length),
        // 有绑定关系的学员数
        prisma.parentChildRelation.groupBy({
          by: ['studentId'],
          where: { status: RelationStatus.ACTIVE },
        }).then((result: any) => result.length),
      ]);

      return res.json({
        success: true,
        data: {
          totalRelations,
          activeRelations,
          unboundRelations,
          totalParents,
          totalStudents,
        },
      });
    } catch (error: any) {
      logger.error('获取亲子关系统计失败:', error);
      return next(error);
    }
  }
}

export const adminRelationController = new AdminRelationController();
