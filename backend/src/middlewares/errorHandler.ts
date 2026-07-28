import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

// 自定义错误类
export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: any;

  constructor(message: string, statusCode: number, code: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 常见错误类型
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = '认证失败，请重新登录') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = '您没有权限执行此操作') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = '请求的资源不存在') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

// 全局错误处理中间件
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // 生成请求追踪 ID
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 记录错误日志
  logger.error({
    error: err.message,
    stack: err.stack,
    requestId,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // 判断是否为自定义错误
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
    return;
  }

  // Prisma 错误处理
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any;
    
    // 唯一约束冲突
    if (prismaError.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'DUPLICATE_ENTRY',
          message: '数据已存在，请检查输入',
          details: prismaError.meta,
          timestamp: new Date().toISOString(),
          requestId,
        },
      });
      return;
    }
    
    // 外键约束失败
    if (prismaError.code === 'P2003') {
      res.status(400).json({
        error: {
          code: 'FOREIGN_KEY_CONSTRAINT',
          message: '关联数据不存在',
          timestamp: new Date().toISOString(),
          requestId,
        },
      });
      return;
    }
  }

  // 默认服务器错误
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? '服务器内部错误' 
        : err.message,
      timestamp: new Date().toISOString(),
      requestId,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
};

// 404 处理中间件
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `路由 ${req.method} ${req.path} 不存在`,
      timestamp: new Date().toISOString(),
    },
  });
};
