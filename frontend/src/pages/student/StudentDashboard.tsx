import React, { lazy, Suspense } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { LoadingFallback } from '../../components/LoadingFallback';

// 子页面懒加载（Code Splitting，降低首屏体积）
const StudentDashboardHome = lazy(() => import('./StudentDashboardHome'));
const ProfileManagement = lazy(() => import('./ProfileManagement'));
const SelfAssessment = lazy(() => import('../../components/student/SelfAssessment'));
const TrainingCabin = lazy(() => import('./TrainingCabin'));
const ErrorBook = lazy(() => import('./ErrorBook'));
const ErrorRetry = lazy(() => import('./ErrorRetry'));
const PointsWishMall = lazy(() => import('./PointsWishMall'));
const TaskCenter = lazy(() => import('./TaskCenter'));
const AnswerZone = lazy(() => import('./AnswerZone'));
const SubjectLearningState = lazy(() => import('./SubjectLearningState'));

/**
 * 学员仪表盘页面
 */
export const StudentDashboard = () => {
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
    <div className="relative flex min-h-screen w-full flex-row overflow-hidden bg-[#111722]">
      {/* 侧边栏 */}
      <aside className="hidden w-72 flex-col border-r border-[#324467] bg-[#232f48] lg:flex">
        <div className="flex h-full flex-col justify-between p-4">
          <div className="flex flex-col gap-8">
            {/* Logo */}
            <div className="flex items-center gap-3 px-2">
              <div className="bg-primary rounded-full size-10 flex items-center justify-center">
                <span className="text-white font-bold text-lg">E</span>
              </div>
              <div className="flex flex-col">
                <h1 className="text-white text-base font-bold leading-normal">EduSmart</h1>
                <p className="text-[#5b6b8c] text-xs font-normal leading-normal">学员中心</p>
              </div>
            </div>

            {/* 导航菜单 */}
            <nav className="flex flex-col gap-2">
              <Link
                to="/student"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  location.pathname === '/student'
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#1a2332]'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">dashboard</span>
                <span className="text-sm font-medium leading-normal">学员仪表盘</span>
              </Link>

              <Link
                to="/student/profile"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/student/profile')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#1a2332]'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">person</span>
                <span className="text-sm font-medium leading-normal">个人档案</span>
              </Link>

              <Link
                to="/student/self-assessment"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/student/self-assessment')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#1a2332]'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">psychology</span>
                <span className="text-sm font-medium leading-normal">自我评估</span>
              </Link>

              <Link
                to="/student/tasks"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/student/tasks')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#1a2332]'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">assignment_turned_in</span>
                <span className="text-sm font-medium leading-normal">任务中心</span>
              </Link>

              <Link
                to="/student/errors"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/student/errors')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#1a2332]'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">assignment_late</span>
                <span className="text-sm font-medium leading-normal">错题本</span>
              </Link>

              <Link
                to="/student/learning-state"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/student/learning-state')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#1a2332]'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">menu_book</span>
                <span className="text-sm font-medium leading-normal">学科档案</span>
              </Link>

              <Link
                to="/student/points-wish"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/student/points-wish')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#1a2332]'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">redeem</span>
                <span className="text-sm font-medium leading-normal">积分商城</span>
              </Link>
            </nav>
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
        <div className="flex lg:hidden items-center justify-between p-4 border-b border-[#324467] bg-[#232f48]">
          <span className="text-white font-bold text-lg">EduSmart</span>
          <button 
            className="text-white"
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
            <div className="fixed top-0 right-0 bottom-0 w-72 bg-[#232f48] z-50 lg:hidden overflow-y-auto border-l border-[#324467]">
              <div className="flex h-full flex-col justify-between p-4">
                <div className="flex flex-col gap-8">
                  {/* Logo */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 px-2">
                      <div className="bg-primary rounded-full size-10 flex items-center justify-center">
                        <span className="text-white font-bold text-lg">E</span>
                      </div>
                      <div className="flex flex-col">
                        <h1 className="text-white text-base font-bold leading-normal">EduSmart</h1>
                        <p className="text-[#5b6b8c] text-xs font-normal leading-normal">学员中心</p>
                      </div>
                    </div>
                    <button 
                      className="text-white"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>

                  {/* 导航菜单 */}
                  <nav className="flex flex-col gap-2">
                    <Link
                      to="/student"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        location.pathname === '/student'
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#1a2332]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">dashboard</span>
                      <span className="text-sm font-medium leading-normal">学员仪表盘</span>
                    </Link>

                    <Link
                      to="/student/profile"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/student/profile')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#1a2332]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">person</span>
                      <span className="text-sm font-medium leading-normal">个人档案</span>
                    </Link>

                    <Link
                      to="/student/self-assessment"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/student/self-assessment')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#1a2332]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">psychology</span>
                      <span className="text-sm font-medium leading-normal">自我评估</span>
                    </Link>

                    <Link
                      to="/student/tasks"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/student/tasks')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#1a2332]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">assignment_turned_in</span>
                      <span className="text-sm font-medium leading-normal">任务中心</span>
                    </Link>

                    <Link
                      to="/student/errors"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/student/errors')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#1a2332]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">assignment_late</span>
                      <span className="text-sm font-medium leading-normal">错题本</span>
                    </Link>

                    <Link
                      to="/student/points-wish"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/student/points-wish')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#1a2332]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">redeem</span>
                      <span className="text-sm font-medium leading-normal">积分商城</span>
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
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<StudentDashboardHome />} />
            <Route path="/profile" element={<ProfileManagement />} />
            <Route path="/self-assessment" element={<SelfAssessment />} />
            <Route path="/tasks" element={<TaskCenter />} />
            <Route path="/answer-zone/:taskId" element={<AnswerZone />} />
            <Route path="/training/:taskId" element={<TrainingCabin />} />
            <Route path="/errors" element={<ErrorBook />} />
            <Route path="/learning-state" element={<SubjectLearningState />} />
            <Route path="/error-retry/:sessionId" element={<ErrorRetry />} />
            <Route path="/points-wish" element={<PointsWishMall />} />
            <Route path="*" element={<div className="p-6"><h1 className="text-2xl font-bold text-white">页面未找到</h1></div>} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
};
