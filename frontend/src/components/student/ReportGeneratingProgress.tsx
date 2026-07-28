// 报告生成进度提示组件
import React, { useEffect, useState } from 'react';
import { subscribeReportProgress, type SSEDoneReport } from '../../services/aiStreamService';
import { getTrainingReport } from '../../services/studentTrainingService';

interface ReportStatus {
  sessionId: string;
  status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  progress: number;
  message: string;
  reportId?: string;
  error?: string;
}

interface ReportGeneratingProgressProps {
  sessionId: string;
  // 报告生成完成后回调，参数为 Markdown 格式的报告内容
  onComplete?: (report: string) => void;
  onError?: (error: string) => void;
}

/**
 * 报告生成进度提示组件
 * 通过 SSE 订阅报告生成进度（替代原有的 2 秒轮询，更实时、更省资源）。
 * 挂载时同时调用 getTrainingReport 触发异步生成（FINAL_EXAM 完成路径不会自动生成报告）。
 */
const ReportGeneratingProgress: React.FC<ReportGeneratingProgressProps> = ({
  sessionId,
  onComplete,
  onError,
}) => {
  const [status, setStatus] = useState<ReportStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 拉取报告内容（已生成时直接回调，否则返回 generating 触发后端异步生成）
    const fetchReportContent = async (): Promise<string | null> => {
      try {
        const resp = await getTrainingReport(sessionId);
        if (resp.status === 'completed' && typeof resp.content === 'string') {
          return resp.content;
        }
      } catch {
        /* ignore */
      }
      return null;
    };

    // 先尝试直接获取（处理报告已生成或同步降级场景）
    fetchReportContent().then((content) => {
      if (cancelled) return;
      if (content) {
        setStatus({
          sessionId,
          status: 'COMPLETED',
          progress: 100,
          message: '',
        });
        onComplete?.(content);
      }
    });

    // 通过 SSE 订阅报告生成进度（无论是否已触发，都保证能收到 done 事件）
    const unsubscribe = subscribeReportProgress(sessionId, {
      onProgress: (data) => {
        setStatus({
          sessionId,
          status: (data.state as ReportStatus['status']) || 'GENERATING',
          progress: data.progress || 0,
          message: data.message || '',
          reportId: (data as { reportId?: string }).reportId,
        });
      },
      onDone: async (data) => {
        const d = data as SSEDoneReport;
        // 生成完成，拉取报告内容并回调
        const content = await fetchReportContent();
        if (cancelled) return;
        setStatus({
          sessionId,
          status: 'COMPLETED',
          progress: 100,
          message: '',
          reportId: d.reportId,
        });
        if (content) {
          onComplete?.(content);
        } else if (onError) {
          onError('报告内容获取失败');
        }
      },
      onError: (message) => {
        if (cancelled) return;
        setStatus({
          sessionId,
          status: 'FAILED',
          progress: 0,
          message,
          error: message,
        });
        if (onError) onError(message);
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId, onComplete, onError]);

  if (!status) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-lg shadow-md p-8">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-gray-600">正在准备生成报告...</p>
      </div>
    );
  }

  if (status.status === 'FAILED') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-lg shadow-md p-8">
        <div className="text-red-500 text-6xl mb-4">✕</div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">报告生成失败</h3>
        <p className="text-gray-600 mb-4">{status.error || '未知错误'}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          重新加载
        </button>
      </div>
    );
  }

  // PENDING / GENERATING 状态
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-lg shadow-md p-8">
      {/* AI 图标动画 */}
      <div className="relative mb-8">
        <div className="animate-pulse">
          <svg
            className="w-24 h-24 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
        <div className="absolute inset-0 animate-ping opacity-20">
          <svg
            className="w-24 h-24 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="10" strokeWidth={2} />
          </svg>
        </div>
      </div>

      {/* 标题 */}
      <h3 className="text-2xl font-semibold text-gray-800 mb-2">AI 正在生成报告</h3>
      <p className="text-gray-600 mb-6">{status.message}</p>

      {/* 进度条 */}
      <div className="w-full max-w-md mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>生成进度</span>
          <span>{status.progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-blue-500 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${status.progress}%` }}
          >
            <div className="h-full w-full bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-shimmer"></div>
          </div>
        </div>
      </div>

      {/* 提示文本 */}
      <p className="text-sm text-gray-500 text-center max-w-md">
        AI 正在分析您的答题数据，生成个性化学习报告。这可能需要几秒钟时间，请耐心等待...
      </p>
    </div>
  );
};

export default ReportGeneratingProgress;
