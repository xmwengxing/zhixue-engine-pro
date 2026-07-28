/**
 * 离线状态指示器组件
 * 显示当前网络状态和待同步操作数量
 */

import { useState, useEffect } from 'react';
import { offlineCache } from '../../utils/offlineCache';
import { syncManager } from '../../utils/syncManager';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // 监听网络状态变化
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 定期更新待同步操作数量
    const updatePendingCount = async () => {
      const count = syncManager.getPendingCount();
      const offlineOps = await offlineCache.getOperations();
      setPendingCount(count + offlineOps.length);
    };

    updatePendingCount();
    const timer = setInterval(updatePendingCount, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(timer);
    };
  }, []);

  // 如果在线且没有待同步操作，不显示指示器
  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 left-4 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 ${
        isOnline ? 'bg-blue-500' : 'bg-gray-500'
      } text-white`}
    >
      {/* 状态图标 */}
      <div className="flex items-center gap-2">
        {isOnline ? (
          <>
            <svg
              className="w-5 h-5 animate-spin"
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
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span className="text-sm font-medium">同步中...</span>
          </>
        ) : (
          <>
            <svg
              className="w-5 h-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
              />
            </svg>
            <span className="text-sm font-medium">离线模式</span>
          </>
        )}
      </div>

      {/* 待同步操作数量 */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-sm">·</span>
          <span className="text-sm">{pendingCount} 个操作待同步</span>
        </div>
      )}
    </div>
  );
}
