import React from 'react';

/**
 * Progress 组件 - 进度条
 * 显示任务或操作的进度
 */
export interface ProgressProps {
  value: number; // 0-100
  max?: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'success' | 'warning' | 'error';
  className?: string;
}

const sizeClasses = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

const variantClasses = {
  primary: 'bg-primary-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
};

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  label,
  showPercentage = false,
  size = 'md',
  variant = 'primary',
  className = '',
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between text-sm">
          {label && <span className="text-secondary-300">{label}</span>}
          {showPercentage && (
            <span className="text-secondary-400 font-medium">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div className={`w-full bg-secondary-700 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`${sizeClasses[size]} ${variantClasses[variant]} rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

/**
 * CircularProgress 组件 - 圆形进度指示器
 * 用于加载状态
 */
export interface CircularProgressProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'white';
  className?: string;
}

const circularSizeClasses = {
  sm: 'text-[16px]',
  md: 'text-[24px]',
  lg: 'text-[32px]',
};

const circularVariantClasses = {
  primary: 'text-primary-500',
  white: 'text-white',
};

export const CircularProgress: React.FC<CircularProgressProps> = ({
  size = 'md',
  variant = 'primary',
  className = '',
}) => {
  return (
    <span
      className={`
        material-symbols-outlined animate-spin
        ${circularSizeClasses[size]}
        ${circularVariantClasses[variant]}
        ${className}
      `}
    >
      progress_activity
    </span>
  );
};
