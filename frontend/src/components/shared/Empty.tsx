import React from 'react';

interface EmptyProps {
  image?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Empty 空状态占位组件
 * 用于显示无数据或空列表的占位提示
 */
const Empty: React.FC<EmptyProps> = ({
  image,
  title = '暂无数据',
  description,
  action,
  className = '',
}) => {
  // 默认空状态图标
  const defaultImage = (
    <svg
      className="w-24 h-24 text-gray-300"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );

  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}
    >
      {/* 图标/图片 */}
      <div className="mb-4">{image || defaultImage}</div>

      {/* 标题 */}
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>

      {/* 描述 */}
      {description && (
        <p className="text-sm text-gray-500 text-center max-w-md mb-4">
          {description}
        </p>
      )}

      {/* 操作按钮 */}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

// 预设的空状态场景组件
export const EmptySearch: React.FC<{ onReset?: () => void }> = ({ onReset }) => {
  return (
    <Empty
      image={
        <svg
          className="w-24 h-24 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      }
      title="未找到相关内容"
      description="请尝试调整搜索条件或筛选器"
      action={
        onReset && (
          <button
            onClick={onReset}
            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
          >
            重置筛选
          </button>
        )
      }
    />
  );
};

export const EmptyList: React.FC<{ onCreate?: () => void; createText?: string }> = ({
  onCreate,
  createText = '创建第一个',
}) => {
  return (
    <Empty
      image={
        <svg
          className="w-24 h-24 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      }
      title="列表为空"
      description="还没有任何内容，快来创建第一个吧"
      action={
        onCreate && (
          <button
            onClick={onCreate}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            {createText}
          </button>
        )
      }
    />
  );
};

export const EmptyError: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => {
  return (
    <Empty
      image={
        <svg
          className="w-24 h-24 text-red-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      }
      title="加载失败"
      description="数据加载出现问题，请稍后重试"
      action={
        onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            重新加载
          </button>
        )
      }
    />
  );
};

export const EmptyNetwork: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => {
  return (
    <Empty
      image={
        <svg
          className="w-24 h-24 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
      }
      title="网络连接失败"
      description="请检查您的网络连接后重试"
      action={
        onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            重新连接
          </button>
        )
      }
    />
  );
};

export const EmptyPermission: React.FC = () => {
  return (
    <Empty
      image={
        <svg
          className="w-24 h-24 text-yellow-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      }
      title="无访问权限"
      description="您没有权限访问此内容，请联系管理员"
    />
  );
};

export default Empty;
