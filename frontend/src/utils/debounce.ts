/**
 * 防抖函数
 * 在事件被触发n秒后再执行回调，如果在这n秒内又被触发，则重新计时
 * 
 * @param func 要执行的函数
 * @param wait 等待时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const context = this;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func.apply(context, args);
      timeout = null;
    }, wait);
  };
}

/**
 * 节流函数
 * 规定在一个单位时间内，只能触发一次函数。如果这个单位时间内触发多次函数，只有一次生效
 * 
 * @param func 要执行的函数
 * @param wait 等待时间（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let previous = 0;

  return function (this: any, ...args: Parameters<T>) {
    const context = this;
    const now = Date.now();
    const remaining = wait - (now - previous);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(context, args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now();
        timeout = null;
        func.apply(context, args);
      }, remaining);
    }
  };
}

/**
 * 防止按钮重复点击的Hook
 * 
 * @param callback 点击回调函数
 * @param delay 防抖延迟时间（毫秒），默认300ms
 * @returns 防抖后的点击处理函数和loading状态
 */
export function useDebounceClick<T extends (...args: any[]) => Promise<any>>(
  callback: T,
  delay: number = 300
): {
  handleClick: (...args: Parameters<T>) => Promise<void>;
  isLoading: boolean;
} {
  const [isLoading, setIsLoading] = React.useState(false);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleClick = React.useCallback(
    async (...args: Parameters<T>) => {
      // 如果正在加载，直接返回
      if (isLoading) {
        return;
      }

      // 清除之前的定时器
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // 设置新的定时器
      timeoutRef.current = setTimeout(async () => {
        setIsLoading(true);
        try {
          await callback(...args);
        } finally {
          setIsLoading(false);
        }
      }, delay);
    },
    [callback, delay, isLoading]
  );

  // 清理定时器
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { handleClick, isLoading };
}

// React导入（如果需要使用useDebounceClick）
import React from 'react';
