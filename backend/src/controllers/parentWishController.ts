import { Request, Response, NextFunction } from 'express';
import { parentWishService } from '../services/parentWishService';
import { WishStatus } from '@prisma/client';

/**
 * 家长端愿望审批控制器
 */
export class ParentWishController {
  /**
   * 获取愿望列表
   * @route GET /api/parent/wishes
   */
  async getWishes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parentId = req.user!.userId;
      const { studentId, status, page, limit } = req.query;

      // 验证状态参数
      if (status && !Object.values(WishStatus).includes(status as WishStatus)) {
        res.status(400).json({
          error: {
            code: 'INVALID_STATUS',
            message: '无效的愿望状态',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const result = await parentWishService.getWishes(parentId, {
        studentId: studentId as string,
        status: status as WishStatus,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      res.json(result);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * 审批愿望
   * @route PUT /api/parent/wishes/:id/approve
   */
  async approveWish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parentId = req.user!.userId;
      const { id } = req.params;
      const { approved, reason } = req.body;

      // 验证必填参数
      if (typeof approved !== 'boolean') {
        res.status(400).json({
          error: {
            code: 'MISSING_APPROVED',
            message: '缺少审批结果参数',
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const wish = await parentWishService.approveWish(
        String(id),
        parentId,
        approved,
        reason
      );

      res.json({
        wish,
        message: approved ? '愿望已同意' : '愿望已拒绝',
      });
    } catch (error: any) {
      // 处理业务逻辑错误
      if (
        error.message === '愿望不存在' ||
        error.message === '无权限审批该愿望'
      ) {
        res.status(404).json({
          error: {
            code: 'WISH_NOT_FOUND',
            message: error.message,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      if (error.message === '该愿望已被审批') {
        res.status(409).json({
          error: {
            code: 'WISH_ALREADY_REVIEWED',
            message: error.message,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      if (error.message === '学员积分不足') {
        res.status(422).json({
          error: {
            code: 'INSUFFICIENT_POINTS',
            message: error.message,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      next(error);
    }
  }

  /**
   * 获取单个愿望详情
   * @route GET /api/parent/wishes/:id
   */
  async getWishById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parentId = req.user!.userId;
      const { id } = req.params;

      const wish = await parentWishService.getWishById(String(id), parentId);

      res.json({ wish });
    } catch (error: any) {
      if (
        error.message === '愿望不存在' ||
        error.message === '无权限查看该愿望'
      ) {
        res.status(404).json({
          error: {
            code: 'WISH_NOT_FOUND',
            message: error.message,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      next(error);
    }
  }
}

export const parentWishController = new ParentWishController();
