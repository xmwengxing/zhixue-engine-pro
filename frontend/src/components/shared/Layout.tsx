import React from 'react';

/**
 * Layout 组件 - 页面整体布局容器
 * 提供统一的页面结构，包含侧边栏和主内容区
 */
interface LayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  className?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, sidebar, className = '' }) => {
  return (
    <div className={`relative flex min-h-screen w-full flex-row overflow-hidden ${className}`}>
      {sidebar}
      <main className="flex flex-1 flex-col h-full min-h-screen relative overflow-y-auto">
        {children}
      </main>
    </div>
  );
};
