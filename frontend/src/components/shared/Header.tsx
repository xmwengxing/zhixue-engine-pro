import React from 'react';

/**
 * Header 组件 - 页面顶部导航栏
 * 用于显示页面标题、描述和操作按钮
 */
interface HeaderProps {
  title: string;
  description?: string;
  lastUpdate?: string;
  actions?: React.ReactNode;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  description,
  lastUpdate,
  actions,
  className = '',
}) => {
  return (
    <div className={`flex flex-wrap justify-between gap-4 ${className}`}>
      <div className="flex flex-col gap-2">
        <h1 className="text-white tracking-tight text-[32px] font-bold leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-secondary-400 text-sm font-normal leading-normal max-w-2xl">
            {description}
          </p>
        )}
      </div>
      <div className="flex items-end flex-col gap-2">
        {lastUpdate && (
          <span className="text-secondary-400 text-xs">
            上次更新：{lastUpdate}
          </span>
        )}
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </div>
  );
};
