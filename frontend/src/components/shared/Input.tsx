import React, { forwardRef } from 'react';

/**
 * Input 组件 - 通用输入框
 * 支持多种类型和状态，使用蓝白色调设计
 */
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: string; // Material Icons 图标名称
  rightIcon?: string;
  onRightIconClick?: () => void;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      onRightIconClick,
      fullWidth = false,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <div className={`flex flex-col gap-1 ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label className="block text-sm font-medium text-secondary-300">
            {label}
            {props.required && <span className="text-error-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="material-symbols-outlined absolute left-3 text-secondary-400 text-[20px] pointer-events-none">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            className={`
              flex-1 h-10 rounded-lg px-3 text-sm text-white placeholder:text-secondary-400
              bg-secondary-800 border transition-colors
              focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
              ${leftIcon ? 'pl-10' : ''}
              ${rightIcon ? 'pr-10' : ''}
              ${error ? 'border-error-500' : 'border-transparent'}
              ${!error && !disabled ? 'hover:border-secondary-600' : ''}
              ${className}
            `}
            disabled={disabled}
            {...props}
          />
          {rightIcon && (
            <button
              type="button"
              onClick={onRightIconClick}
              className="material-symbols-outlined absolute right-3 text-secondary-400 hover:text-white text-[20px] transition-colors"
              disabled={disabled}
            >
              {rightIcon}
            </button>
          )}
        </div>
        {error && (
          <p className="text-error-500 text-xs mt-1 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">error</span>
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-secondary-400 text-xs mt-1">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
