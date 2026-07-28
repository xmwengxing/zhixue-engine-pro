/**
 * 离线缓存管理器
 * 使用 IndexedDB 缓存离线操作，网络恢复后自动同步
 */

import type { SyncOperation } from './syncManager';

/**
 * IndexedDB 数据库名称
 */
const DB_NAME = 'intelligent-training-platform';

/**
 * IndexedDB 版本
 */
const DB_VERSION = 1;

/**
 * 对象存储名称
 */
const STORE_NAMES = {
  OPERATIONS: 'offline_operations', // 离线操作队列
  CACHE: 'resource_cache', // 资源缓存
};

/**
 * 缓存项接口
 */
export interface CacheItem<T = unknown> {
  key: string; // 缓存键
  data: T; // 缓存数据
  timestamp: number; // 缓存时间戳
  expiresAt?: number; // 过期时间戳
}

/**
 * 离线缓存管理器类
 */
export class OfflineCache {
  private db: IDBDatabase | null = null;
  private isOnline = navigator.onLine;
  private syncCallbacks: Array<() => void> = [];

  /**
   * 初始化离线缓存
   */
  public async init(): Promise<void> {
    try {
      this.db = await this.openDatabase();
      this.setupOnlineListener();
      console.log('离线缓存初始化成功');
    } catch (error) {
      console.error('离线缓存初始化失败:', error);
      throw error;
    }
  }

