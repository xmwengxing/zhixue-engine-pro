import React from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import AdminDashboardHome from './AdminDashboardHome';
import UserManagement from './UserManagement';
import StudentIDManagement from './StudentIDManagement';
import AuthCodeManagement from './AuthCodeManagement';
import ParentChildRelationManagement from './ParentChildRelationManagement';
import MaterialSystemManagement from './MaterialSystemManagement';
import AIServiceConfig from './AIServiceConfig';
import SubjectInstructionConfig from './SubjectInstructionConfig';
import AgentPlatformConfig from './AgentPlatformConfig';
import APIMonitoring from './APIMonitoring';
import QuestionBankManagement from './QuestionBankManagement';

/**
 * 管理员仪表盘页面
 */
export const AdminDashboard = () => {
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
    <div className="relative flex min-h-screen w-full flex-row overflow-hidden">
      {/* 侧边栏 */}
      <aside className="hidden w-72 flex-col border-r border-[#324467] bg-[#111722] lg:flex">
        <div className="flex h-full flex-col justify-between p-4">
          <div className="flex flex-col gap-8">
            {/* Logo */}
            <div className="flex items-center gap-3 px-2">
              <div className="bg-primary rounded-full size-10 flex items-center justify-center">
                <span className="text-white font-bold text-lg">E</span>
              </div>
              <div className="flex flex-col">
                <h1 className="text-white text-base font-bold leading-normal">EduSmart 后台</h1>
                <p className="text-[#92a4c9] text-xs font-normal leading-normal">平台管理员</p>
              </div>
            </div>

            {/* 导航菜单 */}
            <nav className="flex flex-col gap-2">
              <Link
                to="/admin"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  location.pathname === '/admin'
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">dashboard</span>
                <span className="text-sm font-medium leading-normal">管理员控制台</span>
              </Link>

              <Link
                to="/admin/users"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/admin/users')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">group</span>
                <span className="text-sm font-medium leading-normal">用户管理</span>
              </Link>

              <Link
                to="/admin/student-ids"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/admin/student-ids')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">badge</span>
                <span className="text-sm font-medium leading-normal">学号管理</span>
              </Link>

              <Link
                to="/admin/relations"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/admin/relations')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">account_tree</span>
                <span className="text-sm font-medium leading-normal">亲子关系</span>
              </Link>

              <Link
                to="/admin/auth-codes"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/admin/auth-codes')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">key</span>
                <span className="text-sm font-medium leading-normal">授权码管理</span>
              </Link>

              <Link
                to="/admin/materials"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/admin/materials')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">menu_book</span>
                <span className="text-sm font-medium leading-normal">教材体系</span>
              </Link>

              <Link
                to="/admin/question-bank"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/admin/question-bank')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">quiz</span>
                <span className="text-sm font-medium leading-normal">题库</span>
              </Link>

              <div className="my-2 h-px bg-[#324467]"></div>

              <Link
                to="/admin/ai-services"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/admin/ai-services')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">smart_toy</span>
                <span className="text-sm font-medium leading-normal">AI 服务配置</span>
              </Link>

              <Link
                to="/admin/subject-instructions"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/admin/subject-instructions')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">school</span>
                <span className="text-sm font-medium leading-normal">科目指令配置</span>
              </Link>

              <Link
                to="/admin/agent-platform"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/admin/agent-platform')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">auto_awesome</span>
                <span className="text-sm font-medium leading-normal">智能体平台</span>
              </Link>

              <Link
                to="/admin/api-monitoring"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/admin/api-monitoring')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">monitoring</span>
                <span className="text-sm font-medium leading-normal">API 监控</span>
              </Link>

              <div className="my-2 h-px bg-[#324467]"></div>

              <Link
                to="/admin/settings"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive('/admin/settings')
                    ? 'bg-primary text-white'
                    : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">settings</span>
                <span className="text-sm font-medium leading-normal">系统设置</span>
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
      <main className="flex flex-1 flex-col h-full min-h-screen relative overflow-y-auto">
        {/* 移动端顶部栏 */}
        <div className="flex lg:hidden items-center justify-between p-4 border-b border-[#324467] bg-[#111722]">
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
            <div className="fixed top-0 right-0 bottom-0 w-72 bg-[#111722] z-50 lg:hidden overflow-y-auto">
              <div className="flex h-full flex-col justify-between p-4">
                <div className="flex flex-col gap-8">
                  {/* Logo */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 px-2">
                      <div className="bg-primary rounded-full size-10 flex items-center justify-center">
                        <span className="text-white font-bold text-lg">E</span>
                      </div>
                      <div className="flex flex-col">
                        <h1 className="text-white text-base font-bold leading-normal">EduSmart 后台</h1>
                        <p className="text-[#92a4c9] text-xs font-normal leading-normal">平台管理员</p>
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
                      to="/admin"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        location.pathname === '/admin'
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">dashboard</span>
                      <span className="text-sm font-medium leading-normal">管理员控制台</span>
                    </Link>

                    <Link
                      to="/admin/users"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/admin/users')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">group</span>
                      <span className="text-sm font-medium leading-normal">用户管理</span>
                    </Link>

                    <Link
                      to="/admin/student-ids"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/admin/student-ids')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">badge</span>
                      <span className="text-sm font-medium leading-normal">学号管理</span>
                    </Link>

                    <Link
                      to="/admin/relations"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/admin/relations')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">account_tree</span>
                      <span className="text-sm font-medium leading-normal">亲子关系</span>
                    </Link>

                    <Link
                      to="/admin/auth-codes"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/admin/auth-codes')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">key</span>
                      <span className="text-sm font-medium leading-normal">授权码管理</span>
                    </Link>

                    <Link
                      to="/admin/materials"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/admin/materials')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">menu_book</span>
                      <span className="text-sm font-medium leading-normal">教材体系</span>
                    </Link>

                    <Link
                      to="/admin/question-bank"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/admin/question-bank')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">quiz</span>
                      <span className="text-sm font-medium leading-normal">题库</span>
                    </Link>

                    <div className="my-2 h-px bg-[#324467]"></div>

                    <Link
                      to="/admin/ai-services"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/admin/ai-services')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">smart_toy</span>
                      <span className="text-sm font-medium leading-normal">AI 服务配置</span>
                    </Link>

                    <Link
                      to="/admin/subject-instructions"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/admin/subject-instructions')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">school</span>
                      <span className="text-sm font-medium leading-normal">科目指令配置</span>
                    </Link>

                    <Link
                      to="/admin/agent-platform"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/admin/agent-platform')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">auto_awesome</span>
                      <span className="text-sm font-medium leading-normal">智能体平台</span>
                    </Link>

                    <Link
                      to="/admin/api-monitoring"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/admin/api-monitoring')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">monitoring</span>
                      <span className="text-sm font-medium leading-normal">API 监控</span>
                    </Link>

                    <div className="my-2 h-px bg-[#324467]"></div>

                    <Link
                      to="/admin/settings"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                        isActive('/admin/settings')
                          ? 'bg-primary text-white'
                          : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[24px]">settings</span>
                      <span className="text-sm font-medium leading-normal">系统设置</span>
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
        <Routes>
          <Route path="/" element={<AdminDashboardHome />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/student-ids" element={<StudentIDManagement />} />
          <Route path="/relations" element={<ParentChildRelationManagement />} />
          <Route path="/auth-codes" element={<AuthCodeManagement />} />
          <Route path="/materials" element={<MaterialSystemManagement />} />
          <Route path="/question-bank" element={<QuestionBankManagement />} />
          <Route path="/ai-services" element={<AIServiceConfig />} />
          <Route path="/subject-instructions" element={<SubjectInstructionConfig />} />
          <Route path="/agent-platform" element={<AgentPlatformConfig />} />
          <Route path="/api-monitoring" element={<APIMonitoring />} />
          <Route path="/settings" element={<PlaceholderPage title="系统设置" />} />
        </Routes>
      </main>
    </div>
  );
};

// 占位页面
const PlaceholderPage = ({ title }: { title: string }) => {
  return (
    <div className="flex flex-1 flex-col h-full min-h-screen bg-[#111722]">
      <div className="px-4 md:px-8 lg:px-12 flex flex-1 justify-center py-8">
        <div className="flex flex-col max-w-[1200px] flex-1 gap-8">
          <h1 className="text-white tracking-tight text-[32px] font-bold leading-tight">
            {title}
          </h1>
          <p className="text-[#92a4c9] text-sm">功能开发中...</p>
        </div>
      </div>
    </div>
  );
};
