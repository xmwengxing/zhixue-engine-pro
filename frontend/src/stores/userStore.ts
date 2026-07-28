import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * 用户偏好设置接口
 */
interface UserPreferences {
  theme?: 'light' | 'dark';
  language?: 'zh-CN' | 'en-US';
  sidebarCollapsed?: boolean;
}

/**
 * 用户 Store 状态接口
 */
interface UserStore {
  preferences: UserPreferences;
  setPreferences: (preferences: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
}

/**
 * 默认用户偏好设置
 */
const defaultPreferences: UserPreferences = {
  theme: 'light',
  language: 'zh-CN',
  sidebarCollapsed: false,
};

/**
 * 用户状态管理 Store
 * 管理用户偏好设置等非认证相关的用户信息
 */
export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      preferences: defaultPreferences,

      /**
       * 设置用户偏好
       * @param preferences 部分偏好设置
       */
      setPreferences: (preferences: Partial<UserPreferences>) => {
        set((state) => ({
          preferences: { ...state.preferences, ...preferences },
        }));
      },

      /**
       * 重置用户偏好为默认值
       */
      resetPreferences: () => {
        set({ preferences: defaultPreferences });
      },
    }),
    {
      name: 'user-storage', // localStorage 中的 key
      storage: createJSONStorage(() => localStorage),
    }
  )
);
