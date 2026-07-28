import React from 'react';

/**
 * Form 组件 - 表单容器
 * 提供统一的表单布局和提交处理
 */
export interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}

export const Form: React.FC<FormProps> = ({
  onSubmit,
  children,
  className = '',
  ...props
}) => {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit?.(e);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-col gap-4 ${className}`}
      {...props}
    >
      {children}
    </form>
  );
};

/**
 * FormGroup 组件 - 表单字段分组
 */
export interface FormGroupProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}

export const FormGroup: React.FC<FormGroupProps> = ({
  children,
  columns = 1,
  className = '',
}) => {
  const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  };

  return (
    <div className={`grid ${gridClasses[columns]} gap-4 ${className}`}>
      {children}
    </div>
  );
};

/**
 * FormActions 组件 - 表单操作按钮区域
 */
export interface FormActionsProps {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export const FormActions: React.FC<FormActionsProps> = ({
  children,
  align = 'right',
  className = '',
}) => {
  const alignClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  };

  return (
    <div className={`flex gap-3 ${alignClasses[align]} ${className}`}>
      {children}
    </div>
  );
};
