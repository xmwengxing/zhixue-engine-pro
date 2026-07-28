// AI 生成进度 SSE 订阅服务
// 封装 EventSource 连接，监听 progress / done / error 事件。
// 注意：EventSource 不支持自定义请求头，令牌通过 ?token= 查询参数传递。

export interface SSEProgress {
  progress: number;
  state?: string;
  message?: string;
}

export interface SSEDoneExam {
  progress: number;
  result: unknown;
}

export interface SSEDoneReport {
  progress: number;
  reportId?: string;
}

export interface SSEHandlers {
  onProgress?: (data: SSEProgress) => void;
  onDone?: (data: unknown) => void;
  onError?: (message: string) => void;
}

function getToken(): string | null {
  return typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;
}

function buildUrl(path: string): string {
  const token = getToken();
  const sep = path.includes('?') ? '&' : '?';
  return token ? `${path}${sep}token=${encodeURIComponent(token)}` : path;
}

/**
 * 订阅综合考试题目生成进度
 * @returns 取消订阅函数
 */
export function subscribeExamProgress(
  jobId: string,
  handlers: SSEHandlers
): () => void {
  const es = new EventSource(buildUrl(`/api/student/ai/stream/exam/${jobId}`));

  es.addEventListener('progress', (e) => {
    try {
      handlers.onProgress?.(JSON.parse((e as MessageEvent).data));
    } catch {
      /* ignore malformed */
    }
  });

  es.addEventListener('done', (e) => {
    try {
      handlers.onDone?.(JSON.parse((e as MessageEvent).data));
    } catch {
      /* ignore */
    }
    es.close();
  });

  es.addEventListener('error', (e) => {
    const data = (e as MessageEvent).data;
    let message = '连接中断';
    try {
      message = JSON.parse(data).message || message;
    } catch {
      /* ignore */
    }
    handlers.onError?.(message);
    es.close();
  });

  return () => es.close();
}

/**
 * 订阅训练报告生成进度
 * @returns 取消订阅函数
 */
export function subscribeReportProgress(
  sessionId: string,
  handlers: SSEHandlers
): () => void {
  const es = new EventSource(buildUrl(`/api/student/ai/stream/report/${sessionId}`));

  es.addEventListener('progress', (e) => {
    try {
      handlers.onProgress?.(JSON.parse((e as MessageEvent).data));
    } catch {
      /* ignore malformed */
    }
  });

  es.addEventListener('done', (e) => {
    try {
      handlers.onDone?.(JSON.parse((e as MessageEvent).data));
    } catch {
      /* ignore */
    }
    es.close();
  });

  es.addEventListener('error', (e) => {
    const data = (e as MessageEvent).data;
    let message = '连接中断';
    try {
      message = JSON.parse(data).message || message;
    } catch {
      /* ignore */
    }
    handlers.onError?.(message);
    es.close();
  });

  return () => es.close();
}
