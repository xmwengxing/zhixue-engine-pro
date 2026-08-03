import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

interface TrainingSessionBrief {
  id: string;
  phase: string;
  progress: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalSteps: number;
  currentStep: number;
}

interface ReportBrief {
  id: string;
  generatedAt: string;
  subject: string | null;
  category: 'SUBJECT_MAIN' | 'SPECIAL';
  specialType: string | null;
}

interface TaskDetailData {
  id: string;
  title: string;
  mode: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  category: 'SUBJECT_MAIN' | 'SPECIAL';
  subject: string | null;
  specialType: string | null;
  targetRef: Record<string, unknown> | null;
  config: Record<string, any>;
  student: {
    id: string;
    username: string;
    studentProfile?: { realName?: string; grade?: string; materialVersion?: string } | null;
  } | null;
  creator?: { id: string; username: string; realName: string | null; role: string } | null;
  trainingSessions: TrainingSessionBrief[];
  reports: ReportBrief[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: '待开始',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  IN_PROGRESS: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  COMPLETED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const MODE_LABELS: Record<string, string> = {
  PROFILE: '档案模式',
  CUSTOM: '自定义模式',
  EXAM_PAPER: '组卷模式',
};

const SPECIAL_TYPE_LABELS: Record<string, string> = {
  UNIT: '单元专项',
  KNOWLEDGE_POINT: '知识点专项',
  ERROR_BOOK: '错题本专项',
};

const PHASE_LABELS: Record<string, string> = {
  INITIAL_TEST: '初测',
  TEACHING: '讲授',
  PRACTICE: '练习',
  FINAL_TEST: '终测',
  REVIEW: '复盘',
};

const SESSION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: '进行中',
  COMPLETED: '已完成',
  PAUSED: '已暂停',
  ABANDONED: '已放弃',
};

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN') : '—';

/**
 * 家长端 - 任务详情页
 * 展示任务基础信息、配置、训练会话与关联报告，并支持删除任务
 */
export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<TaskDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadTask = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError('');
      const res = await request.get(`/parent/tasks/${id}`);
      setTask(res.data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '加载任务详情失败'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      setDeleting(true);
      setError('');
      await request.delete(`/parent/tasks/${id}`);
      navigate('/parent/tasks');
    } catch (err: unknown) {
      setError(getErrorMessage(err, '删除任务失败'));
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  /** 任务配置摘要（不同模式字段不同，做兼容展示） */
  const buildConfigRows = (t: TaskDetailData): Array<[string, string]> => {
    const c = t.config || {};
    const rows: Array<[string, string]> = [];
    if (c.aiTeacher) rows.push(['AI 科目老师', String(c.aiTeacher)]);
    if (c.questionCount != null) rows.push(['题目数量', `${c.questionCount} 题`]);
    if (c.difficulty != null) rows.push(['难度', `${c.difficulty} 级`]);
    if (c.duration != null) rows.push(['建议时长', `${c.duration} 分钟`]);
    if (c.goal) rows.push(['学习目标', String(c.goal)]);
    if (Array.isArray(c.materialNodeIds) && c.materialNodeIds.length) {
      rows.push(['关联教材节点', `${c.materialNodeIds.length} 个`]);
    }
    if (c.paperId) rows.push(['选用试卷', String(c.paperId)]);
    if (c.parentEncouragement) rows.push(['家长寄语', String(c.parentEncouragement)]);

    const target = (t.targetRef || {}) as Record<string, any>;
    if (Array.isArray(target.unitIds) && target.unitIds.length) {
      rows.push(['专项单元', `${target.unitIds.length} 个单元`]);
    }
    if (Array.isArray(target.knowledgePoints) && target.knowledgePoints.length) {
      rows.push(['专项知识点', target.knowledgePoints.join('、')]);
    }
    if (Array.isArray(target.errorQuestionIds) && target.errorQuestionIds.length) {
      rows.push(['错题来源', `${target.errorQuestionIds.length} 道错题`]);
    }
    return rows;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111722] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-[#92a4c9]">加载中...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-[#111722] p-8">
        <div className="max-w-3xl mx-auto rounded-lg border border-red-500/40 bg-red-500/10 p-6">
          <p className="text-red-300 mb-4">{error || '任务不存在或已被删除'}</p>
          <button
            onClick={() => navigate('/parent/tasks')}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600"
          >
            返回任务列表
          </button>
        </div>
      </div>
    );
  }

  const configRows = buildConfigRows(task);
  const hasActiveSession = task.trainingSessions.some((s) => s.status === 'ACTIVE');

