import React from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import ParentDashboardHome from './ParentDashboardHome';
import ChildManagement from './ChildManagement';
import StudentOverview from './StudentOverview';
import TaskList from './TaskList';
import TaskConfigCenter from './TaskConfigCenter';
import TaskReportCenter from './TaskReportCenter';
import ReportDetail from './ReportDetail';
import WishApprovalList from './WishApprovalList';
import ParentProfileCenter from './ParentProfileCenter';
import SubjectLearningState from './SubjectLearningState';

/**
 * 家长仪表盘页面
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

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="relative flex min-h-screen w-full flex-row overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* 侧边栏 */}
      <aside className="hidden w-72 flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 lg:flex">
        <div className="flex h-full flex-col justify-between p-4">
          <div className="flex flex-col gap-8">
            {/* Logo */}
            <div className="flex items-center gap-3 px-2">
              <div className="bg-primary rounded-full size-10 flex items-center justify-center">
                <span className="text-white font-bold text-lg">E</span>
              </div>
              <div className="flex flex-col">
                <h1 className="text-slate-900 dark:text-white text-base font-bold leading-normal">EduSmart</h1>
                <p className="text-slate-500 dark:text-slate-400 text-xs font-normal leading-normal">家长中心</p>
              </div>
            </div>

            {/* 导航菜单 */}
            <nav className="flex flex-col gap-2">
              <Link
                to="/parent"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  location.pathname === '/parent'
                    ? 'bg-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">home</span>
                <span className="text-sm font-medium leading-normal">首页</span>
              </Link>

              <Link
                to="/parent/overview"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/parent/overview')
                    ? 'bg-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">monitoring</span>
                <span className="text-sm font-medium leading-normal">学情概览</span>
              </Link>

              <Link
                to="/parent/learning-state"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/parent/learning-state')
                    ? 'bg-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">menu_book</span>
                <span className="text-sm font-medium leading-normal">学科档案</span>
              </Link>

              <Link
                to="/parent/children"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/parent/children')
                    ? 'bg-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">family_restroom</span>
                <span className="text-sm font-medium leading-normal">亲子管理</span>
              </Link>

              <Link
                to="/parent/tasks"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/parent/tasks')
                    ? 'bg-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">assignment</span>
                <span className="text-sm font-medium leading-normal">任务管理</span>
              </Link>

              <Link
                to="/parent/reports"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/parent/reports')
                    ? 'bg-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">description</span>
                <span className="text-sm font-medium leading-normal">学习报告</span>
              </Link>

              <Link
                to="/parent/wishes"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/parent/wishes')
                    ? 'bg-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">card_giftcard</span>
                <span className="text-sm font-medium leading-normal">愿望审批</span>
              </Link>

              <Link
                to="/parent/profile"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/parent/profile')
                    ? 'bg-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">account_circle</span>
                <span className="text-sm font-medium leading-normal">个人中心</span>
              </Link>
            </nav>
          </div>

          {/* 退出登录 */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              <span className="text-sm font-medium leading-normal">退出登录</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex flex-1 flex-col h-full min-h-screen relative overflow-y-auto bg-slate-50 dark:bg-slate-900">
        {/* 移动端顶部栏 */}
        <div className="flex lg:hidden items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <span className="text-slate-900 dark:text-white font-bold text-lg">EduSmart</span>
          <button 
            className="text-slate-900 dark:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>

        {/* 移动端菜单抽屉 */}
        {mobileMenuOpen && (
          <>
            {/* 遮罩层 */}
            <div 
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            
            {/* 菜单内容 */}
            <div className="fixed top-0 right-0 bottom-0 w-72 bg-white dark:bg-slate-800 z-50 lg:hidden overflow-y-auto border-l border-slate-200 dark:border-slate-700">
              <div className="flex h-full flex-col justify-between p-4">
                <div className="flex flex-col gap-8">
                  {/* Logo */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 px-2">
                      <div className="bg-primary rounded-full size-10 flex items-center justify-center">
                        <span className="text-white font-bold text-lg">E</span>
                      </div>
                      <div className="flex flex-col">
                        <h1 className="text-slate-900 dark:text-white text-base font-bold leading-normal">EduSmart</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-normal leading-normal">家长中心</p>
                      </div>
                    </div>
                    <button 
                      className="text-slate-900 dark:text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>

                  {/* 导航菜单 */}
                  <nav className="flex flex-col gap-2">
                    <Link
                      to="/parent"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        location.pathname === '/parent'
                          ? 'bg-primary text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">home</span>
                      <span className="text-sm font-medium leading-normal">首页</span>
                    </Link>

                    <Link
                      to="/parent/overview"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/parent/overview')
                          ? 'bg-primary text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">monitoring</span>
                      <span className="text-sm font-medium leading-normal">学情概览</span>
                    </Link>

                    <Link
                      to="/parent/children"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/parent/children')
                          ? 'bg-primary text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">family_restroom</span>
                      <span className="text-sm font-medium leading-normal">亲子管理</span>
                    </Link>

                    <Link
                      to="/parent/tasks"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/parent/tasks')
                          ? 'bg-primary text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">assignment</span>
                      <span className="text-sm font-medium leading-normal">任务管理</span>
                    </Link>

                    <Link
                      to="/parent/reports"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/parent/reports')
                          ? 'bg-primary text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">description</span>
                      <span className="text-sm font-medium leading-normal">学习报告</span>
                    </Link>

                    <Link
                      to="/parent/wishes"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/parent/wishes')
                          ? 'bg-primary text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">card_giftcard</span>
                      <span className="text-sm font-medium leading-normal">愿望审批</span>
                    </Link>

                    <Link
                      to="/parent/profile"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/parent/profile')
                          ? 'bg-primary text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">account_circle</span>
                      <span className="text-sm font-medium leading-normal">个人中心</span>
                    </Link>
                  </nav>
                </div>

                {/* 退出登录 */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
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
          <Route path="/reports" element={<TaskReportCenter />} />
          <Route path="/reports/:id" element={<ReportDetail />} />
          <Route path="/learning-state" element={<SubjectLearningState />} />
          <Route path="/wishes" element={<WishApprovalList />} />
          <Route path="/profile" element={<ParentProfileCenter />} />
          <Route path="*" element={<div className="p-6"><h1 className="text-2xl font-bold text-slate-900 dark:text-white">页面未找到</h1></div>} />
        </Routes>
      </main>
    </div>
  );
};
