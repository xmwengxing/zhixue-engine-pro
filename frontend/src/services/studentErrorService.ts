// 学员端错题管理服务
import request from '../utils/request';

// 错题接口类型定义
export interface ErrorQuestion {
  id: string;
  studentId: string;
  questionId: string;
  answerId: string;
  subject: string;
  mastery: 'UNMASTERED' | 'MASTERING' | 'MASTERED';
  retryCount: number;
  lastRetryAt: string | null;
  collectedAt: string;
  updatedAt: string;
  question: {
    id: string;
    type: 'CHOICE' | 'FILL' | 'ESSAY';
    content: {
      text: string;
      options?: Array<{ key: string; text: string } | string>;
      [key: string]: unknown;
    };
    answer: string;
    difficulty: number;
    knowledgePoints: string[];
    materialNode: {
      id: string;
      name: string;
      type: string;
    };
  };
  answer: {
    id: string;
    studentAnswer: string;
    isCorrect: boolean;
    timeSpent: number;
    answeredAt: string;
  };
  // 艾宾浩斯间隔重复相关字段（改善1：错题伪掌握治理）
  reviewStage?: number;
  consecutiveCorrect?: number;
  nextReviewAt?: string | null;
  reviewHistory?: unknown;
}

// 今日待复习响应
export interface DueReviewResponse {
  items: ErrorQuestion[];
  total: number;
  cyclesToMaster: number;
}

export interface ErrorListResponse {
  errors: ErrorQuestion[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ErrorStats {
  unmastered: number;
  mastering: number;
  mastered: number;
  total: number;
}

/**
 * 获取错题列表
 */
export const getErrors = async (params: {
  subject?: string;
  mastery?: 'UNMASTERED' | 'MASTERING' | 'MASTERED';
  page?: number;
  limit?: number;
}): Promise<ErrorListResponse> => {
  const response = await request.get('/student/errors', { params });
  // 修复：直接返回 response，而不是 response.data
  return response;
};

/**
 * 获取错题详情
 */
export const getErrorDetail = async (errorId: string): Promise<ErrorQuestion> => {
  const response = await request.get(`/student/errors/${errorId}`);
  // 修复：直接返回 response.error，而不是 response.data.error
  return response.error;
};

/**
 * 开始错题重做
 */
export const retryError = async (errorId: string) => {
  const response = await request.post(`/student/errors/${errorId}/retry`);
  // 修复：直接返回 response.session，而不是 response.data.session
  return response.session;
};

/**
 * 更新错题掌握度
 */
export const updateMastery = async (
  errorId: string,
  mastery: 'UNMASTERED' | 'MASTERING' | 'MASTERED'
): Promise<ErrorQuestion> => {
  const response = await request.put(`/student/errors/${errorId}/mastery`, {
    mastery,
  });
  // 修复：直接返回 response.error，而不是 response.data.error
  return response.error;
};

/**
 * 获取今日到期待复习的错题（艾宾浩斯间隔重复）
 */
export const getDueReviews = async (limit = 20): Promise<DueReviewResponse> => {
  const response = await request.get('/student/errors/due', {
    params: { limit },
  });
  // request 拦截器已解包 response.data，此处 payload 为 { items, total, cyclesToMaster }
  return response;
};
