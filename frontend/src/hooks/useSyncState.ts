/**
 * 同步状态 Hook
 * 提供乐观更新和状态同步功能
 */

import { useState, useCallback, useEffect } from 'react';
import { syncManager, StateValidator, type SyncOperationType } from '../utils/syncManager';

/**
 * 同步状态 Hook 配置
 */
interface UseSyncStateOptions<T> {
  resource: string; // 资源类型
  resourceId?: string; // 资源 ID
  initialData: T; // 初始数据
  autoValidate?: boolean; // 是否自动验证状态
  validateInterval?: number; // 验证间隔（毫秒）
}

/**
 * 同步状态 Hook 返回值
 */
interface UseSyncStateReturn<T> {
  data: T; // 当前数据
  isLoading: boolean; // 是否加载中
  isSyncing: boolean; // 是否同步中
  error: Error | null; // 错误信息
  update: (newData: Partial<T>) => Promise<void>; // 更新数据
  create: (newData: T) => Promise<void>; // 创建数据
  remove: () => Promise<void>; // 删除数据
  validate: () => Promise<boolean>; // 验证状态
  refresh: () => Promise<void>; // 刷新数据
}

/**
 * 使用同步状态 Hook
 * @param options 配置选项
 * @returns 同步状态和操作方法
 */
export function useSyncState<T extends Record<string, any>>(
  options: UseSyncStateOptions<T>
): UseSyncStateReturn<T> {
  const {
    resource,
    resourceId,
    initialData,
    autoValidate = false,
    validateInterval = 30000, // 默认 30 秒验证一次
  } = options;

  const [data, setData] = useState<T>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * 更新数据（乐观更新）
   */
  const update = useCallback(
    async (newData: Partial<T>) => {
      if (!resourceId) {
        throw new Error('更新操作需要提供 resourceId');
      }

      setIsSyncing(true);
      setError(null);

      const updatedData = { ...data, ...newData };

      try {
        await syncManager.optimisticUpdate(
          {
            type: 'update' as SyncOperationType,
            resource,
            resourceId,
            data: updatedData,
          },
          {
            // 乐观更新：立即更新本地状态
            onOptimisticUpdate: (optimisticData) => {
              setData(optimisticData as T);
            },
            // 同步成功：使用服务器返回的数据
            onSyncSuccess: (serverData) => {
              setData(serverData as T);
              setIsSyncing(false);
            },
            // 同步失败：回滚到原始数据
            onSyncFailure: (err, rollbackData) => {
              setData(rollbackData as T);
              setError(err);
              setIsSyncing(false);
            },
          }
        );
      } catch (err) {
        setError(err instanceof Error ? err : new Error('更新失败'));
        setIsSyncing(false);
      }
    },
    [data, resource, resourceId]
  );

  /**
   * 创建数据（乐观更新）
   */
  const create = useCallback(
    async (newData: T) => {
      setIsSyncing(true);
      setError(null);

      try {
        await syncManager.optimisticUpdate(
          {
            type: 'create' as SyncOperationType,
            resource,
            data: newData,
          },
          {
            // 乐观更新：立即更新本地状态
            onOptimisticUpdate: (optimisticData) => {
              setData(optimisticData as T);
            },
            // 同步成功：使用服务器返回的数据
            onSyncSuccess: (serverData) => {
              setData(serverData as T);
              setIsSyncing(false);
            },
            // 同步失败：清空数据
            onSyncFailure: (err) => {
              setData(initialData);
              setError(err);
              setIsSyncing(false);
            },
          }
        );
      } catch (err) {
        setError(err instanceof Error ? err : new Error('创建失败'));
        setIsSyncing(false);
      }
    },
    [resource, initialData]
  );

  /**
   * 删除数据（乐观更新）
   */
  const remove = useCallback(async () => {
    if (!resourceId) {
      throw new Error('删除操作需要提供 resourceId');
    }

    setIsSyncing(true);
    setError(null);

    const originalData = data;

    try {
      await syncManager.optimisticUpdate(
        {
          type: 'delete' as SyncOperationType,
          resource,
          resourceId,
          data: null,
        },
        {
          // 乐观更新：立即清空本地状态
          onOptimisticUpdate: () => {
            setData(initialData);
          },
          // 同步成功
          onSyncSuccess: () => {
            setIsSyncing(false);
          },
          // 同步失败：恢复原始数据
          onSyncFailure: (err) => {
            setData(originalData);
            setError(err);
            setIsSyncing(false);
          },
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err : new Error('删除失败'));
      setIsSyncing(false);
    }
  }, [data, resource, resourceId, initialData]);

  /**
   * 验证状态一致性
   */
  const validate = useCallback(async (): Promise<boolean> => {
    if (!resourceId) {
      return true; // 没有 resourceId 无法验证
    }

    try {
      const result = await StateValidator.validateState(resource, resourceId, data);

      if (!result.isValid) {
        console.warn('状态不一致，差异:', result.diff);
        
        // 使用服务器状态更新本地状态
        if (result.serverState) {
          setData(result.serverState as T);
        }
      }

      return result.isValid;
    } catch (err) {
      console.error('状态验证失败:', err);
      return false;
    }
  }, [resource, resourceId, data]);

  /**
   * 刷新数据
   */
  const refresh = useCallback(async () => {
    if (!resourceId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await validate();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('刷新失败'));
    } finally {
      setIsLoading(false);
    }
  }, [resourceId, validate]);

  /**
   * 自动验证状态
   */
  useEffect(() => {
    if (!autoValidate || !resourceId) {
      return;
    }

    const timer = setInterval(() => {
      validate();
    }, validateInterval);

    return () => clearInterval(timer);
  }, [autoValidate, resourceId, validateInterval, validate]);

  return {
    data,
    isLoading,
    isSyncing,
    error,
    update,
    create,
    remove,
    validate,
    refresh,
  };
}
