import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 防抖Hook - 用于延迟更新值
 * 
 * @param value 要防抖的值
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的值
 * 
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 500);
 * 
 * useEffect(() => {
 *   // 使用debouncedSearchTerm进行搜索
 *   fetchSearchResults(debouncedSearchTerm);
 * }, [debouncedSearchTerm]);
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * 防抖回调Hook - 用于防抖函数调用
 * 
 * @param callback 要防抖的回调函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的回调函数
 * 
 * @example
 * const handleSearch = useDebounceCallback((term: string) => {
 *   fetchSearchResults(term);
 * }, 500);
 */
export function useDebounceCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // 更新回调引用
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}

/**
 * 节流Hook - 用于限制函数调用频率
 * 
 * @param callback 要节流的回调函数
 * @param delay 延迟时间（毫秒）
 * @returns 节流后的回调函数
 * 
 * @example
 * const handleScroll = useThrottle(() => {
 *   console.log('Scrolling...');
 * }, 200);
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousRef = useRef<number>(0);
  const callbackRef = useRef(callback);

  // 更新回调引用
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const remaining = delay - (now - previousRef.current);

      if (remaining <= 0 || remaining > delay) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        previousRef.current = now;
        callbackRef.current(...args);
      } else if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          previousRef.current = Date.now();
          timeoutRef.current = null;
          callbackRef.current(...args);
        }, remaining);
      }
    },
    [delay]
  );
}

/**
 * 防止重复提交Hook
 * 
 * @param asyncFunction 异步函数
 * @returns { execute: 执行函数, loading: 加载状态, error: 错误信息 }
 * 
 * @example
 * const { execute: handleSubmit, loading } = usePreventDoubleSubmit(async (data) => {
 *   await api.submitForm(data);
 * });
 * 
 * <button onClick={() => handleSubmit(formData)} disabled={loading}>
 *   {loading ? '提交中...' : '提交'}
 * </button>
 */
export function usePreventDoubleSubmit<T extends (...args: any[]) => Promise<any>>(
  asyncFunction: T
): {
  execute: (...args: Parameters<T>) => Promise<void>;
  loading: boolean;
  error: Error | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (...args: Parameters<T>) => {
      // 如果正在加载，直接返回
      if (loading) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        await asyncFunction(...args);
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error('未知错误'));
        }
        throw err;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [asyncFunction, loading]
  );

  return { execute, loading, error };
}
