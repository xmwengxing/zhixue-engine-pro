// 报告生成状态服务
import { logger } from '../middlewares/logger';

/**
 * 报告生成状态
 */
export enum ReportStatus {
  PENDING = 'PENDING', // 等待生成
  GENERATING = 'GENERATING', // 生成中
  COMPLETED = 'COMPLETED', // 已完成
  FAILED = 'FAILED', // 失败
}

/**
 * 报告状态信息
 */
interface ReportStatusInfo {
  sessionId: string;
  status: ReportStatus;
  progress: number; // 0-100
  message: string;
  reportId?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * 报告状态服务类
 * 使用内存存储报告生成状态（生产环境应使用 Redis）
 */
export class ReportStatusService {
  private statusMap: Map<string, ReportStatusInfo> = new Map();

  /**
   * 设置报告状态为等待生成
   */
  setPending(sessionId: string) {
    this.statusMap.set(sessionId, {
      sessionId,
      status: ReportStatus.PENDING,
      progress: 0,
      message: '报告生成任务已创建',
      startedAt: new Date(),
    });
    logger.info(`报告状态设置为等待: 会话 ${sessionId}`);
  }

  /**
   * 设置报告状态为生成中
   */
  setGenerating(sessionId: string, progress: number, message: string) {
    const existing = this.statusMap.get(sessionId);
    this.statusMap.set(sessionId, {
      sessionId,
      status: ReportStatus.GENERATING,
      progress: Math.min(100, Math.max(0, progress)),
      message,
      startedAt: existing?.startedAt || new Date(),
    });
    logger.info(`报告生成进度更新: 会话 ${sessionId}, 进度 ${progress}%`);
  }

  /**
   * 设置报告状态为已完成
   */
  setCompleted(sessionId: string, reportId: string) {
    const existing = this.statusMap.get(sessionId);
    this.statusMap.set(sessionId, {
      sessionId,
      status: ReportStatus.COMPLETED,
      progress: 100,
      message: '报告生成完成',
      reportId,
      startedAt: existing?.startedAt || new Date(),
      completedAt: new Date(),
    });
    logger.info(`报告生成完成: 会话 ${sessionId}, 报告 ID ${reportId}`);

    // 30 秒后清理状态
    setTimeout(() => {
      this.statusMap.delete(sessionId);
    }, 30000);
  }

  /**
   * 设置报告状态为失败
   */
  setFailed(sessionId: string, error: string) {
    const existing = this.statusMap.get(sessionId);
    this.statusMap.set(sessionId, {
      sessionId,
      status: ReportStatus.FAILED,
      progress: 0,
      message: '报告生成失败',
      error,
      startedAt: existing?.startedAt || new Date(),
      completedAt: new Date(),
    });
    logger.error(`报告生成失败: 会话 ${sessionId}, 错误: ${error}`);

    // 60 秒后清理状态
    setTimeout(() => {
      this.statusMap.delete(sessionId);
    }, 60000);
  }

  /**
   * 获取报告状态
   */
  getStatus(sessionId: string): ReportStatusInfo | null {
    return this.statusMap.get(sessionId) || null;
  }

  /**
   * 清理状态
   */
  clearStatus(sessionId: string) {
    this.statusMap.delete(sessionId);
  }
}

export const reportStatusService = new ReportStatusService();
