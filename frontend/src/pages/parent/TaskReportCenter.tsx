import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

/**
 * 报告统计（由 reportGenerationService 在生成报告时写入 content.statistics）
 */
interface ReportStatistics {
  totalQuestions: number;
  correctCount: number;
  /** 0 ~ 1 */
  correctRate: number;
  avgTimeSpent: number;
  avgDifficulty: number;
}

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
    statistics?: ReportStatistics;
  };
  generatedAt: string;
  subject?: string | null;
  category?: 'SUBJECT_MAIN' | 'SPECIAL' | string;
  specialType?: string | null;
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

interface ChildOption {
  id: string;
  name: string;
}

const SPECIAL_TYPE_LABELS: Record<string, string> = {
  UNIT: '单元专项',
  KNOWLEDGE_POINT: '知识点专项',
  ERROR_BOOK: '错题本专项',
};

/**
 * 从报告内容中提取真实统计（无 statistics 时按错题分析降级）
 */
const extractStats = (report: Report) => {
  const s = report.content?.statistics;
  const errorCount = report.content?.errorAnalysis?.length ?? 0;

  if (s && typeof s.totalQuestions === 'number' && s.totalQuestions > 0) {
    const rate = typeof s.correctRate === 'number' ? s.correctRate : s.correctCount / s.totalQuestions;
    return {
      hasData: true,
      totalQuestions: s.totalQuestions,
      correctCount: s.correctCount,
      wrongCount: Math.max(0, s.totalQuestions - s.correctCount),
      correctRate: Math.round(rate * 100),
      score: Math.round(rate * 100),
      avgTimeSpent: s.avgTimeSpent ?? 0,
      avgDifficulty: s.avgDifficulty ?? 0,
    };
  }

  return {
    hasData: false,
    totalQuestions: 0,
    correctCount: 0,
    wrongCount: errorCount,
    correctRate: 0,
    score: 0,
    avgTimeSpent: 0,
    avgDifficulty: 0,
  };
};

/**
 * 任务报告中心页面（学科总任务 / 专项攻克 双版块）
 */
