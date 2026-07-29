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
  weakPoints: { point: string; score: number; priority: number }[];
  errorStats: {
    total: number;
    byMastery: Record<string, number>;
    byKnowledgePoint: Record<string, number>;
  };
  taskHistory: { taskId: string; title: string; completedAt: string; completion: number; score: number }[];
  updatedAt: string | null;
}

interface Props {
  studentId?: string; // 家长端需要指定学员；学员端由 token 推导
  role: 'parent' | 'student';
}

/**
 * 学科学情总览（家长/学员共用）
 * 数据源：/parent/children/:id/learning-state 或 /student/learning-state （P4 后端）
 * 展示：学科 Tab → 知识点掌握度雷达图 + 薄弱点 + 错题分布 + 总任务履历
 */
export default function SubjectLearningStateView({ studentId, role }: Props) {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [active, setActive] = useState<string>('');
  const [state, setState] = useState<SubjectState | null>(null);
  const [loading, setLoading] = useState(false);

  const listUrl =
    role === 'parent'
      ? `/parent/children/${studentId}/learning-state`
      : `/student/learning-state`;

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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">学科学情总览</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        按学科查看知识点掌握度、薄弱点与错题分布（数据随总任务/专项训练自动滚动更新）
      </p>

      {subjects.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {subjects.map((s) => (
            <button
              key={s}
              onClick={() => setActive(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
                active === s
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="text-slate-400 py-8">加载中…</div>}

      {!loading && subjects.length === 0 && (
        <div className="text-slate-400 py-10 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
          暂无学情数据，完成训练任务后将自动生成学科档案。
        </div>
      )}

      {!loading && state && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* 雷达图 */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">
              {state.subject} · 知识点掌握度
            </h2>
            {radarSubjects.length > 0 ? (
              <AbilityRadarChart subjects={radarSubjects} scores={radarScores} />
            ) : (
              <div className="text-slate-400 py-10 text-center">暂无知识点掌握记录</div>
            )}
            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              能力估计（IRT θ）：{state.irtTheta != null ? state.irtTheta : '—'}
            </div>
          </div>

          {/* 错题分布 */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">错题分布</h2>
            {state.errorStats.total > 0 ? (
              <>
                <ErrorRingChart unmastered={unmastered} mastering={mastering} mastered={mastered} />
                <div className="flex justify-around text-sm mt-2">
                  <span className="text-rose-500">未掌握 {unmastered}</span>
                  <span className="text-amber-500">攻克中 {mastering}</span>
                  <span className="text-emerald-500">已掌握 {mastered}</span>
                </div>
              </>
            ) : (
              <div className="text-slate-400 py-10 text-center">暂无错题</div>
            )}
          </div>

          {/* 薄弱点 */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">薄弱点（掌握度升序）</h2>
            {state.weakPoints.length > 0 ? (
              <ul className="space-y-2">
                {state.weakPoints.map((w) => (
                  <li key={w.point} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-200">{w.point}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-400">{trendIcon((state.masteryMap[w.point] as any)?.trend)}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          w.score < 40
                            ? 'bg-rose-100 text-rose-600'
                            : w.score < 70
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-emerald-100 text-emerald-600'
                        }`}
                      >
                        {w.score}分
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-slate-400 py-6 text-center">暂无薄弱点记录</div>
            )}
          </div>

          {/* 总任务履历 */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">总任务履历</h2>
            {state.taskHistory.length > 0 ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {state.taskHistory
                  .slice()
                  .reverse()
                  .map((t) => (
                    <li key={t.taskId} className="py-2 flex items-center justify-between text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{t.title}</span>
                      <span className="text-slate-400">
                        {t.completion}% · {new Date(t.completedAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <div className="text-slate-400 py-6 text-center">暂无总任务履历（专项训练不计入此栏）</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
