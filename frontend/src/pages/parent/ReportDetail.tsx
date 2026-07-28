import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

/**
 * 报告详情接口
 */
interface ReportDetail {
  id: string;
  sessionId: string;
  studentId: string;
  taskId: string;
  content: {
    summary: string;
    abilityAnalysis: Record<string, number>;
    errorAnalysis: Array<{
      questionId: string;
      reason: string;
      suggestion: string;
    }>;
    learningAdvice: string;
  };
  generatedAt: string;
  task: {
    id: string;
    title: string;
    mode: string;
    config: {
      materialNodeIds?: string[];
      questionCount?: number;
      difficulty?: number;
      [key: string]: unknown;
    };
    status: string;
    createdAt: string;
    completedAt: string | null;
  };
  session: {
    id: string;
    phase: string;
    progress: number;
    status: string;
    startedAt: string;
    completedAt: string | null;
    currentStep: number;
    totalSteps: number;
    student: {
      id: string;
      username: string;
      studentProfile: {
        realName: string;
        grade: string;
        materialVersion: string;
      } | null;
    };
    answers: Array<{
      id: string;
      questionId: string;
      studentAnswer: string;
      isCorrect: boolean;
      timeSpent: number;
      attemptCount: number;
      answeredAt: string;
      question: {
        id: string;
        type: string;
        content: {
          text: string;
          options?: Array<{ key: string; text: string } | string>;
          [key: string]: unknown;
        };
        answer: string;
        difficulty: number;
        knowledgePoints: string[];
      };
    }>;
  };
}

/**
 * 报告详情页面
 */
const ReportDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 加载报告详情
   * 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
   */
  const loadReport = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);

      const response = await request.get(`/parent/reports/${id}`);

      if (response.success) {
        setReport(response.data);
      }
    } catch (err: unknown) {
      console.error('加载报告详情失败:', err);
      setError(getErrorMessage(err, '加载报告详情失败'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  /**
   * 导出报告
   */
  const handleExportReport = async () => {
    if (!id) return;

    try {
      const response = await request.get(`/parent/reports/${id}/export`, {
        responseType: 'blob',
      });

      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error('导出报告失败:', err);
      alert('导出报告失败');
    }
  };

  /**
   * 计算总得分
   */
  const calculateScore = (): number => {
    if (!report) return 0;
    const correctAnswers = report.session.answers.filter((a) => a.isCorrect).length;
    const totalAnswers = report.session.answers.length;
    return totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;
  };

  /**
   * 计算学习时长
   */
  const calculateDuration = (): number => {
    if (!report || !report.session.startedAt || !report.session.completedAt) return 0;
    const start = new Date(report.session.startedAt).getTime();
    const end = new Date(report.session.completedAt).getTime();
    return Math.round((end - start) / 1000 / 60); // 分钟
  };

  /**
   * 格式化日期
   */
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-background-dark">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-background-dark">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error || '报告不存在'}</p>
          <button
            onClick={() => navigate('/parent/reports')}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            返回列表
          </button>
        </div>
      </div>
    );
  }

  const score = calculateScore();
  const duration = calculateDuration();
  const studentName = report.session.student.studentProfile?.realName || report.session.student.username;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background-dark">
      <main className="max-w-[1100px] mx-auto px-6 py-8">
        {/* 页面标题和操作按钮 */}
        <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-slate-900 dark:text-white text-4xl font-black leading-tight tracking-tight">
              AI 训练报告详情
            </h1>
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 bg-primary/20 text-primary text-xs font-bold rounded">
                {report.task.title}
              </span>
              <p className="text-slate-500 dark:text-slate-400 text-base">
                更新时间：{formatDate(report.generatedAt)}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <button
              onClick={handleExportReport}
              className="flex items-center gap-2 px-6 py-3 bg-slate-200 dark:bg-[#232f48] text-slate-900 dark:text-white rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-all"
            >
              <span className="material-symbols-outlined">download</span>
              <span>导出 PDF</span>
            </button>
            <button
              onClick={() => navigate('/parent/reports')}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-blue-600 transition-all shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              <span>返回列表</span>
            </button>
          </div>
        </div>

        {/* 总体得分卡片 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* 得分 */}
          <div className="lg:col-span-1 rounded-2xl p-8 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-[#1e293b] dark:to-[#232f48] flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl"></div>
            <p className="text-slate-600 dark:text-slate-400 text-lg font-medium mb-4">
              本次训练总体得分
            </p>
            <div className="relative w-40 h-40 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  fill="transparent"
                  r="70"
                  stroke="rgba(0,0,0,0.05)"
                  strokeWidth="12"
                  className="dark:stroke-white/5"
                ></circle>
                <circle
                  cx="80"
                  cy="80"
                  fill="transparent"
                  r="70"
                  stroke="#135bec"
                  strokeDasharray="440"
                  strokeDashoffset={440 - (440 * score) / 100}
                  strokeLinecap="round"
                  strokeWidth="12"
                ></circle>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-black text-slate-900 dark:text-white">{score}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400 mt-[-4px]">/ 100</span>
              </div>
            </div>
            <div className="mt-6 flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  学员: {studentName}
                </span>
              </div>
            </div>
          </div>

          {/* 学习统计 */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-[#232f48] rounded-2xl p-6 flex flex-col justify-between border border-slate-200 dark:border-white/5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                    学习总时长
                  </p>
                  <h3 className="text-slate-900 dark:text-white text-3xl font-bold mt-1">
                    {duration}{' '}
                    <span className="text-base font-normal opacity-70">分钟</span>
                  </h3>
                </div>
                <div className="p-3 bg-blue-500/10 rounded-xl">
                  <span className="material-symbols-outlined text-primary">schedule</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/5">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  完成度: {report.session.progress}%
                </p>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${report.session.progress}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#232f48] rounded-2xl p-6 flex flex-col justify-between border border-slate-200 dark:border-white/5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                    答题统计
                  </p>
                  <h3 className="text-slate-900 dark:text-white text-3xl font-bold mt-1">
                    {report.session.answers.filter((a) => a.isCorrect).length}
                    <span className="text-base font-normal opacity-70">
                      /{report.session.answers.length}
                    </span>
                  </h3>
                </div>
                <div className="p-3 bg-green-500/10 rounded-xl">
                  <span className="material-symbols-outlined text-green-500">check_circle</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/5">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  正确率: {score}%
                </p>
              </div>
            </div>

            {/* AI 专家点评 */}
            <div className="sm:col-span-2 bg-primary/10 border border-primary/20 rounded-2xl p-5 flex items-center gap-4">
              <div className="size-10 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary">auto_awesome</span>
              </div>
              <div>
                <p className="text-slate-900 dark:text-white font-bold text-sm">AI 专家点评</p>
                <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
                  {report.content.summary}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 能力分析 */}
        {report.content.abilityAnalysis && Object.keys(report.content.abilityAnalysis).length > 0 && (
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-6 border border-slate-200 dark:border-white/5 mb-8">
            <h2 className="text-slate-900 dark:text-white text-xl font-bold mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">radar</span>
              能力分析
            </h2>
            <div className="space-y-4">
              {Object.entries(report.content.abilityAnalysis).map(([knowledgePoint, score]) => (
                <div key={knowledgePoint}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {knowledgePoint}
                    </span>
                    <span className="text-sm font-bold text-primary">
                      {(score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${score * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 错题分析 */}
        {report.content.errorAnalysis && report.content.errorAnalysis.length > 0 && (
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-6 border border-slate-200 dark:border-white/5 mb-8">
            <h2 className="text-slate-900 dark:text-white text-xl font-bold mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500">error</span>
              错题分析
            </h2>
            <div className="space-y-4">
              {report.content.errorAnalysis.map((error, index) => (
                <div
                  key={error.questionId}
                  className="bg-slate-50 dark:bg-background-dark/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        <span className="font-bold">错误原因：</span>
                        {error.reason}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        <span className="font-bold">改进建议：</span>
                        {error.suggestion}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 学习建议 */}
        {report.content.learningAdvice && (
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-6 border border-slate-200 dark:border-white/5">
            <h2 className="text-slate-900 dark:text-white text-xl font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">lightbulb</span>
              学习建议
            </h2>
            <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
              {report.content.learningAdvice}
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default ReportDetail;
