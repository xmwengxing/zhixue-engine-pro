import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../types/error';
import request from '../../utils/request';

interface Task {
  id: string;
  title: string;
  mode: string;
  status: string;
  createdAt: string;
  // P3 双轨字段
  category?: 'SUBJECT_MAIN' | 'SPECIAL';
  subject?: string | null;
  specialType?: 'UNIT' | 'KNOWLEDGE_POINT' | 'ERROR_BOOK' | null;
  // 学期延续模式字段
  config?: any; // 含 textbookId / unitIds / units / goalScore
  lastTrainedAt?: string | null; // 最近一次训练时间
  archivedAt?: string | null; // 归档时间
  archive?: {
    id: string;
    semesterLabel: string;
    summaryText: string;
    archivedAt: string;
  } | null;
  student: {
    username: string;
    status?: string; // 学员状态字段
    studentProfile?: {
      realName: string;
    };
  };
}

/** P3 双轨：专项类型中文标签 */
const SPECIAL_TYPE_LABELS: Record<string, string> = {
  UNIT: '单元专项',
  KNOWLEDGE_POINT: '知识点专项',
  ERROR_BOOK: '错题本专项',
  PAPER: '题库组卷',
};

interface Child {
  id: string;
  username: string;
  studentProfile?: {
    realName: string;
  };
}

/**
 * 任务列表页面
 * 显示家长创建的所有任务
 */
