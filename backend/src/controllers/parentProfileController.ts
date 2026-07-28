import { Request, Response, NextFunction } from 'express';
import { parentProfileService } from '../services/parentProfileService';
import { logger } from '../middlewares/logger';

/**
 * 家长个人中心控制器
 */
class ParentProfileController {
  /**
   * 获取家长个人信息
   * GET /api/parent/profile
   */
  async getProfile(req: Request, res: Response, next: NextFunction) {
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

      const profile = await parentProfileService.getProfile(parentId);

      return res.json({
        success: true,
        data: profile,
      });
    } catch (error: any) {
      if (error.message === '用户不存在') {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        });
      }

      if (error.message === '用户不是家长角色') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: error.message,
          },
        });
      }

      logger.error('获取家长个人信息失败:', error);
      return next(error);
    }
  }

  /**
   * 更新家长个人信息
   * PUT /api/parent/profile
   */
  async updateProfile(req: Request, res: Response, next: NextFunction) {
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

      const { email, phone, realName, gender, address, industry } = req.body;

      // 验证邮箱格式（如果提供）
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_EMAIL',
            message: '邮箱格式不正确',
          },
        });
      }

      const updatedProfile = await parentProfileService.updateProfile(parentId, {
        email,
        phone,
        realName,
        gender,
        address,
        industry,
      });

      return res.json({
        success: true,
        data: updatedProfile,
        message: '个人信息更新成功',
      });
    } catch (error: any) {
      if (error.message === '用户不存在') {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        });
      }

      if (error.message === '用户不是家长角色') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: error.message,
          },
        });
      }

      if (error.message === '邮箱已被使用') {
        return res.status(409).json({
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: error.message,
          },
        });
      }

      logger.error('更新家长个人信息失败:', error);
      return next(error);
    }
  }

  /**
   * 修改密码
   * PUT /api/parent/password
   */
  async changePassword(req: Request, res: Response, next: NextFunction) {
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

      const { oldPassword, newPassword } = req.body;

      // 验证必填字段
      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: '原密码和新密码为必填项',
          },
        });
      }

      // 验证新密码长度
      if (newPassword.length < 6) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PASSWORD',
            message: '新密码长度至少为6位',
          },
        });
      }

      const result = await parentProfileService.changePassword(parentId, {
        oldPassword,
        newPassword,
      });

      return res.json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (error: any) {
      if (error.message === '用户不存在') {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        });
      }

      if (error.message === '用户不是家长角色') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: error.message,
          },
        });
      }

      if (error.message === '原密码错误') {
        return res.status(400).json({
          error: {
            code: 'INVALID_OLD_PASSWORD',
            message: error.message,
          },
        });
      }

      logger.error('修改密码失败:', error);
      return next(error);
    }
  }
}

export const parentProfileController = new ParentProfileController();
