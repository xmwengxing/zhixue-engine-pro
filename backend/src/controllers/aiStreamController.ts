/**
 * AI 生成进度 SSE 控制器
 * ------------------------------------------------------------------
 * 提供两类流式端点：
 *  - streamExam：订阅综合考试出题任务（BullMQ job）的进度与结果；
 *  - streamReport：订阅训练报告生成进度（复用 reportStatusService）。
 * 客户端以 EventSource 连接，监听 progress / done / error 事件。
 */
import { Request, Response, NextFunction } from 'express';
import { getAIQueue } from '../queue/aiQueue';
import { reportStatusService, ReportStatus } from '../services/reportStatusService';
import { logger } from '../middlewares/logger';
import { verifyAccessToken } from '../utils/jwt';

const POLL_INTERVAL_MS = 1000;

/**
 * SSE 鉴权：EventSource 不支持自定义请求头，令牌通过 query 参数 ?token= 传递，
 * 兼容 Authorization 头（用于非浏览器或未来扩展）。校验失败向客户端发送 error 事件。
 */
function verifySSE(req: Request, res: Response): boolean {
  const token =
    (req.query.token as string | undefined) ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  if (!token) {
    sendEvent(res, 'error', { message: '未授权：缺少令牌' });
    res.end();
    return false;
  }
  try {
    verifyAccessToken(token);
    return true;
  } catch {
    sendEvent(res, 'error', { message: '未授权：令牌无效' });
    res.end();
    return false;
  }
}

function setupSSE(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * GET /api/student/ai/stream/exam/:jobId
 * 订阅综合考试题目生成的实时进度。
 */
export const streamExam = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const jobId = req.params.jobId as string;
  setupSSE(res);

  if (!verifySSE(req, res)) return;

  const queue = getAIQueue();
  if (!queue) {
    sendEvent(res, 'error', { message: '队列服务不可用，请稍后重试' });
    res.end();
    return;
  }

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    if (!res.writableEnded) res.end();
  };

  const timer = setInterval(async () => {
    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        sendEvent(res, 'error', { message: '任务不存在或已过期' });
        cleanup();
        return;
      }

      // BullMQ v5：progress / returnvalue / failedReason 为属性
      const jobAny = job as any;
      const state: string = await job.getState();
      const progress: number =
        typeof jobAny.progress === 'number' ? jobAny.progress : 0;

      if (state === 'completed') {
        sendEvent(res, 'done', {
          progress: 100,
          result: jobAny.returnvalue,
        });
        cleanup();
      } else if (state === 'failed') {
        sendEvent(res, 'error', {
          message: jobAny.failedReason || '考试题目生成失败',
        });
        cleanup();
      } else {
        sendEvent(res, 'progress', { progress, state });
      }
    } catch (error) {
      logger.error('SSE 读取考试任务状态失败:', error);
      sendEvent(res, 'error', { message: '读取任务状态失败' });
      cleanup();
    }
  }, POLL_INTERVAL_MS);

  req.on('close', cleanup);
};

/**
 * GET /api/student/ai/stream/report/:sessionId
 * 订阅训练报告生成进度（复用 reportStatusService）。
 */
export const streamReport = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const sessionId = req.params.sessionId as string;
  setupSSE(res);

  if (!verifySSE(req, res)) return;

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    if (!res.writableEnded) res.end();
  };

  const timer = setInterval(() => {
    try {
      const status = reportStatusService.getStatus(sessionId);

      if (!status) {
        // 状态尚未建立或已清理：视为仍在生成（客户端可稍后回退轮询 GET 状态）
        sendEvent(res, 'progress', { progress: 0, state: 'PENDING' });
        return;
      }

      if (status.status === ReportStatus.COMPLETED) {
        sendEvent(res, 'done', {
          progress: 100,
          reportId: status.reportId,
        });
        cleanup();
      } else if (status.status === ReportStatus.FAILED) {
        sendEvent(res, 'error', { message: status.error || '报告生成失败' });
        cleanup();
      } else {
        sendEvent(res, 'progress', {
          progress: status.progress,
          state: status.status,
          message: status.message,
        });
      }
    } catch (error) {
      logger.error('SSE 读取报告状态失败:', error);
      sendEvent(res, 'error', { message: '读取报告状态失败' });
      cleanup();
    }
  }, POLL_INTERVAL_MS);

  req.on('close', cleanup);
};

export const aiStreamController = {
  streamExam,
  streamReport,
};
