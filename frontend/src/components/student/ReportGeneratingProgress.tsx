// 报告生成进度提示组件
import React, { useEffect, useState } from 'react';
import request from '../../utils/request';

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
  onComplete?: (reportId: string) => void;
  onError?: (error: string) => void;
}

/**
 * 报告生成进度提示组件
 * 参照设计稿：训练舱-ai报告生成中
 */
const ReportGeneratingProgress: React.FC<ReportGeneratingProgressProps> = ({
  sessionId,
  onComplete,
  onError,
}) => {
  const [status, setStatus] = useState<ReportStatus | null>(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!polling) return;

    const pollStatus = async () => {
      try {
        const response = await request.get(`/api/student/report/status/${sessionId}`);
        const newStatus: ReportStatus = response;
        setStatus(newStatus);

        // 如果完成或失败，停止轮询
        if (newStatus.status === 'COMPLETED') {
          setPolling(false);
          if (onComplete && newStatus.reportId) {
            onComplete(newStatus.reportId);
          }
        } else if (newStatus.status === 'FAILED') {
          setPolling(false);
          if (onError && newStatus.error) {
            onError(newStatus.error);
          }
        }
      } catch (err: unknown) {
        console.error('获取报告状态失败:', err);
        // 如果状态不存在，可能报告已经生成完成很久了
        const apiError = err as { response?: { status?: number } };
        if (apiError.response?.status === 404) {
          setPolling(false);
        }
      }
    };

    // 立即执行一次
    pollStatus();

    // 每 2 秒轮询一次
    const interval = setInterval(pollStatus, 2000);

    return () => clearInterval(interval);
  }, [sessionId, polling, onComplete, onError]);

  if (!status) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-lg shadow-md p-8">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-gray-600">正在检查报告状态...</p>
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

  if (status.status === 'COMPLETED') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-lg shadow-md p-8">
        <div className="text-green-500 text-6xl mb-4">✓</div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">报告生成完成</h3>
        <p className="text-gray-600 mb-4">您的学习报告已经准备好了</p>
        {status.reportId && (
          <button
            onClick={() => onComplete && onComplete(status.reportId!)}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            查看报告
          </button>
        )}
      </div>
    );
  }

  // PENDING 或 GENERATING 状态
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
