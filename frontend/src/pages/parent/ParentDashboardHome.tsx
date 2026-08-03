import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty, Loading } from '../../components/shared';
import request from '../../utils/request';

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
 * 首页统计数据（对应后端 GET /parent/dashboard/stats）
 */
interface QuickStats {
  totalChildren: number;
  pendingTasks: number;
  notStartedTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  pendingWishes: number;
  recentReports: number;
  totalReports: number;
}

const EMPTY_STATS: QuickStats = {
  totalChildren: 0,
  pendingTasks: 0,
  notStartedTasks: 0,
  inProgressTasks: 0,
  completedTasks: 0,
  pendingWishes: 0,
  recentReports: 0,
  totalReports: 0,
};

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
 * 显示快速导航和数据概览（统计数据来自后端真实接口）
 */
export const ParentDashboardHome = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<Child[]>([]);
  const [stats, setStats] = useState<QuickStats>(EMPTY_STATS);

  useEffect(() => {
    loadDashboardData();
  }, []);

  /**
   * 加载仪表盘数据：子女列表 + 首页统计
   */
  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const [childrenRes, statsRes] = await Promise.allSettled([
        request.get<{ success: boolean; data: { children: any[] } }>('/parent/children'),
        request.get<{ success: boolean; data: QuickStats }>('/parent/dashboard/stats'),
      ]);

      if (childrenRes.status === 'fulfilled') {
        const childrenData = (childrenRes.value as any)?.data?.children || [];
        setChildren(
          childrenData.map((child: any) => ({
            id: child.student.id,
            name: child.student.profile?.realName || child.student.username,
            grade: child.student.profile?.grade || '未设置',
          }))
        );
      } else {
        setChildren([]);
      }

      if (statsRes.status === 'fulfilled') {
        setStats({ ...EMPTY_STATS, ...((statsRes.value as any)?.data || {}) });
      } else {
        setStats(EMPTY_STATS);
      }
    } catch (error) {
      console.error('加载仪表盘数据失败:', error);
      setChildren([]);
      setStats(EMPTY_STATS);
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

  /** 统计卡片配置 */
  const statCards = [
    {
      key: 'children',
      label: '管理子女',
      value: stats.totalChildren,
      icon: 'family_restroom',
      iconClass: 'bg-blue-500/15 text-blue-400',
      hint: stats.totalChildren > 0 ? '已绑定学员' : '尚未绑定学员',
      path: '/parent/children',
    },
    {
      key: 'tasks',
      label: '待完成任务',
      value: stats.pendingTasks,
      icon: 'assignment',
      iconClass: 'bg-purple-500/15 text-purple-400',
      hint: `未开始 ${stats.notStartedTasks} · 进行中 ${stats.inProgressTasks}`,
      path: '/parent/tasks',
    },
    {
      key: 'wishes',
      label: '待审批愿望',
      value: stats.pendingWishes,
      icon: 'card_giftcard',
      iconClass: 'bg-orange-500/15 text-orange-400',
      hint: stats.pendingWishes > 0 ? '需要你的处理' : '暂无待办',
      path: '/parent/wishes',
    },
    {
      key: 'reports',
      label: '近 7 天报告',
      value: stats.recentReports,
      icon: 'description',
      iconClass: 'bg-green-500/15 text-green-400',
      hint: `累计 ${stats.totalReports} 份`,
      path: '/parent/reports',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#111722]">
        <Loading size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto flex flex-col gap-8">
      {/* 页面标题 */}
      <header className="flex flex-col gap-2">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
          家长中心
        </h2>
        <p className="text-[#92a4c9] text-lg">管理子女学习，陪伴成长每一步</p>
      </header>

      {/* 统计卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <div
            key={card.key}
            onClick={() => navigate(card.path)}
            className="cursor-pointer rounded-xl border border-[#324467] bg-[#232f48] p-6 flex flex-col justify-between h-36 hover:border-primary/60 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div className={`p-2 rounded-lg ${card.iconClass}`}>
                <span className="material-symbols-outlined">{card.icon}</span>
              </div>
              {card.value > 0 && (
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#1a2332] text-[#92a4c9]">
                  {card.value}
                </span>
              )}
            </div>
            <div>
              <p className="text-[#92a4c9] text-sm font-medium mb-1">{card.label}</p>
              <h3 className="text-3xl font-bold text-white leading-none">{card.value}</h3>
              <p className="text-[#5b6b8c] text-xs mt-1">{card.hint}</p>
            </div>
          </div>
        ))}
      </section>

      {/* 子女列表 */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">family_restroom</span>
            我的子女
          </h2>
          <button
            onClick={() => navigate('/parent/children')}
            className="text-sm font-medium text-[#92a4c9] hover:text-white transition-colors"
          >
            管理子女
          </button>
        </div>

        {children.length === 0 ? (
          <div className="rounded-xl border border-[#324467] bg-[#232f48] p-10">
            <Empty description="暂无子女信息，请先绑定子女账户" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {children.map((child) => (
              <div
                key={child.id}
                className="rounded-xl border border-[#324467] bg-[#232f48] p-6 flex items-center gap-4 hover:border-primary/60 transition-all hover:-translate-y-1 cursor-pointer"
                onClick={() => navigate('/parent/overview')}
              >
                <div className="size-16 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                  {child.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-white truncate">{child.name}</h3>
                  <p className="text-sm text-[#92a4c9]">{child.grade}</p>
                </div>
                <span className="material-symbols-outlined text-[#5b6b8c]">chevron_right</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 快捷操作 */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">dashboard</span>
            快捷操作
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {quickActions.map((action) => (
            <div
              key={action.id}
              className="rounded-xl border border-[#324467] bg-[#232f48] p-6 flex flex-col gap-4 hover:border-primary/60 transition-all hover:-translate-y-1 cursor-pointer group"
              onClick={() => navigate(action.path)}
            >
              <div className="flex items-start justify-between">
                <div className={`p-3 ${action.color} rounded-xl text-white`}>
                  <span className="material-symbols-outlined text-2xl">{action.icon}</span>
                </div>
                <span className="material-symbols-outlined text-[#5b6b8c] group-hover:text-primary transition-colors">
                  arrow_forward
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">{action.title}</h3>
                <p className="text-sm text-[#92a4c9]">{action.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ParentDashboardHome;
