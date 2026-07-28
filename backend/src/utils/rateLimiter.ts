/**
 * 令牌桶算法实现
 * 用于 AI 请求限流
 */

export interface RateLimiterConfig {
  capacity: number; // 桶容量（最大令牌数）
  refillRate: number; // 令牌补充速率（每秒补充的令牌数）
  maxQueueSize?: number; // 最大队列长度
}

export interface QueuedRequest<T = unknown> {
  execute: () => Promise<T>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timestamp: number;
}

/**
 * 令牌桶限流器
 */
export class TokenBucketRateLimiter {
  private tokens: number; // 当前令牌数
  private capacity: number; // 桶容量
  private refillRate: number; // 补充速率
  private lastRefillTime: number; // 上次补充时间
  private queue: QueuedRequest[]; // 请求队列
  private maxQueueSize: number; // 最大队列长度
  private processing: boolean; // 是否正在处理队列

  constructor(config: RateLimiterConfig) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.maxQueueSize = config.maxQueueSize || 100;
    this.tokens = config.capacity; // 初始时桶是满的
    this.lastRefillTime = Date.now();
    this.queue = [];
    this.processing = false;
  }

  /**
   * 补充令牌
   */
  private refillTokens(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefillTime) / 1000; // 转换为秒
    const tokensToAdd = timePassed * this.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }

  /**
   * 尝试消费一个令牌
   * @returns 是否成功消费
   */
  private tryConsume(): boolean {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * 处理队列中的请求
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // 尝试消费令牌
      if (!this.tryConsume()) {
        // 没有令牌，等待一段时间后重试
        const waitTime = 1000 / this.refillRate; // 等待一个令牌补充的时间
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // 取出队列头部的请求
      const request = this.queue.shift();
      if (!request) {
        break;
      }

      // 执行请求
      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error: unknown) {
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.processing = false;
  }

  /**
   * 执行限流请求
   * @param fn 要执行的异步函数
   * @returns Promise
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 如果可以立即执行，直接执行
    if (this.tryConsume()) {
      return await fn();
    }

    // 否则加入队列
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('请求队列已满，请稍后重试');
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: fn,
        resolve: resolve as (value: unknown) => void,
        reject,
        timestamp: Date.now(),
      });

      // 触发队列处理
      this.processQueue();
    });
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    this.refillTokens();
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      queueLength: this.queue.length,
      maxQueueSize: this.maxQueueSize,
    };
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    const error = new Error('队列已被清空');
    this.queue.forEach(request => request.reject(error));
    this.queue = [];
  }
}

/**
 * 漏桶算法实现（备选方案）
 */
export class LeakyBucketRateLimiter {
  private queue: QueuedRequest[];
  private maxQueueSize: number;
  private leakRate: number; // 每秒处理的请求数
  private processing: boolean;
  private lastLeakTime: number;

  constructor(leakRate: number, maxQueueSize: number = 100) {
    this.leakRate = leakRate;
    this.maxQueueSize = maxQueueSize;
    this.queue = [];
    this.processing = false;
    this.lastLeakTime = Date.now();
  }

  /**
   * 处理队列（漏水）
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastLeak = (now - this.lastLeakTime) / 1000;
      const waitTime = 1 / this.leakRate;

      // 如果距离上次处理时间不足，等待
      if (timeSinceLastLeak < waitTime) {
        await new Promise(resolve => 
          setTimeout(resolve, (waitTime - timeSinceLastLeak) * 1000)
        );
      }

      // 取出队列头部的请求
      const request = this.queue.shift();
      if (!request) {
        break;
      }

      this.lastLeakTime = Date.now();

      // 执行请求
      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error: any) {
        request.reject(error);
      }
    }

    this.processing = false;
  }

  /**
   * 执行限流请求
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 检查队列是否已满
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('请求队列已满，请稍后重试');
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: fn,
        resolve: resolve as (value: unknown) => void,
        reject,
        timestamp: Date.now(),
      });

      // 触发队列处理
      this.processQueue();
    });
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      maxQueueSize: this.maxQueueSize,
      leakRate: this.leakRate,
    };
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    const error = new Error('队列已被清空');
    this.queue.forEach(request => request.reject(error));
    this.queue = [];
  }
}