  return (
    <div className="min-h-screen bg-[#111722] py-8">
      <div className="max-w-5xl mx-auto px-4 flex flex-col gap-6">
        {/* 顶部导航 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/parent/tasks')}
            className="flex items-center gap-1 text-sm text-[#92a4c9] hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            返回任务列表
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* 任务头部 */}
        <div className="rounded-xl border border-[#324467] bg-[#232f48] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
                    STATUS_CLASSES[task.status] || 'bg-[#1a2332] text-[#92a4c9] border-[#324467]'
                  }`}
                >
                  {STATUS_LABELS[task.status] || task.status}
                </span>
                {task.subject && (
                  <span className="px-2.5 py-1 text-xs rounded-full bg-blue-500/15 text-blue-300">
                    {task.subject}
                  </span>
                )}
                <span
                  className={`px-2.5 py-1 text-xs rounded-full ${
                    task.category === 'SPECIAL'
                      ? 'bg-purple-500/15 text-purple-300'
                      : 'bg-[#1a2332] text-[#92a4c9]'
                  }`}
                >
                  {task.category === 'SPECIAL'
                    ? SPECIAL_TYPE_LABELS[task.specialType || ''] || '专项攻克'
                    : '学科总任务'}
                </span>
                <span className="px-2.5 py-1 text-xs rounded-full bg-[#1a2332] text-[#92a4c9]">
                  {MODE_LABELS[task.mode] || task.mode}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white break-words">{task.title}</h1>
              <p className="mt-1 text-sm text-[#92a4c9]">
                学员：
                {task.student?.studentProfile?.realName || task.student?.username || '(学员已删除)'}
                {task.student?.studentProfile?.grade ? ` · ${task.student.studentProfile.grade}` : ''}
              </p>
            </div>

            <button
              onClick={() => setDeleteOpen(true)}
              className="px-4 py-2 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors text-sm"
            >
              删除任务
            </button>
          </div>

          {/* 时间线 */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              ['创建时间', formatDateTime(task.createdAt)],
              ['开始时间', formatDateTime(task.startedAt)],
              ['完成时间', formatDateTime(task.completedAt)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-[#1a2332] border border-[#324467] p-3">
                <p className="text-xs text-[#5b6b8c] mb-1">{label}</p>
                <p className="text-sm text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 任务配置 */}
        <div className="rounded-xl border border-[#324467] bg-[#232f48] p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
            任务配置
          </h2>
          {configRows.length === 0 ? (
            <p className="text-sm text-[#5b6b8c]">该任务未记录额外配置信息</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {configRows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-4 rounded-lg bg-[#1a2332] border border-[#324467] px-4 py-3"
                >
                  <span className="text-sm text-[#92a4c9] shrink-0">{label}</span>
                  <span className="text-sm text-white text-right break-words">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 训练会话 */}
        <div className="rounded-xl border border-[#324467] bg-[#232f48] p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">timeline</span>
            训练会话（{task.trainingSessions.length}）
          </h2>
          {task.trainingSessions.length === 0 ? (
            <p className="text-sm text-[#5b6b8c]">学员尚未开始该任务的训练</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#324467]">
                <thead className="bg-[#1a2332]">
                  <tr>
                    {['阶段', '状态', '进度', '开始时间', '完成时间'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-xs font-medium text-[#92a4c9] uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#324467]">
                  {task.trainingSessions.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3 text-sm text-white whitespace-nowrap">
                        {PHASE_LABELS[s.phase] || s.phase}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full ${
                            s.status === 'ACTIVE'
                              ? 'bg-blue-500/15 text-blue-300'
                              : s.status === 'COMPLETED'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-[#1a2332] text-[#92a4c9]'
                          }`}
                        >
                          {SESSION_STATUS_LABELS[s.status] || s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#92a4c9] whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 rounded-full bg-[#1a2332] overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${Math.min(100, Math.max(0, s.progress))}%` }}
                            />
                          </div>
                          <span>
                            {s.progress}%（{s.currentStep}/{s.totalSteps}）
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#92a4c9] whitespace-nowrap">
                        {formatDateTime(s.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#92a4c9] whitespace-nowrap">
                        {formatDateTime(s.completedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 关联报告 */}
        <div className="rounded-xl border border-[#324467] bg-[#232f48] p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">description</span>
            关联学习报告（{task.reports.length}）
          </h2>
          {task.reports.length === 0 ? (
            <p className="text-sm text-[#5b6b8c]">该任务暂未生成学习报告</p>
          ) : (
            <div className="flex flex-col gap-2">
              {task.reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/parent/reports/${r.id}`)}
                  className="flex items-center justify-between gap-4 rounded-lg bg-[#1a2332] border border-[#324467] px-4 py-3 hover:border-primary/60 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white">
                      {r.subject || '综合'} ·{' '}
                      {r.category === 'SPECIAL'
                        ? SPECIAL_TYPE_LABELS[r.specialType || ''] || '专项报告'
                        : '学科总任务报告'}
                    </p>
                    <p className="text-xs text-[#5b6b8c] mt-0.5">
                      生成于 {formatDateTime(r.generatedAt)}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[#5b6b8c]">chevron_right</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 删除确认弹窗 */}
      {deleteOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#232f48] border border-[#324467] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-400">warning</span>
              </div>
              <h3 className="ml-4 text-lg font-medium text-white">确认删除任务</h3>
            </div>
            <p className="text-[#92a4c9] mb-2">
              删除「{task.title}」将同时清除其训练会话、答题记录与学习报告，操作无法撤销。
            </p>
            {hasActiveSession && (
              <p className="text-sm text-orange-400 mb-2">
                该任务存在进行中的训练会话，需学员结束训练后才能删除。
              </p>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="px-4 py-2 border border-[#324467] rounded-lg text-[#92a4c9] hover:text-white hover:border-primary/60 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 flex items-center"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    删除中...
                  </>
                ) : (
                  '确认删除'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
