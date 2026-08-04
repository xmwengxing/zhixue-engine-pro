/**
 * BullMQ 队列专用 Redis 连接
 * ------------------------------------------------------------------
 * BullMQ 依赖 ioredis，与 CacheManager 使用的 node-redis 客户端相互独立。
 * BullMQ 要求连接设置：maxRetriesPerRequest=null 且 enableReadyCheck=false。
 */
import IORedis from 'ioredis';
import { logger } from '../middlewares/logger';

let connection: IORedis | null = null;

export function getQueueConnection(): IORedis {
  if (!connection) {
    connection = new IORedis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      // 有限重连：最多 10 次后停止（返回 null），避免 Redis 未启动时 ioredis
      // 默认「无限重试」持续刷屏；上层（幂等中间件/AI 队列）已有降级放行。
      retryStrategy: (times: number) => {
        if (times > 10) {
          logger.warn('BullMQ Redis 重连次数超限，停止重试（降级为无 Redis 运行）');
          return null;
        }
        return Math.min(times * 1000, 10000);
      },
    });

    connection.on('error', (err) => {
      logger.error('BullMQ Redis 连接错误:', err);
    });
  }
  return connection;
}
