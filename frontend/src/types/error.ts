/**
 * API 错误响应类型
 */
export interface ApiErrorResponse {
  response?: {
    status?: number;
    data?: {
      error?: {
        message?: string;
        code?: string;
      };
      message?: string;
    };
  };
  message?: string;
}

/**
 * 从错误对象中提取错误消息
 * @param error 错误对象
 * @param defaultMessage 默认错误消息
 * @returns 错误消息字符串
 */
export function getErrorMessage(error: unknown, defaultMessage: string = '操作失败'): string {
  if (!error) return defaultMessage;
  
  // 检查是否是 API 错误响应
  const apiError = error as ApiErrorResponse;
  if (apiError.response?.data?.error?.message) {
    return apiError.response.data.error.message;
  }
  
  if (apiError.response?.data?.message) {
    return apiError.response.data.message;
  }
  
  // 检查是否是普通 Error 对象
  if (error instanceof Error) {
    return error.message;
  }
  
  return defaultMessage;
}
