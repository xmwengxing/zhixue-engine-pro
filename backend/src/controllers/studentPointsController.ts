import { Request, Response, NextFunction } from 'express';
import { studentPointsService } from '../services/studentPointsService';

/**
 * 学员积分控制器
 */
export class StudentPointsController {
  /**
   * 获取学员积分信息
   * GET /api/student/points
   */
  async getPoints(req: Request, res: Response, next: NextFunction) {
    try {
      const studentId = req.user!.userId; // 从认证中间件获取用户 ID

      const pointsData = await studentPointsService.getPoints(studentId);

      res.json({
        success: true,
        data: pointsData,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const studentPointsController = new StudentPointsController();
