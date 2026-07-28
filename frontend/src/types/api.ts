/**
 * API 响应基础接口
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    requestId: string;
  };
}

/**
 * 分页请求参数
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/**
 * 分页响应数据
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * 登录请求参数
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * 登录响应数据
 */
export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    role: 'admin' | 'parent' | 'student';
    email?: string;
    phone?: string;
  };
}

/**
 * 注册请求参数（新版本 - 支持角色选择）
 */
export interface RegisterRequest {
  role: 'PARENT' | 'STUDENT';
  username: string;
  password: string;
  email?: string;
  authCode?: string; // 学员注册时必需
  profile?: {
    // 家长特有字段
    name?: string;
    gender?: string;
    phone?: string;
    address?: string;
    industry?: string;
    
    // 学员特有字段
    birthDate?: string;
    grade?: string;
    school?: string;
    learningFoundation?: string;
    interests?: string;
  };
}

/**
 * 注册响应数据
 */
export interface RegisterResponse {
  success: boolean;
  userId: string;
  username: string;
  role: string;
  studentIdNumber?: string; // 仅学员返回
}

/**
 * 用户角色
 */
export type Role = 'ADMIN' | 'PARENT' | 'STUDENT';

/**
 * 用户状态
 */
export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DELETED';