const TaskReportCenter: React.FC = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [children, setChildren] = useState<ChildOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  // 双版块：学科总任务报告 / 专项攻克报告
  const [category, setCategory] = useState<'all' | 'SUBJECT_MAIN' | 'SPECIAL'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  /** 加载绑定学员（供学员筛选下拉使用） */
  useEffect(() => {
    request
      .get('/parent/children')
      .then((res: any) => {
        const raw: any[] = res?.data?.children ?? [];
        setChildren(
          raw.map((item: any) => {
            const stu = item.student ?? item;
            return {
              id: stu.id,
              name: stu.profile?.realName || stu.studentProfile?.realName || stu.username,
            };
          })
        );
      })
      .catch(() => setChildren([]));
  }, []);

  /**
   * 加载报告列表
   */
  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string | number> = { page, limit };
      if (selectedStudent) params.studentId = selectedStudent;
      if (category !== 'all') params.category = category;
      if (subjectFilter) params.subject = subjectFilter;

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
  }, [page, limit, selectedStudent, category, subjectFilter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // 学科下拉：优先取该学员已生成学情的学科；未选学员时用当前报告集合去重
  useEffect(() => {
    if (!selectedStudent) {
      setSubjects([]);
      setSubjectFilter('');
      return;
    }
    request
      .get(`/parent/children/${selectedStudent}/learning-state`)
      .then((res: any) => {
        const list: any[] = res?.data ?? [];
        setSubjects(list.map((s) => s.subject).filter(Boolean));
      })
      .catch(() => setSubjects([]));
  }, [selectedStudent]);

  const handleViewReport = (reportId: string) => {
    navigate(`/parent/reports/${reportId}`);
  };

  const handleExportReport = async (reportId: string) => {
    try {
      const response = await request.get(`/parent/reports/${reportId}/export`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response as any]));
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

  const formatDate = (dateString: string): string =>
    new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  /** 当前筛选结果的真实汇总（替代此前写死的 92% / 86.5 假数据） */
  const summary = useMemo(() => {
    const valid = reports.map(extractStats).filter((s) => s.hasData);
    if (valid.length === 0) {
      return { count: reports.length, avgScore: null as number | null, totalQuestions: 0, totalWrong: 0 };
    }
    const avgScore = valid.reduce((sum, s) => sum + s.score, 0) / valid.length;
    return {
      count: reports.length,
      avgScore: Math.round(avgScore * 10) / 10,
      totalQuestions: valid.reduce((sum, s) => sum + s.totalQuestions, 0),
      totalWrong: valid.reduce((sum, s) => sum + s.wrongCount, 0),
    };
  }, [reports]);

  const sectionTabs = [
    { key: 'all', label: '全部报告' },
    { key: 'SUBJECT_MAIN', label: '学科总任务' },
    { key: 'SPECIAL', label: '专项攻克' },
  ] as const;

  const selectClass =
    'px-3 py-2 rounded-lg border border-[#324467] bg-[#1a2332] text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/60';

  if (loading && reports.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#111722]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-[#92a4c9]">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111722]">
      <main className="max-w-[1280px] mx-auto px-6 lg:px-12 py-8">
        {/* 面包屑导航 */}
        <nav className="flex items-center gap-2 mb-4 text-sm">
          <Link to="/parent" className="text-[#92a4c9] hover:text-primary transition-colors">
            首页
          </Link>
          <span className="text-[#5b6b8c]">/</span>
          <span className="text-white font-medium">学习报告</span>
        </nav>

        {/* 页面标题 */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-white text-3xl font-bold tracking-tight">学习报告中心</h1>
            <p className="text-[#92a4c9] text-base">
              分「学科总任务」与「专项攻克」两个版块，查看 AI 老师的评价与错题解析。
            </p>
          </div>
        </div>

        {/* 版块切换 + 筛选 */}
        <div className="rounded-xl border border-[#324467] bg-[#232f48] p-4 mb-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {sectionTabs.map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  setCategory(opt.key);
                  setPage(1);
                }}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  category === opt.key
                    ? opt.key === 'SPECIAL'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-primary text-white border-primary'
                    : 'bg-[#1a2332] text-[#92a4c9] border-[#324467] hover:text-white hover:border-primary/60'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#324467]">
            <span className="text-sm text-[#92a4c9]">筛选</span>
            <select
              value={selectedStudent}
              onChange={(e) => {
                setSelectedStudent(e.target.value);
                setPage(1);
              }}
              className={selectClass}
            >
              <option value="">全部学员</option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={subjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value);
                setPage(1);
              }}
              disabled={subjects.length === 0}
              className={`${selectClass} disabled:opacity-40 disabled:cursor-not-allowed`}
              title={subjects.length === 0 ? '请先选择学员' : '按学科筛选'}
            >
              <option value="">全部学科</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <div className="flex-1" />
            <span className="text-sm text-[#5b6b8c]">共 {total} 份报告</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 flex items-center justify-between">
            <p className="text-red-300">{error}</p>
            <button
              onClick={loadReports}
              className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-blue-600"
            >
              重试
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          {/* 主内容区域 */}
          <div className="flex-1 min-w-0">
            <div className="space-y-4">
              {reports.length === 0 ? (
                <div className="rounded-xl border border-[#324467] bg-[#232f48] p-12 text-center">
                  <p className="text-[#92a4c9]">
                    {category === 'SPECIAL'
                      ? '暂无专项攻克报告'
                      : category === 'SUBJECT_MAIN'
                        ? '暂无学科总任务报告'
                        : '暂无报告'}
                  </p>
                  <p className="text-[#5b6b8c] text-sm mt-2">
                    报告在学员完成训练会话后自动生成。
                  </p>
                </div>
              ) : (
                reports.map((report) => {
                  const stats = extractStats(report);
                  const studentName =
                    report.session?.student?.studentProfile?.realName ||
                    report.session?.student?.username ||
                    '未知学员';

                  return (
                    <div
                      key={report.id}
                      className="rounded-xl border border-[#324467] bg-[#232f48] p-5 hover:border-primary/60 transition-all"
                    >
                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            {report.category === 'SPECIAL' ? (
                              <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 text-xs font-medium">
                                {SPECIAL_TYPE_LABELS[report.specialType || ''] || '专项报告'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-xs font-medium">
                                总任务报告
                              </span>
                            )}
                            {report.subject && (
                              <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 text-xs">
                                {report.subject}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded bg-[#1a2332] text-[#92a4c9] text-xs">
                              {studentName}
                            </span>
                            <span className="text-[#5b6b8c] text-xs">
                              {formatDate(report.generatedAt)}
                            </span>
                          </div>

                          <h3 className="text-white font-bold text-lg mb-3 break-words">
                            {report.task?.title || '训练报告'}
                          </h3>

                          {/* AI 点评 */}
                          {report.content?.summary && (
                            <div className="bg-[#1a2332] rounded-lg p-4 mb-4 border-l-4 border-primary">
                              <div className="flex items-start gap-3">
                                <span className="material-symbols-outlined text-primary text-xl">
                                  smart_toy
                                </span>
                                <p className="text-[#92a4c9] text-sm leading-relaxed">
                                  <span className="font-bold text-white">AI 导师点评：</span>
                                  {report.content.summary}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* 得分和答题分布（真实统计） */}
                          {stats.hasData ? (
                            <div className="flex flex-wrap items-center gap-6">
                              <div className="flex items-baseline gap-2">
                                <span className="text-[#92a4c9] text-sm">得分</span>
                                <span className="text-2xl font-black text-primary">
                                  {stats.score}
                                  <span className="text-sm font-normal text-[#5b6b8c] ml-1">/100</span>
                                </span>
                              </div>
                              <div className="flex-1 min-w-[200px] max-w-[280px]">
                                <div className="flex justify-between text-[11px] text-[#5b6b8c] mb-1">
                                  <span>
                                    答对 {stats.correctCount} / {stats.totalQuestions} 题
                                  </span>
                                  <span>{stats.wrongCount} 题错误</span>
                                </div>
                                <div className="flex h-2 w-full rounded-full overflow-hidden bg-[#1a2332]">
                                  <div
                                    className="h-full bg-emerald-500"
                                    style={{ width: `${stats.correctRate}%` }}
                                  />
                                  <div
                                    className="h-full bg-red-500"
                                    style={{ width: `${100 - stats.correctRate}%` }}
                                  />
                                </div>
                              </div>
                              {stats.avgTimeSpent > 0 && (
                                <div className="text-xs text-[#5b6b8c]">
                                  平均 {stats.avgTimeSpent.toFixed(0)} 秒/题 · 难度{' '}
                                  {stats.avgDifficulty.toFixed(1)}/5
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-[#5b6b8c]">
                              该报告未记录答题统计
                              {stats.wrongCount > 0 ? `（错题分析 ${stats.wrongCount} 条）` : ''}
                            </p>
                          )}
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex flex-row md:flex-col justify-center items-stretch gap-3 border-t md:border-t-0 md:border-l border-[#324467] pt-4 md:pt-0 md:pl-6">
                          <button
                            onClick={() => handleViewReport(report.id)}
                            className="px-4 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-blue-600 transition-all whitespace-nowrap"
                          >
                            查看详情
                          </button>
                          <button
                            onClick={() => handleExportReport(report.id)}
                            className="px-4 py-2 bg-[#1a2332] border border-[#324467] text-[#92a4c9] text-sm font-bold rounded-lg hover:text-white hover:border-primary/60 transition-all whitespace-nowrap"
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
              <div className="flex justify-center items-center gap-2 mt-6">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-[#232f48] border border-[#324467] rounded-lg text-sm font-medium text-[#92a4c9] hover:text-white hover:border-primary/60 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  上一页
                </button>
                <span className="px-4 py-2 text-sm text-[#92a4c9]">
                  第 {page} 页 / 共 {Math.ceil(total / limit)} 页
                </span>
                <button
                  onClick={() => setPage(Math.min(Math.ceil(total / limit), page + 1))}
                  disabled={page >= Math.ceil(total / limit)}
                  className="px-4 py-2 bg-[#232f48] border border-[#324467] rounded-lg text-sm font-medium text-[#92a4c9] hover:text-white hover:border-primary/60 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  下一页
                </button>
              </div>
            )}
          </div>

          {/* 侧边栏：当前筛选结果的真实汇总 */}
          <aside className="w-full lg:w-80 space-y-6">
            <div className="rounded-xl border border-[#324467] bg-[#232f48] p-5">
              <h4 className="text-white font-bold text-sm mb-1">当前筛选结果统计</h4>
              <p className="text-[11px] text-[#5b6b8c] mb-4">
                基于本页 {summary.count} 份报告的真实答题数据
              </p>

              {summary.avgScore === null ? (
                <p className="text-sm text-[#5b6b8c]">暂无可统计的答题数据</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[#92a4c9]">平均得分</span>
                      <span className="text-xs font-bold text-primary">{summary.avgScore}</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#1a2332] rounded-full">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, summary.avgScore)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="rounded-lg bg-[#1a2332] border border-[#324467] p-3">
                      <p className="text-[11px] text-[#5b6b8c]">累计题量</p>
                      <p className="text-lg font-bold text-white">{summary.totalQuestions}</p>
                    </div>
                    <div className="rounded-lg bg-[#1a2332] border border-[#324467] p-3">
                      <p className="text-[11px] text-[#5b6b8c]">累计错题</p>
                      <p className="text-lg font-bold text-red-400">{summary.totalWrong}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[#324467] bg-[#232f48] p-5">
              <h4 className="text-white font-bold text-sm mb-3">相关入口</h4>
              <div className="flex flex-col gap-2">
                <Link
                  to="/parent/learning-state"
                  className="flex items-center justify-between rounded-lg bg-[#1a2332] border border-[#324467] px-4 py-3 text-sm text-[#92a4c9] hover:text-white hover:border-primary/60 transition-colors"
                >
                  学科学情档案
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </Link>
                <Link
                  to="/parent/overview"
                  className="flex items-center justify-between rounded-lg bg-[#1a2332] border border-[#324467] px-4 py-3 text-sm text-[#92a4c9] hover:text-white hover:border-primary/60 transition-colors"
                >
                  学情概览看板
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </Link>
                <Link
                  to="/parent/tasks"
                  className="flex items-center justify-between rounded-lg bg-[#1a2332] border border-[#324467] px-4 py-3 text-sm text-[#92a4c9] hover:text-white hover:border-primary/60 transition-colors"
                >
                  任务管理
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default TaskReportCenter;
