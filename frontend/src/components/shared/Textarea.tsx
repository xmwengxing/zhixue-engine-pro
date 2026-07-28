import React, { forwardRef } from 'react';

/**
 * Textarea 组件 - 多行文本输入框
 * 使用蓝白色调设计
 */
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      fullWidth = false,
      resize = 'vertical',
      className = '',
      disabled,
      rows = 4,
      ...props
    },
    ref
  ) => {
    const resizeClasses = {
      none: 'resize-none',
      vertical: 'resize-y',
      horizontal: 'resize-x',
      both: 'resize',
    };

    return (
      <div className={`flex flex-col gap-1 ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label className="block text-sm font-medium text-secondary-300">
            {label}
            {props.required && <span className="text-error-500 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          rows={rows}
          className={`
            w-full rounded-lg px-3 py-2 text-sm text-white placeholder:text-secondary-400
            bg-secondary-800 border transition-colors
            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${resizeClasses[resize]}
            ${error ? 'border-error-500' : 'border-transparent'}
            ${!error && !disabled ? 'hover:border-secondary-600' : ''}
            ${className}
          `}
          disabled={disabled}
          {...props}
        />
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

Textarea.displayName = 'Textarea';
