import { useState, useEffect } from 'react';
import request from '../../utils/request';
import AbilityRadarChart from '../../components/parent/AbilityRadarChart';
import ErrorRingChart from '../../components/parent/ErrorRingChart';

interface MasteryEntry {
  score: number;
  trend: 'up' | 'down' | 'flat';
  lastAt: string;
  source?: 'main' | 'special';
}
interface SubjectState {
  studentId: string;
  subject: string;
  irtTheta: number | null;
  masteryMap: Record<string, MasteryEntry>;
  weakPoints: Array<{
    point: string;
    score: number;
    priority: number;
    // 薄弱点诊断结构化（edu-class-diagnosis 方法论）
    gap_level?: number;
    urgency?: '高' | '中' | '低';
    priority_score?: number;
    blocks_followup?: boolean;
    confidence?: '高' | '中' | '低';
    evidence?: string;
    suggestions?: string[];
  }>;
  errorStats: {
    total: number;
    byMastery: Record<string, number>;
    byKnowledgePoint: Record<string, number>;
  };
  taskHistory: {
    taskId: string;
    title: string;
    completedAt: string;
    completion: number;
    score: number;
  }[];
  updatedAt: string | null;
}

interface Props {
  studentId?: string; // 家长端需要指定学员；学员端由 token 推导
  role: 'parent' | 'student';
  /** 外层页面已有标题时隐藏内部标题，避免重复 */
  hideHeader?: boolean;
}

/**
 * 学科学情总览（家长/学员共用，暗色主题）
 * 数据源：/parent/children/:id/learning-state 或 /student/learning-state （P4 后端）
 * 展示：学科 Tab → 知识点掌握度雷达图 + 薄弱点 + 错题分布 + 总任务履历
 */
