import React from 'react';

/**
 * Card 组件 - 卡片容器
 * 参照设计稿实现深色主题的卡片样式
 */
export interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  icon?: string; // Material Icons 图标名称
  iconColor?: string;
  actions?: React.ReactNode;
  hoverable?: boolean;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  icon,
  iconColor = 'text-primary-500',
  actions,
  hoverable = false,
  className = '',
  onClick,
}) => {
  return (
    <div
      className={`
        flex flex-col gap-2 rounded-xl p-6 border border-secondary-700 bg-secondary-800
        ${hoverable ? 'hover:border-secondary-600 transition-colors cursor-pointer' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {(title || icon || actions) && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {icon && (
              <span className={`material-symbols-outlined ${iconColor}`}>
                {icon}
              </span>
            )}
            <div className="flex flex-col">
              {title && (
                <p className="text-secondary-300 text-sm font-medium leading-normal">
                  {title}
                </p>
              )}
              {subtitle && (
                <p className="text-secondary-400 text-xs leading-normal">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
};

/**
 * StatCard 组件 - 统计卡片
 * 用于显示数据统计信息
 */
export interface StatCardProps {
  title: string;
  value: string | number;
  icon?: string;
  iconColor?: string;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  iconColor = 'text-primary-500',
  trend,
  className = '',
}) => {
  const trendColors = {
    up: 'text-success-500',
    down: 'text-error-500',
    neutral: 'text-secondary-400',
  };

  const trendIcons = {
    up: 'trending_up',
    down: 'trending_down',
    neutral: 'trending_flat',
  };

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl p-6 border border-secondary-700 bg-secondary-800 ${className}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-secondary-400 text-sm font-medium leading-normal">
          {title}
        </p>
        {icon && (
          <span className={`material-symbols-outlined ${iconColor}`}>
            {icon}
          </span>
        )}
      </div>
      <p className="text-white tracking-tight text-3xl font-bold leading-tight">
        {value}
      </p>
      {trend && (
        <p
          className={`text-sm font-medium leading-normal flex items-center gap-1 ${trendColors[trend.direction]}`}
        >
          <span className="material-symbols-outlined text-sm">
            {trendIcons[trend.direction]}
          </span>
          {trend.value}
        </p>
      )}
    </div>
  );
};
