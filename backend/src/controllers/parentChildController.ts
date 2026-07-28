import { Request, Response, NextFunction } from 'express';
import { parentChildService } from '../services/parentChildService';
import { logger } from '../middlewares/logger';

/**
 * 家长端亲子关系管理控制器
 */
class ParentChildController {
  /**
   * 获取家长的所有子女列表
   * GET /api/parent/children
   */
  async getChildren(req: Request, res: Response, next: NextFunction) {
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

      const children = await parentChildService.getChildren(parentId);

      return res.json({
        success: true,
        data: { children },
      });
    } catch (error: any) {
      logger.error('获取子女列表失败:', error);
      return next(error);
    }
  }

  /**
   * 绑定学员
   * POST /api/parent/children/bind
   */
  async bindChild(req: Request, res: Response, next: NextFunction) {
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

      const { authCode, studentIdNumber, relation } = req.body;

      // 验证必填字段
      if (!relation) {
        return res.status(400).json({
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: '关系类型为必填项',
          },
        });
      }

      // 验证至少提供一种绑定方式
      if (!authCode && !studentIdNumber) {
        return res.status(400).json({
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: '必须提供授权码或学号',
          },
        });
      }

      // 验证关系类型
      const validRelations = ['父亲', '母亲', '监护人'];
      if (!validRelations.includes(relation)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_RELATION',
            message: '关系类型必须是：父亲、母亲或监护人',
          },
        });
      }

      const result = await parentChildService.bindChild({
        parentId,
        authCode,
        studentIdNumber,
        relation,
      });

      return res.status(201).json({
        success: true,
        data: result,
        message: '学员绑定成功',
      });
    } catch (error: any) {
      if (
        error.message === '授权码不存在' ||
        error.message === '学号不存在' ||
        error.message === '授权码未被使用或已过期' ||
        error.message === '学号未分配给任何用户' ||
        error.message === '授权码未关联任何用户' ||
        error.message === '学号未关联任何用户' ||
        error.message === '授权码关联的用户不是学员' ||
        error.message === '学号关联的用户不是学员'
      ) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        });
      }

      if (error.message === '该学员已经绑定') {
        return res.status(409).json({
          error: {
            code: 'ALREADY_BOUND',
            message: error.message,
          },
        });
      }

      if (error.message === '只有家长角色可以绑定学员') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: error.message,
          },
        });
      }

      logger.error('绑定学员失败:', error);
      return next(error);
    }
  }

  /**
   * 解绑学员
   * DELETE /api/parent/children/:id/unbind
   */
  async unbindChild(req: Request, res: Response, next: NextFunction) {
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

      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '关系 ID 不能为空',
          },
        });
      }

      const result = await parentChildService.unbindChild(parentId, id);

      return res.json({
        success: true,
        data: result,
        message: '学员解绑成功',
      });
    } catch (error: any) {
      if (error.message === '亲子关系不存在') {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        });
      }

      if (error.message === '无权解绑该学员' || error.message === '该学员已经解绑') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: error.message,
          },
        });
      }

      logger.error('解绑学员失败:', error);
      return next(error);
    }
  }

  /**
   * 创建学员并绑定
   * POST /api/parent/children/create
   */
  async createChild(req: Request, res: Response, next: NextFunction) {
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

      const { authCode, username, password, profile, relation } = req.body;

      // 验证必填字段
      if (!authCode || !username || !password || !relation) {
        return res.status(400).json({
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: '授权码、用户名、密码和关系类型为必填项',
          },
        });
      }

      // 验证学员档案必填字段
      if (!profile || !profile.name || !profile.gender || !profile.birthDate || !profile.grade) {
        return res.status(400).json({
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: '学员姓名、性别、出生年月和年级为必填项',
          },
        });
      }

      // 验证关系类型
      const validRelations = ['父亲', '母亲', '监护人'];
      if (!validRelations.includes(relation)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_RELATION',
            message: '关系类型必须是：父亲、母亲或监护人',
          },
        });
      }

      const result = await parentChildService.createStudentByParent({
        parentId,
        authCode,
        username,
        password,
        profile,
        relation,
      });

      return res.status(201).json({
        success: true,
        data: result,
        message: '学员创建并绑定成功',
      });
    } catch (error: any) {
      if (
        error.message === '授权码不存在' ||
        error.message === '学员注册需要提供授权码' ||
        error.message === '授权码已被使用或已过期' ||
        error.message === '授权码已过期'
      ) {
        return res.status(400).json({
          error: {
            code: 'INVALID_AUTH_CODE',
            message: error.message,
          },
        });
      }

      if (error.message === '用户名已存在') {
        return res.status(409).json({
          error: {
            code: 'USERNAME_EXISTS',
            message: error.message,
          },
        });
      }

      if (
        error.message === '家长用户不存在' ||
        error.message === '只有家长角色可以创建学员账户'
      ) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: error.message,
          },
        });
      }

      logger.error('创建学员并绑定失败:', error);
      return next(error);
    }
  }
}

export const parentChildController = new ParentChildController();