  /**
   * 打开 IndexedDB 数据库
   */
  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('无法打开 IndexedDB 数据库'));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建离线操作存储
        if (!db.objectStoreNames.contains(STORE_NAMES.OPERATIONS)) {
          const operationsStore = db.createObjectStore(STORE_NAMES.OPERATIONS, {
            keyPath: 'id',
          });
          operationsStore.createIndex('timestamp', 'timestamp', { unique: false });
          operationsStore.createIndex('status', 'status', { unique: false });
        }

        // 创建资源缓存存储
        if (!db.objectStoreNames.contains(STORE_NAMES.CACHE)) {
          const cacheStore = db.createObjectStore(STORE_NAMES.CACHE, {
            keyPath: 'key',
          });
          cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
          cacheStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
    });
  }

  /**
   * 设置在线状态监听器
   */
  private setupOnlineListener(): void {
    window.addEventListener('online', () => {
      console.log('网络已恢复，开始同步离线操作');
      this.isOnline = true;
      this.syncOfflineOperations();
    });

    window.addEventListener('offline', () => {
      console.log('网络已断开，启用离线模式');
      this.isOnline = false;
    });
  }

  /**
   * 保存离线操作
   * @param operation 同步操作
   */
  public async saveOperation(operation: SyncOperation): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.OPERATIONS], 'readwrite');
      const store = transaction.objectStore(STORE_NAMES.OPERATIONS);
      const request = store.put(operation);

      request.onsuccess = () => {
        console.log(`离线操作已保存: ${operation.id}`);
        resolve();
      };

      request.onerror = () => {
        reject(new Error('保存离线操作失败'));
      };
    });
  }

  /**
   * 获取所有离线操作
   */
  public async getOperations(): Promise<SyncOperation[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.OPERATIONS], 'readonly');
      const store = transaction.objectStore(STORE_NAMES.OPERATIONS);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error('获取离线操作失败'));
      };
    });
  }

  /**
   * 删除离线操作
   * @param operationId 操作 ID
   */
  public async deleteOperation(operationId: string): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.OPERATIONS], 'readwrite');
      const store = transaction.objectStore(STORE_NAMES.OPERATIONS);
      const request = store.delete(operationId);

      request.onsuccess = () => {
        console.log(`离线操作已删除: ${operationId}`);
        resolve();
      };

      request.onerror = () => {
        reject(new Error('删除离线操作失败'));
      };
    });
  }

  /**
   * 同步所有离线操作
   */
  private async syncOfflineOperations(): Promise<void> {
    try {
      const operations = await this.getOperations();

      if (operations.length === 0) {
        console.log('没有待同步的离线操作');
        return;
      }

      console.log(`开始同步 ${operations.length} 个离线操作`);

      // 按时间戳排序，确保操作顺序
      operations.sort((a, b) => a.timestamp - b.timestamp);

      // 执行同步回调
      for (const callback of this.syncCallbacks) {
        callback();
      }

      console.log('离线操作同步完成');
    } catch (error) {
      console.error('同步离线操作失败:', error);
    }
  }

  /**
   * 注册同步回调
   * @param callback 同步回调函数
   */
  public onSync(callback: () => void): void {
    this.syncCallbacks.push(callback);
  }

  /**
   * 缓存资源数据
   * @param key 缓存键
   * @param data 数据
   * @param ttl 过期时间（毫秒），可选
   */
  public async cacheResource<T>(key: string, data: T, ttl?: number): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const cacheItem: CacheItem<T> = {
      key,
      data,
      timestamp: Date.now(),
      expiresAt: ttl ? Date.now() + ttl : undefined,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.CACHE], 'readwrite');
      const store = transaction.objectStore(STORE_NAMES.CACHE);
      const request = store.put(cacheItem);

      request.onsuccess = () => {
        console.log(`资源已缓存: ${key}`);
        resolve();
      };

      request.onerror = () => {
        reject(new Error('缓存资源失败'));
      };
    });
  }

  /**
   * 获取缓存的资源
   * @param key 缓存键
   * @returns 缓存数据，如果不存在或已过期返回 null
   */
  public async getCachedResource<T>(key: string): Promise<T | null> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.CACHE], 'readonly');
      const store = transaction.objectStore(STORE_NAMES.CACHE);
      const request = store.get(key);

      request.onsuccess = () => {
        const cacheItem = request.result as CacheItem<T> | undefined;

        if (!cacheItem) {
          resolve(null);
          return;
        }

        // 检查是否过期
        if (cacheItem.expiresAt && Date.now() > cacheItem.expiresAt) {
          console.log(`缓存已过期: ${key}`);
          // 删除过期缓存
          this.deleteCachedResource(key);
          resolve(null);
          return;
        }

        console.log(`从缓存获取资源: ${key}`);
        resolve(cacheItem.data);
      };

      request.onerror = () => {
        reject(new Error('获取缓存资源失败'));
      };
    });
  }

  /**
   * 删除缓存的资源
   * @param key 缓存键
   */
  public async deleteCachedResource(key: string): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.CACHE], 'readwrite');
      const store = transaction.objectStore(STORE_NAMES.CACHE);
      const request = store.delete(key);

      request.onsuccess = () => {
        console.log(`缓存已删除: ${key}`);
        resolve();
      };

      request.onerror = () => {
        reject(new Error('删除缓存失败'));
      };
    });
  }

  /**
   * 清空所有缓存
   */
  public async clearCache(): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.CACHE], 'readwrite');
      const store = transaction.objectStore(STORE_NAMES.CACHE);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('所有缓存已清空');
        resolve();
      };

      request.onerror = () => {
        reject(new Error('清空缓存失败'));
      };
    });
  }

  /**
   * 清理过期缓存
   */
  public async cleanExpiredCache(): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAMES.CACHE], 'readwrite');
      const store = transaction.objectStore(STORE_NAMES.CACHE);
      const index = store.index('expiresAt');
      const now = Date.now();

      // 获取所有已过期的缓存
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;

        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          console.log('过期缓存清理完成');
          resolve();
        }
      };

      request.onerror = () => {
        reject(new Error('清理过期缓存失败'));
      };
    });
  }

  /**
   * 检查是否在线
   */
  public isNetworkOnline(): boolean {
    return this.isOnline;
  }

  /**
   * 关闭数据库
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('离线缓存数据库已关闭');
    }
  }
}

/**
 * 全局离线缓存实例
 */
export const offlineCache = new OfflineCache();

/**
 * 初始化离线缓存
 * 应在应用启动时调用
 */
export async function initOfflineCache(): Promise<void> {
  try {
    await offlineCache.init();
  } catch (error) {
    console.error('初始化离线缓存失败:', error);
  }
}
