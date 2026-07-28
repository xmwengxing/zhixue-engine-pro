import React, { forwardRef } from 'react';

/**
 * DatePicker 组件 - 日期选择器
 * 基于原生 input[type="date"] 实现，使用蓝白色调设计
 */
export interface DatePickerProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  (
    {
      label,
      error,
      helperText,
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
          <input
            ref={ref}
            type="date"
            className={`
              flex-1 h-10 rounded-lg px-3 text-sm text-white
              bg-secondary-800 border transition-colors
              focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
              [color-scheme:dark]
              ${error ? 'border-error-500' : 'border-transparent'}
              ${!error && !disabled ? 'hover:border-secondary-600' : ''}
              ${className}
            `}
            disabled={disabled}
            {...props}
          />
          <span className="material-symbols-outlined absolute right-3 text-secondary-400 pointer-events-none">
            calendar_today
          </span>
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

DatePicker.displayName = 'DatePicker';
