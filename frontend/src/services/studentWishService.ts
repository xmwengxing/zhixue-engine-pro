import request from '../utils/request';

/**
 * 愿望类型
 */
export type WishType = 'CASH' | 'CUSTOM';

/**
 * 愿望状态
 */
export type WishStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';

/**
 * 愿望信息
 */
export interface Wish {
  id: string;
  type: WishType;
  description: string;
  requiredPoints: number;
  imageUrl: string | null;
  status: WishStatus;
  reviewedBy: {
    id: string;
    username: string;
  } | null;
  reviewReason: string | null;
  confirmedAt: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  fulfilledAt: string | null;
}

/**
 * 愿望列表响应
 */
export interface WishListResponse {
  wishes: Wish[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * 创建愿望请求
 */
export interface CreateWishRequest {
  type: WishType;
  description: string;
  requiredPoints: number;
  imageUrl?: string;
}

/**
 * 创建愿望响应
 */
export interface CreateWishResponse {
  wish: Wish;
  hasEnoughPoints: boolean;
  currentPoints: number;
  pointsNeeded: number;
}

/**
 * 愿望统计
 */
export interface WishStats {
  pending: number;
  approved: number;
  rejected: number;
  fulfilled: number;
  total: number;
}

/**
 * 学员愿望服务
 */
class StudentWishService {
  /**
   * 获取愿望列表
   */
  async getWishes(
    status?: WishStatus,
    page: number = 1,
    limit: number = 20
  ): Promise<WishListResponse> {
    const params: any = { page, limit };
    if (status) {
      params.status = status;
    }

    const response = await request.get('/student/wishes', { params });
    // 修复：后端返回 { success, data: { wishes, total, ... } }，需要访问 response.data
    return response.data;
  }

  /**
   * 获取愿望详情
   */
  async getWish(wishId: string): Promise<Wish> {
    const response = await request.get(`/student/wishes/${wishId}`);
    // 修复：后端返回 { success, data: wish }，需要访问 response.data
    return response.data;
  }

  /**
   * 提交愿望
   */
  async createWish(data: CreateWishRequest): Promise<CreateWishResponse> {
    const response = await request.post('/student/wishes', data);
    // 修复：后端返回 { success, wish, hasEnoughPoints, ... }，直接返回 response
    return response;
  }

  /**
   * 确认愿望（扣除积分）
   */
  async confirmWish(wishId: string): Promise<Wish> {
    const response = await request.post(`/student/wishes/${wishId}/confirm`);
    // 返回确认后的愿望数据
    return response.data;
  }

  /**
   * 获取愿望统计
   */
  async getWishStats(): Promise<WishStats> {
    const response = await request.get('/student/wishes/stats');
    // 修复：后端返回 { success, data: stats }，需要访问 response.data
    return response.data;
  }
}

export const studentWishService = new StudentWishService();
