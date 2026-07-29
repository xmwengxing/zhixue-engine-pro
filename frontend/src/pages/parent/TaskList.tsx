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
    status?: string; // 添加学员状态字段
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
   * 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
   */
  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      
      const response = await request.get('/parent/tasks', {
        params: {
          page,
          limit,
          category,
        },
      });

      setTasks(response.data.tasks);
      setTotal(response.data.total);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '加载任务列表失败'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, category]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  /**
   * 加载家长绑定的学员列表（供 AI 智能派单选择）
   */
  const loadChildren = useCallback(async () => {
    try {
      const response = await request.get('/parent/children');
      const list: Child[] = response.data.children || [];
      setChildren(list);
      if (list.length > 0 && !selectedStudentId) {
        setSelectedStudentId(list[0].id);
      }
    } catch (err: unknown) {
      // 列表加载失败不阻塞任务页，仅记录日志
      console.error('加载学员列表失败:', err);
    }
  }, [selectedStudentId]);

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
      const weak = basis?.weakPoints?.length
        ? `薄弱点：${basis.weakPoints.join('、')}`
        : '';
      setAssignMsg(
        `已为学员生成「${response.data?.task?.title || '今日巩固小练'}」，近3天错题 ${basis?.errorCount ?? 0} 道${weak ? '，' + weak : ''}`
      );
      // 刷新任务列表
      await loadTasks();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'AI 智能派单失败'));
    } finally {
      setAssigning(false);
    }
  };

  /**
   * 获取状态显示文本
   */
  const getStatusText = (status: string) => {
    const statusMap: { [key: string]: string } = {
      PENDING: '待开始',
      IN_PROGRESS: '进行中',
      COMPLETED: '已完成',
    };
    return statusMap[status] || status;
  };

  /**
   * 获取状态颜色
   */
  const getStatusColor = (status: string) => {
    const colorMap: { [key: string]: string } = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      IN_PROGRESS: 'bg-blue-100 text-blue-800',
      COMPLETED: 'bg-green-100 text-green-800',
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800';
  };

  /**
   * 获取模式显示文本
   */
  const getModeText = (mode: string) => {
    const modeMap: { [key: string]: string } = {
      PROFILE: '档案模式',
      CUSTOM: '自定义模式',
    };
    return modeMap[mode] || mode;
  };

  /**
   * 检查任务是否可以删除
   */
  const canDeleteTask = (task: Task) => {
    // 如果学员已被删除，允许删除任务
    const studentDeleted = !task.student || task.student.status === 'DELETED';
    if (studentDeleted) {
      return true;
    }
    
    // 如果学员未被删除，只有非进行中的任务可以删除
    return task.status !== 'IN_PROGRESS';
  };

  /**
   * 获取删除按钮的提示文本
   */
  const getDeleteTooltip = (task: Task) => {
    const studentDeleted = !task.student || task.student.status === 'DELETED';
    
    if (studentDeleted) {
      return '学员已删除，可以删除此任务';
    }
    
    if (task.status === 'IN_PROGRESS') {
      return '进行中的任务不能删除';
    }
    
    return '删除任务';
  };
  const handleDeleteClick = (task: Task) => {
    setTaskToDelete(task);
    setDeleteConfirmOpen(true);
  };

  /**
   * 关闭删除确认弹窗
   */
  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setTaskToDelete(null);
  };

  /**
   * 确认删除任务
   */
  const handleDeleteConfirm = async () => {
    if (!taskToDelete) return;

    try {
      setDeleting(true);
      setError('');

      await request.delete(`/parent/tasks/${taskToDelete.id}`);

      // 删除成功，重新加载任务列表
      await loadTasks();

      // 关闭弹窗
      setDeleteConfirmOpen(false);
      setTaskToDelete(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '删除任务失败'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading && tasks.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* 页面标题 */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">任务列表</h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">查看和管理学员的学习任务</p>
          </div>
          <button
            onClick={() => navigate('/parent/tasks/create')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            创建新任务
          </button>
        </div>

        {/* P3 双轨：任务大类 Tab */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => {
              setCategory('SUBJECT_MAIN');
              setPage(1);
            }}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
              category === 'SUBJECT_MAIN'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
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
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            专项攻克任务
          </button>
        </div>

        {/* AI 智能派单工具条 */}
        <div className="mb-6 flex flex-wrap items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">
            AI 一键巩固
          </span>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
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
          {assignMsg && (
            <span className="text-sm text-green-700 dark:text-green-300">{assignMsg}</span>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* 任务列表 */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700">
          {tasks.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                {category === 'SPECIAL' ? '还没有发布过专项攻克任务' : '还没有创建学科总任务'}
              </p>
              <button
                onClick={() => navigate('/parent/tasks/create')}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                创建第一个任务
              </button>
            </div>
          ) : (
            <>
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      任务标题
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      学员
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      学科 / 类型
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      创建时间
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                  {tasks.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{task.title}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-900 dark:text-white">
                          {task.student?.studentProfile?.realName || task.student?.username || '(学员已删除)'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {task.subject && (
                            <span className="mr-1.5 px-2 py-0.5 text-xs rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                              {task.subject}
                            </span>
                          )}
                          {task.category === 'SPECIAL' ? (
                            <span className="px-2 py-0.5 text-xs rounded bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                              {SPECIAL_TYPE_LABELS[task.specialType || ''] || '专项攻克'}
                            </span>
                          ) : (
                            getModeText(task.mode)
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                            task.status
                          )}`}
                        >
                          {getStatusText(task.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                        {new Date(task.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-3">
                          <button
                            onClick={() => navigate(`/parent/tasks/${task.id}`)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            查看详情
                          </button>
                          {canDeleteTask(task) ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('删除按钮被点击', task);
                                handleDeleteClick(task);
                              }}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 cursor-pointer"
                              title={getDeleteTooltip(task)}
                            >
                              删除
                            </button>
                          ) : (
                            <span 
                              className="text-gray-400 cursor-not-allowed" 
                              title={getDeleteTooltip(task)}
                            >
                              删除
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 分页 */}
              {total > limit && (
                <div className="px-6 py-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
                  <div className="text-sm text-slate-700 dark:text-slate-300">
                    显示 {(page - 1) * limit + 1} 到 {Math.min(page * limit, total)} 条，共 {total} 条
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page * limit >= total}
                      className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                    <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-[24px]">
                      warning
                    </span>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white">
                      确认删除任务
                    </h3>
                  </div>
                </div>

                <div className="mb-6">
                  <p className="text-slate-600 dark:text-slate-400 mb-2">
                    您确定要删除以下任务吗？此操作无法撤销。
                  </p>
                  <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                    <p className="text-sm text-slate-900 dark:text-white font-medium">
                      {taskToDelete.title}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      学员：{taskToDelete.student?.studentProfile?.realName || taskToDelete.student?.username || '(学员已删除)'}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      状态：{getStatusText(taskToDelete.status)}
                    </p>
                    {(!taskToDelete.student || taskToDelete.student.status === 'DELETED') && (
                      <p className="text-sm text-orange-600 dark:text-orange-400 mt-2">
                        ⚠️ 该任务的学员账户已被删除
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={handleDeleteCancel}
                    disabled={deleting}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleDeleteConfirm}
                    disabled={deleting}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
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
