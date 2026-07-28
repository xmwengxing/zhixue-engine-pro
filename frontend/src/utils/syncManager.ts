/**
 * 状态同步管理器
 * 实现前后端状态同步、乐观更新和冲突解决
 */

import request from './request';
import { offlineCache } from './offlineCache';

/**
 * 同步操作类型
 */
export type SyncOperationType = 'create' | 'update' | 'delete';

/**
 * 同步操作接口
 */
export interface SyncOperation<T = unknown> {
  id: string; // 操作唯一标识
  type: SyncOperationType; // 操作类型
  resource: string; // 资源类型（如 'task', 'wish', 'profile'）
  resourceId?: string; // 资源 ID
  data: T; // 操作数据
  timestamp: number; // 操作时间戳
  status: 'pending' | 'syncing' | 'synced' | 'failed'; // 同步状态
  retryCount: number; // 重试次数
  error?: string; // 错误信息
}

/**
 * 乐观更新回调接口
 */
export interface OptimisticUpdateCallbacks<T = unknown> {
  onOptimisticUpdate: (data: T) => void; // 乐观更新回调
  onSyncSuccess: (data: T) => void; // 同步成功回调
  onSyncFailure: (error: Error, rollbackData: T) => void; // 同步失败回调（需要回滚）
}

/**
 * 同步配置
 */
interface SyncConfig {
  maxRetries: number; // 最大重试次数
  retryDelay: number; // 重试延迟（毫秒）
  syncInterval: number; // 同步检查间隔（毫秒）
}

/**
 * 默认同步配置
 */
const DEFAULT_CONFIG: SyncConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  syncInterval: 5000,
};

/**
 * 状态同步管理器类
 */
class SyncManager {
  private operations: Map<string, SyncOperation> = new Map();
  private config: SyncConfig = DEFAULT_CONFIG;
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;

  /**
   * 初始化同步管理器
   */
  constructor(config?: Partial<SyncConfig>) {
    if (config) {
      this.config = { ...DEFAULT_CONFIG, ...config };
    }
    this.startSyncTimer();
    this.setupOfflineSync();
  }

  /**
   * 设置离线同步
   */
  private setupOfflineSync() {
    // 注册网络恢复时的同步回调
    offlineCache.onSync(async () => {
      console.log('网络恢复，开始同步离线操作');
      await this.syncOfflineOperations();
    });

    // 应用启动时同步离线操作
    this.syncOfflineOperations();
  }

  /**
   * 同步离线操作
   */
  private async syncOfflineOperations() {
    try {
      const operations = await offlineCache.getOperations();

      if (operations.length === 0) {
        return;
      }

      console.log(`发现 ${operations.length} 个离线操作，开始同步`);

      // 按时间戳排序
      operations.sort((a, b) => a.timestamp - b.timestamp);

      for (const operation of operations) {
        try {
          // 添加到同步队列
          this.operations.set(operation.id, operation);

          // 尝试同步
          await this.syncOperation(operation);

          // 同步成功，从离线缓存中删除
          await offlineCache.deleteOperation(operation.id);
          this.operations.delete(operation.id);

          console.log(`离线操作 ${operation.id} 同步成功`);
        } catch (error) {
          console.error(`离线操作 ${operation.id} 同步失败:`, error);

          // 如果超过最大重试次数，从离线缓存中删除
          if (operation.retryCount >= this.config.maxRetries) {
            await offlineCache.deleteOperation(operation.id);
            this.operations.delete(operation.id);
          }
        }
      }

      console.log('离线操作同步完成');
    } catch (error) {
      console.error('同步离线操作失败:', error);
    }
  }

