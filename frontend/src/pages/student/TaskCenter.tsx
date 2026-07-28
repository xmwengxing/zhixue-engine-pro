import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge, Empty, Loading } from '../../components/shared';
import { getCurrentTask, type Task } from '../../services/studentTrainingService';

/**
 * 任务中心页面
 * 显示学员的所有学习任务
 */
export const TaskCenter = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setLoading(true);
      // 获取当前任务
      const currentTask = await getCurrentTask();
      if (currentTask) {
        setTasks([currentTask]);
      }
    } catch (error) {
      console.error('加载任务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 进入训练舱
   */
  const handleStartTraining = (taskId: string) => {
    navigate(`/student/training/${taskId}`);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loading size="lg" />
      </div>
    );
  }

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
                {tasks.filter(t => t.status === 'IN_PROGRESS').length}
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
                {tasks.filter(t => t.status === 'COMPLETED').length}
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
                {tasks.length}
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

      {/* 任务列表 */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
          我的任务
        </h2>

        {tasks.length === 0 ? (
          <Empty description="暂无学习任务" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tasks.map((task) => {
              const taskStatus = getTaskStatus(task);
              return (
                <Card key={task.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex flex-col h-full">
                    {/* 任务标题和状态 */}
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex-1">
                        {task.title}
                      </h3>
                      <Badge className={`ml-2 ${taskStatus.color}`}>
                        {taskStatus.text}
                      </Badge>
                    </div>

                    {/* 任务信息 */}
                    <div className="space-y-2 mb-4 flex-1">
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <span className="material-symbols-outlined text-[18px]">
                          category
                        </span>
                        <span>模式: {task.mode === 'PROFILE' ? '档案模式' : '自定义模式'}</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <span className="material-symbols-outlined text-[18px]">
                          quiz
                        </span>
                        <span>题目数量: {task.config.questionCount} 题</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <span className="material-symbols-outlined text-[18px]">
                          speed
                        </span>
                        <span>难度: {task.config.difficulty}/5</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <span className="material-symbols-outlined text-[18px]">
                          schedule
                        </span>
                        <span>创建时间: {formatTime(task.createdAt)}</span>
                      </div>

                      {task.creator && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <span className="material-symbols-outlined text-[18px]">
                            person
                          </span>
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
                          onClick={() => handleStartTraining(task.id)}
                        >
                          查看详情
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          className="w-full"
                          onClick={() => handleStartTraining(task.id)}
                        >
                          {task.status === 'IN_PROGRESS' ? '继续训练' : '开始训练'}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskCenter;
