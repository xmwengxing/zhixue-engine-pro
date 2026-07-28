// 用户角色类型
export type UserRole = 'admin' | 'parent' | 'student';

// 用户信息接口
export interface User {
  id: string;
  username: string;
  role: UserRole;
  email?: string;
  phone?: string;
}

// 认证状态接口
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}
