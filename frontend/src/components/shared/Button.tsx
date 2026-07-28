import React from 'react';

/**
 * Button 组件 - 通用按钮
 * 支持多种变体和尺寸，使用蓝白色调设计
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: string; // Material Icons 图标名称
  rightIcon?: string;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses = {
  primary:
    'bg-primary-500 text-white hover:bg-primary-600 shadow-lg shadow-primary-900/20',
  secondary:
    'bg-secondary-800 text-white hover:bg-secondary-700',
  outline:
    'bg-transparent text-white border border-secondary-600 hover:bg-secondary-800',
  ghost: 'bg-transparent text-secondary-400 hover:text-white hover:bg-secondary-800',
  danger: 'bg-error-500 text-white hover:bg-error-600',
};

const sizeClasses = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  loading = false,
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  return (
    <button
      className={`
        flex items-center justify-center gap-2 rounded-lg font-medium
        transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-secondary-900
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-[20px]">
          progress_activity
        </span>
      ) : (
        <>
          {leftIcon && (
            <span className="material-symbols-outlined text-[20px]">
              {leftIcon}
            </span>
          )}
          {children}
          {rightIcon && (
            <span className="material-symbols-outlined text-[20px]">
              {rightIcon}
            </span>
          )}
        </>
      )}
    </button>
  );
};
