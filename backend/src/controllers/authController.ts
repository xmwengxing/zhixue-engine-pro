import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { z } from 'zod';
import { logger } from '../middlewares/logger';

/**
 * 登录请求验证 schema
 */
const loginSchema = z.object({
  username: z.string().min(3, '用户名至少 3 个字符').max(20, '用户名最多 20 个字符'),
  // 登录只校验非空，不强制密码策略（密码强度由注册/改密接口保证）
  password: z.string().min(1, '请输入密码'),
});

/**
 * 注册请求验证 schema
 * 支持家长和学员两种角色的差异化注册
 */
const registerSchema = z.object({
  role: z.enum(['PARENT', 'STUDENT'], { 
    errorMap: () => ({ message: '角色必须是 PARENT 或 STUDENT' }) 
  }),
  username: z.string().min(3, '用户名至少 3 个字符').max(20, '用户名最多 20 个字符'),
  password: z.string().min(6, '密码至少 6 个字符'),
  email: z.string().email('邮箱格式不正确').optional(),
  authCode: z.string().optional(), // 学员注册时必需，家长注册时不需要
  
  // 角色特定字段
  profile: z.object({
    // 家长特有字段
    name: z.string().optional(),
    gender: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    industry: z.string().optional(),
    
    // 学员特有字段
    birthDate: z.string().optional(),
    grade: z.string().optional(),
    school: z.string().optional(),
    learningFoundation: z.string().optional(),
    interests: z.string().optional(),
  }).optional(),
}).refine(
  (data) => {
    // 学员注册必须提供授权码
    if (data.role === 'STUDENT' && !data.authCode) {
      return false;
    }
    return true;
  },
  {
    message: '学员注册必须提供授权码',
    path: ['authCode'],
  }
).refine(
  (data) => {
    // 学员注册必须提供必填字段
    if (data.role === 'STUDENT' && data.profile) {
      const required = ['name', 'gender', 'birthDate', 'grade'];
      for (const field of required) {
        if (!data.profile[field as keyof typeof data.profile]) {
          return false;
        }
      }
    }
    return true;
  },
  {
    message: '学员注册必须提供姓名、性别、出生年月、年级',
    path: ['profile'],
  }
);

/**
 * 认证控制器类
 * 处理认证相关的 HTTP 请求
 */
export class AuthController {
  /**
   * 用户登录
   * POST /api/auth/login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 验证请求参数
      const validatedData = loginSchema.parse(req.body);

      // 调用认证服务
      const result = await authService.login(
        validatedData.username,
        validatedData.password
      );

      // 返回成功响应
      res.status(200).json({
        success: true,
        message: '登录成功',
        data: result,
      });
    } catch (error) {
      // 处理验证错误
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: '请求参数验证失败',
          errors: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      // 处理业务逻辑错误
      if (error instanceof Error) {
        logger.warn('登录失败:', {
          username: req.body.username,
          error: error.message,
        });

        res.status(401).json({
          success: false,
          message: error.message,
        });
        return;
      }

      // 传递给全局错误处理器
      next(error);
    }
  }

  /**
   * 用户注册
   * POST /api/auth/register
   * 支持家长和学员两种角色的差异化注册
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 验证请求参数
      const validatedData = registerSchema.parse(req.body);

      // 调用认证服务
      const result = await authService.registerUser(validatedData);

      // 返回成功响应
      res.status(201).json({
        success: true,
        message: '注册成功',
        data: result,
      });
    } catch (error) {
      // 处理验证错误
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: '请求参数验证失败',
          errors: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      // 处理业务逻辑错误
      if (error instanceof Error) {
        logger.warn('注册失败:', {
          username: req.body.username,
          role: req.body.role,
          error: error.message,
        });

        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }

      // 传递给全局错误处理器
      next(error);
    }
  }
}

export const authController = new AuthController();
