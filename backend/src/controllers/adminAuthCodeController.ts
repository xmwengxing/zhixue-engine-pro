import { Request, Response, NextFunction } from 'express';
import { adminAuthCodeService } from '../services/adminAuthCodeService';
import { AuthCodeStatus } from '@prisma/client';
import { logger } from '../middlewares/logger';

/**
 * 管理员授权码管理控制器
 */
class AdminAuthCodeController {
  /**
   * 获取授权码列表
   * GET /api/admin/auth-codes
   */
  async getAuthCodes(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        status,
        page,
        limit,
        search,
      } = req.query;

      // 验证参数
      const params: any = {};

      if (status && Object.values(AuthCodeStatus).includes(status as AuthCodeStatus)) {
        params.status = status as AuthCodeStatus;
      }

      if (page) {
        params.page = parseInt(page as string, 10);
        if (isNaN(params.page) || params.page < 1) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '页码必须是大于 0 的整数',
            },
          });
        }
      }

      if (limit) {
        params.limit = parseInt(limit as string, 10);
        if (isNaN(params.limit) || params.limit < 1 || params.limit > 100) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '每页数量必须在 1-100 之间',
            },
          });
        }
      }

      if (search) {
        params.search = search as string;
      }

      const result = await adminAuthCodeService.getAuthCodes(params);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('获取授权码列表失败:', error);
      return next(error);
    }
  }

  /**
   * 获取授权码详情
   * GET /api/admin/auth-codes/:id
   */
  async getAuthCodeById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '授权码 ID 不能为空',
          },
        });
      }

      const authCode = await adminAuthCodeService.getAuthCodeById(id);

      return res.json({
        success: true,
        data: { authCode },
      });
    } catch (error: any) {
      if (error.message === '授权码不存在') {
        return res.status(404).json({
          error: {
            code: 'AUTH_CODE_NOT_FOUND',
            message: error.message,
          },
        });
      }
      logger.error('获取授权码详情失败:', error);
      return next(error);
    }
  }

  /**
   * 批量生成授权码
   * POST /api/admin/auth-codes/generate
   */
  async generateAuthCodes(req: Request, res: Response, next: NextFunction) {
    try {
      const { count, expiryDays } = req.body;

      // 验证必填字段
      if (!count || !expiryDays) {
        return res.status(400).json({
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: '生成数量和有效期为必填项',
          },
        });
      }

      // 验证数值类型
      const countNum = parseInt(count, 10);
      const expiryDaysNum = parseInt(expiryDays, 10);

      if (isNaN(countNum) || isNaN(expiryDaysNum)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '生成数量和有效期必须是数字',
          },
        });
      }

      const result = await adminAuthCodeService.generateAuthCodes({
        count: countNum,
        expiryDays: expiryDaysNum,
      });

      return res.status(201).json({
        success: true,
        data: result,
        message: `成功生成 ${result.count} 个授权码`,
      });
    } catch (error: any) {
      if (error.message.includes('必须在')) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: error.message,
          },
        });
      }
      logger.error('批量生成授权码失败:', error);
      return next(error);
    }
  }

  /**
   * 导出授权码
   * GET /api/admin/auth-codes/export
   */
  async exportAuthCodes(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.query;

      // 验证参数
      const params: any = {};

      if (status && Object.values(AuthCodeStatus).includes(status as AuthCodeStatus)) {
        params.status = status as AuthCodeStatus;
      }

      const csv = await adminAuthCodeService.exportAuthCodes(params);

      // 设置响应头
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=auth-codes-${Date.now()}.csv`);
      
      // 发送 CSV 内容（添加 UTF-8 BOM）
      return res.send('\ufeff' + csv);
    } catch (error: any) {
      logger.error('导出授权码失败:', error);
      return next(error);
    }
  }

  /**
   * 获取授权码统计信息
   * GET /api/admin/auth-codes/stats
   */
  async getAuthCodeStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await adminAuthCodeService.getAuthCodeStats();

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      logger.error('获取授权码统计失败:', error);
      return next(error);
    }
  }

  /**
   * 删除授权码
   * DELETE /api/admin/auth-codes/:id
   */
  async deleteAuthCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '授权码 ID 不能为空',
          },
        });
      }

      const result = await adminAuthCodeService.deleteAuthCode(id);

      return res.json({
        success: true,
        data: result,
        message: '授权码删除成功',
      });
    } catch (error: any) {
      if (error.message === '授权码不存在') {
        return res.status(404).json({
          error: {
            code: 'AUTH_CODE_NOT_FOUND',
            message: error.message,
          },
        });
      }
      if (error.message === '已使用的授权码不能删除') {
        return res.status(409).json({
          error: {
            code: 'CONFLICT',
            message: error.message,
          },
        });
      }
      logger.error('删除授权码失败:', error);
      return next(error);
    }
  }
}

export const adminAuthCodeController = new AdminAuthCodeController();
