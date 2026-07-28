import { useState } from 'react';
import { usePreventDoubleSubmit } from '../../hooks/useDebounce';

interface User {
  id: string;
  username: string;
  role: 'ADMIN' | 'PARENT' | 'STUDENT';
  email?: string;
}

interface DeleteUserModalProps {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * 删除用户确认弹窗组件
 */
export default function DeleteUserModal({ user, onClose, onSuccess }: DeleteUserModalProps) {
  const [error, setError] = useState('');
  const [confirmText, setConfirmText] = useState('');

  // 使用防重复提交Hook
  const { execute: deleteUser, loading } = usePreventDoubleSubmit(async () => {
    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || '删除用户失败');
    }

    onSuccess();
    onClose();
  });

  // 获取角色中文名
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return '管理员';
      case 'PARENT':
        return '家长';
      case 'STUDENT':
        return '学员';
      default:
        return role;
    }
  };

  // 提交删除
  const handleDelete = async () => {
    if (confirmText !== user.username) {
      setError('输入的用户名不匹配');
      return;
    }

    setError('');

    try {
      await deleteUser();
    } catch (err: any) {
      setError(err.message || '删除用户失败');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-[#1a2436] border border-[#324467] shadow-xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-[#324467] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
              <span className="material-symbols-outlined text-red-400">warning</span>
            </div>
            <h2 className="text-xl font-bold text-white">删除用户</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#92a4c9] hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-4">
          {/* 错误提示 */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* 警告信息 */}
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-3">
            <p className="text-yellow-400 text-sm font-medium mb-2">
              ⚠️ 此操作将会：
            </p>
            <ul className="text-yellow-400 text-sm space-y-1 list-disc list-inside">
              <li>将用户状态设置为"已删除"</li>
              <li>用户将无法登录系统</li>
              <li>用户的历史数据将被保留</li>
              {user.role === 'PARENT' && <li>与学员的绑定关系将保留</li>}
              {user.role === 'STUDENT' && <li>学号和档案数据将保留</li>}
            </ul>
          </div>

          {/* 用户信息 */}
          <div className="rounded-lg bg-[#232f48] border border-[#324467] p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-[#92a4c9] text-sm">用户名：</span>
              <span className="text-white font-medium">{user.username}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#92a4c9] text-sm">角色：</span>
              <span className="text-white font-medium">{getRoleLabel(user.role)}</span>
            </div>
            {user.email && (
              <div className="flex justify-between">
                <span className="text-[#92a4c9] text-sm">邮箱：</span>
                <span className="text-white font-medium">{user.email}</span>
              </div>
            )}
          </div>

          {/* 确认输入 */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              请输入用户名 <span className="text-red-400">{user.username}</span> 以确认删除
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-red-500 transition-colors"
              placeholder="输入用户名确认"
            />
          </div>

          {/* 按钮组 */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 rounded-lg bg-[#232f48] hover:bg-[#324467] text-white transition-colors"
              disabled={loading}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-6 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || confirmText !== user.username}
            >
              {loading ? '删除中...' : '确认删除'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
