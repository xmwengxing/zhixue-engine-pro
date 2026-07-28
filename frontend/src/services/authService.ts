import request from '../utils/request';
import type { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse } from '../types/api';

/**
 * 后端 API 响应包装格式
 */
interface ApiResponseWrapper<T> {
  success: boolean;
  message: string;
  data: T;
}

/**
 * 认证相关 API 服务
 */
export const authService = {
  /**
   * 用户登录
   * @param data 登录请求参数
   * @returns 登录响应数据
   */
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await request.post<ApiResponseWrapper<LoginResponse>>('/auth/login', data);
    return response.data; // 响应拦截器已经解包了一层，直接返回 data 字段
  },

  /**
   * 用户注册
   * @param data 注册请求参数
   * @returns 注册响应数据
   */
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await request.post<ApiResponseWrapper<RegisterResponse>>('/auth/register', data);
    return response.data; // 响应拦截器已经解包了一层，直接返回 data 字段
  },

  /**
   * 用户登出
   * @returns 登出响应
   */
  logout: (): Promise<{ success: boolean }> => {
    return request.post('/auth/logout');
  },

  /**
   * 刷新 token
   * @param refreshToken 刷新令牌
   * @returns 新的 token
   */
  refreshToken: (refreshToken: string): Promise<{ token: string }> => {
    return request.post('/auth/refresh', { refreshToken });
  },
};
