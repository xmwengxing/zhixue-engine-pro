import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/authService';
import { getErrorMessage } from '../types/error';

/**
 * 登录页面
 * 实现用户登录功能，包括表单验证、API 调用和角色跳转
 */
export const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();

  // 表单状态
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 表单验证
  const validateForm = (): boolean => {
    if (!username.trim()) {
      setError('请输入用户名');
      return false;
    }
    if (username.length < 3) {
      setError('用户名至少 3 个字符');
      return false;
    }
    if (!password) {
      setError('请输入密码');
      return false;
    }
    if (password.length < 6) {
      setError('密码至少 6 个字符');
      return false;
    }
    return true;
  };

  // 处理登录提交
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // 验证表单
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // 调用登录 API
      const response = await authService.login({ username, password });
      
      // 调试：打印响应数据
      console.log('登录响应:', response);
      console.log('Token:', response.token);
      console.log('User:', response.user);

      // 保存用户信息和 token 到 store
      login(response.user, response.token);
      
      // 等待 store 持久化完成
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 验证 store 中的数据
      const storeState = useAuthStore.getState();
      console.log('Store 状态:', {
        isAuthenticated: storeState.isAuthenticated,
        hasToken: !!storeState.token,
        hasUser: !!storeState.user,
        token: storeState.token?.substring(0, 20) + '...',
      });
      
      // 验证 localStorage
      const localStorageData = localStorage.getItem('auth-storage');
      console.log('localStorage 数据:', localStorageData);

      // 根据角色跳转到对应首页
      const role = response.user.role.toLowerCase();
      switch (role) {
        case 'admin':
          navigate('/admin');
          break;
        case 'parent':
          navigate('/parent');
          break;
        case 'student':
          navigate('/student');
          break;
        default:
          navigate('/');
      }
    } catch (err: unknown) {
      console.error('登录失败:', err);
      setError(getErrorMessage(err, '登录失败，请检查用户名和密码'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="max-w-md w-full mx-4">
        {/* 登录卡片 */}
        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* 标题 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              智能提分训练平台
            </h1>
            <p className="text-gray-600">欢迎回来，请登录您的账户</p>
          </div>

          {/* 登录表单 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 错误提示 */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* 用户名输入 */}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                用户名
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="请输入用户名"
                disabled={loading}
              />
            </div>

            {/* 密码输入 */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="请输入密码"
                disabled={loading}
              />
            </div>

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
            >
              {loading ? '登录中...' : '登录'}
            </button>

            {/* 注册链接 */}
            <div className="text-center">
              <p className="text-sm text-gray-600">
                还没有账户？
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="text-blue-600 hover:text-blue-700 font-medium ml-1"
                  disabled={loading}
                >
                  立即注册
                </button>
              </p>
            </div>
          </form>

          {/* 测试账户提示（开发环境） */}
          {import.meta.env.DEV && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-600 font-medium mb-2">
                测试账户：
              </p>
              <div className="text-xs text-gray-500 space-y-1">
                <p>管理员: admin / password123</p>
                <p>家长: parent1 / password123</p>
                <p>学员: student1 / password123</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
