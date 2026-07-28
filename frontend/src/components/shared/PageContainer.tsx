import React from 'react';

/**
 * PageContainer 组件 - 页面内容容器
 * 提供统一的内容区域样式和最大宽度限制
 */
interface PageContainerProps {
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
}

const maxWidthClasses = {
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-screen-xl',
  '2xl': 'max-w-[1200px]',
  full: 'max-w-full',
};

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  maxWidth = '2xl',
  className = '',
}) => {
  return (
    <div className="layout-container flex h-full grow flex-col bg-secondary-900">
      <div className="px-4 md:px-8 lg:px-12 flex flex-1 justify-center py-8">
        <div
          className={`
            layout-content-container flex flex-col flex-1 gap-8
            ${maxWidthClasses[maxWidth]}
            ${className}
          `}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
