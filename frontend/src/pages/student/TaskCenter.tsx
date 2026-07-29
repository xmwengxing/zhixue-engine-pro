import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge, Empty, Loading } from '../../components/shared';
import { getStudentTasks, type Task } from '../../services/studentTrainingService';

/** P3 双轨：专项类型中文标签 */
const SPECIAL_TYPE_LABELS: Record<string, string> = {
  UNIT: '单元专项',
  KNOWLEDGE_POINT: '知识点专项',
  ERROR_BOOK: '错题本专项',
};

/**
 * 任务中心页面（P3 双轨）
 * 学科总任务与专项攻克任务分区展示，互不混合
 */
export const TaskCenter = () => {
  const navigate = useNavigate();
  const [mainTasks, setMainTasks] = useState<Task[]>([]);
  const [specialTasks, setSpecialTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setLoading(true);
      // 双区并行加载：学科总任务 + 专项攻克任务
      const [mainRes, specialRes] = await Promise.all([
        getStudentTasks({ category: 'SUBJECT_MAIN', limit: 50 }),
        getStudentTasks({ category: 'SPECIAL', limit: 50 }),
      ]);
      setMainTasks(mainRes.tasks || []);
      setSpecialTasks(specialRes.tasks || []);
    } catch (error) {
      console.error('加载任务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 进入训练舱 / 电子答题专区（按任务模式分流）
   */
  const handleStartTraining = (taskId: string, mode?: string) => {
    if (mode === 'EXAM_PAPER') {
      navigate(`/student/answer-zone/${taskId}`);
    } else {
      navigate(`/student/training/${taskId}`);
    }
  };

  /**
   * 获取任务状态显示
   */
  const getTaskStatus = (task: Task): { text: string; color: string } => {
    switch (task.status) {
      case 'COMPLETED':
        return { text: '已完成', color: 'bg-green-100 text-green-600 dark:bg-green-900/20' };
      case 'IN_PROGRESS':
        return { text: '进行中', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20' };
      case 'PENDING':
        return { text: '待开始', color: 'bg-gray-100 text-gray-600 dark:bg-gray-900/20' };
      default:
        return { text: '未知', color: 'bg-gray-100 text-gray-600 dark:bg-gray-900/20' };
    }
  };

  /**
   * 格式化时间
   */
  const formatTime = (time: string) => {
    const date = new Date(time);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * 渲染单个任务卡片（两个分区共用）
   */
  const renderTaskCard = (task: Task, isSpecial: boolean) => {
    const taskStatus = getTaskStatus(task);
    return (
      <Card key={task.id} className="p-6 hover:shadow-lg transition-shadow">
        <div className="flex flex-col h-full">
          {/* 任务标题和状态 */}
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex-1">
              {task.title}
            </h3>
            <Badge className={`ml-2 ${taskStatus.color}`}>{taskStatus.text}</Badge>
          </div>

          {/* 学科 / 类型标签 */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {task.subject && (
              <span className="px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {task.subject}
              </span>
            )}
            {isSpecial ? (
              <span className="px-2 py-0.5 text-xs rounded bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                {SPECIAL_TYPE_LABELS[task.specialType || ''] || '专项攻克'}
              </span>
            ) : (
              <span className="px-2 py-0.5 text-xs rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                学科总任务
              </span>
            )}
          </div>

          {/* 任务信息 */}
          <div className="space-y-2 mb-4 flex-1">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span className="material-symbols-outlined text-[18px]">quiz</span>
              <span>题目数量: {task.config?.questionCount ?? '-'} 题</span>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span className="material-symbols-outlined text-[18px]">schedule</span>
              <span>创建时间: {formatTime(task.createdAt)}</span>
            </div>

            {task.creator && (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span className="material-symbols-outlined text-[18px]">person</span>
                <span>创建者: {task.creator.username}</span>
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="mt-auto">
            {task.status === 'COMPLETED' ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleStartTraining(task.id, task.mode)}
              >
                查看详情
              </Button>
            ) : (
              <Button
                variant="primary"
                className="w-full"
                onClick={() => handleStartTraining(task.id, task.mode)}
              >
                {task.mode === 'EXAM_PAPER'
                  ? '去答题'
                  : task.status === 'IN_PROGRESS'
                  ? '继续训练'
                  : '开始训练'}
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loading size="lg" />
      </div>
    );
  }

  const allTasks = [...mainTasks, ...specialTasks];

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-primary text-3xl">
            assignment_turned_in
          </span>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">
            任务中心
          </h1>
        </div>
        <p className="text-slate-600 dark:text-slate-400">
          查看和管理你的学习任务
        </p>
      </div>

      {/* 任务统计 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-1">
                进行中
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {allTasks.filter(t => t.status === 'IN_PROGRESS').length}
              </p>
            </div>
            <div className="bg-blue-100 dark:bg-blue-900/20 rounded-full p-3">
              <span className="material-symbols-outlined text-blue-600 text-2xl">
                pending_actions
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-1">
                已完成
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {allTasks.filter(t => t.status === 'COMPLETED').length}
              </p>
            </div>
            <div className="bg-green-100 dark:bg-green-900/20 rounded-full p-3">
              <span className="material-symbols-outlined text-green-600 text-2xl">
                check_circle
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-1">
                总任务数
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {allTasks.length}
              </p>
            </div>
            <div className="bg-purple-100 dark:bg-purple-900/20 rounded-full p-3">
              <span className="material-symbols-outlined text-purple-600 text-2xl">
                assignment
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* 学科总任务区 */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-emerald-600 text-2xl">school</span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">学科总任务</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            （长期主线，计入学情分析）
          </span>
        </div>

        {mainTasks.length === 0 ? (
          <Empty description="暂无学科总任务" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mainTasks.map((task) => renderTaskCard(task, false))}
          </div>
        )}
      </div>

      {/* 专项攻克任务区 */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-purple-600 text-2xl">target</span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">专项攻克任务</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            （单元 / 知识点 / 错题本短期专项）
          </span>
        </div>

        {specialTasks.length === 0 ? (
          <Empty description="暂无专项攻克任务" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {specialTasks.map((task) => renderTaskCard(task, true))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskCenter;
