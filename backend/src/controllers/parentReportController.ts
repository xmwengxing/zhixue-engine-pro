// 家长端报告控制器
import { Request, Response, NextFunction } from 'express';
import { reportGenerationService } from '../services/reportGenerationService';
import { logger } from '../middlewares/logger';

/**
 * 获取报告列表
 */
export const getReports = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { studentId, page = '1', limit = '10', category, subject } = req.query;

    if (!studentId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_STUDENT_ID',
          message: '缺少学员 ID',
        },
      });
    }

    // P3 双轨：报告大类过滤校验
    let reportCategory: 'SUBJECT_MAIN' | 'SPECIAL' | undefined;
    if (category) {
      if (!['SUBJECT_MAIN', 'SPECIAL'].includes(category as string)) {
        return res.status(400).json({
          error: { code: 'INVALID_PARAMETER', message: '无效的报告大类' },
        });
      }
      reportCategory = category as 'SUBJECT_MAIN' | 'SPECIAL';
    }

    const result = await reportGenerationService.getStudentReports(
      studentId as string,
      parseInt(page as string),
      parseInt(limit as string),
      {
        category: reportCategory,
        subject: subject ? String(subject) : undefined,
      }
    );

    return res.json(result);
  } catch (error: any) {
    logger.error('获取报告列表失败:', error);
    return res.status(500).json({
      error: {
        code: 'GET_REPORTS_FAILED',
        message: error.message || '获取报告列表失败',
      },
    });
  }
};

/**
 * 获取报告详情
 */
export const getReportById = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { id } = req.params;

    if (Array.isArray(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: '无效的报告 ID',
        },
      });
    }

    const report = await reportGenerationService.getReport(id);

    // TODO: 验证家长权限

    return res.json(report);
  } catch (error: any) {
    logger.error('获取报告详情失败:', error);
    return res.status(500).json({
      error: {
        code: 'GET_REPORT_FAILED',
        message: error.message || '获取报告详情失败',
      },
    });
  }
};

/**
 * 导出报告为 PDF
 */
export const exportReport = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { id } = req.params;

    if (Array.isArray(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: '无效的报告 ID',
        },
      });
    }

    // TODO: 实现 PDF 导出功能
    // 目前返回 JSON 格式
    const report = await reportGenerationService.getReport(id);

    return res.json({
      message: 'PDF 导出功能待实现',
      report,
    });
  } catch (error: any) {
    logger.error('导出报告失败:', error);
    return res.status(500).json({
      error: {
        code: 'EXPORT_REPORT_FAILED',
        message: error.message || '导出报告失败',
      },
    });
  }
};

// 导出控制器对象
export const parentReportController = {
  getReports,
  getReportById,
  exportReport,
};
