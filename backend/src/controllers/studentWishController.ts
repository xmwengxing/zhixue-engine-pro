import { Request, Response, NextFunction } from 'express';
import { studentWishService } from '../services/studentWishService';
import { WishStatus } from '@prisma/client';

/**
 * 学员愿望控制器
 */
export class StudentWishController {
  /**
   * 获取愿望列表
   * GET /api/student/wishes?status=&page=&limit=
   */
  async getWishes(req: Request, res: Response, next: NextFunction) {
    try {
      const studentId = req.user!.userId;
      const { status, page = '1', limit = '20' } = req.query;

      // 验证 status 参数
      let wishStatus: WishStatus | undefined;
      if (status) {
        if (!Object.values(WishStatus).includes(status as WishStatus)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_STATUS',
              message: '无效的愿望状态',
            },
          });
        }
        wishStatus = status as WishStatus;
      }

      const result = await studentWishService.getWishes(
        studentId,
        wishStatus,
        parseInt(page as string),
        parseInt(limit as string)
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * 获取愿望详情
   * GET /api/student/wishes/:id
   */
  async getWish(req: Request, res: Response, next: NextFunction) {
    try {
      const studentId = req.user!.userId;
      const { id } = req.params;

      if (Array.isArray(id)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ID',
            message: '无效的愿望 ID',
          },
        });
      }

      const wish = await studentWishService.getWish(id, studentId);

      return res.json({
        success: true,
        data: wish,
      });
    } catch (error: any) {
      if (error.message === '愿望不存在') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'WISH_NOT_FOUND',
            message: error.message,
          },
        });
      }
      return next(error);
    }
  }

  /**
   * 提交愿望
   * POST /api/student/wishes
   */
  async createWish(req: Request, res: Response, next: NextFunction) {
    try {
      const studentId = req.user!.userId;
      const { type = 'CUSTOM', description, requiredPoints, imageUrl } = req.body;

      // 验证愿望类型
      if (!['CASH', 'CUSTOM'].includes(type)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TYPE',
            message: '无效的愿望类型',
          },
        });
      }

      // 验证输入
      const validation = studentWishService.validateWishSubmission(
        description,
        requiredPoints
      );

      if (!validation.valid) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '愿望提交验证失败',
            details: validation.errors,
          },
        });
      }

      const result = await studentWishService.createWish(
        studentId,
        type,
        description,
        requiredPoints,
        imageUrl
      );

      return res.status(201).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      if (error.message.includes('不能为空') || error.message.includes('必须')) {
        return res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }
      return next(error);
    }
  }

  /**
   * 确认愿望（扣除积分）
   * POST /api/student/wishes/:id/confirm
   */
  async confirmWish(req: Request, res: Response, next: NextFunction) {
    try {
      const studentId = req.user!.userId;
      const { id } = req.params;

      if (Array.isArray(id)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ID',
            message: '无效的愿望 ID',
          },
        });
      }

      const wish = await studentWishService.confirmWish(id, studentId);

      return res.json({
        success: true,
        data: wish,
        message: '愿望确认成功，积分已扣除',
      });
    } catch (error: any) {
      if (error.message === '愿望不存在') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'WISH_NOT_FOUND',
            message: error.message,
          },
        });
      }
      if (error.message === '只能确认已批准的愿望' || error.message === '愿望已确认') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: error.message,
          },
        });
      }
      if (error.message === '积分不足') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_POINTS',
            message: error.message,
          },
        });
      }
      return next(error);
    }
  }

  /**
   * 获取愿望统计信息
   * GET /api/student/wishes/stats
   */
  async getWishStats(req: Request, res: Response, next: NextFunction) {
    try {
      const studentId = req.user!.userId;

      const stats = await studentWishService.getWishStats(studentId);

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      return next(error);
    }
  }
}

export const studentWishController = new StudentWishController();
