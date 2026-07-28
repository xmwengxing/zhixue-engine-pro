import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
}

// 自定义 Axios 实例类型，返回值是解包后的数据
interface CustomAxiosInstance {
  get<T = any>(url: string, config?: any): Promise<T>;
  post<T = any>(url: string, data?: any, config?: any): Promise<T>;
  put<T = any>(url: string, data?: any, config?: any): Promise<T>;
  delete<T = any>(url: string, config?: any): Promise<T>;
  patch<T = any>(url: string, data?: any, config?: any): Promise<T>;
}

/**
 * API 基础 URL
 * 开发环境使用本地后端，生产环境使用环境变量
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

/**
 * 创建 Axios 实例
 */
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // 30 秒超时
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * 请求拦截器
 * 在请求发送前添加 token
 */
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 从 store 获取 token
    const token = useAuthStore.getState().token;

    // 调试：打印 token 信息
    console.log('请求拦截器 - Token:', token ? `${token.substring(0, 20)}...` : 'null');
    console.log('请求拦截器 - URL:', config.url);

    // 如果存在 token，添加到请求头
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('请求拦截器 - Authorization 头已设置');
    } else {
      console.warn('请求拦截器 - 没有 token！');
    }

    return config;
  },
  (error: AxiosError) => {
    console.error('请求错误:', error);
    return Promise.reject(error);
  }
);

/**
 * 响应拦截器
 * 统一处理响应和错误
 */
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    // 直接返回响应数据
    return response.data as any;
  },
  async (error: AxiosError) => {
    // 错误处理
    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401:
          // 未认证或 token 过期
          // TODO: 实现token刷新机制（需要后端支持 /api/auth/refresh 端点）
          // const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
          // if (!originalRequest._retry) {
          //   originalRequest._retry = true;
          //   try {
          //     const refreshToken = localStorage.getItem('refreshToken');
          //     if (refreshToken) {
          //       const response = await axios.post('/api/auth/refresh', { refreshToken });
          //       const { token } = response.data.data;
          //       localStorage.setItem('token', token);
          //       useAuthStore.getState().setToken(token);
          //       originalRequest.headers.Authorization = `Bearer ${token}`;
          //       return axiosInstance(originalRequest);
          //     }
          //   } catch (refreshError) {
          //     console.error('Token刷新失败:', refreshError);
          //   }
          // }
          
          // 清除认证信息并跳转登录页
          console.error('认证失败，请重新登录');
          useAuthStore.getState().logout();
          window.location.href = '/login';
          break;

        case 403:
          // 权限不足
          console.error('权限不足，无法访问该资源');
          showError('您没有权限执行此操作');
          break;

        case 404:
          // 资源不存在
          console.error('请求的资源不存在');
          showError('请求的资源不存在');
          break;

        case 422: {
          // 业务逻辑错误
          const errorData = data as { error?: { message?: string } };
          const errorMessage = errorData?.error?.message || '请求参数错误';
          console.error('业务逻辑错误:', errorMessage);
          showError(errorMessage);
          break;
        }

        case 500:
        case 502:
        case 503:
          // 服务器错误
          console.error('服务器错误，请稍后重试');
          showError('服务暂时不可用，请稍后重试');
          break;

        default:
          console.error('未知错误:', error);
          showError('发生未知错误');
      }
    } else if (error.request) {
      // 请求已发送但没有收到响应
      console.error('网络错误，请检查网络连接');
      showError('网络连接失败，请检查网络');
    } else {
      // 请求配置错误
      console.error('请求配置错误:', error.message);
      showError('请求失败');
    }

    return Promise.reject(error);
  }
);

/**
 * 显示错误提示
 * TODO: 后续集成 Toast 组件后替换为实际的提示组件
 */
function showError(message: string) {
  // 临时使用 alert，后续替换为 Toast 组件
  if (typeof window !== 'undefined') {
    console.error(message);
    // alert(message); // 暂时注释，避免过多弹窗
  }
}

// 导出自定义类型的实例
const request = axiosInstance as unknown as CustomAxiosInstance;

export default request;
