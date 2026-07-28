import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthState, User } from '../types/auth';

interface AuthStore extends AuthState {
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

/**
 * 认证状态管理 Store
 * 使用 Zustand 管理用户认证状态，并持久化到 localStorage
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      token: null,

      /**
       * 用户登录
       * @param user 用户信息
       * @param token JWT token
       */
      login: (user: User, token: string) => {
        set({ isAuthenticated: true, user, token });
        // 同时将 token 单独存储，供直接使用 localStorage.getItem('token') 的代码使用
        localStorage.setItem('token', token);
      },

      /**
       * 用户登出
       * 清除所有认证信息
       */
      logout: () => {
        set({ isAuthenticated: false, user: null, token: null });
        // 同时清除单独存储的 token
        localStorage.removeItem('token');
      },

      /**
       * 更新用户信息
       * @param user 部分用户信息
       */
      updateUser: (user: Partial<User>) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...user } : null,
        }));
      },
    }),
    {
      name: 'auth-storage', // localStorage 中的 key
      storage: createJSONStorage(() => localStorage),
    }
  )
);
