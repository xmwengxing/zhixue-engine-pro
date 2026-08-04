import request from '../utils/request';

/** 积分流水 */
export interface PointsTx {
  id: string;
  amount: number;
  type: string;
  relatedId: string | null;
  balance: number;
  memo: string | null;
  createdAt: string;
}

/** 积分规则 */
export interface PointsRule {
  type: string;
  name: string;
  amount: number;
  desc: string;
}

/** 扣分警告 */
export interface PenaltyWarning {
  taskId: string;
  reason: string;
  severity: 'WARN' | 'DANGER';
}

/** 积分总览 */
export interface PointsOverview {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  warnings: PenaltyWarning[];
}

/** 积分流水分页 */
export interface TxPage {
  total: number;
  page: number;
  pageSize: number;
  rows: PointsTx[];
}

/**
 * 学员积分服务 V2（1 积分 = 1 元）
 */
class StudentPointsService {
  async getBalance(): Promise<PointsOverview> {
    const res = await request.get<{ success: boolean; data: PointsOverview }>('/student/points/balance');
    return res.data;
  }

  async getTransactions(type = 'ALL', page = 1): Promise<TxPage> {
    const res = await request.get<{ success: boolean; data: TxPage }>(
      `/student/points/transactions?type=${encodeURIComponent(type)}&page=${page}`
    );
    return res.data;
  }

  async getRules(): Promise<PointsRule[]> {
    const res = await request.get<{ success: boolean; data: PointsRule[] }>('/student/points/rules');
    return res.data;
  }

  async submitAppeal(txId: string, reason: string): Promise<void> {
    await request.post(`/student/points/appeal/${txId}`, { reason });
  }
}

export const studentPointsService = new StudentPointsService();
