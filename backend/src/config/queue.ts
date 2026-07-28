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
    });

    connection.on('error', (err) => {
      logger.error('BullMQ Redis 连接错误:', err);
    });
  }
  return connection;
}
