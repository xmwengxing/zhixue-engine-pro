import request from '../utils/request';

/**
 * 积分历史记录
 */
export interface PointsHistory {
  id: string;
  amount: number;
  type: 'TASK_COMPLETE' | 'ERROR_RETRY' | 'WISH_REDEEM';
  relatedId: string | null;
  balance: number;
  createdAt: string;
}

/**
 * 积分信息
 */
export interface PointsData {
  available: number;
  total: number;
  history: PointsHistory[];
}

/**
 * 学员积分服务
 */
class StudentPointsService {
  /**
   * 获取学员积分信息
   */
  async getPoints(): Promise<PointsData> {
    const response = await request.get('/student/points');
    // 修复：后端返回 { success, data: pointsData }，需要访问 response.data
    return response.data;
  }
}

export const studentPointsService = new StudentPointsService();
