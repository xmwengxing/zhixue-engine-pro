// 学员端错题管理控制器
import { Request, Response, NextFunction } from 'express';
import * as studentErrorService from '../services/studentErrorService';

/**
 * @route   GET /api/student/errors
 * @desc    获取错题列表（支持筛选）
 * @access  Private (Student)
 */
export const getErrors = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const studentId = req.user!.userId;
    const { subject, mastery, page = '1', limit = '20' } = req.query;

    const result = await studentErrorService.getErrors({
      studentId,
      subject: subject as string | undefined,
      mastery: mastery as 'UNMASTERED' | 'MASTERING' | 'MASTERED' | undefined,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/student/errors/:id
 * @desc    获取错题详情
 * @access  Private (Student)
 */
export const getErrorDetail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const studentId = req.user!.userId;
    const id = req.params.id as string;

    const error = await studentErrorService.getErrorDetail(id, studentId);

    res.json({ error });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/student/errors/:id/retry
 * @desc    开始错题重做
 * @access  Private (Student)
 */
export const retryError = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const studentId = req.user!.userId;
    const id = req.params.id as string;

    const session = await studentErrorService.createRetrySession(id, studentId);

    res.json({ session });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/student/errors/:id/mastery
 * @desc    更新错题掌握度
 * @access  Private (Student)
 */
export const updateMastery = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const studentId = req.user!.userId;
    const id = req.params.id as string;
    const { mastery } = req.body;

    // 验证掌握度值
    if (!['UNMASTERED', 'MASTERING', 'MASTERED'].includes(mastery)) {
      res.status(400).json({
        error: {
          code: 'INVALID_MASTERY',
          message: '无效的掌握度值',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const error = await studentErrorService.updateMastery(id, studentId, mastery);

    res.json({ error });
  } catch (error) {
    next(error);
  }
};
