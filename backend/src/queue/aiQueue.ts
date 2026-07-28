/**
 * AI 生成任务队列（BullMQ）
 * ------------------------------------------------------------------
 * 承担长耗时的 AI 生成（当前为综合考试出题），避免 HTTP 请求同步阻塞。
 * 报告生成复用既有 generateReportAsync + reportStatusService，不在此重复处理，
 * 以免重复发放积分。
 *
 * 降级策略：若 Redis 不可用，getAIQueue()/enqueueAIJob() 返回 null，
 * 调用方退化为同步执行，保证系统上线零风险。
 */
import { Queue, Worker } from 'bullmq';
import { getQueueConnection } from '../config/queue';
import { logger } from '../middlewares/logger';
import { AIJobData } from '../types/aiJob';
import { studentTrainingService } from '../services/studentTrainingService';

export const AI_QUEUE_NAME = 'ai-generation';

let queue: Queue<AIJobData> | null = null;
let worker: Worker<AIJobData> | null = null;
let queueAvailable = true;

export function getAIQueue(): Queue<AIJobData> | null {
  if (!queueAvailable) {
    return null;
  }
  if (!queue) {
    try {
      queue = new Queue<AIJobData>(AI_QUEUE_NAME, {
        connection: getQueueConnection(),
      });
      logger.info('AI 生成队列已创建');
    } catch (err) {
      logger.error(
        '创建 AI 生成队列失败（Redis 可能不可用，将降级为同步执行）:',
        err
      );
      queue = null;
      queueAvailable = false;
    }
  }
  return queue;
}

/**
 * 入队一个 AI 生成任务。
 * @returns jobId；若队列不可用（Redis 离线）返回 null，调用方应降级为同步执行。
 */
export async function enqueueAIJob(data: AIJobData): Promise<string | null> {
  const q = getAIQueue();
  if (!q) {
    return null;
  }
  try {
    const job = await q.add('generate', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    });
    return job.id ? String(job.id) : null;
  } catch (err) {
    logger.error('入队 AI 任务失败，将降级为同步执行:', err);
    queueAvailable = false;
    return null;
  }
}

export function startAIWorker(concurrency = 4): void {
  if (worker) {
    return;
  }
  try {
    worker = new Worker<AIJobData>(
      AI_QUEUE_NAME,
      async (job) => {
        const { kind, sessionId, studentId } = job.data;

        if (kind === 'exam') {
          await job.updateProgress(10);
          const result = await studentTrainingService.startFinalExam(
            sessionId,
            studentId
          );
          await job.updateProgress(100);
          return result;
        }

        // 报告生成走既有异步路径，不应通过此处入队
        throw new Error(`不支持的任务类型: ${kind}`);
      },
      {
        connection: getQueueConnection(),
        concurrency,
      }
    );

    worker.on('completed', (job) => {
      logger.info(`AI 任务完成 jobId=${job.id}, kind=${job.data.kind}`);
    });

    worker.on('failed', (job, err) => {
      logger.error(
        `AI 任务失败 jobId=${job?.id}, kind=${job?.data.kind}:`,
        err
      );
    });

    logger.info('AI 生成队列 Worker 已启动');
  } catch (err) {
    logger.error('启动 AI Worker 失败（Redis 可能不可用）:', err);
    worker = null;
  }
}

export async function closeAIQueue(): Promise<void> {
  try {
    if (worker) {
      await worker.close();
    }
    if (queue) {
      await queue.close();
    }
  } catch (err) {
    logger.error('关闭 AI 队列失败:', err);
  }
}
