import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import request from '../../utils/request';
import AbilityRadarChart from '../../components/parent/AbilityRadarChart';
import ErrorRingChart from '../../components/parent/ErrorRingChart';

interface StudentProfile {
  realName: string;
  grade: string;
  materialVersion: string;
  subjectLevels: Record<string, string>;
  completeness: number;
}

interface Student {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  studentIdNumber: string | null;
  profile: StudentProfile | null;
}

interface Child {
  relationId: string;
  relation: string;
  bindedAt: string;
  student: Student;
}

/** 学情概览数据（对应后端 GET /parent/overview/:studentId） */
interface OverviewData {
  abilityRadar: {
    subjects: string[];
    scores: number[];
    sampleSizes: number[];
    hasData: boolean;
  };
  errorStats: {
    unmastered: number;
    mastering: number;
    mastered: number;
    total: number;
  };
  learningStreak: {
    days: number;
    weeklyHours: number;
    weeklyMinutes: number;
    weeklyAnswered: number;
    totalLearningDays: number;
    completedSessions: number;
  };
  overall: {
    totalAnswered: number;
    totalCorrect: number;
    correctRate: number;
    completedSessions: number;
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    taskCompletionRate: number;
  };
  recentTrend: Array<{ date: string; answered: number; correctRate: number }>;
  methodology: {
    radar: string;
    error: string;
    streak: string;
  };
}