export default function SubjectLearningStateView({ studentId, role, hideHeader }: Props) {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [active, setActive] = useState<string>('');
  const [state, setState] = useState<SubjectState | null>(null);
  const [loading, setLoading] = useState(false);

  const listUrl =
    role === 'parent' ? `/parent/children/${studentId}/learning-state` : `/student/learning-state`;

  useEffect(() => {
    if (role === 'parent' && !studentId) return;
    setLoading(true);
    request
      .get(listUrl)
      .then((res: any) => {
        const list: any[] = res?.data ?? [];
        const names = list.map((s) => s.subject).filter(Boolean);
        setSubjects(names);
        if (names.length > 0 && !names.includes(active)) setActive(names[0]);
      })
      .catch(() => setSubjects([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listUrl, studentId]);

  useEffect(() => {
    if (!active) {
      setState(null);
      return;
    }
    setLoading(true);
    const url =
      role === 'parent'
        ? `/parent/children/${studentId}/learning-state?subject=${encodeURIComponent(active)}`
        : `/student/learning-state?subject=${encodeURIComponent(active)}`;
    request
      .get(url)
      .then((res: any) => setState(res?.data ?? null))
      .catch(() => setState(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, role, studentId]);

  const entries = state ? Object.entries(state.masteryMap) : [];
  const radarSubjects = entries.slice(0, 12).map(([k]) => k);
  const radarScores = entries.slice(0, 12).map(([, v]) => v.score);
  const byMastery = state?.errorStats?.byMastery ?? {};
  const unmastered = byMastery['UNMASTERED'] ?? 0;
  const mastering = byMastery['MASTERING'] ?? 0;
  const mastered = byMastery['MASTERED'] ?? 0;

  const trendIcon = (t?: string) => (t === 'up' ? '▲' : t === 'down' ? '▼' : '—');
  const trendClass = (t?: string) =>
    t === 'up' ? 'text-emerald-400' : t === 'down' ? 'text-red-400' : 'text-[#5b6b8c]';

  const cardClass = 'rounded-xl border border-[#324467] bg-[#232f48] p-5';

  return (
    <div className="p-6">
      {!hideHeader && (
        <>
          <h1 className="mb-1 text-2xl font-bold text-white">学科学情总览</h1>
          <p className="mb-4 text-sm text-[#92a4c9]">
            按学科查看知识点掌握度、薄弱点与错题分布（数据随总任务/专项训练自动滚动更新）
          </p>
        </>
      )}

      {subjects.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {subjects.map((s) => (
            <button
              key={s}
              onClick={() => setActive(s)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                active === s
                  ? 'border-primary bg-primary text-white'
                  : 'border-[#324467] bg-[#1a2332] text-[#92a4c9] hover:border-primary hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="py-8 text-[#92a4c9]">加载中…</div>}

      {!loading && subjects.length === 0 && (
        <div className="rounded-lg border border-dashed border-[#324467] py-10 text-center text-[#5b6b8c]">
          暂无学情数据，完成训练任务后将自动生成学科档案。
        </div>
      )}

      {!loading && state && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* 知识点掌握度 */}
          <div className={`lg:col-span-2 ${cardClass}`}>
            <h2 className="mb-3 font-semibold text-white">{state.subject} · 知识点掌握度</h2>
            {radarSubjects.length > 0 ? (
              <AbilityRadarChart subjects={radarSubjects} scores={radarScores} />
            ) : (
              <div className="py-10 text-center text-[#5b6b8c]">暂无知识点掌握记录</div>
            )}
            <div className="mt-3 text-xs text-[#5b6b8c]">
              能力估计（IRT θ）：
              <span className="text-[#92a4c9]">
                {state.irtTheta != null ? state.irtTheta.toFixed(2) : '—'}
              </span>
              <span className="ml-2">
                更新于 {state.updatedAt ? new Date(state.updatedAt).toLocaleString() : '—'}
              </span>
            </div>
          </div>

          {/* 错题分布 */}
          <div className={cardClass}>
            <h2 className="mb-3 font-semibold text-white">错题分布</h2>
            {state.errorStats.total > 0 ? (
              <ErrorRingChart unmastered={unmastered} mastering={mastering} mastered={mastered} />
            ) : (
              <div className="py-10 text-center text-[#5b6b8c]">暂无错题</div>
            )}
          </div>

          {/* 薄弱点 */}
          <div className={cardClass}>
            <h2 className="mb-3 font-semibold text-white">薄弱点（按补弱优先级）</h2>
            {state.weakPoints.length > 0 ? (
              <ul className="space-y-3">
                {state.weakPoints.map((w) => (
                  <li key={w.point} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[#c7d3ea]">{w.point}</span>
                      <span className="flex items-center gap-2">
                        {w.urgency && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              w.urgency === '高'
                                ? 'bg-red-500/15 text-red-300'
                                : w.urgency === '中'
                                  ? 'bg-amber-500/15 text-amber-300'
                                  : 'bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            {w.urgency}紧迫
                          </span>
                        )}
                        <span className={trendClass((state.masteryMap[w.point] as any)?.trend)}>
                          {trendIcon((state.masteryMap[w.point] as any)?.trend)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            w.score < 40
                              ? 'bg-red-500/15 text-red-300'
                              : w.score < 70
                                ? 'bg-amber-500/15 text-amber-300'
                                : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {w.score}分
                        </span>
                      </span>
                    </div>
                    {w.suggestions && w.suggestions.length > 0 && (
                      <p className="mt-1 text-xs text-[#5b6b8c]">
                        建议：{w.suggestions.join('；')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-6 text-center text-[#5b6b8c]">暂无薄弱点记录</div>
            )}
          </div>

          {/* 总任务履历 */}
          <div className={`lg:col-span-2 ${cardClass}`}>
            <h2 className="mb-3 font-semibold text-white">总任务履历</h2>
            {state.taskHistory.length > 0 ? (
              <ul className="divide-y divide-[#324467]">
                {state.taskHistory
                  .slice()
                  .reverse()
                  .map((t) => (
                    <li
                      key={t.taskId}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="text-[#c7d3ea]">{t.title}</span>
                      <span className="text-[#5b6b8c]">
                        完成度 {t.completion}% · 得分 {t.score} ·{' '}
                        {new Date(t.completedAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <div className="py-6 text-center text-[#5b6b8c]">
                暂无总任务履历（专项训练不计入此栏）
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
