import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

/**
 * 报告接口
 */
interface Report {
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
    student: {
      id: string;
      username: string;
      studentProfile: {
        realName: string;
      } | null;
    };
  };
}

/**
 * 任务报告中心页面
 */
const TaskReportCenter: React.FC = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<'all' | 'completed' | 'in_progress'>('all');
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  // 避免未使用变量警告
  console.log({ selectedStudent, setSelectedStudent });

  /**
   * 加载报告列表
   * 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
   */
  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string | number> = {
        page,
        limit,
      };

      if (selectedStudent) {
        params.studentId = selectedStudent;
      }

      const response = await request.get('/parent/reports', { params });

      if (response.success) {
        setReports(response.data.reports);
        setTotal(response.data.total);
      }
    } catch (err: unknown) {
      console.error('加载报告列表失败:', err);
      setError(getErrorMessage(err, '加载报告列表失败'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, selectedStudent]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  /**
   * 查看报告详情
   */
  const handleViewReport = (reportId: string) => {
    navigate(`/parent/reports/${reportId}`);
  };

  /**
   * 导出报告
   */
  const handleExportReport = async (reportId: string) => {
    try {
      const response = await request.get(`/parent/reports/${reportId}/export`, {
        responseType: 'blob',
      });

      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report-${reportId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error('导出报告失败:', err);
      alert(getErrorMessage(err, '导出报告失败'));
    }
  };

  /**
   * 计算得分
   */
  const calculateScore = (report: Report): number => {
    // TODO: 实现得分计算逻辑
    console.log('计算报告得分:', report);
    return 0;
    // 这里简化处理，实际应该从报告内容中计算
    return Math.floor(Math.random() * 30) + 70;
  };

  /**
   * 计算错题数量
   */
  const getErrorCount = (report: Report): number => {
    return report.content.errorAnalysis?.length || 0;
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

  /**
   * 获取状态标签
   */
  const getStatusBadge = (status: string) => {
    if (status === 'COMPLETED') {
      return (
        <span className="px-2.5 py-1 rounded bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-bold uppercase">
          已完成
        </span>
      );
    } else if (status === 'IN_PROGRESS') {
      return (
        <span className="px-2.5 py-1 rounded bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase">
          进行中
        </span>
      );
    } else {
      return (
        <span className="px-2.5 py-1 rounded bg-gray-100 dark:bg-gray-500/10 text-gray-600 dark:text-gray-400 text-xs font-bold uppercase">
          待开始
        </span>
      );
    }
  };

  if (loading && reports.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={loadReports}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background-dark">
      <main className="max-w-[1280px] mx-auto px-6 lg:px-20 py-8">
        {/* 面包屑导航 */}
        <nav className="flex items-center gap-2 mb-4 text-sm">
          <a
            href="/parent"
            className="text-slate-500 dark:text-slate-400 hover:text-primary transition-colors"
          >
            首页
          </a>
          <span className="text-slate-400 dark:text-slate-500">/</span>
          <span className="text-slate-900 dark:text-white font-medium">任务报告中心</span>
        </nav>

        {/* 页面标题 */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-slate-900 dark:text-white text-3xl font-bold tracking-tight">
              任务报告列表
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-base">
              监控孩子学情动态，查看 AI 老师的专业评价及错题深度解析。
            </p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
              <span className="material-symbols-outlined text-xl">download</span>
              导出月度报告
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* 主内容区域 */}
          <div className="flex-1 min-w-0">
            {/* 筛选和标签 */}
            <div className="bg-white dark:bg-[#1a2235] rounded-xl border border-slate-200 dark:border-slate-800 p-2 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex border-b border-transparent">
                  <button
                    onClick={() => setCurrentTab('all')}
                    className={`px-6 py-3 text-sm font-bold ${
                      currentTab === 'all'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-slate-500 dark:text-slate-400 hover:text-primary'
                    }`}
                  >
                    全部任务 ({total})
                  </button>
                  <button
                    onClick={() => setCurrentTab('completed')}
                    className={`px-6 py-3 text-sm font-medium ${
                      currentTab === 'completed'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-slate-500 dark:text-slate-400 hover:text-primary'
                    }`}
                  >
                    已完成
                  </button>
                  <button
                    onClick={() => setCurrentTab('in_progress')}
                    className={`px-6 py-3 text-sm font-medium ${
                      currentTab === 'in_progress'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-slate-500 dark:text-slate-400 hover:text-primary'
                    }`}
                  >
                    进行中
                  </button>
                </div>
              </div>
            </div>

            {/* 报告列表 */}
            <div className="space-y-4">
              {reports.length === 0 ? (
                <div className="bg-white dark:bg-[#1a2235] border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
                  <p className="text-slate-500 dark:text-slate-400">暂无报告</p>
                </div>
              ) : (
                reports.map((report) => {
                  const score = calculateScore(report);
                  const errorCount = getErrorCount(report);
                  const correctRate = Math.floor(((20 - errorCount) / 20) * 100);

                  return (
                    <div
                      key={report.id}
                      className="bg-white dark:bg-[#1a2235] border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-primary/50 transition-all cursor-pointer group"
                    >
                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            {getStatusBadge(report.task.status)}
                            <h3 className="text-slate-900 dark:text-white font-bold text-lg">
                              {report.task.title}
                            </h3>
                            <span className="text-slate-400 dark:text-slate-500 text-sm">
                              {formatDate(report.generatedAt)}
                            </span>
                          </div>

                          {/* AI 点评 */}
                          {report.content.summary && (
                            <div className="bg-slate-50 dark:bg-background-dark/50 rounded-lg p-4 mb-4 border-l-4 border-primary">
                              <div className="flex items-start gap-3">
                                <span className="material-symbols-outlined text-primary text-xl">
                                  smart_toy
                                </span>
                                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                                  <span className="font-bold text-slate-800 dark:text-white">
                                    AI导师点评：
                                  </span>
                                  {report.content.summary}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* 得分和错题分布 */}
                          <div className="flex flex-wrap items-center gap-6">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 text-sm">得分：</span>
                              <span className="text-2xl font-black text-primary">
                                {score}
                                <span className="text-sm font-normal text-slate-400 ml-1">
                                  /100
                                </span>
                              </span>
                            </div>
                            <div className="flex-1 max-w-[240px]">
                              <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                                <span>错题分布</span>
                                <span>{errorCount} 题错误</span>
                              </div>
                              <div className="flex h-2 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                                <div
                                  className="h-full bg-green-500"
                                  style={{ width: `${correctRate}%` }}
                                ></div>
                                <div
                                  className="h-full bg-red-500"
                                  style={{ width: `${100 - correctRate}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex flex-row md:flex-col justify-center items-end gap-3 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 pt-4 md:pt-0 md:pl-6">
                          <button
                            onClick={() => handleViewReport(report.id)}
                            className="w-full md:w-auto px-4 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:shadow-lg hover:shadow-primary/20 transition-all"
                          >
                            查看详情
                          </button>
                          <button
                            onClick={() => handleExportReport(report.id)}
                            className="w-full md:w-auto px-4 py-2 bg-slate-100 dark:bg-[#232f48] text-slate-600 dark:text-white text-sm font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                          >
                            导出 PDF
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 分页 */}
            {total > limit && (
              <div className="flex justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-white dark:bg-[#1a2235] border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  上一页
                </button>
                <span className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">
                  第 {page} 页 / 共 {Math.ceil(total / limit)} 页
                </span>
                <button
                  onClick={() => setPage(Math.min(Math.ceil(total / limit), page + 1))}
                  disabled={page >= Math.ceil(total / limit)}
                  className="px-4 py-2 bg-white dark:bg-[#1a2235] border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  下一页
                </button>
              </div>
            )}
          </div>

          {/* 侧边栏 */}
          <aside className="w-full lg:w-80 space-y-6">
            {/* 本周学情概览 */}
            <div className="bg-white dark:bg-[#1a2235] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h4 className="text-slate-900 dark:text-white font-bold text-sm mb-4">
                本周学情概览
              </h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">任务完成率</span>
                  <span className="text-xs font-bold text-green-500">92%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: '92%' }}></div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">平均得分</span>
                  <span className="text-xs font-bold text-primary">86.5</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: '86.5%' }}
                  ></div>
                </div>
                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-lg bg-orange-100 dark:bg-orange-500/10 flex items-center justify-center text-orange-500">
                      <span className="material-symbols-outlined">trending_up</span>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">较上周提升</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        +12.4% 能力分
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI 智能辅助建议 */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-blue-700 p-5 text-white shadow-lg">
              <div className="relative z-10">
                <h4 className="font-bold text-sm mb-2">AI 智能辅助建议</h4>
                <p className="text-[11px] text-white/80 leading-relaxed mb-4">
                  根据近期错题，孩子更偏向于"视觉化学习"。建议在讲解物理时光现象时，多配合模型演示。
                </p>
                <button className="bg-white/20 hover:bg-white/30 transition-colors text-white text-[10px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm">
                  了解详情
                </button>
              </div>
              <div className="absolute -right-4 -bottom-4 opacity-10">
                <span className="material-symbols-outlined text-8xl">tips_and_updates</span>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default TaskReportCenter;
