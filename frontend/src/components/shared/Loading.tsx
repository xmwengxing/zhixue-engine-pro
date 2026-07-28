import React from 'react';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
  overlay?: boolean;
}

/**
 * Loading 加载指示器组件
 * 用于显示加载状态，支持全屏和局部加载
 */
const Loading: React.FC<LoadingProps> = ({
  size = 'md',
  text,
  fullScreen = false,
  overlay = false,
}) => {
  // 尺寸映射
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  // 加载动画 SVG
  const spinner = (
    <svg
      className={`animate-spin ${sizeClasses[size]} text-blue-600`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  // 加载内容
  const loadingContent = (
    <div className="flex flex-col items-center justify-center gap-3">
      {spinner}
      {text && (
        <p className={`${textSizeClasses[size]} text-gray-600 font-medium`}>
          {text}
        </p>
      )}
    </div>
  );

  // 全屏加载
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
        {loadingContent}
      </div>
    );
  }

  // 遮罩层加载
  if (overlay) {
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-white bg-opacity-80 backdrop-blur-sm">
        {loadingContent}
      </div>
    );
  }

  // 普通加载
  return <div className="flex items-center justify-center p-4">{loadingContent}</div>;
};

// 加载骨架屏组件
interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'pulse',
}) => {
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: '',
  };

  const style: React.CSSProperties = {
    width: width || (variant === 'text' ? '100%' : undefined),
    height: height || (variant === 'text' ? '1em' : undefined),
  };

  return (
    <div
      className={`bg-gray-200 ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={style}
    >
      {animation === 'wave' && (
        <div className="h-full w-full bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer-slide" />
      )}
    </div>
  );
};

// 加载点动画组件
export const LoadingDots: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({
  size = 'md',
}) => {
  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-3 h-3',
  };

  return (
    <div className="flex items-center gap-1">
      <div
        className={`${dotSizes[size]} bg-blue-600 rounded-full animate-bounce`}
        style={{ animationDelay: '0ms' }}
      />
      <div
        className={`${dotSizes[size]} bg-blue-600 rounded-full animate-bounce`}
        style={{ animationDelay: '150ms' }}
      />
      <div
        className={`${dotSizes[size]} bg-blue-600 rounded-full animate-bounce`}
        style={{ animationDelay: '300ms' }}
      />
    </div>
  );
};

// 进度条加载组件
interface LoadingBarProps {
  progress?: number; // 0-100
  indeterminate?: boolean;
  height?: number;
  color?: string;
}

export const LoadingBar: React.FC<LoadingBarProps> = ({
  progress = 0,
  indeterminate = false,
  height = 4,
  color = 'bg-blue-600',
}) => {
  return (
    <div className="w-full bg-gray-200 rounded-full overflow-hidden" style={{ height }}>
      {indeterminate ? (
        <div
          className={`h-full ${color} animate-loading-bar`}
          style={{ width: '30%' }}
        />
      ) : (
        <div
          className={`h-full ${color} transition-all duration-300 ease-out`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      )}
    </div>
  );
};

// 添加自定义动画样式
const style = document.createElement('style');
style.textContent = `
  @keyframes shimmer-slide {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  @keyframes loading-bar {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(400%);
    }
  }

  .animate-shimmer-slide {
    animation: shimmer-slide 1.5s infinite;
  }

  .animate-loading-bar {
    animation: loading-bar 1.5s infinite;
  }
`;
document.head.appendChild(style);

export default Loading;
