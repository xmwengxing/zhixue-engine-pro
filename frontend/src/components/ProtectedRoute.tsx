import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import type { UserRole } from '../types/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

/**
 * 路由守卫组件
 * 用于保护需要认证的路由，并根据角色控制访问权限
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { isAuthenticated, user } = useAuthStore();

  // 未认证，跳转到登录页
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // 如果指定了允许的角色，检查用户角色是否匹配
  if (allowedRoles) {
    // 将用户角色转换为小写进行比较
    const userRoleLower = user.role.toLowerCase() as UserRole;
    if (!allowedRoles.includes(userRoleLower)) {
      // 角色不匹配，跳转到对应角色的首页
      const roleHomePage: Record<string, string> = {
        admin: '/admin',
        parent: '/parent',
        student: '/student',
      };
      return <Navigate to={roleHomePage[userRoleLower] || '/login'} replace />;
    }
  }

  return <>{children}</>;
};
