// 报告状态控制器
import { Request, Response, NextFunction } from 'express';
import { reportStatusService } from '../services/reportStatusService';
import { logger } from '../middlewares/logger';

/**
 * 获取报告生成状态
 */
export const getReportStatus = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { sessionId } = req.params;

    if (Array.isArray(sessionId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_SESSION_ID',
          message: '无效的会话 ID',
        },
      });
    }

    const status = reportStatusService.getStatus(sessionId);

    if (!status) {
      return res.status(404).json({
        error: {
          code: 'STATUS_NOT_FOUND',
          message: '未找到报告生成状态',
        },
      });
    }

    return res.json(status);
  } catch (error: any) {
    logger.error('获取报告状态失败:', error);
    return res.status(500).json({
      error: {
        code: 'GET_STATUS_FAILED',
        message: error.message || '获取报告状态失败',
      },
    });
  }
};

// 导出控制器对象
export const reportStatusController = {
  getReportStatus,
};
