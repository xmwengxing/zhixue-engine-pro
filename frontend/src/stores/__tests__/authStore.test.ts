import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../authStore';
import type { User } from '../../types/auth';

describe('authStore', () => {
  // 在每个测试前重置 store
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it('初始状态应该是未认证', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });

  it('登录后应该更新认证状态', () => {
    const mockUser: User = {
      id: '1',
      username: 'testuser',
      role: 'student',
      email: 'test@example.com',
    };
    const mockToken = 'mock-jwt-token';

    useAuthStore.getState().login(mockUser, mockToken);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(mockUser);
    expect(state.token).toBe(mockToken);
  });

  it('登出后应该清除认证状态', () => {
    const mockUser: User = {
      id: '1',
      username: 'testuser',
      role: 'student',
    };
    const mockToken = 'mock-jwt-token';

    // 先登录
    useAuthStore.getState().login(mockUser, mockToken);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    // 再登出
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });

  it('更新用户信息应该保留其他字段', () => {
    const mockUser: User = {
      id: '1',
      username: 'testuser',
      role: 'student',
      email: 'old@example.com',
    };
    const mockToken = 'mock-jwt-token';

    useAuthStore.getState().login(mockUser, mockToken);

    // 更新部分用户信息
    useAuthStore.getState().updateUser({ email: 'new@example.com' });

    const state = useAuthStore.getState();
    expect(state.user?.email).toBe('new@example.com');
    expect(state.user?.username).toBe('testuser');
    expect(state.user?.role).toBe('student');
  });
});
