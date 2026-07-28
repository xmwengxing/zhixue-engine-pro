import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * 侧边栏导航项接口
 */
export interface SidebarNavItem {
  label: string;
  icon: string; // Material Icons 图标名称
  path: string;
  divider?: boolean; // 是否在此项后显示分隔线
}

/**
 * Sidebar 组件 - 侧边栏导航
 * 参照设计稿实现深色主题的侧边栏
 */
interface SidebarProps {
  title: string;
  subtitle: string;
  logo?: string;
  navItems: SidebarNavItem[];
  onLogout?: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  title,
  subtitle,
  logo,
  navItems,
  onLogout,
  className = '',
}) => {
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <>
      {/* 移动端顶部栏 */}
      <div className="flex lg:hidden items-center justify-between p-4 border-b border-secondary-700 bg-secondary-900">
        <span className="text-white font-bold text-lg">{title}</span>
        <button
          className="text-white"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          aria-label="切换菜单"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
      </div>

      {/* 侧边栏 */}
      <aside
        className={`
          ${isMobileOpen ? 'fixed inset-0 z-50' : 'hidden'}
          lg:flex
          w-72 flex-col border-r border-secondary-700 bg-secondary-900
          ${className}
        `}
      >
        {/* 移动端遮罩层 */}
        {isMobileOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsMobileOpen(false)}
          />
        )}

        <div className="relative z-50 flex h-full flex-col justify-between p-4 bg-secondary-900">
          <div className="flex flex-col gap-8">
            {/* Logo 和标题 */}
            <div className="flex items-center gap-3 px-2">
              {logo ? (
                <div
                  className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 border border-secondary-700"
                  style={{ backgroundImage: `url(${logo})` }}
                />
              ) : (
                <div className="flex items-center justify-center size-10 rounded-full bg-primary-500 border border-secondary-700">
                  <span className="text-white font-bold text-lg">
                    {title.charAt(0)}
                  </span>
                </div>
              )}
              <div className="flex flex-col">
                <h1 className="text-white text-base font-bold leading-normal">
                  {title}
                </h1>
                <p className="text-secondary-400 text-xs font-normal leading-normal">
                  {subtitle}
                </p>
              </div>
            </div>

            {/* 导航菜单 */}
            <nav className="flex flex-col gap-2">
              {navItems.map((item) => (
                <React.Fragment key={item.path}>
                  <Link
                    to={item.path}
                    className={`
                      flex items-center gap-3 px-3 py-3 rounded-lg transition-colors
                      ${
                        location.pathname === item.path
                          ? 'bg-primary-500 text-white'
                          : 'text-secondary-400 hover:bg-secondary-800 hover:text-white'
                      }
                    `}
                    onClick={() => setIsMobileOpen(false)}
                  >
                    <span className="material-symbols-outlined text-[24px]">
                      {item.icon}
                    </span>
                    <span className="text-sm font-medium leading-normal">
                      {item.label}
                    </span>
                  </Link>
                  {item.divider && (
                    <div className="my-2 h-px bg-secondary-700" />
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>

          {/* 底部退出按钮 */}
          {onLogout && (
            <div className="flex flex-col gap-2">
              <button
                onClick={onLogout}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-secondary-400 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">
                  logout
                </span>
                <span className="text-sm font-medium leading-normal">
                  退出登录
                </span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