export default function TaskList() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  // P3 双轨：任务大类 Tab（学科总任务 / 专项攻克，隔离查询）
  const [category, setCategory] = useState<'SUBJECT_MAIN' | 'SPECIAL'>('SUBJECT_MAIN');
  // 状态筛选（后端支持 status 过滤）
  const [statusFilter, setStatusFilter] = useState<'' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('');
  // 学员筛选
  const [filterStudentId, setFilterStudentId] = useState('');

  // AI 智能派单相关状态
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState('');

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ===== 学期延续模式状态 =====
  // 调整单元弹窗
  const [unitModalTask, setUnitModalTask] = useState<Task | null>(null);
  const [unitOptions, setUnitOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [unitModalLoading, setUnitModalLoading] = useState(false);
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitModalError, setUnitModalError] = useState('');
  // 归档确认弹窗
  const [archiveModalTask, setArchiveModalTask] = useState<Task | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveModalError, setArchiveModalError] = useState('');
  // 归档总结查看弹窗
  const [summaryTask, setSummaryTask] = useState<Task | null>(null);

  /**
   * 加载任务列表
   */
  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const params: Record<string, unknown> = { page, limit, category };
      if (statusFilter) params.status = statusFilter;
      if (filterStudentId) params.studentId = filterStudentId;

      const response = await request.get('/parent/tasks', { params });

      setTasks(response.data.tasks);
      setTotal(response.data.total);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '加载任务列表失败'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, category, statusFilter, filterStudentId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  /**
   * 加载家长绑定的学员列表（供筛选与 AI 智能派单选择）
   */
  const loadChildren = useCallback(async () => {
    try {
      const response = await request.get('/parent/children');
      const raw: any[] = response.data.children || [];
      // 兼容两种返回结构：{ student: {...} } 或直接学员对象
      const list: Child[] = raw.map((item: any) =>
        item.student ? { ...item.student, studentProfile: item.student.profile ?? item.student.studentProfile } : item
      );
      setChildren(list);
      if (list.length > 0 && !selectedStudentId) {
        setSelectedStudentId(list[0].id);
      }
    } catch (err: unknown) {
      console.error('加载学员列表失败:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadChildren();
  }, [loadChildren]);

  /**
   * AI 一键布置今日巩固：根据近 3 天错题 + IRT 能力自动派单
   */
  const handleSmartAssign = async () => {
    if (!selectedStudentId) {
      setAssignMsg('请先选择要派单的学员');
      return;
    }
    try {
      setAssigning(true);
      setError('');
      setAssignMsg('');
      const response = await request.post('/parent/tasks/smart-assign', {
        studentId: selectedStudentId,
      });
      const basis = response.data?.basis;
      const weak = basis?.weakPoints?.length ? `薄弱点：${basis.weakPoints.join('、')}` : '';
      setAssignMsg(
        `已为学员生成「${response.data?.task?.title || '今日巩固小练'}」，近3天错题 ${basis?.errorCount ?? 0} 道${weak ? '，' + weak : ''}`
      );
      // AI 派单产出的是专项任务，自动切到专项 Tab 便于看到结果
      setCategory('SPECIAL');
      setPage(1);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'AI 智能派单失败'));
    } finally {
      setAssigning(false);
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: { [key: string]: string } = {
      PENDING: '待开始',
      IN_PROGRESS: '进行中',
      COMPLETED: '已完成',
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colorMap: { [key: string]: string } = {
      PENDING: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
      IN_PROGRESS: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
      COMPLETED: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    };
    return colorMap[status] || 'bg-[#1a2332] text-[#92a4c9] border border-[#324467]';
  };

  const getModeText = (mode: string) => {
    const modeMap: { [key: string]: string } = {
      PROFILE: '档案模式',
      CUSTOM: '自定义模式',
      EXAM_PAPER: '组卷模式',
    };
    return modeMap[mode] || mode;
  };

  /**
   * 删除按钮提示（后端仅在存在 ACTIVE 训练会话时拦截，前端不再按状态禁用）
   */
  const getDeleteTooltip = (task: Task) => {
    const studentDeleted = !task.student || task.student.status === 'DELETED';
    if (studentDeleted) return '学员已删除，可以删除此任务';
    if (task.status === 'IN_PROGRESS') return '删除任务（若学员正在训练中会被拦截）';
    return '删除任务';
  };

  const handleDeleteClick = (task: Task) => {
    setTaskToDelete(task);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setTaskToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!taskToDelete) return;

    try {
      setDeleting(true);
      setError('');

      await request.delete(`/parent/tasks/${taskToDelete.id}`);
      await loadTasks();

      setDeleteConfirmOpen(false);
      setTaskToDelete(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '删除任务失败'));
      setDeleteConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  // ===== 学期延续模式：调整单元 / 归档 =====

  /** 距今天数（取整） */
  const daysSince = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.max(0, Math.floor(diff / 86400000));
  };

  /** 最近训练提示：返回 { text, overdue } */
  const lastTrainedInfo = (task: Task) => {
    const days = daysSince(task.lastTrainedAt);
    if (days === null) return null;
    if (days === 0) return { text: '今日训练过', overdue: false };
    if (days < 14) return { text: `${days} 天前训练`, overdue: false };
    return { text: `已 ${days} 天未训练`, overdue: true };
  };

  /** 打开调整单元弹窗：加载任务教材的单元列表，预填当前勾选 */
  const openUnitModal = async (task: Task) => {
    setUnitModalTask(task);
    setUnitModalError('');
    setUnitModalLoading(true);
    setSelectedUnitIds(Array.isArray(task.config?.unitIds) ? [...task.config.unitIds] : []);
    try {
      const res = await request.get('/parent/question-bank/textbooks');
      const textbooks: any[] = res.data || [];
      const tb = textbooks.find((t: any) => t.id === task.config?.textbookId);
      const units = tb?.units || [];
      setUnitOptions(units.map((u: any) => ({ id: u.id, name: u.name })));
      if (units.length === 0) setUnitModalError('未找到该任务绑定的教材单元，请先确认教材已添加');
    } catch (err) {
      setUnitModalError(getErrorMessage(err, '加载教材单元失败'));
    } finally {
      setUnitModalLoading(false);
    }
  };

  const toggleUnit = (id: string) => {
    setSelectedUnitIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const saveUnits = async () => {
    if (!unitModalTask) return;
    if (selectedUnitIds.length === 0) {
      setUnitModalError('请至少勾选一个单元');
      return;
    }
    try {
      setUnitSaving(true);
      setUnitModalError('');
      await request.patch(`/parent/tasks/${unitModalTask.id}/units`, {
        unitIds: selectedUnitIds,
      });
      setUnitModalTask(null);
      await loadTasks();
    } catch (err) {
      setUnitModalError(getErrorMessage(err, '调整单元失败'));
    } finally {
      setUnitSaving(false);
    }
  };

  const openArchiveModal = (task: Task) => {
    setArchiveModalTask(task);
    setArchiveModalError('');
  };

  const confirmArchive = async () => {
    if (!archiveModalTask) return;
    try {
      setArchiving(true);
      setArchiveModalError('');
      await request.post(`/parent/tasks/${archiveModalTask.id}/archive`);
      setArchiveModalTask(null);
      await loadTasks();
    } catch (err) {
      setArchiveModalError(getErrorMessage(err, '归档失败'));
    } finally {
      setArchiving(false);
    }
  };

  /** 是否展示「调整单元」（学科总任务、未归档、可继续训练） */
  const canAdjustUnits = (task: Task) =>
    task.category === 'SUBJECT_MAIN' &&
    !task.archivedAt &&
    task.status !== 'COMPLETED' &&
    Boolean(task.config?.textbookId);

  /** 是否展示「归档本学期」（学科总任务、进行中、未归档；需期末考完成由后端校验） */
  const canArchive = (task: Task) =>
    task.category === 'SUBJECT_MAIN' && !task.archivedAt && task.status === 'IN_PROGRESS';

  const selectClass =
    'px-3 py-2 rounded-lg border border-[#324467] bg-[#1a2332] text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/60';

  if (loading && tasks.length === 0) {
    return (
      <div className="min-h-screen bg-[#111722] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-[#92a4c9]">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111722] py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* 页面标题 */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white">任务管理</h1>
            <p className="mt-2 text-[#92a4c9]">查看和管理学员的学习任务</p>
          </div>
          <button
            onClick={() => navigate('/parent/tasks/create')}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            创建新任务
          </button>
        </div>

        {/* P3 双轨：任务大类 Tab */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => {
              setCategory('SUBJECT_MAIN');
              setPage(1);
            }}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
              category === 'SUBJECT_MAIN'
                ? 'bg-primary text-white border-primary'
                : 'bg-[#232f48] text-[#92a4c9] border-[#324467] hover:border-primary/60 hover:text-white'
            }`}
          >
            学科总任务
          </button>
          <button
            onClick={() => {
              setCategory('SPECIAL');
              setPage(1);
            }}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
              category === 'SPECIAL'
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-[#232f48] text-[#92a4c9] border-[#324467] hover:border-purple-500/60 hover:text-white'
            }`}
          >
            专项攻克任务
          </button>
        </div>

        {/* 筛选条 */}
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-[#324467] bg-[#232f48] p-4">
          <span className="text-sm text-[#92a4c9] font-medium">筛选</span>
          <select
            value={filterStudentId}
            onChange={(e) => {
              setFilterStudentId(e.target.value);
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">全部学员</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.studentProfile?.realName || c.username}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter);
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">全部状态</option>
            <option value="PENDING">待开始</option>
            <option value="IN_PROGRESS">进行中</option>
            <option value="COMPLETED">已完成</option>
          </select>
          <div className="flex-1" />
          <span className="text-sm text-[#5b6b8c]">共 {total} 条</span>
        </div>

        {/* AI 智能派单工具条 */}
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-[#324467] bg-[#1a2332] p-4">
          <span className="text-sm text-white font-medium">AI 一键巩固</span>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className={selectClass}
          >
            {children.length === 0 && <option value="">（暂无绑定学员）</option>}
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.studentProfile?.realName || c.username}
              </option>
            ))}
          </select>
          <button
            onClick={handleSmartAssign}
            disabled={assigning || children.length === 0 || !selectedStudentId}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {assigning ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                AI 派单中...
              </>
            ) : (
              'AI 一键布置今日巩固'
            )}
          </button>
          {assignMsg && <span className="text-sm text-emerald-300">{assignMsg}</span>}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-4 rounded-lg border border-red-500/40 bg-red-500/10">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* 任务列表 */}
        <div className="rounded-lg overflow-hidden border border-[#324467] bg-[#232f48]">
          {tasks.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-[#92a4c9] mb-4">
                {category === 'SPECIAL' ? '还没有发布过专项攻克任务' : '还没有创建学科总任务'}
              </p>
              <button
                onClick={() => navigate('/parent/tasks/create')}
                className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                创建第一个任务
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[#324467]">
                  <thead className="bg-[#1a2332]">
                    <tr>
                      {['任务标题', '学员', '学科 / 类型', '状态', '创建时间', '操作'].map((h) => (
                        <th
                          key={h}
                          className="px-6 py-3 text-left text-xs font-medium text-[#92a4c9] uppercase tracking-wider whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#324467]">
                    {tasks.map((task) => (
                      <tr
                        key={task.id}
                        className="hover:bg-[#1a2332] transition-colors cursor-pointer"
                        onClick={() => navigate(`/parent/tasks/${task.id}`)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-white">{task.title}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-white">
                            {task.student?.studentProfile?.realName ||
                              task.student?.username ||
                              '(学员已删除)'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-[#92a4c9]">
                            {task.subject && (
                              <span className="mr-1.5 px-2 py-0.5 text-xs rounded bg-blue-500/15 text-blue-300">
                                {task.subject}
                              </span>
                            )}
                            {task.category === 'SPECIAL' ? (
                              <span className="px-2 py-0.5 text-xs rounded bg-purple-500/15 text-purple-300">
                                {SPECIAL_TYPE_LABELS[task.specialType || ''] || '专项攻克'}
                              </span>
                            ) : (
                              getModeText(task.mode)
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                                task.status
                              )}`}
                            >
                              {getStatusText(task.status)}
                            </span>
                            {task.archivedAt && (
                              <span className="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                已归档
                              </span>
                            )}
                          </div>
                          {(() => {
                            const info = lastTrainedInfo(task);
                            if (!info) return null;
                            return (
                              <div
                                className={`mt-1 text-xs ${
                                  info.overdue ? 'text-red-400 font-medium' : 'text-[#5b6b8c]'
                                }`}
                              >
                                {info.overdue ? '⚠ ' : ''}
                                {info.text}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[#92a4c9]">
                          {new Date(task.createdAt).toLocaleDateString('zh-CN')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/parent/tasks/${task.id}`);
                              }}
                              className="text-blue-400 hover:text-blue-300"
                            >
                              查看详情
                            </button>
                            {canAdjustUnits(task) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openUnitModal(task);
                                }}
                                className="text-amber-400 hover:text-amber-300 cursor-pointer"
                                title="学员在校学完新单元后，勾选新单元发起继续训练（支持随时调整）"
                              >
                                调整单元
                              </button>
                            )}
                            {canArchive(task) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openArchiveModal(task);
                                }}
                                className="text-purple-400 hover:text-purple-300 cursor-pointer"
                                title="期末考训练完成并达成分数目标后，归档本学期并生成学期总结"
                              >
                                归档
                              </button>
                            )}
                            {task.archivedAt && task.archive && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSummaryTask(task);
                                }}
                                className="text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                title="查看本学期归档总结"
                              >
                                学期总结
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(task);
                              }}
                              className="text-red-400 hover:text-red-300 cursor-pointer"
                              title={getDeleteTooltip(task)}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 分页 */}
              {total > limit && (
                <div className="px-6 py-4 flex items-center justify-between border-t border-[#324467]">
                  <div className="text-sm text-[#92a4c9]">
                    显示 {(page - 1) * limit + 1} 到 {Math.min(page * limit, total)} 条，共 {total} 条
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="px-4 py-2 border border-[#324467] rounded-lg text-sm font-medium text-[#92a4c9] hover:text-white hover:border-primary/60 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page * limit >= total}
                      className="px-4 py-2 border border-[#324467] rounded-lg text-sm font-medium text-[#92a4c9] hover:text-white hover:border-primary/60 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 删除确认弹窗 */}
        {deleteConfirmOpen && taskToDelete && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-[#232f48] border border-[#324467] rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
                    <span className="material-symbols-outlined text-red-400 text-[24px]">warning</span>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-white">确认删除任务</h3>
                  </div>
                </div>

                <div className="mb-6">
                  <p className="text-[#92a4c9] mb-2">
                    删除后将同时清除该任务的训练会话、答题记录与学习报告，操作无法撤销。
                  </p>
                  <div className="mt-4 p-4 bg-[#1a2332] rounded-lg border border-[#324467]">
                    <p className="text-sm text-white font-medium">{taskToDelete.title}</p>
                    <p className="text-sm text-[#92a4c9] mt-1">
                      学员：
                      {taskToDelete.student?.studentProfile?.realName ||
                        taskToDelete.student?.username ||
                        '(学员已删除)'}
                    </p>
                    <p className="text-sm text-[#92a4c9]">状态：{getStatusText(taskToDelete.status)}</p>
                    {(!taskToDelete.student || taskToDelete.student.status === 'DELETED') && (
                      <p className="text-sm text-orange-400 mt-2">该任务的学员账户已被删除</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={handleDeleteCancel}
                    disabled={deleting}
                    className="px-4 py-2 border border-[#324467] rounded-lg text-[#92a4c9] hover:text-white hover:border-primary/60 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleDeleteConfirm}
                    disabled={deleting}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {deleting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        删除中...
                      </>
                    ) : (
                      '确认删除'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 调整单元弹窗（学期延续模式：勾选新单元 → 继续训练） */}
        {unitModalTask && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-[#232f48] border border-[#324467] rounded-lg shadow-xl max-w-lg w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-white">调整单元范围</h3>
                  <button
                    onClick={() => setUnitModalTask(null)}
                    className="text-[#5b6b8c] hover:text-white text-xl leading-none"
                  >
                    ×
                  </button>
                </div>

                <div className="mb-4 p-4 bg-[#1a2332] rounded-lg border border-[#324467]">
                  <p className="text-sm text-white font-medium">{unitModalTask.title}</p>
                  <p className="text-sm text-[#92a4c9] mt-1">
                    学员在校学完新单元后，勾选新单元发起继续训练；可随时调整（追加或移出单元），
                    学员下一轮训练将按新的单元范围出题。
                  </p>
                  {Array.isArray(unitModalTask.config?.units) &&
                    unitModalTask.config.units.length > 0 && (
                      <p className="text-xs text-[#5b6b8c] mt-2">
                        当前已选：{unitModalTask.config.units.join('、')}
                      </p>
                    )}
                </div>

                {unitModalLoading ? (
                  <div className="py-10 text-center text-[#92a4c9]">加载单元中...</div>
                ) : (
                  <div className="max-h-72 overflow-y-auto mb-4">
                    {unitOptions.length === 0 ? (
                      <p className="text-[#92a4c9] text-sm py-4 text-center">暂无可用单元</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {unitOptions.map((u) => {
                          const checked = selectedUnitIds.includes(u.id);
                          return (
                            <button
                              key={u.id}
                              onClick={() => toggleUnit(u.id)}
                              className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${
                                checked
                                  ? 'bg-primary/20 border-primary text-white'
                                  : 'bg-[#1a2332] border-[#324467] text-[#92a4c9] hover:border-primary/60 hover:text-white'
                              }`}
                            >
                              <span className="mr-1.5">{checked ? '☑' : '☐'}</span>
                              {u.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {unitModalError && (
                  <div className="mb-4 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-300">
                    {unitModalError}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#5b6b8c]">已选 {selectedUnitIds.length} 个单元</span>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setUnitModalTask(null)}
                      disabled={unitSaving}
                      className="px-4 py-2 border border-[#324467] rounded-lg text-[#92a4c9] hover:text-white hover:border-primary/60 disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => void saveUnits()}
                      disabled={unitSaving || unitModalLoading}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center"
                    >
                      {unitSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          保存中...
                        </>
                      ) : (
                        '保存并继续训练'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 归档确认弹窗（学期延续模式：期末考完成并达标后归档） */}
        {archiveModalTask && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-[#232f48] border border-[#324467] rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-500/15 flex items-center justify-center">
                    <span className="material-symbols-outlined text-purple-400 text-[24px]">archive</span>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-white">归档本学期</h3>
                  </div>
                </div>

                <div className="mb-6">
                  <p className="text-[#92a4c9] mb-2">
                    归档后将生成本学期学习总结（AI 摘要），任务标记为已完成并释放
                    「同学科 1 个总任务」名额；新学期需重新发布任务并进行水平评估初测。
                  </p>
                  <div className="mt-4 p-4 bg-[#1a2332] rounded-lg border border-[#324467]">
                    <p className="text-sm text-white font-medium">{archiveModalTask.title}</p>
                    <p className="text-sm text-[#92a4c9] mt-1">
                      学员：
                      {archiveModalTask.student?.studentProfile?.realName ||
                        archiveModalTask.student?.username}
                    </p>
                    {typeof archiveModalTask.config?.goalScore === 'number' && (
                      <p className="text-sm text-[#92a4c9] mt-1">
                        期末目标正确率：{archiveModalTask.config.goalScore}%（未达标将无法归档）
                      </p>
                    )}
                  </div>
                </div>

                {archiveModalError && (
                  <div className="mb-4 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-300">
                    {archiveModalError}
                  </div>
                )}

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setArchiveModalTask(null)}
                    disabled={archiving}
                    className="px-4 py-2 border border-[#324467] rounded-lg text-[#92a4c9] hover:text-white hover:border-primary/60 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => void confirmArchive()}
                    disabled={archiving}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 disabled:opacity-50 flex items-center"
                  >
                    {archiving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        归档中...
                      </>
                    ) : (
                      '确认归档'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 学期总结查看弹窗 */}
        {summaryTask && summaryTask.archive && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-[#232f48] border border-[#324467] rounded-lg shadow-xl max-w-lg w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-white">
                      {summaryTask.archive.semesterLabel} · 学习总结
                    </h3>
                    <p className="text-sm text-[#5b6b8c] mt-1">{summaryTask.title}</p>
                  </div>
                  <button
                    onClick={() => setSummaryTask(null)}
                    className="text-[#5b6b8c] hover:text-white text-xl leading-none"
                  >
                    ×
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto p-4 bg-[#1a2332] rounded-lg border border-[#324467]">
                  <p className="text-sm text-[#92a4c9] whitespace-pre-wrap leading-relaxed">
                    {summaryTask.archive.summaryText || '（暂无总结内容）'}
                  </p>
                </div>

                <div className="mt-4 text-right">
                  <button
                    onClick={() => setSummaryTask(null)}
                    className="px-4 py-2 border border-[#324467] rounded-lg text-[#92a4c9] hover:text-white hover:border-primary/60"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
