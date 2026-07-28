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
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN: StringValue = (process.env.JWT_EXPIRES_IN || '7d') as StringValue;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
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
