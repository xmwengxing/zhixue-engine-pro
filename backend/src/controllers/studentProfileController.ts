// 学员档案控制器
import { Request, Response, NextFunction } from 'express';
import { studentProfileService } from '../services/studentProfileService';
import { logger } from '../middlewares/logger';

/**
 * 获取学员档案
 * GET /api/student/profile
 */
export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    let profile = await studentProfileService.getProfile(userId);

    // 如果档案不存在，自动创建空档案
    if (!profile) {
      profile = await studentProfileService.upsertProfile(userId, {});
    }

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    logger.error('获取学员档案失败:', error);
    next(error);
  }
};

/**
 * 更新学员档案
 * PUT /api/student/profile
 * 注意：学号、账户名、姓名、性别、出生年月等核心信息不可修改
 */
export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    const { grade, school, learningFoundation, interests, materialVersion } = req.body;

    // 验证至少提供一个可更新字段
    if (!grade && !school && !learningFoundation && !interests && !materialVersion) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '至少需要提供一个字段进行更新',
        },
      });
      return;
    }

    // 验证学习基础选项
    if (learningFoundation) {
      const validFoundations = ['WEAK', 'AVERAGE', 'GOOD', 'EXCELLENT'];
      if (!validFoundations.includes(learningFoundation)) {
        res.status(400).json({
          error: {
            code: 'INVALID_FOUNDATION',
            message: `学习基础值无效，必须是: ${validFoundations.join(', ')}`,
          },
        });
        return;
      }
    }

    const profile = await studentProfileService.updateProfile(userId, {
      grade,
      school,
      learningFoundation,
      interests,
      materialVersion,
    });

    res.json({
      success: true,
      message: '档案更新成功',
      data: profile,
    });
  } catch (error: any) {
    logger.error('更新学员档案失败:', error);
    
    if (error.message === '学员档案不存在') {
      res.status(404).json({
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }
    
    next(error);
  }
};

/**
 * 学习基础自评
 * POST /api/student/profile/self-assessment
 */
export const selfAssessment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    const { subject, level } = req.body;

    // 验证必填字段
    if (!subject || !level) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '科目和水平等级为必填项',
        },
      });
      return;
    }

    // 验证水平等级
    const validLevels = ['weak', 'average', 'good', 'excellent'];
    if (!validLevels.includes(level)) {
      res.status(400).json({
        error: {
          code: 'INVALID_LEVEL',
          message: `水平等级无效，必须是: ${validLevels.join(', ')}`,
        },
      });
      return;
    }

    const profile = await studentProfileService.selfAssessment(
      userId,
      subject,
      level
    );

    res.json({
      success: true,
      message: '自评提交成功',
      profile,
    });
  } catch (error: any) {
    logger.error('学习基础自评失败:', error);
    
    if (error.message === '请先创建学员档案') {
      res.status(404).json({
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }
    
    next(error);
  }
};

/**
 * 获取档案更新历史
 * GET /api/student/profile/history
 */
export const getProfileHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 10;

    const history = await studentProfileService.getProfileHistory(userId, limit);

    res.json({
      success: true,
      history,
    });
  } catch (error) {
    logger.error('获取档案历史失败:', error);
    next(error);
  }
};

/**
 * 修改密码
 * PUT /api/student/password
 */
export const updatePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    const { oldPassword, newPassword } = req.body;

    // 验证必填字段
    if (!oldPassword || !newPassword) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '原密码和新密码为必填项',
        },
      });
      return;
    }

    // 验证新密码长度
    if (newPassword.length < 6) {
      res.status(400).json({
        error: {
          code: 'INVALID_PASSWORD',
          message: '新密码长度至少为6位',
        },
      });
      return;
    }

    // 验证新旧密码不能相同
    if (oldPassword === newPassword) {
      res.status(400).json({
        error: {
          code: 'SAME_PASSWORD',
          message: '新密码不能与原密码相同',
        },
      });
      return;
    }

    await studentProfileService.updatePassword(userId, oldPassword, newPassword);

    res.json({
      success: true,
      message: '密码修改成功，请重新登录',
    });
  } catch (error: any) {
    logger.error('修改密码失败:', error);
    
    if (error.message === '用户不存在') {
      res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }
    
    if (error.message === '原密码错误') {
      res.status(400).json({
        error: {
          code: 'WRONG_PASSWORD',
          message: error.message,
        },
      });
      return;
    }
    
    next(error);
  }
};
