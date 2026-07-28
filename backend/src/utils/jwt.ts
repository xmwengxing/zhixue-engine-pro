import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { Role } from '@prisma/client';

// JWT 载荷接口
export interface JWTPayload {
  userId: string;
  username: string;
  role: Role;
}

// JWT 配置
// 安全约定：密钥必须来自环境变量，禁止任何硬编码默认值（否则可被用于伪造令牌）。
// 生产环境缺失则直接启动失败（fail-fast）；非生产环境缺失时回退到进程内随机密钥，
// 既保证本地/测试可用，又不再是可预测的硬编码常量。
function resolveSecret(name: string): string {
  const value = process.env[name];
  if (value && value.trim().length > 0) {
    return value;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `环境变量 ${name} 未配置，生产环境禁止缺失（存在令牌伪造风险）。请在部署配置中设置。`
    );
  }
  return crypto.randomBytes(32).toString('hex');
}

const JWT_SECRET = resolveSecret('JWT_SECRET');
const JWT_EXPIRES_IN: StringValue = (process.env.JWT_EXPIRES_IN || '7d') as StringValue;
const JWT_REFRESH_SECRET = resolveSecret('JWT_REFRESH_SECRET');
const JWT_REFRESH_EXPIRES_IN: StringValue = (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as StringValue;

/**
 * 生成访问令牌
 * @param payload JWT 载荷
 * @returns 访问令牌
 */
export const generateAccessToken = (payload: JWTPayload): string => {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'training-platform',
    audience: 'training-platform-users',
  };
  return jwt.sign(payload, JWT_SECRET, options);
};

/**
 * 生成刷新令牌
 * @param payload JWT 载荷
 * @returns 刷新令牌
 */
export const generateRefreshToken = (payload: JWTPayload): string => {
  const options: SignOptions = {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    issuer: 'training-platform',
    audience: 'training-platform-users',
  };
  return jwt.sign(payload, JWT_REFRESH_SECRET, options);
};

/**
 * 验证访问令牌
 * @param token 访问令牌
 * @returns JWT 载荷
 * @throws 令牌无效或过期时抛出错误
 */
export const verifyAccessToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'training-platform',
      audience: 'training-platform-users',
    }) as JWTPayload;
    
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('令牌已过期');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('令牌无效');
    }
    throw error;
  }
};

/**
 * 验证刷新令牌
 * @param token 刷新令牌
 * @returns JWT 载荷
 * @throws 令牌无效或过期时抛出错误
 */
export const verifyRefreshToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'training-platform',
      audience: 'training-platform-users',
    }) as JWTPayload;
    
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('刷新令牌已过期');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('刷新令牌无效');
    }
    throw error;
  }
};

/**
 * 从令牌中解码载荷（不验证签名）
 * @param token JWT 令牌
 * @returns JWT 载荷或 null
 */
export const decodeToken = (token: string): JWTPayload | null => {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
};
