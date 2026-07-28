/**
 * Redis 缓存管理器
 * 用于缓存热点数据，提升系统性能
 */

import { createClient, RedisClientType } from 'redis';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  defaultTTL?: number; // 默认过期时间（秒）
}

/**
 * Redis 缓存管理器
 */
export class CacheManager {
  private static instance: CacheManager;
  private client: RedisClientType | null = null;
  private defaultTTL: number;
  private isConnected: boolean = false;

  private constructor(config: CacheConfig) {
    this.defaultTTL = config.defaultTTL || 3600; // 默认 1 小时
    // 异步初始化客户端（不阻塞构造函数）
    this.initializeClient(config).catch((err) => {
      console.error('Redis 初始化失败:', err);
    });
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: CacheConfig): CacheManager {
    if (!CacheManager.instance) {
      if (!config) {
        throw new Error('首次调用必须提供配置');
      }
      CacheManager.instance = new CacheManager(config);
    }
    return CacheManager.instance;
  }

  /**
   * 初始化 Redis 客户端
   */
  private async initializeClient(config: CacheConfig) {
    try {
      this.client = createClient({
        socket: {
          host: config.host,
          port: config.port,
        },
        password: config.password,
        database: config.db || 0,
      });

      // 错误处理
      this.client.on('error', (err) => {
        console.error('Redis 客户端错误:', err);
        this.isConnected = false;
      });

      // 连接事件
      this.client.on('connect', () => {
        console.log('Redis 连接成功');
        this.isConnected = true;
      });

      // 断开连接事件
      this.client.on('disconnect', () => {
        console.log('Redis 连接断开');
        this.isConnected = false;
      });

      // 连接到 Redis
      await this.client.connect();
    } catch (error) {
      console.error('Redis 初始化失败:', error);
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * 检查是否已连接
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * 设置缓存
   * @param key 键
   * @param value 值（会被 JSON 序列化）
   * @param ttl 过期时间（秒），不传则使用默认值
   */
  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    if (!this.isReady()) {
      console.warn('Redis 未连接，跳过缓存设置');
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl || this.defaultTTL;

      if (this.client) {
        await this.client.setEx(key, expiry, serialized);
        return true;
      }
      return false;
      
      await this.client!.setEx(key, expiry, serialized);
      return true;
    } catch (error) {
      console.error('设置缓存失败:', error);
      return false;
    }
  }

  /**
   * 获取缓存
   * @param key 键
   * @returns 值（会被 JSON 反序列化），不存在返回 null
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.isReady()) {
      console.warn('Redis 未连接，跳过缓存获取');
      return null;
    }

    try {
      const value = await this.client!.get(key);
      
      if (value === null) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      console.error('获取缓存失败:', error);
      return null;
    }
  }

  /**
   * 删除缓存
   * @param key 键
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isReady()) {
      console.warn('Redis 未连接，跳过缓存删除');
      return false;
    }

    try {
      await this.client!.del(key);
      return true;
    } catch (error) {
      console.error('删除缓存失败:', error);
      return false;
    }
  }

  /**
   * 批量删除缓存（支持通配符）
   * @param pattern 键模式（如 "user:*"）
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.isReady()) {
      console.warn('Redis 未连接，跳过批量删除');
      return 0;
    }

    try {
      const keys = await this.client!.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      await this.client!.del(keys);
      return keys.length;
    } catch (error) {
      console.error('批量删除缓存失败:', error);
      return 0;
    }
  }

  /**
   * 检查键是否存在
   * @param key 键
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }

    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error) {
      console.error('检查键存在失败:', error);
      return false;
    }
  }

  /**
   * 设置键的过期时间
   * @param key 键
   * @param ttl 过期时间（秒）
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }

    try {
      await this.client!.expire(key, ttl);
      return true;
    } catch (error) {
      console.error('设置过期时间失败:', error);
      return false;
    }
  }

  /**
   * 获取键的剩余过期时间
   * @param key 键
   * @returns 剩余秒数，-1 表示永不过期，-2 表示键不存在
   */
  async ttl(key: string): Promise<number> {
    if (!this.isReady()) {
      return -2;
    }

    try {
      return await this.client!.ttl(key);
    } catch (error) {
      console.error('获取过期时间失败:', error);
      return -2;
    }
  }

  /**
   * 清空所有缓存
   */
  async flush(): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }

    try {
      await this.client!.flushDb();
      return true;
    } catch (error) {
      console.error('清空缓存失败:', error);
      return false;
    }
  }

  /**
   * 关闭连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<Record<string, unknown> | null> {
    if (!this.isReady()) {
      return null;
    }

    try {
      const info = await this.client!.info('stats');
      // info 是字符串，需要解析为对象
      const stats: Record<string, unknown> = {};
      const lines = info.split('\r\n');
      for (const line of lines) {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            stats[key] = value;
          }
        }
      }
      return stats;
    } catch (error) {
      console.error('获取缓存统计失败:', error);
      return null;
    }
  }
}

/**
 * 缓存装饰器
 * 用于自动缓存函数结果
 */
export function Cacheable(keyPrefix: string, ttl?: number) {
  return function (
    _target: object,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const cacheManager = CacheManager.getInstance();
      
      // 生成缓存键
      const cacheKey = `${keyPrefix}:${JSON.stringify(args)}`;

      // 尝试从缓存获取
      const cached = await cacheManager.get(cacheKey);
      if (cached !== null) {
        console.log(`缓存命中: ${cacheKey}`);
        return cached;
      }

      // 执行原方法
      const result = await originalMethod.apply(this, args);

      // 存入缓存
      await cacheManager.set(cacheKey, result, ttl);

      return result;
    };

    return descriptor;
  };
}

/**
 * 缓存失效装饰器
 * 用于在方法执行后自动清除相关缓存
 */
export function CacheEvict(pattern: string) {
  return function (
    _target: object,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      // 执行原方法
      const result = await originalMethod.apply(this, args);

      // 清除缓存
      const cacheManager = CacheManager.getInstance();
      await cacheManager.deletePattern(pattern);

      return result;
    };

    return descriptor;
  };
}

// 导出默认实例（需要先初始化）
let cacheManager: CacheManager | null = null;

export const initializeCache = (config: CacheConfig): CacheManager => {
  cacheManager = CacheManager.getInstance(config);
  return cacheManager;
};

export const getCache = (): CacheManager => {
  if (!cacheManager) {
    throw new Error('缓存管理器未初始化，请先调用 initializeCache');
  }
  return cacheManager;
};
