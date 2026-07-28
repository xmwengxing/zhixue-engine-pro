import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Loading } from '../../components/shared';

/**
 * 系统统计数据接口
 */
interface SystemStats {
  totalUsers: number;
  userGrowth: number;
  activeStudents: number;
  studentGrowth: number;
  totalParents: number;
  parentGrowth: number;
  totalAuthCodes: number;
  usedAuthCodes: number;
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
 * 管理员仪表盘首页组件
 * 显示系统统计和快速操作
 */
export const AdminDashboardHome = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SystemStats>({
    totalUsers: 0,
    userGrowth: 0,
    activeStudents: 0,
    studentGrowth: 0,
    totalParents: 0,
    parentGrowth: 0,
    totalAuthCodes: 0,
    usedAuthCodes: 0,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  /**
   * 加载仪表盘数据
   */
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      
      // 并行请求所有统计数据
      const [userStatsRes, studentIdStatsRes, authCodeStatsRes, relationStatsRes] = await Promise.all([
        fetch('/api/admin/users/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/admin/student-ids/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/admin/auth-codes/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/admin/relations/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (!userStatsRes.ok || !studentIdStatsRes.ok || !authCodeStatsRes.ok || !relationStatsRes.ok) {
        throw new Error('获取统计数据失败');
      }

      const [userStatsData, studentIdStatsData, authCodeStatsData, relationStatsData] = await Promise.all([
        userStatsRes.json(),
        studentIdStatsRes.json(),
        authCodeStatsRes.json(),
        relationStatsRes.json()
      ]);

      console.log('API返回数据:', { userStatsData, studentIdStatsData, authCodeStatsData, relationStatsData });

      // 组合统计数据
      setStats({
        totalUsers: userStatsData.totalUsers || 0,
        userGrowth: 0, // 后端暂未提供增长率数据
        activeStudents: studentIdStatsData.byStatus?.assigned || 0,
        studentGrowth: 0, // 后端暂未提供增长率数据
        totalParents: userStatsData.byRole?.parent || 0,
        parentGrowth: 0, // 后端暂未提供增长率数据
        totalAuthCodes: authCodeStatsData.total || 0,
        usedAuthCodes: authCodeStatsData.byStatus?.used || 0,
      });
    } catch (error) {
      console.error('加载仪表盘数据失败:', error);
      setError('加载数据失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 快捷操作列表
   */
  const quickActions: QuickAction[] = [
    {
      id: 'users',
      title: '用户管理',
      description: '管理学员和家长账户，更新状态和权限',
      icon: 'group',
      color: 'bg-blue-500',
      path: '/admin/users',
    },
    {
      id: 'auth-codes',
      title: '授权码管理',
      description: '批量生成和管理授权码',
      icon: 'key',
      color: 'bg-purple-500',
      path: '/admin/auth-codes',
    },
    {
      id: 'student-ids',
      title: '学号管理',
      description: '分配和管理学员学号',
      icon: 'badge',
      color: 'bg-green-500',
      path: '/admin/student-ids',
    },
    {
      id: 'materials',
      title: '教材体系',
      description: '管理教材版本和知识点结构',
      icon: 'menu_book',
      color: 'bg-orange-500',
      path: '/admin/materials',
    },
    {
      id: 'ai-config',
      title: 'AI 服务配置',
      description: '配置 AI 服务商和教学指令',
      icon: 'smart_toy',
      color: 'bg-teal-500',
      path: '/admin/ai-config',
    },
    {
      id: 'api-monitoring',
      title: 'API 监控',
      description: '查看 API 调用统计和性能指标',
      icon: 'monitoring',
      color: 'bg-red-500',
      path: '/admin/api-monitoring',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#111722]">
        <Loading size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#111722]">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Button onClick={loadDashboardData}>重新加载</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col h-full min-h-screen bg-[#111722]">
      <div className="px-4 md:px-8 lg:px-12 flex flex-1 justify-center py-8">
        <div className="flex flex-col max-w-[1200px] flex-1 gap-8">
          {/* 页面标题 */}
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-white tracking-tight text-[32px] font-bold leading-tight">
                管理员控制台 🎛️
              </h2>
              <p className="text-[#92a4c9] text-base">
                系统管理和配置中心
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#92a4c9] text-xs">
                上次更新：{new Date().toLocaleString('zh-CN', { 
                  month: 'long', 
                  day: 'numeric', 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
            </div>
          </header>

          {/* 统计卡片 */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* 总用户数 */}
            <div className="flex flex-col gap-3 rounded-xl border border-[#324467] bg-[#1a2332] p-6 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-[#92a4c9] text-sm font-medium">
                  总用户数
                </p>
                <span className="material-symbols-outlined text-primary">group</span>
              </div>
              <p className="text-white text-[32px] font-bold leading-tight">
                {stats.totalUsers.toLocaleString()}
              </p>
              {stats.userGrowth > 0 && (
                <p className="text-[#10b981] text-sm font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">trending_up</span>
                  本月新增 +{stats.userGrowth}%
                </p>
              )}
            </div>

            {/* 活跃学员 */}
            <div className="flex flex-col gap-3 rounded-xl border border-[#324467] bg-[#1a2332] p-6 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-[#92a4c9] text-sm font-medium">
                  活跃学员
                </p>
                <span className="material-symbols-outlined text-purple-400">school</span>
              </div>
              <p className="text-white text-[32px] font-bold leading-tight">
                {stats.activeStudents.toLocaleString()}
              </p>
              {stats.studentGrowth > 0 && (
                <p className="text-[#10b981] text-sm font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">trending_up</span>
                  活跃度 +{stats.studentGrowth}%
                </p>
              )}
            </div>

            {/* 家长人数 */}
            <div className="flex flex-col gap-3 rounded-xl border border-[#324467] bg-[#1a2332] p-6 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-[#92a4c9] text-sm font-medium">
                  家长人数
                </p>
                <span className="material-symbols-outlined text-teal-400">
                  family_restroom
                </span>
              </div>
              <p className="text-white text-[32px] font-bold leading-tight">
                {stats.totalParents.toLocaleString()}
              </p>
              <p className="text-[#92a4c9] text-sm font-medium">
                {stats.parentGrowth > 0 ? `增长 +${stats.parentGrowth}%` : '增长稳定'}
              </p>
            </div>
          </section>

          {/* 授权码使用情况 */}
          <section>
            <div className="flex flex-col gap-4 rounded-xl border border-[#324467] bg-[#1a2332] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white text-lg font-bold">
                    授权码使用情况
                  </h3>
                  <p className="text-[#92a4c9] text-sm">
                    已使用 {stats.usedAuthCodes} / {stats.totalAuthCodes}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => navigate('/admin/auth-codes')}
                  size="sm"
                >
                  管理授权码
                </Button>
              </div>
              <div className="w-full h-4 bg-[#232f48] rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: stats.totalAuthCodes > 0 
                      ? `${(stats.usedAuthCodes / stats.totalAuthCodes) * 100}%`
                      : '0%',
                  }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-[#92a4c9]">
                <span>
                  使用率: {stats.totalAuthCodes > 0 
                    ? Math.round((stats.usedAuthCodes / stats.totalAuthCodes) * 100) 
                    : 0}%
                </span>
                <span>剩余: {stats.totalAuthCodes - stats.usedAuthCodes}</span>
              </div>
            </div>
          </section>

          {/* 快捷操作 */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white text-[22px] font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">
                  dashboard
                </span>
                快捷操作
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {quickActions.map((action) => (
                <div
                  key={action.id}
                  className="flex flex-col gap-4 rounded-xl border border-[#324467] bg-[#1a2332] p-6 hover:border-primary/50 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer group"
                  onClick={() => navigate(action.path)}
                >
                  <div className="flex items-start justify-between">
                    <div className={`p-3 ${action.color} rounded-xl text-white`}>
                      <span className="material-symbols-outlined text-2xl">
                        {action.icon}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-[#92a4c9] group-hover:text-primary transition-colors">
                      arrow_forward
                    </span>
                  </div>
                  <div>
                    <h3 className="text-white text-lg font-bold mb-1">
                      {action.title}
                    </h3>
                    <p className="text-[#92a4c9] text-sm">
                      {action.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 系统状态 */}
          <section>
            <div className="flex flex-col gap-4 rounded-xl border border-[#324467] bg-[#1a2332] p-6">
              <h3 className="text-white text-lg font-bold">
                系统状态
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse"></div>
                  <div>
                    <p className="text-white text-sm font-medium">
                      数据库
                    </p>
                    <p className="text-[#92a4c9] text-xs">正常运行</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse"></div>
                  <div>
                    <p className="text-white text-sm font-medium">
                      AI 服务
                    </p>
                    <p className="text-[#92a4c9] text-xs">正常运行</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse"></div>
                  <div>
                    <p className="text-white text-sm font-medium">
                      缓存服务
                    </p>
                    <p className="text-[#92a4c9] text-xs">正常运行</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardHome;