/** KPI 卡片 */
function StatCard({
  icon,
  iconClass,
  label,
  value,
  suffix,
  hint,
}: {
  icon: string;
  iconClass: string;
  label: string;
  value: string | number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[#324467] bg-[#232f48] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#92a4c9]">{label}</p>
        <div className={`flex size-9 items-center justify-center rounded-lg ${iconClass}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold text-white">
        {value}
        {suffix && <span className="ml-1 text-base font-medium text-[#92a4c9]">{suffix}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-[#5b6b8c]">{hint}</p>}
    </div>
  );
}

/**
 * 家长端 - 学情概览看板
 * 布局外壳由 ParentDashboard 提供（本页不再自带顶部导航）
 */
export default function StudentOverview() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    () => searchParams.get('studentId') || ''
  );
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [showMethodology, setShowMethodology] = useState(false);

  const fetchChildren = useCallback(async () => {
    try {
      setLoading(true);
      const response: any = await request.get('/parent/children');
      const childrenData: Child[] = response?.data?.children || [];
      setChildren(childrenData);

      setSelectedStudentId((prev) => {
        if (prev && childrenData.some((c) => c.student.id === prev)) return prev;
        return childrenData[0]?.student.id || '';
      });
    } catch (err: unknown) {
      console.error('获取子女列表失败:', err);
      const apiError = err as { response?: { status?: number } };
      if (apiError.response?.status === 401) navigate('/login');
      else setError('获取子女列表失败');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const fetchOverviewData = useCallback(
    async (studentId: string) => {
      try {
        setOverviewLoading(true);
        setError('');
        const response: any = await request.get(`/parent/overview/${studentId}`);
        setOverviewData(response?.data || null);
      } catch (err: unknown) {
        console.error('获取学情概览失败:', err);
        const apiError = err as {
          response?: {
            status?: number;
            data?: { message?: string; error?: { message?: string } };
          };
        };
        if (apiError.response?.status === 401) navigate('/login');
        else
          setError(
            apiError.response?.data?.error?.message ||
              apiError.response?.data?.message ||
              '获取学情概览失败'
          );
        setOverviewData(null);
      } finally {
        setOverviewLoading(false);
      }
    },
    [navigate]
  );

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  useEffect(() => {
    if (selectedStudentId) fetchOverviewData(selectedStudentId);
  }, [selectedStudentId, fetchOverviewData]);

  const handleStudentChange = (studentId: string) => {
    setSelectedStudentId(studentId);
    setSearchParams({ studentId });
  };

  const currentChild = useMemo(
    () => children.find((c) => c.student.id === selectedStudentId),
    [children, selectedStudentId]
  );

  const maxTrend = useMemo(
    () => Math.max(1, ...(overviewData?.recentTrend || []).map((d) => d.answered)),
    [overviewData]
  );

  const quickActions = useMemo(
    () => [
      {
        icon: 'assignment',
        title: '发布任务',
        desc: '为该学员创建学习任务',
        cls: 'bg-blue-500/15 text-blue-400',
        onClick: () => navigate('/parent/tasks/create'),
      },
      {
        icon: 'description',
        title: '查看报告',
        desc: '学科总任务 / 专项攻克报告',
        cls: 'bg-emerald-500/15 text-emerald-400',
        onClick: () => navigate('/parent/reports'),
      },
      {
        icon: 'menu_book',
        title: '学科档案',
        desc: '知识点掌握度与薄弱项',
        cls: 'bg-purple-500/15 text-purple-400',
        onClick: () =>
          navigate(
            selectedStudentId
              ? `/parent/learning-state?studentId=${selectedStudentId}`
              : '/parent/learning-state'
          ),
      },
      {
        icon: 'card_giftcard',
        title: '愿望审批',
        desc: '审批孩子提交的愿望',
        cls: 'bg-amber-500/15 text-amber-400',
        onClick: () => navigate('/parent/wishes'),
      },
    ],
    [navigate, selectedStudentId]
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#111722]">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="mt-4 text-[#92a4c9]">加载中...</p>
        </div>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#111722] px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[#232f48]">
            <span className="material-symbols-outlined text-3xl text-[#5b6b8c]">person_off</span>
          </div>
          <h2 className="mb-2 text-xl font-bold text-white">暂无绑定学员</h2>
          <p className="mb-6 text-[#92a4c9]">请先在亲子管理中绑定学员</p>
          <button
            onClick={() => navigate('/parent/children')}
            className="rounded-lg bg-primary px-6 py-2 font-bold text-white transition-colors hover:bg-blue-600"
          >
            前往绑定
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#111722] p-6 lg:p-8">
      <div className="mx-auto max-w-[1200px]">
        {/* 标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white lg:text-3xl">学情概览</h1>
          <p className="mt-2 text-sm text-[#92a4c9]">
            基于已完成训练的真实答题数据，展示学科正确率、错题攻克与学习节奏
          </p>
        </div>

        {/* 学员切换 */}
        <div className="mb-6 flex gap-6 overflow-x-auto border-b border-[#324467]">
          {children.map((child) => {
            const active = selectedStudentId === child.student.id;
            return (
              <button
                key={child.relationId}
                onClick={() => handleStudentChange(child.student.id)}
                className={`flex flex-col items-center whitespace-nowrap border-b-[3px] pb-3 pt-2 transition-all ${
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-[#92a4c9] hover:text-white'
                }`}
              >
                <p className="text-sm font-bold">
                  {child.student.profile?.realName || child.student.username}
                </p>
                <p className="mt-1 text-xs">{child.student.profile?.grade || '未设置年级'}</p>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {overviewLoading && (
          <div className="mb-6 rounded-lg border border-[#324467] bg-[#232f48] px-4 py-3 text-sm text-[#92a4c9]">
            正在加载 {currentChild?.student.profile?.realName || ''} 的学情数据...
          </div>
        )}

        {overviewData && (
          <>
            {/* KPI 概览 */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon="quiz"
                iconClass="bg-blue-500/15 text-blue-400"
                label="累计答题"
                value={overviewData.overall.totalAnswered}
                suffix="题"
                hint={`答对 ${overviewData.overall.totalCorrect} 题`}
              />
              <StatCard
                icon="check_circle"
                iconClass="bg-emerald-500/15 text-emerald-400"
                label="累计正确率"
                value={overviewData.overall.correctRate}
                suffix="%"
                hint={
                  overviewData.overall.totalAnswered === 0
                    ? '暂无答题记录'
                    : `样本 ${overviewData.overall.totalAnswered} 题`
                }
              />
              <StatCard
                icon="task_alt"
                iconClass="bg-purple-500/15 text-purple-400"
                label="任务完成率"
                value={overviewData.overall.taskCompletionRate}
                suffix="%"
                hint={`已完成 ${overviewData.overall.completedTasks} / 共 ${overviewData.overall.totalTasks}，待完成 ${overviewData.overall.pendingTasks}`}
              />
              <StatCard
                icon="play_circle"
                iconClass="bg-amber-500/15 text-amber-400"
                label="已完成训练"
                value={overviewData.overall.completedSessions}
                suffix="场"
                hint={`累计学习 ${overviewData.learningStreak.totalLearningDays} 天`}
              />
            </div>

            {/* 雷达 + 错题 */}
            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="rounded-xl border border-[#324467] bg-[#232f48] p-6 lg:col-span-2">
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">学科正确率画像</h3>
                    <p className="mt-1 text-sm text-[#92a4c9]">
                      按已完成训练的答题正确率，沿教材树归属到学科
                    </p>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/15">
                    <span className="material-symbols-outlined text-blue-400">radar</span>
                  </div>
                </div>
                <AbilityRadarChart
                  subjects={overviewData.abilityRadar.subjects}
                  scores={overviewData.abilityRadar.scores}
                  sampleSizes={overviewData.abilityRadar.sampleSizes}
                />
              </div>

              <div className="rounded-xl border border-[#324467] bg-[#232f48] p-6">
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">错题攻克</h3>
                    <p className="mt-1 text-sm text-[#92a4c9]">错题本掌握度分布</p>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-lg bg-red-500/15">
                    <span className="material-symbols-outlined text-red-400">error</span>
                  </div>
                </div>
                <ErrorRingChart
                  unmastered={overviewData.errorStats.unmastered}
                  mastering={overviewData.errorStats.mastering}
                  mastered={overviewData.errorStats.mastered}
                />
              </div>
            </div>

            {/* 近 7 日趋势 */}
            <div className="mb-6 rounded-xl border border-[#324467] bg-[#232f48] p-6">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">近 7 日学习趋势</h3>
                  <p className="mt-1 text-sm text-[#92a4c9]">柱高为当日答题量，标签为当日正确率</p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/15">
                  <span className="material-symbols-outlined text-emerald-400">trending_up</span>
                </div>
              </div>

              <div className="flex h-44 items-end gap-2 sm:gap-4">
                {overviewData.recentTrend.map((day) => {
                  const heightPct = day.answered > 0 ? (day.answered / maxTrend) * 100 : 0;
                  return (
                    <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                      <span className="text-xs text-[#92a4c9]">
                        {day.answered > 0 ? `${day.correctRate}%` : '-'}
                      </span>
                      <div className="flex h-full w-full items-end justify-center">
                        <div
                          className={`w-full max-w-[42px] rounded-t ${
                            day.answered > 0 ? 'bg-primary' : 'bg-[#1a2332]'
                          }`}
                          style={{ height: `${Math.max(heightPct, day.answered > 0 ? 6 : 3)}%` }}
                          title={`${day.date}：${day.answered} 题，正确率 ${day.correctRate}%`}
                        />
                      </div>
                      <span className="text-[11px] text-[#5b6b8c]">{day.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 学习连续性 */}
            <div className="mb-6 rounded-xl border border-[#324467] bg-[#232f48] p-6">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">学习连续性</h3>
                  <p className="mt-1 text-sm text-[#92a4c9]">
                    连续天数按"有已完成训练"的自然日回溯（今日未学习不清零）
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-orange-500/15">
                  <span className="material-symbols-outlined text-orange-400">
                    local_fire_department
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  {
                    icon: 'calendar_today',
                    value: overviewData.learningStreak.days,
                    unit: '天',
                    label: '连续学习',
                  },
                  {
                    icon: 'schedule',
                    value: overviewData.learningStreak.weeklyHours,
                    unit: '小时',
                    label: `本周时长（${overviewData.learningStreak.weeklyMinutes} 分钟）`,
                  },
                  {
                    icon: 'edit_note',
                    value: overviewData.learningStreak.weeklyAnswered,
                    unit: '题',
                    label: '本周答题量',
                  },
                  {
                    icon: 'event_available',
                    value: overviewData.learningStreak.totalLearningDays,
                    unit: '天',
                    label: '累计学习天数',
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-[#324467] bg-[#1a2332] p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-full bg-[#232f48]">
                        <span className="material-symbols-outlined text-[20px] text-[#92a4c9]">
                          {item.icon}
                        </span>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white">
                          {item.value}
                          <span className="ml-1 text-sm font-medium text-[#92a4c9]">
                            {item.unit}
                          </span>
                        </p>
                        <p className="text-xs text-[#5b6b8c]">{item.label}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 统计口径说明 */}
            <div className="mb-6 rounded-xl border border-[#324467] bg-[#232f48]">
              <button
                onClick={() => setShowMethodology((v) => !v)}
                className="flex w-full items-center justify-between px-6 py-4 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  <span className="material-symbols-outlined text-[20px] text-[#92a4c9]">info</span>
                  数据统计口径说明
                </span>
                <span className="material-symbols-outlined text-[#92a4c9]">
                  {showMethodology ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {showMethodology && (
                <div className="space-y-2 border-t border-[#324467] px-6 py-4 text-sm text-[#92a4c9]">
                  <p>
                    <span className="text-white">学科正确率：</span>
                    {overviewData.methodology.radar}；样本量少于 5 题时标注"样本不足"，仅供参考。
                  </p>
                  <p>
                    <span className="text-white">错题攻克：</span>
                    {overviewData.methodology.error}。
                  </p>
                  <p>
                    <span className="text-white">学习连续性：</span>
                    {overviewData.methodology.streak}（本周从周一 00:00 起算）。
                  </p>
                  <p>
                    <span className="text-white">数据范围：</span>
                    仅统计状态为"已完成"的训练会话，进行中的会话不计入，因此与训练舱实时进度可能存在差异。
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {!overviewData && !overviewLoading && !error && (
          <div className="rounded-xl border border-[#324467] bg-[#232f48] p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-[#3d4f73]">insights</span>
            <p className="mt-3 text-[#92a4c9]">暂无学情数据</p>
          </div>
        )}

        {/* 快速操作 */}
        <div className="rounded-xl border border-[#324467] bg-[#232f48] p-6">
          <h3 className="mb-4 text-lg font-bold text-white">快速操作</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <button
                key={action.title}
                onClick={action.onClick}
                className="flex items-center gap-3 rounded-lg border border-transparent bg-[#1a2332] p-4 text-left transition-all hover:border-primary"
              >
                <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${action.cls}`}>
                  <span className="material-symbols-outlined">{action.icon}</span>
                </div>
                <div>
                  <p className="font-bold text-white">{action.title}</p>
                  <p className="text-xs text-[#5b6b8c]">{action.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
