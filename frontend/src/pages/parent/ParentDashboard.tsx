import React from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import ParentDashboardHome from './ParentDashboardHome';
import ChildManagement from './ChildManagement';
import StudentOverview from './StudentOverview';
import TaskList from './TaskList';
import TaskDetail from './TaskDetail';
import TaskConfigCenter from './TaskConfigCenter';
import TaskReportCenter from './TaskReportCenter';
import ReportDetail from './ReportDetail';
import WishApprovalList from './WishApprovalList';
import ParentProfileCenter from './ParentProfileCenter';
import SubjectLearningState from './SubjectLearningState';

/** 家长端导航项（PC 侧边栏与移动抽屉共用，避免两处菜单不一致） */
const NAV_ITEMS: Array<{ to: string; icon: string; label: string; exact?: boolean }> = [
  { to: '/parent', icon: 'home', label: '首页', exact: true },
  { to: '/parent/overview', icon: 'monitoring', label: '学情概览' },
  { to: '/parent/learning-state', icon: 'menu_book', label: '学科档案' },
  { to: '/parent/children', icon: 'family_restroom', label: '亲子管理' },
  { to: '/parent/tasks', icon: 'assignment', label: '任务管理' },
  { to: '/parent/reports', icon: 'description', label: '学习报告' },
  { to: '/parent/wishes', icon: 'card_giftcard', label: '愿望审批' },
  { to: '/parent/profile', icon: 'account_circle', label: '个人中心' },
];

/**
 * 家长仪表盘页面（布局外壳 + 子路由）
 */
export const ParentDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
      active ? 'bg-primary text-white' : 'text-[#92a4c9] hover:bg-[#1a2332] hover:text-white'
    }`;

  const renderNav = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-2">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={navLinkClass(isActive(item.to, item.exact))}
        >
          <span className="material-symbols-outlined text-[24px]">{item.icon}</span>
          <span className="text-sm font-medium leading-normal">{item.label}</span>
        </Link>
      ))}
    </nav>
  );

  const renderBrand = () => (
    <div className="flex items-center gap-3 px-2">
      <div className="bg-primary rounded-full size-10 flex items-center justify-center">
        <span className="text-white font-bold text-lg">E</span>
      </div>
      <div className="flex flex-col">
        <h1 className="text-white text-base font-bold leading-normal">EduSmart</h1>
        <p className="text-[#92a4c9] text-xs font-normal leading-normal">家长中心</p>
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-screen w-full flex-row overflow-hidden bg-[#111722]">
      {/* 侧边栏 */}
      <aside className="hidden w-72 flex-col border-r border-[#324467] bg-[#1a2332] lg:flex">
        <div className="flex h-full flex-col justify-between p-4">
          <div className="flex flex-col gap-8">
            {renderBrand()}
            {renderNav()}
          </div>

          {/* 退出登录 */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#92a4c9] hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              <span className="text-sm font-medium leading-normal">退出登录</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex flex-1 flex-col h-full min-h-screen relative overflow-y-auto bg-[#111722]">
        {/* 移动端顶部栏 */}
        <div className="flex lg:hidden items-center justify-between p-4 border-b border-[#324467] bg-[#1a2332]">
          <span className="text-white font-bold text-lg">EduSmart</span>
          <button className="text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>

        {/* 移动端菜单抽屉 */}
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/60 z-40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />

            <div className="fixed top-0 right-0 bottom-0 w-72 bg-[#1a2332] z-50 lg:hidden overflow-y-auto border-l border-[#324467]">
              <div className="flex h-full flex-col justify-between p-4">
                <div className="flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    {renderBrand()}
                    <button className="text-white" onClick={() => setMobileMenuOpen(false)}>
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>

                  {renderNav(() => setMobileMenuOpen(false))}
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#92a4c9] hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">logout</span>
                    <span className="text-sm font-medium leading-normal">退出登录</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 路由内容 */}
        <Routes>
          <Route path="/" element={<ParentDashboardHome />} />
          <Route path="/overview" element={<StudentOverview />} />
          <Route path="/children" element={<ChildManagement />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/tasks/create" element={<TaskConfigCenter />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/reports" element={<TaskReportCenter />} />
          <Route path="/reports/:id" element={<ReportDetail />} />
          <Route path="/learning-state" element={<SubjectLearningState />} />
          <Route path="/wishes" element={<WishApprovalList />} />
          <Route path="/profile" element={<ParentProfileCenter />} />
          <Route
            path="*"
            element={
              <div className="p-8">
                <h1 className="text-2xl font-bold text-white">页面未找到</h1>
                <p className="mt-2 text-[#92a4c9]">请从左侧导航重新进入功能页面。</p>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
};
