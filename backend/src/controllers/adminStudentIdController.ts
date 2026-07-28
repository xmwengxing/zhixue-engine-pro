import { Request, Response, NextFunction } from 'express';
import { adminStudentIdService } from '../services/adminStudentIdService';
import { StudentIDStatus } from '@prisma/client';
import { logger } from '../middlewares/logger';

/**
 * 管理员学号管理控制器
 */
class AdminStudentIdController {
  /**
   * 获取学号列表
   * GET /api/admin/student-ids
   */
  async getStudentIds(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        status,
        page,
        limit,
        search,
      } = req.query;

      // 验证参数
      const params: any = {};

      if (status && Object.values(StudentIDStatus).includes(status as StudentIDStatus)) {
        params.status = status as StudentIDStatus;
      }

      if (page) {
        params.page = parseInt(page as string, 10);
        if (isNaN(params.page) || params.page < 1) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '页码必须是大于 0 的整数',
            },
          });
        }
      }

      if (limit) {
        params.limit = parseInt(limit as string, 10);
        if (isNaN(params.limit) || params.limit < 1 || params.limit > 100) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '每页数量必须在 1-100 之间',
            },
          });
        }
      }

      if (search) {
        params.search = search as string;
      }

      const result = await adminStudentIdService.getStudentIds(params);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('获取学号列表失败:', error);
      return next(error);
    }
  }

  /**
   * 获取学号详情
   * GET /api/admin/student-ids/:id
   */
  async getStudentIdById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '学号 ID 不能为空',
          },
        });
      }

      const studentId = await adminStudentIdService.getStudentIdById(id);

      return res.json({
        success: true,
        data: { studentId },
      });
    } catch (error: any) {
      if (error.message === '学号不存在') {
        return res.status(404).json({
          error: {
            code: 'STUDENT_ID_NOT_FOUND',
            message: error.message,
          },
        });
      }
      logger.error('获取学号详情失败:', error);
      return next(error);
    }
  }

  /**
   * 分配学号
   * POST /api/admin/student-ids/assign
   */
  async assignStudentId(req: Request, res: Response, next: NextFunction) {
    try {
      const { studentIdId, userId } = req.body;

      // 验证必填字段
      if (!studentIdId || !userId) {
        return res.status(400).json({
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: '学号 ID 和用户 ID 为必填项',
          },
        });
      }

      const studentId = await adminStudentIdService.assignStudentId({
        studentIdId,
        userId,
      });

      return res.json({
        success: true,
        data: { studentId },
        message: '学号分配成功',
      });
    } catch (error: any) {
      if (error.message === '学号不存在' || error.message === '用户不存在') {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        });
      }
      if (
        error.message.includes('不可用') || 
        error.message === '该用户已分配学号'
      ) {
        return res.status(409).json({
          error: {
            code: 'CONFLICT',
            message: error.message,
          },
        });
      }
      logger.error('分配学号失败:', error);
      return next(error);
    }
  }

  /**
   * 锁定学号
   * PUT /api/admin/student-ids/:id/lock
   */
  async lockStudentId(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '学号 ID 不能为空',
          },
        });
      }

      const studentId = await adminStudentIdService.lockStudentId(id);

      return res.json({
        success: true,
        data: { studentId },
        message: '学号锁定成功',
      });
    } catch (error: any) {
      if (error.message === '学号不存在') {
        return res.status(404).json({
          error: {
            code: 'STUDENT_ID_NOT_FOUND',
            message: error.message,
          },
        });
      }
      if (error.message === '学号已被锁定') {
        return res.status(409).json({
          error: {
            code: 'CONFLICT',
            message: error.message,
          },
        });
      }
      logger.error('锁定学号失败:', error);
      return next(error);
    }
  }

  /**
   * 解锁学号
   * PUT /api/admin/student-ids/:id/unlock
   */
  async unlockStudentId(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '学号 ID 不能为空',
          },
        });
      }

      const studentId = await adminStudentIdService.unlockStudentId(id);

      return res.json({
        success: true,
        data: { studentId },
        message: '学号解锁成功',
      });
    } catch (error: any) {
      if (error.message === '学号不存在') {
        return res.status(404).json({
          error: {
            code: 'STUDENT_ID_NOT_FOUND',
            message: error.message,
          },
        });
      }
      if (error.message === '学号未被锁定') {
        return res.status(409).json({
          error: {
            code: 'CONFLICT',
            message: error.message,
          },
        });
      }
      logger.error('解锁学号失败:', error);
      return next(error);
    }
  }

  /**
   * 解绑学号
   * PUT /api/admin/student-ids/:id/unbind
   */
  async unbindStudentId(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '学号 ID 不能为空',
          },
        });
      }

      const studentId = await adminStudentIdService.unbindStudentId(id);

      return res.json({
        success: true,
        data: { studentId },
        message: '学号解绑成功',
      });
    } catch (error: any) {
      if (error.message === '学号不存在') {
        return res.status(404).json({
          error: {
            code: 'STUDENT_ID_NOT_FOUND',
            message: error.message,
          },
        });
      }
      if (error.message === '学号未分配给任何用户') {
        return res.status(409).json({
          error: {
            code: 'CONFLICT',
            message: error.message,
          },
        });
      }
      logger.error('解绑学号失败:', error);
      return next(error);
    }
  }

  /**
   * 获取学号统计信息
   * GET /api/admin/student-ids/stats
   */
  async getStudentIdStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await adminStudentIdService.getStudentIdStats();

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      logger.error('获取学号统计失败:', error);
      return next(error);
    }
  }
}

export const adminStudentIdController = new AdminStudentIdController();
