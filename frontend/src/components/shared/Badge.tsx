import React from 'react';

/**
 * Badge 组件 - 徽章标签
 * 用于显示状态、标签等信息
 */
export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  className?: string;
}

const variantClasses = {
  primary: 'bg-primary-500/10 text-primary-400 ring-primary-500/20',
  secondary: 'bg-secondary-500/10 text-secondary-400 ring-secondary-500/20',
  success: 'bg-success-500/10 text-success-400 ring-success-500/20',
  warning: 'bg-warning-500/10 text-warning-400 ring-warning-500/20',
  error: 'bg-error-500/10 text-error-400 ring-error-500/20',
  info: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

const dotColors = {
  primary: 'bg-primary-500',
  secondary: 'bg-secondary-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
  info: 'bg-blue-500',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  dot = false,
  className = '',
}) => {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-md font-medium ring-1 ring-inset
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  );
};

/**
 * StatusBadge 组件 - 状态徽章
 * 带有状态点的徽章
 */
export interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'error';
  label: string;
  className?: string;
}

const statusConfig = {
  active: {
    color: 'bg-success-500',
    text: '活跃',
  },
  inactive: {
    color: 'bg-secondary-500',
    text: '停用',
  },
  pending: {
    color: 'bg-warning-500',
    text: '待定',
  },
  error: {
    color: 'bg-error-500',
    text: '错误',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  className = '',
}) => {
  const config = statusConfig[status];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`h-2 w-2 rounded-full ${config.color}`} />
      <span className="text-white">{label || config.text}</span>
    </div>
  );
};
