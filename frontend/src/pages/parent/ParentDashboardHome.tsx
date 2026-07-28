import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge, Empty, Loading } from '../../components/shared';

/**
 * 子女信息接口
 */
interface Child {
  id: string;
  name: string;
  grade: string;
  avatar?: string;
}

/**
 * 快速统计数据接口
 */
interface QuickStats {
  totalChildren: number;
  pendingTasks: number;
  pendingWishes: number;
  recentReports: number;
}

/**
 * 快捷操作接口
 */
interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  path: string;
}

/**
 * 家长仪表盘首页组件
 * 显示快速导航和数据概览
 */
export const ParentDashboardHome = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<Child[]>([]);
  const [stats, setStats] = useState<QuickStats>({
    totalChildren: 0,
    pendingTasks: 0,
    pendingWishes: 0,
    recentReports: 0,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  /**
   * 加载仪表盘数据
   */
  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // 调用实际 API 获取子女列表
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/parent/children`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('获取子女列表失败');
      }

      const data = await response.json();
      const childrenData = data.data?.children || [];

      // 转换数据格式
      const formattedChildren = childrenData.map((child: any) => ({
        id: child.student.id,
        name: child.student.profile?.realName || child.student.username,
        grade: child.student.profile?.grade || '未设置',
      }));

      setChildren(formattedChildren);

      // 设置统计数据
      setStats({
        totalChildren: formattedChildren.length,
        pendingTasks: 0, // TODO: 从实际API获取
        pendingWishes: 0, // TODO: 从实际API获取
        recentReports: 0, // TODO: 从实际API获取
      });
    } catch (error) {
      console.error('加载仪表盘数据失败:', error);
      // 出错时设置为空数据
      setChildren([]);
      setStats({
        totalChildren: 0,
        pendingTasks: 0,
        pendingWishes: 0,
        recentReports: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * 快捷操作列表
   */
  const quickActions: QuickAction[] = [
    {
      id: 'overview',
      title: '学情概览',
      description: '查看子女的学习进度和成绩分析',
      icon: 'monitoring',
      color: 'bg-blue-500',
      path: '/parent/overview',
    },
    {
      id: 'tasks',
      title: '任务配置',
      description: '为子女创建和管理学习任务',
      icon: 'assignment',
      color: 'bg-purple-500',
      path: '/parent/tasks/create',
    },
    {
      id: 'reports',
      title: '学习报告',
      description: '查看 AI 生成的学习分析报告',
      icon: 'description',
      color: 'bg-green-500',
      path: '/parent/reports',
    },
    {
      id: 'wishes',
      title: '愿望审批',
      description: '审批子女提交的愿望申请',
      icon: 'card_giftcard',
      color: 'bg-orange-500',
      path: '/parent/wishes',
    },
    {
      id: 'children',
      title: '亲子管理',
      description: '管理子女账户和绑定关系',
      icon: 'family_restroom',
      color: 'bg-teal-500',
      path: '/parent/children',
    },
  ];

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
      <header className="flex flex-col gap-2">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
          家长中心 👨‍👩‍👧‍👦
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-lg">
          管理子女学习，陪伴成长每一步
        </p>
      </header>

      {/* 统计卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 子女数量 */}
        <Card className="p-6 flex flex-col justify-between h-32 hover:border-primary/50 transition-colors">
          <div className="flex justify-between items-start">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-primary">
              <span className="material-symbols-outlined">family_restroom</span>
            </div>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">
              管理子女
            </p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white font-display">
              {stats.totalChildren}
            </h3>
          </div>
        </Card>

        {/* 待完成任务 */}
        <Card className="p-6 flex flex-col justify-between h-32 hover:border-primary/50 transition-colors">
          <div className="flex justify-between items-start">
            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-purple-500">
              <span className="material-symbols-outlined">assignment</span>
            </div>
            {stats.pendingTasks > 0 && (
              <Badge className="bg-purple-100 text-purple-600 dark:bg-purple-900/20 text-xs font-bold px-2 py-1 rounded-full">
                {stats.pendingTasks}
              </Badge>
            )}
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">
              待完成任务
            </p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white font-display">
              {stats.pendingTasks}
            </h3>
          </div>
        </Card>

        {/* 待审批愿望 */}
        <Card className="p-6 flex flex-col justify-between h-32 hover:border-primary/50 transition-colors">
          <div className="flex justify-between items-start">
            <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-orange-500">
              <span className="material-symbols-outlined">card_giftcard</span>
            </div>
            {stats.pendingWishes > 0 && (
              <Badge className="bg-orange-100 text-orange-600 dark:bg-orange-900/20 text-xs font-bold px-2 py-1 rounded-full">
                {stats.pendingWishes}
              </Badge>
            )}
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">
              待审批愿望
            </p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white font-display">
              {stats.pendingWishes}
            </h3>
          </div>
        </Card>

        {/* 最近报告 */}
        <Card className="p-6 flex flex-col justify-between h-32 hover:border-primary/50 transition-colors">
          <div className="flex justify-between items-start">
            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-500">
              <span className="material-symbols-outlined">description</span>
            </div>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">
              最近报告
            </p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white font-display">
              {stats.recentReports}
            </h3>
          </div>
        </Card>
      </section>

      {/* 子女列表 */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">
              family_restroom
            </span>
            我的子女
          </h2>
          <Button
            variant="ghost"
            onClick={() => navigate('/parent/children')}
            className="text-sm font-medium"
          >
            管理子女
          </Button>
        </div>

        {children.length === 0 ? (
          <Empty description="暂无子女信息，请先绑定子女账户" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {children.map((child) => (
              <Card
                key={child.id}
                className="p-6 flex items-center gap-4 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer"
                onClick={() => navigate('/parent/overview')}
              >
                <div className="size-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                  {child.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {child.name}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {child.grade}
                  </p>
                </div>
                <span className="material-symbols-outlined text-slate-400">
                  chevron_right
                </span>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 快捷操作 */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">
              dashboard
            </span>
            快捷操作
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {quickActions.map((action) => (
            <Card
              key={action.id}
              className="p-6 flex flex-col gap-4 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer group"
              onClick={() => navigate(action.path)}
            >
              <div className="flex items-start justify-between">
                <div className={`p-3 ${action.color} rounded-xl text-white`}>
                  <span className="material-symbols-outlined text-2xl">
                    {action.icon}
                  </span>
                </div>
                <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors">
                  arrow_forward
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                  {action.title}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {action.description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ParentDashboardHome;
