import { useState, useCallback } from 'react';
import type { ToastType } from '../components/shared/Toast';

interface ToastItem {
  id: string;
  message: string;
  type?: ToastType;
  duration?: number;
}

/**
 * useToast Hook
 * 用于管理 Toast 消息提示
 */
export const useToast = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // 显示 Toast
  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = 3000) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      const newToast: ToastItem = { id, message, type, duration };

      setToasts((prev) => [...prev, newToast]);

      return id;
    },
    []
  );

  // 移除 Toast
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // 便捷方法
  const success = useCallback(
    (message: string, duration?: number) => showToast(message, 'success', duration),
    [showToast]
  );

  const error = useCallback(
    (message: string, duration?: number) => showToast(message, 'error', duration),
    [showToast]
  );

  const warning = useCallback(
    (message: string, duration?: number) => showToast(message, 'warning', duration),
    [showToast]
  );

  const info = useCallback(
    (message: string, duration?: number) => showToast(message, 'info', duration),
    [showToast]
  );

  return {
    toasts,
    showToast,
    removeToast,
    success,
    error,
    warning,
    info,
  };
};
