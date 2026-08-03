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
                          <span
                            className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                              task.status
                            )}`}
                          >
                            {getStatusText(task.status)}
                          </span>
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
      </div>
    </div>
  );
}
