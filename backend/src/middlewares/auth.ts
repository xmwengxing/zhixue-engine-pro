import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken, JWTPayload } from '../utils/jwt';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import prisma from '../config/database';

// 扩展 Express Request 类型，添加 user 属性
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * 认证中间件 - 验证 JWT 令牌
 * 从请求头中提取 Bearer token，验证并将用户信息附加到 req.user
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 从请求头获取 Authorization
    const authHeader = req.headers.authorization;
    
    // 调试日志
    console.log('认证中间件 - Authorization 头:', authHeader ? `${authHeader.substring(0, 30)}...` : 'null');
    console.log('认证中间件 - 请求路径:', req.path);
    
    if (!authHeader) {
      throw new AuthenticationError('未提供认证令牌');
    }

    // 检查是否为 Bearer token 格式
    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('令牌格式错误，应为 Bearer token');
    }

    // 提取 token
    const token = authHeader.substring(7);
    
    if (!token) {
      throw new AuthenticationError('令牌不能为空');
    }

    // 验证 token
    const payload = verifyAccessToken(token);
    console.log('认证中间件 - Token payload:', payload);
    
    // 检查用户是否存在且状态正常
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      throw new AuthenticationError('用户不存在');
    }

    if (user.status === 'LOCKED') {
      throw new AuthenticationError('账户已被锁定');
    }

    if (user.status === 'DELETED') {
      throw new AuthenticationError('账户已被删除');
    }

    // 将用户信息附加到请求对象
    // 注意：从数据库获取的 role 是大写枚举值，用于后端权限检查
    req.user = {
      userId: user.id,
      username: user.username,
      role: user.role, // 使用数据库中的大写角色值
    };

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      next(error);
    } else if (error instanceof Error) {
      next(new AuthenticationError(error.message));
    } else {
      next(new AuthenticationError('认证失败'));
    }
  }
};

/**
 * 角色权限中间件工厂函数
 * 创建一个中间件，检查用户是否具有指定角色之一
 * @param allowedRoles 允许的角色列表
 * @returns Express 中间件函数
 */
export const authorize = (...allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // 确保用户已认证
      if (!req.user) {
        throw new AuthenticationError('用户未认证');
      }

      // 检查用户角色是否在允许列表中
      if (!allowedRoles.includes(req.user.role)) {
        throw new AuthorizationError(
          `此操作需要以下角色之一: ${allowedRoles.join(', ')}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * 可选认证中间件
 * 如果提供了令牌则验证，否则继续执行（不抛出错误）
 * 用于某些既可以匿名访问也可以认证访问的端点
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    // 如果没有提供令牌，直接继续
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return next();
    }

    // 尝试验证 token
    try {
      const payload = verifyAccessToken(token);
      
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          username: true,
          role: true,
          status: true,
        },
      });

      if (user && user.status === 'ACTIVE') {
        req.user = {
          userId: user.id,
          username: user.username,
          role: user.role,
        };
      }
    } catch {
      // 令牌无效，但不抛出错误，继续执行
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 管理员权限中间件
 * 快捷方式，等同于 authorize('ADMIN')
 */
export const requireAdmin = authorize(Role.ADMIN);

/**
 * 家长权限中间件
 * 快捷方式，等同于 authorize('PARENT')
 */
export const requireParent = authorize(Role.PARENT);

/**
 * 学员权限中间件
 * 快捷方式，等同于 authorize('STUDENT')
 */
export const requireStudent = authorize(Role.STUDENT);

/**
 * 家长或管理员权限中间件
 * 快捷方式，等同于 authorize('PARENT', 'ADMIN')
 */
export const requireParentOrAdmin = authorize(Role.PARENT, Role.ADMIN);

/**
 * 学员或家长权限中间件
 * 快捷方式，等同于 authorize('STUDENT', 'PARENT')
 */
export const requireStudentOrParent = authorize(Role.STUDENT, Role.PARENT);
