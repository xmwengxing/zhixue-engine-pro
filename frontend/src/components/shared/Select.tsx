import React, { forwardRef } from 'react';

/**
 * Select 组件 - 下拉选择框
 * 使用蓝白色调设计
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  fullWidth?: boolean;
  onChange?: (value: string) => void;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      placeholder,
      fullWidth = false,
      className = '',
      disabled,
      onChange,
      ...props
    },
    ref
  ) => {
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange?.(e.target.value);
    };

    return (
      <div className={`flex flex-col gap-1 ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label className="block text-sm font-medium text-secondary-300">
            {label}
            {props.required && <span className="text-error-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={`
              w-full h-10 rounded-lg px-3 pr-10 text-sm text-white
              bg-secondary-800 border transition-colors appearance-none
              focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
              ${error ? 'border-error-500' : 'border-transparent'}
              ${!error && !disabled ? 'hover:border-secondary-600' : ''}
              ${className}
            `}
            disabled={disabled}
            onChange={handleChange}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-secondary-400 pointer-events-none">
            expand_more
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

Select.displayName = 'Select';
