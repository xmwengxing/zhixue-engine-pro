import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Progress, Badge, Empty, Loading } from '../../components/shared';
import { getCurrentTask, type Task } from '../../services/studentTrainingService';
import { getErrors } from '../../services/studentErrorService';

/**
 * 统计数据接口
 */
interface DashboardStats {
  averageScore: number;
  scoreChange: number;
  nextTraining: {
    subject: string;
    time: string;
  } | null;
  errorCount: number;
  errorChange: number;
  streakDays: number;
}

/**
 * 学员仪表盘首页组件
 * 显示进度看板、今日任务和错题汇总
 */
export const StudentDashboardHome = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    averageScore: 88,
    scoreChange: 2.4,
    nextTraining: {
      subject: '数学',
      time: '下午 4:00',
    },
    errorCount: 12,
    errorChange: -5,
    streakDays: 14,
  });
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  /**
   * 加载仪表盘数据
   */
  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // 获取当前任务
      const currentTask = await getCurrentTask();
      if (currentTask) {
        setTasks([currentTask]);
      }

      // 获取错题数量
      const errorsResponse = await getErrors({ page: 1, limit: 1 });
      // 添加安全检查，确保 errorsResponse 和 total 存在
      if (errorsResponse && typeof errorsResponse.total === 'number') {
        setStats((prev) => ({
          ...prev,
          errorCount: errorsResponse.total,
        }));
      }

      // TODO: 获取积分数据
      // const pointsData = await getPoints();
      // 暂时使用模拟数据
    } catch (error) {
      console.error('加载仪表盘数据失败:', error);
      // 即使出错也要设置默认值，避免页面崩溃
      setStats((prev) => ({
        ...prev,
        errorCount: 0,
      }));
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
   * 查看错题本
   */
  const handleViewErrors = () => {
    navigate('/student/errors');
  };

  /**
   * 获取任务截止状态
   */
  const getDeadlineStatus = (task: Task): { text: string; color: string } => {
    if (task.status === 'COMPLETED') {
      return { text: '已完成', color: 'bg-green-100 text-green-600 dark:bg-green-900/20' };
    }
    // 简化处理，实际应该根据截止时间判断
    return { text: '今天截止', color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/20' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loading size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto flex flex-col gap-8">
      {/* 页面标题 */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
            下午好！ 👋
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg">
            准备好开启今天的学习之旅了吗？
          </p>
        </div>
        <div className="flex items-center gap-4 bg-white dark:bg-card-dark px-4 py-2 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
              连续打卡
            </span>
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-orange-500 text-lg">
                local_fire_department
              </span>
              <span className="font-bold text-xl text-slate-900 dark:text-white font-display">
                {stats.streakDays} 天
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 统计卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 各科平均分 */}
        <Card className="p-6 flex flex-col justify-between h-40 group hover:border-primary/50 transition-colors">
          <div className="flex justify-between items-start">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-primary">
              <span className="material-symbols-outlined">monitoring</span>
            </div>
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold font-display ${
                stats.scoreChange >= 0
                  ? 'text-green-600 bg-green-100 dark:bg-green-900/20'
                  : 'text-red-600 bg-red-100 dark:bg-red-900/20'
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                {stats.scoreChange >= 0 ? 'trending_up' : 'trending_down'}
              </span>
              {Math.abs(stats.scoreChange)}%
            </div>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">
              各科平均分
            </p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white font-display">
              {stats.averageScore}分
            </h3>
          </div>
        </Card>

        {/* 训练时间表 */}
        <Card className="p-6 flex flex-col justify-between h-40 group hover:border-primary/50 transition-colors">
          <div className="flex justify-between items-start">
            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-purple-500">
              <span className="material-symbols-outlined">schedule</span>
            </div>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">
              训练时间表
            </p>
            {stats.nextTraining ? (
              <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats.nextTraining.subject}
                </h3>
                <span className="text-slate-500 dark:text-slate-400 font-medium text-sm">
                  {stats.nextTraining.time}
                </span>
              </div>
            ) : (
              <h3 className="text-xl font-medium text-slate-400">暂无安排</h3>
            )}
          </div>
        </Card>

        {/* 历史错题数 */}
        <Card
          className="p-6 flex flex-col justify-between h-40 group hover:border-primary/50 transition-colors cursor-pointer"
          onClick={handleViewErrors}
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-orange-500">
              <span className="material-symbols-outlined">assignment_late</span>
            </div>
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold font-display ${
                stats.errorChange <= 0
                  ? 'text-green-600 bg-green-100 dark:bg-green-900/20'
                  : 'text-orange-600 bg-orange-100 dark:bg-orange-900/20'
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                {stats.errorChange <= 0 ? 'trending_down' : 'trending_up'}
              </span>
              {Math.abs(stats.errorChange)}%
            </div>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">
              历史错题数
            </p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white font-display">
              {stats.errorCount}{' '}
              <span className="text-lg font-normal text-slate-400">待订正</span>
            </h3>
          </div>
        </Card>
      </section>

      {/* 任务中心 */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">
              assignment_turned_in
            </span>
            任务中心
          </h2>
          <Button
            variant="ghost"
            onClick={() => navigate('/student/profile')}
            className="text-sm font-medium"
          >
            查看全部任务
          </Button>
        </div>

        {tasks.length === 0 ? (
          <Empty description="暂无学习任务" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tasks.map((task) => {
              const deadline = getDeadlineStatus(task);
              const progress = task.status === 'IN_PROGRESS' ? 40 : 0;

              return (
                <Card
                  key={task.id}
                  className="rounded-xl overflow-hidden flex flex-col h-full hover:shadow-lg transition-all hover:-translate-y-1"
                >
                  {/* 任务封面 */}
                  <div className="h-40 bg-gradient-to-br from-blue-500 to-purple-600 relative">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                    <div className="absolute bottom-4 left-4">
                      <Badge className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded shadow-sm">
                        {task.title.includes('数学')
                          ? '数学'
                          : task.title.includes('英语')
                            ? '英语'
                            : '其他'}
                      </Badge>
                    </div>
                  </div>

                  {/* 任务内容 */}
                  <div className="p-5 flex flex-col flex-1 gap-4">
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                          {task.title}
                        </h3>
                        <Badge className={`text-xs font-medium ${deadline.color} px-2 py-1 rounded`}>
                          {deadline.text}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                        {task.config.questionCount} 道题目 · 难度 {task.config.difficulty}
                      </p>
                    </div>

                    {/* 进度条 */}
                    <div className="mt-auto flex flex-col gap-2">
                      <div className="flex justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                        <span>学习进度</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    {/* 操作按钮 */}
                    <Button
                      onClick={() => handleStartTraining(task.id)}
                      className="mt-2 w-full flex items-center justify-center gap-2 group"
                      disabled={task.status === 'COMPLETED'}
                    >
                      <span>
                        {task.status === 'COMPLETED' ? '已完成' : '进入训练舱'}
                      </span>
                      {task.status !== 'COMPLETED' && (
                        <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">
                          arrow_forward
                        </span>
                      )}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default StudentDashboardHome;
