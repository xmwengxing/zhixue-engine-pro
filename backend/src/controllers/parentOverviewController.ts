import { Request, Response, NextFunction } from 'express';
import { parentOverviewService } from '../services/parentOverviewService';
import { parentChildService } from '../services/parentChildService';
import { logger } from '../middlewares/logger';

/**
 * 家长端学情概览控制器
 */
class ParentOverviewController {
  /**
   * 获取学员的学情概览数据
   * GET /api/parent/overview/:studentId
   */
  async getStudentOverview(req: Request, res: Response, next: NextFunction) {
    try {
      // 从认证中间件获取家长 ID
      const parentId = req.user?.userId;

      if (!parentId) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: '未认证',
          },
        });
      }

      const { studentId } = req.params;

      if (!studentId || typeof studentId !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '学员 ID 不能为空',
          },
        });
      }

      // 验证家长是否有权访问该学员的数据
      const hasAccess = await parentChildService.verifyParentChildRelation(parentId, studentId);

      if (!hasAccess) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: '无权访问该学员的数据',
          },
        });
      }

      // 获取学情概览数据
      const overview = await parentOverviewService.getStudentOverview(studentId);

      return res.json({
        success: true,
        data: overview,
      });
    } catch (error: any) {
      logger.error('获取学情概览失败:', error);
      return next(error);
    }
  }
}

export const parentOverviewController = new ParentOverviewController();