  /**
   * 启动同步定时器
   */
  private startSyncTimer() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      this.syncPendingOperations();
    }, this.config.syncInterval);
  }

  /**
   * 停止同步定时器
   */
  public stopSyncTimer() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * 执行乐观更新操作
   * @param operation 同步操作
   * @param callbacks 回调函数
   */
  public async optimisticUpdate<T>(
    operation: Omit<SyncOperation<T>, 'id' | 'timestamp' | 'status' | 'retryCount'>,
    callbacks: OptimisticUpdateCallbacks<T>
  ): Promise<void> {
    // 生成操作 ID
    const operationId = this.generateOperationId();

    // 创建完整的同步操作
    const syncOperation: SyncOperation<T> = {
      ...operation,
      id: operationId,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
    };

    // 保存操作到队列
    this.operations.set(operationId, syncOperation);

    // 立即执行乐观更新
    callbacks.onOptimisticUpdate(operation.data);

    // 检查网络状态
    if (!offlineCache.isNetworkOnline()) {
      console.log('离线模式，操作已保存到离线缓存');
      // 保存到离线缓存
      await offlineCache.saveOperation(syncOperation);
      return;
    }

    // 尝试同步到后端
    try {
      const result = await this.syncOperation(syncOperation);
      
      // 同步成功
      syncOperation.status = 'synced';
      this.operations.delete(operationId);
      callbacks.onSyncSuccess(result);
    } catch (error) {
      // 同步失败，保存到离线缓存
      syncOperation.status = 'failed';
      syncOperation.error = error instanceof Error ? error.message : '同步失败';
      
      console.error(`操作 ${operationId} 同步失败:`, error);
      
      // 保存到离线缓存以便后续重试
      await offlineCache.saveOperation(syncOperation);
      
      // 如果超过最大重试次数，执行回滚
      if (syncOperation.retryCount >= this.config.maxRetries) {
        this.operations.delete(operationId);
        callbacks.onSyncFailure(
          error instanceof Error ? error : new Error('同步失败'),
          operation.data
        );
      }
    }
  }

  /**
   * 同步单个操作到后端
   * @param operation 同步操作
   * @returns 后端返回的数据
   */
  private async syncOperation<T>(operation: SyncOperation<T>): Promise<T> {
    operation.status = 'syncing';
    operation.retryCount++;

    // 根据操作类型构建请求
    const endpoint = this.buildEndpoint(operation);
    const method = this.getHttpMethod(operation.type);

    try {
      let response: any;
      
      // 根据HTTP方法调用对应的request方法
      switch (method.toLowerCase()) {
        case 'get':
          response = await request.get(endpoint);
          break;
        case 'post':
          response = await request.post(endpoint, operation.data);
          break;
        case 'put':
          response = await request.put(endpoint, operation.data);
          break;
        case 'delete':
          response = await request.delete(endpoint);
          break;
        default:
          throw new Error(`不支持的HTTP方法: ${method}`);
      }

      return response as T;
    } catch (error) {
      // 如果未达到最大重试次数，延迟后重试
      if (operation.retryCount < this.config.maxRetries) {
        await this.delay(this.config.retryDelay * operation.retryCount);
        return this.syncOperation(operation);
      }

      throw error;
    }
  }

  /**
   * 同步所有待处理的操作
   */
  private async syncPendingOperations() {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;

    try {
      const pendingOps = Array.from(this.operations.values()).filter(
        (op) => op.status === 'pending' || op.status === 'failed'
      );

      for (const operation of pendingOps) {
        try {
          await this.syncOperation(operation);
          operation.status = 'synced';
          this.operations.delete(operation.id);
        } catch (error) {
          console.error(`操作 ${operation.id} 同步失败:`, error);
          
          // 如果超过最大重试次数，从队列中移除
          if (operation.retryCount >= this.config.maxRetries) {
            this.operations.delete(operation.id);
          }
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 构建 API 端点
   * @param operation 同步操作
   * @returns API 端点路径
   */
  private buildEndpoint(operation: SyncOperation): string {
    const { resource, resourceId, type } = operation;

    switch (type) {
      case 'create':
        return `/${resource}`;
      case 'update':
        return `/${resource}/${resourceId}`;
      case 'delete':
        return `/${resource}/${resourceId}`;
      default:
        throw new Error(`未知的操作类型: ${type}`);
    }
  }

  /**
   * 获取 HTTP 方法
   * @param type 操作类型
   * @returns HTTP 方法
   */
  private getHttpMethod(type: SyncOperationType): string {
    switch (type) {
      case 'create':
        return 'POST';
      case 'update':
        return 'PUT';
      case 'delete':
        return 'DELETE';
      default:
        throw new Error(`未知的操作类型: ${type}`);
    }
  }

  /**
   * 生成操作 ID
   * @returns 唯一操作 ID
   */
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 延迟函数
   * @param ms 延迟毫秒数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取待处理操作数量
   */
  public getPendingCount(): number {
    return Array.from(this.operations.values()).filter(
      (op) => op.status === 'pending' || op.status === 'failed'
    ).length;
  }

  /**
   * 清空所有操作
   */
  public clear() {
    this.operations.clear();
  }

  /**
   * 销毁同步管理器
   */
  public destroy() {
    this.stopSyncTimer();
    this.clear();
  }
}

/**
 * 全局同步管理器实例
 */
export const syncManager = new SyncManager();

/**
 * 状态验证工具
 * 用于验证前后端状态一致性
 */
export class StateValidator {
  /**
   * 验证资源状态
   * @param resource 资源类型
   * @param resourceId 资源 ID
   * @param localState 本地状态
   * @returns 是否一致
   */
  public static async validateState<T>(
    resource: string,
    resourceId: string,
    localState: T
  ): Promise<{ isValid: boolean; serverState?: T; diff?: Record<string, unknown> }> {
    try {
      // 从服务器获取最新状态
      const serverState = await request.get<T>(`/${resource}/${resourceId}`);

      // 比较本地状态和服务器状态
      const isValid = this.deepEqual(localState, serverState);

      if (!isValid) {
        const diff = this.getDifference(
          localState as Record<string, unknown>, 
          serverState as Record<string, unknown>
        );
        return { isValid: false, serverState, diff };
      }

      return { isValid: true, serverState };
    } catch (error) {
      console.error('状态验证失败:', error);
      throw error;
    }
  }

  /**
   * 深度比较两个对象
   * @param obj1 对象1
   * @param obj2 对象2
   * @returns 是否相等
   */
  private static deepEqual(obj1: unknown, obj2: unknown): boolean {
    if (obj1 === obj2) return true;

    if (
      typeof obj1 !== 'object' ||
      typeof obj2 !== 'object' ||
      obj1 === null ||
      obj2 === null
    ) {
      return false;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqual((obj1 as Record<string, unknown>)[key], (obj2 as Record<string, unknown>)[key])) return false;
    }

    return true;
  }

  /**
   * 获取两个对象的差异
   * @param obj1 对象1
   * @param obj2 对象2
   * @returns 差异对象
   */
  private static getDifference(obj1: Record<string, unknown>, obj2: Record<string, unknown>): Record<string, unknown> {
    const diff: Record<string, unknown> = {};

    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

    for (const key of allKeys) {
      if (!this.deepEqual(obj1[key], obj2[key])) {
        diff[key] = {
          local: obj1[key],
          server: obj2[key],
        };
      }
    }

    return diff;
  }
}
