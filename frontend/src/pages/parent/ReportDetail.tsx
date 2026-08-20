import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import { LatexText } from "../../components/common/MathFormula";
import { getErrorMessage } from '../../types/error';

/**
 * 报告详情接口
 */
interface ReportDetail {
  id: string;
  sessionId: string;
  studentId: string;
  taskId: string;
  category?: 'SUBJECT_MAIN' | 'SPECIAL' | null;
  subject?: string | null;
  specialType?: string | null;
  content: {
    summary: string;
    abilityAnalysis: Record<string, number>;
    errorAnalysis: Array<{
      questionId: string;
      reason: string;
      suggestion: string;
    }>;
    learningAdvice: string;
    statistics?: {
      totalQuestions?: number;
      correctCount?: number;
      correctRate?: number;
      avgTimeSpent?: number;
      avgDifficulty?: number;
    };
  };
  generatedAt: string;
  task: {
    id: string;
    title: string;
    mode: string;
    config: Record<string, unknown>;
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
          text?: string;
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

const SPECIAL_TYPE_LABEL: Record<string, string> = {
  ERROR_BOOK: '错题攻克',
  WEAK_POINT: '薄弱点突破',
  EXAM_PAPER: '试卷训练',
  CUSTOM: '自定义专项',
};

const CARD = 'rounded-2xl border border-[#324467] bg-[#232f48]';

/**
 * 家长端 - 报告详情
 */
const ReportDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadReport = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const response: any = await request.get(`/parent/reports/${id}`);
      if (response?.success) setReport(response.data);
      else setError('报告数据异常');
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

  const handleExportReport = async () => {
    if (!id) return;
    try {
      setExporting(true);
      const response: any = await request.get(`/parent/reports/${id}/export`, {
        responseType: 'blob',
      });
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
      alert(getErrorMessage(err, '导出报告失败'));
    } finally {
      setExporting(false);
    }
  };

  /** 统计：优先取报告内 statistics，缺失时按答题记录兜底 */
  const stats = useMemo(() => {
    if (!report) return { total: 0, correct: 0, score: 0, avgTime: 0, avgDifficulty: 0 };

    const s = report.content?.statistics;
    const answers = report.session?.answers || [];
    const total = s?.totalQuestions ?? answers.length;
    const correct = s?.correctCount ?? answers.filter((a) => a.isCorrect).length;
    const score =
      typeof s?.correctRate === 'number'
        ? Math.round(s.correctRate * 100)
        : total > 0
          ? Math.round((correct / total) * 100)
          : 0;
    const avgTime =
      s?.avgTimeSpent ??
      (answers.length > 0
        ? Math.round(answers.reduce((sum, a) => sum + (a.timeSpent || 0), 0) / answers.length)
        : 0);

    return { total, correct, score, avgTime, avgDifficulty: s?.avgDifficulty ?? 0 };
  }, [report]);

  /** 学习时长：优先按答题耗时累计，缺失时用会话时间差 */
  const durationMinutes = useMemo(() => {
    if (!report) return 0;
    const answers = report.session?.answers || [];
    const spent = answers.reduce((sum, a) => sum + (a.timeSpent || 0), 0);
    if (spent > 0) return Math.max(1, Math.round(spent / 60));
    if (report.session?.startedAt && report.session?.completedAt) {
      const diff =
        new Date(report.session.completedAt).getTime() -
        new Date(report.session.startedAt).getTime();
      return Math.max(0, Math.round(diff / 60000));
    }
    return 0;
  }, [report]);

  const formatDate = (dateString: string): string =>
    new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#111722]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-[#92a4c9]">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#111722]">
        <div className="text-center">
          <p className="mb-4 text-red-300">{error || '报告不存在'}</p>
          <button
            onClick={() => navigate('/parent/reports')}
            className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600"
          >
            返回列表
          </button>
        </div>
      </div>
    );
  }

  const studentName =
    report.session.student.studentProfile?.realName || report.session.student.username;
  const isSpecial = report.category === 'SPECIAL';

  return (
    <div className="min-h-full bg-[#111722]">
      <main className="mx-auto max-w-[1100px] px-6 py-8">
        {/* 标题与操作 */}
        <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate('/parent/reports')}
              className="flex w-fit items-center gap-1 text-sm text-[#92a4c9] transition-colors hover:text-white"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              返回报告中心
            </button>
            <h1 className="text-3xl font-black leading-tight tracking-tight text-white">
              AI 训练报告详情
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-xs font-bold ${
                  isSpecial
                    ? 'bg-purple-500/15 text-purple-300'
                    : 'bg-blue-500/15 text-blue-300'
                }`}
              >
                {isSpecial ? '专项攻克' : '学科总任务'}
              </span>
              {report.subject && (
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-300">
                  {report.subject}
                </span>
              )}
              {report.specialType && (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-300">
                  {SPECIAL_TYPE_LABEL[report.specialType] || report.specialType}
                </span>
              )}
              <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-bold text-primary">
                {report.task.title}
              </span>
              <p className="text-sm text-[#5b6b8c]">生成于 {formatDate(report.generatedAt)}</p>
            </div>
          </div>

          <button
            onClick={handleExportReport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-xl bg-[#232f48] px-5 py-3 font-bold text-white transition-all hover:bg-[#2b3a58] disabled:opacity-50"
          >
            <span className="material-symbols-outlined">download</span>
            <span>{exporting ? '导出中...' : '导出 PDF'}</span>
          </button>
        </div>

        {/* 得分 + 统计 */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div
            className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-[#324467] bg-gradient-to-br from-[#1e293b] to-[#232f48] p-8 text-center`}
          >
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
            <p className="mb-4 text-lg font-medium text-[#92a4c9]">本次训练正确率</p>
            <div className="relative flex h-40 w-40 items-center justify-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160">
                <circle
                  cx="80"
                  cy="80"
                  fill="transparent"
                  r="70"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="12"
                />
                <circle
                  cx="80"
                  cy="80"
                  fill="transparent"
                  r="70"
                  stroke="#3b82f6"
                  strokeDasharray="440"
                  strokeDashoffset={440 - (440 * stats.score) / 100}
                  strokeLinecap="round"
                  strokeWidth="12"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-black text-white">{stats.score}</span>
                <span className="mt-[-4px] text-sm text-[#92a4c9]">/ 100</span>
              </div>
            </div>
            <p className="mt-6 text-xl font-bold text-white">学员：{studentName}</p>
            <p className="mt-1 text-xs text-[#5b6b8c]">
              {report.session.student.studentProfile?.grade || '未设置年级'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
            <div className={`${CARD} flex flex-col justify-between p-6`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[#92a4c9]">学习总时长</p>
                  <h3 className="mt-1 text-3xl font-bold text-white">
                    {durationMinutes}
                    <span className="ml-1 text-base font-normal text-[#92a4c9]">分钟</span>
                  </h3>
                </div>
                <div className="rounded-xl bg-blue-500/10 p-3">
                  <span className="material-symbols-outlined text-primary">schedule</span>
                </div>
              </div>
              <div className="mt-4 border-t border-[#324467] pt-4">
                <p className="text-xs text-[#5b6b8c]">
                  会话完成度：{report.session.progress}%（{report.session.currentStep}/
                  {report.session.totalSteps} 步）
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1a2332]">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${report.session.progress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className={`${CARD} flex flex-col justify-between p-6`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[#92a4c9]">答题统计</p>
                  <h3 className="mt-1 text-3xl font-bold text-white">
                    {stats.correct}
                    <span className="text-base font-normal text-[#92a4c9]">/{stats.total}</span>
                  </h3>
                </div>
                <div className="rounded-xl bg-emerald-500/10 p-3">
                  <span className="material-symbols-outlined text-emerald-400">check_circle</span>
                </div>
              </div>
              <div className="mt-4 space-y-1 border-t border-[#324467] pt-4 text-xs text-[#5b6b8c]">
                <p>平均用时：{stats.avgTime} 秒/题</p>
                {stats.avgDifficulty > 0 && (
                  <p>平均难度：{stats.avgDifficulty.toFixed(1)} / 5</p>
                )}
              </div>
            </div>

            {report.content?.summary && (
              <div className="flex items-start gap-4 rounded-2xl border border-primary/20 bg-primary/10 p-5 sm:col-span-2">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
                  <span className="material-symbols-outlined text-primary">auto_awesome</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">AI 专家点评</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#c7d3ea]">
                    {report.content.summary}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 能力分析 */}
        {report.content?.abilityAnalysis &&
          Object.keys(report.content.abilityAnalysis).length > 0 && (
            <div className={`${CARD} mb-8 p-6`}>
              <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-white">
                <span className="material-symbols-outlined text-primary">radar</span>
                知识点掌握分析
              </h2>
              <div className="space-y-4">
                {Object.entries(report.content.abilityAnalysis).map(([point, value]) => {
                  const pct = Math.round((Number(value) || 0) * 100);
                  return (
                    <div key={point}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-[#c7d3ea]">{point}</span>
                        <span
                          className={`text-sm font-bold ${
                            pct < 40
                              ? 'text-red-300'
                              : pct < 70
                                ? 'text-amber-300'
                                : 'text-emerald-300'
                          }`}
                        >
                          {pct}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#1a2332]">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct < 40 ? 'bg-red-400' : pct < 70 ? 'bg-amber-400' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {/* 错题分析 */}
        {report.content?.errorAnalysis && report.content.errorAnalysis.length > 0 && (
          <div className={`${CARD} mb-8 p-6`}>
            <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-white">
              <span className="material-symbols-outlined text-red-400">error</span>
              错题分析（{report.content.errorAnalysis.length}）
            </h2>
            <div className="space-y-4">
              {report.content.errorAnalysis.map((item, index) => (
                <div
                  key={`${item.questionId}-${index}`}
                  className="rounded-lg border border-[#324467] bg-[#1a2332] p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-xs font-bold text-red-300">
                      {index + 1}
                    </span>
                    <div className="flex-1 space-y-2">
                      <p className="text-sm text-[#c7d3ea]">
                        <span className="font-bold text-white">错误原因：</span>
                        {item.reason}
                      </p>
                      <p className="text-sm text-[#92a4c9]">
                        <span className="font-bold text-white">改进建议：</span>
                        {item.suggestion}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 学习建议 */}
        {report.content?.learningAdvice && (
          <div className={`${CARD} mb-8 p-6`}>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
              <span className="material-symbols-outlined text-primary">lightbulb</span>
              学习建议
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#c7d3ea]">
              {report.content.learningAdvice}
            </p>
          </div>
        )}

        {/* 答题明细 */}
        {report.session.answers.length > 0 && (
          <div className={CARD}>
            <button
              onClick={() => setShowAnswers((v) => !v)}
              className="flex w-full items-center justify-between px-6 py-5 text-left"
            >
              <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                <span className="material-symbols-outlined text-[#92a4c9]">list_alt</span>
                答题明细（{report.session.answers.length} 题）
              </h2>
              <span className="material-symbols-outlined text-[#92a4c9]">
                {showAnswers ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {showAnswers && (
              <div className="space-y-3 border-t border-[#324467] p-6">
                {report.session.answers.map((a, index) => (
                  <div
                    key={a.id}
                    className={`rounded-lg border p-4 ${
                      a.isCorrect
                        ? 'border-emerald-500/20 bg-emerald-500/5'
                        : 'border-red-500/20 bg-red-500/5'
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-bold text-[#5b6b8c]">#{index + 1}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                          a.isCorrect
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-red-500/15 text-red-300'
                        }`}
                      >
                        {a.isCorrect ? '正确' : '错误'}
                      </span>
                      <span className="text-[11px] text-[#5b6b8c]">
                        用时 {a.timeSpent}s · 难度 {a.question.difficulty} · 作答{' '}
                        {a.attemptCount} 次
                      </span>
                    </div>
                    <p className="mb-2 text-sm text-[#c7d3ea]">
                      <LatexText text={(() => { const c = a.question.content; return typeof c === "string" ? c : (c?.text || (c as any)?.stem || "") })()} />
                    </p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                      <span className="text-[#92a4c9]">
                        学员答案：
                        <span className={a.isCorrect ? 'text-emerald-300' : 'text-red-300'}>
                          {a.studentAnswer || '—'}
                        </span>
                      </span>
                      <span className="text-[#92a4c9]">
                        正确答案：<span className="text-white">{a.question.answer}</span>
                      </span>
                    </div>
                    {a.question.knowledgePoints?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.question.knowledgePoints.map((kp) => (
                          <span
                            key={kp}
                            className="rounded bg-[#1a2332] px-1.5 py-0.5 text-[10px] text-[#92a4c9]"
                          >
                            {kp}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ReportDetail;
