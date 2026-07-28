import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LoadingFallback } from '../components/LoadingFallback';

// 懒加载组件
const Login = lazy(() => import('../pages/Login').then(m => ({ default: m.Login })));
const Register = lazy(() => import('../pages/Register').then(m => ({ default: m.Register })));
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const ParentDashboard = lazy(() => import('../pages/parent/ParentDashboard').then(m => ({ default: m.ParentDashboard })));
const StudentDashboard = lazy(() => import('../pages/student/StudentDashboard').then(m => ({ default: m.StudentDashboard })));
const NotFound = lazy(() => import('../pages/NotFound').then(m => ({ default: m.NotFound })));

// 包装懒加载组件
const withSuspense = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={<LoadingFallback />}>
    <Component />
  </Suspense>
);

/**
 * 应用路由配置
 * 包含公开路由和受保护的角色路由
 * 使用 React.lazy 实现代码分割，提升首屏加载速度
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/login',
    element: withSuspense(Login),
  },
  {
    path: '/register',
    element: withSuspense(Register),
  },
  {
    path: '/admin/*',
    element: (
      <ProtectedRoute allowedRoles={['admin']}>
        {withSuspense(AdminDashboard)}
      </ProtectedRoute>
    ),
  },
  {
    path: '/parent/*',
    element: (
      <ProtectedRoute allowedRoles={['parent']}>
        {withSuspense(ParentDashboard)}
      </ProtectedRoute>
    ),
  },
  {
    path: '/student/*',
    element: (
      <ProtectedRoute allowedRoles={['student']}>
        {withSuspense(StudentDashboard)}
      </ProtectedRoute>
    ),
  },
  {
    path: '*',
    element: withSuspense(NotFound),
  },
]);
