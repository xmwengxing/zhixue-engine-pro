/**
 * 幂等性中间件（Idempotency Key）
 * ------------------------------------------------------------------
 * 防止离线恢复 / 网络重试导致的重复写入（如重复提交答题、重复创建任务）。
 *
 * 机制：
 *  - 客户端在请求头携带 `Idempotency-Key: <唯一键>`；
 *  - 首次请求：处理业务，并在响应返回前将 `{ status, body }` 写入 Redis
 *    （键 `idem:<key>`，带 TTL）；
 *  - 同一键的重复请求：直接返回首次缓存的响应，不再执行业务逻辑。
 *
 * Redis 不可用时中间件安全放行（降级为无幂等保护），不影响主流程。
 */
import { Request, Response, NextFunction } from 'express';
import { getQueueConnection } from '../config/queue';
import { logger } from './logger';

const IDEMPOTENCY_TTL = 60 * 60 * 24; // 24 小时

interface IdempotencyOptions {
  ttl?: number;
}

export function idempotencyMiddleware(opts?: IdempotencyOptions) {
  const ttl = opts?.ttl ?? IDEMPOTENCY_TTL;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header('Idempotency-Key');

    // 无幂等键：放行（非关键路径不强制）
    if (!key) {
      next();
      return;
    }

    const redis = getQueueConnection();
    if (!redis) {
      // Redis 不可用：降级放行
      next();
      return;
    }

    const redisKey = `idem:${key}`;

    try {
      const cached = await redis.get(redisKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { status: number; body: unknown };
          logger.debug(`幂等命中，直接返回缓存响应 key=${key}`);
          res.status(parsed.status).json(parsed.body);
          return;
        } catch {
          // 缓存损坏：忽略，继续正常处理
        }
      }

      // 捕获状态码与响应体，在 res.json 时缓存
      let capturedStatus = res.statusCode || 200;
      const originalStatus = res.status.bind(res);
      const originalJson = res.json.bind(res);

      (res as unknown as { status: typeof res.status }).status = (code: number) => {
        capturedStatus = code;
        return originalStatus(code);
      };

      (res as unknown as { json: typeof res.json }).json = (body: unknown) => {
        // 仅缓存成功响应（2xx），错误响应不缓存，允许用户重试
        if (capturedStatus >= 200 && capturedStatus < 300) {
          try {
            redis.set(redisKey, JSON.stringify({ status: capturedStatus, body }), 'EX', ttl);
          } catch (err) {
            logger.warn('幂等键写入失败（不影响主流程）:', err);
          }
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      logger.warn('幂等中间件异常，安全放行:', err);
      next();
    }
  };
}
