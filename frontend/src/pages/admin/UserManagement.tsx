import { useState, useEffect, useCallback } from 'react';
import type { Role, UserStatus } from '../../types/api';
import CreateUserModal from '../../components/admin/CreateUserModal';
import EditUserModal from '../../components/admin/EditUserModal';
import DeleteUserModal from '../../components/admin/DeleteUserModal';
import { useDebounce } from '../../hooks/useDebounce';
import request from '../../utils/request';

// 用户数据类型
interface User {
  id: string;
  username: string;
  role: Role;
  email?: string;
  phone?: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

// 用户统计数据类型
interface UserStats {
  totalUsers: number;
  byRole: {
    admin: number;
    parent: number;
    student: number;
  };
  byStatus: {
    active: number;
    locked: number;
  };
}

/**
 * 管理员用户管理页面
 */
export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // 使用防抖Hook延迟搜索查询
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // 获取用户列表
  // 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {
        page: page.toString(),
        limit: '10',
      };

      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;
      if (debouncedSearchQuery) params.search = debouncedSearchQuery;

      const response = await request.get('/admin/users', { params });

      if (response.success) {
        setUsers(response.data.users);
        setTotal(response.data.total);
        setTotalPages(response.data.totalPages);
      }
    } catch (error) {
      console.error('获取用户列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, statusFilter, debouncedSearchQuery]);

  // 获取用户统计
  // 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
  const fetchStats = useCallback(async () => {
    try {
      const response = await request.get('/admin/users/stats');

      if (response.success) {
        // 修复：使用 response 而不是 data
        setStats(response.data);
      }
    } catch (error) {
      console.error('获取用户统计失败:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, [fetchUsers, fetchStats]);

  // 当搜索查询改变时，重置到第一页
  useEffect(() => {
    if (debouncedSearchQuery !== searchQuery) {
      setPage(1);
    }
  }, [debouncedSearchQuery, searchQuery]);

  // 角色徽章颜色
  const getRoleBadgeClass = (role: Role) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-red-500/10 text-red-400 ring-red-500/20';
      case 'PARENT':
        return 'bg-cyan-500/10 text-cyan-400 ring-cyan-500/20';
      case 'STUDENT':
        return 'bg-purple-500/10 text-purple-400 ring-purple-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 ring-gray-500/20';
    }
  };

  // 角色中文名
  const getRoleLabel = (role: Role) => {
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

  // 状态指示器颜色
  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-500';
      case 'LOCKED':
        return 'bg-yellow-500';
      case 'DELETED':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  // 状态中文名
  const getStatusLabel = (status: UserStatus) => {
    switch (status) {
      case 'ACTIVE':
        return '活跃';
      case 'LOCKED':
        return '锁定';
      case 'DELETED':
        return '已删除';
      default:
        return status;
    }
  };

  // 格式化时间
  const formatTime = (dateString?: string) => {
    if (!dateString) return '从不';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div className="flex flex-1 flex-col h-full min-h-screen bg-[#111722]">
      <div className="px-4 md:px-8 lg:px-12 flex flex-1 justify-center py-8">
        <div className="flex flex-col max-w-[1200px] flex-1 gap-8">
          {/* 页面标题 */}
          <div className="flex flex-wrap justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="text-white tracking-tight text-[32px] font-bold leading-tight">
                用户管理
              </h1>
              <p className="text-[#92a4c9] text-sm font-normal leading-normal max-w-2xl">
                管理学员和家长账户，更新状态，追踪注册情况，并监督平台访问权限。
              </p>
            </div>
            <div className="flex items-end">
              <span className="text-[#92a4c9] text-xs">
                上次更新：{new Date().toLocaleString('zh-CN')}
              </span>
            </div>
          </div>

          {/* 统计卡片 */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2 rounded-xl p-6 border border-[#324467] bg-[#1a2436]">
                <div className="flex items-center justify-between">
                  <p className="text-[#92a4c9] text-sm font-medium leading-normal">总用户数</p>
                  <span className="material-symbols-outlined text-[#135bec]">group</span>
                </div>
                <p className="text-white tracking-tight text-3xl font-bold leading-tight">
                  {stats.totalUsers}
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-xl p-6 border border-[#324467] bg-[#1a2436]">
                <div className="flex items-center justify-between">
                  <p className="text-[#92a4c9] text-sm font-medium leading-normal">活跃学员</p>
                  <span className="material-symbols-outlined text-[#9333ea]">school</span>
                </div>
                <p className="text-white tracking-tight text-3xl font-bold leading-tight">
                  {stats.byRole.student}
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-xl p-6 border border-[#324467] bg-[#1a2436]">
                <div className="flex items-center justify-between">
                  <p className="text-[#92a4c9] text-sm font-medium leading-normal">家长人数</p>
                  <span className="material-symbols-outlined text-[#06b6d4]">family_restroom</span>
                </div>
                <p className="text-white tracking-tight text-3xl font-bold leading-tight">
                  {stats.byRole.parent}
                </p>
              </div>
            </div>
          )}

          {/* 搜索和筛选栏 */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="flex flex-1 flex-col md:flex-row gap-3 w-full md:w-auto">
              {/* 搜索框 */}
              <div className="relative flex h-10 w-full md:w-64 items-center rounded-lg bg-[#232f48] px-3 border border-transparent focus-within:border-primary transition-colors">
                <span className="material-symbols-outlined text-[#92a4c9] text-[20px]">search</span>
                <input
                  className="flex-1 bg-transparent px-2 text-sm text-white placeholder:text-[#92a4c9] focus:outline-none"
                  placeholder="搜索姓名、学号或邮箱..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && fetchUsers()}
                />
              </div>

              {/* 筛选按钮 */}
              <div className="flex gap-2">
                <select
                  className="h-10 rounded-lg bg-[#232f48] hover:bg-[#324467] px-4 text-white text-sm transition-colors focus:outline-none"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as Role | '')}
                >
                  <option value="">角色：全部</option>
                  <option value="ADMIN">管理员</option>
                  <option value="PARENT">家长</option>
                  <option value="STUDENT">学员</option>
                </select>

                <select
                  className="h-10 rounded-lg bg-[#232f48] hover:bg-[#324467] px-4 text-white text-sm transition-colors focus:outline-none"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as UserStatus | '')}
                >
                  <option value="">状态：全部</option>
                  <option value="ACTIVE">活跃</option>
                  <option value="LOCKED">锁定</option>
                  <option value="DELETED">已删除</option>
                </select>
              </div>
            </div>

            {/* 新增用户按钮 */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex h-10 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-primary hover:bg-blue-600 px-5 transition-colors shadow-lg shadow-blue-900/20"
            >
              <span className="material-symbols-outlined text-white text-[20px]">add</span>
              <span className="text-white text-sm font-bold leading-normal">新增用户</span>
            </button>
          </div>

          {/* 用户列表表格 */}
          <div className="w-full overflow-hidden rounded-xl border border-[#324467] bg-[#1a2436] shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-white whitespace-nowrap">
                <thead className="bg-[#232f48] text-[#92a4c9]">
                  <tr>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      用户名
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      角色
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      邮箱
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      状态
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      上次活跃
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-right">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#324467]">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-[#92a4c9]">
                        加载中...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-[#92a4c9]">
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr
                        key={user.id}
                        className="group hover:bg-[#232f48]/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-medium text-white">{user.username}</span>
                            {user.email && (
                              <span className="text-[#92a4c9] text-xs">{user.email}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${getRoleBadgeClass(
                              user.role
                            )}`}
                          >
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {user.email || '-'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-2 w-2 rounded-full ${getStatusColor(user.status)}`}
                            ></div>
                            <span className="text-white">{getStatusLabel(user.status)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {formatTime(user.lastLoginAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setShowEditModal(true);
                              }}
                              className="text-[#92a4c9] hover:text-white transition-colors"
                              title="编辑"
                            >
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setShowDeleteModal(true);
                              }}
                              className="text-[#92a4c9] hover:text-red-400 transition-colors"
                              title="删除"
                            >
                              <span className="material-symbols-outlined text-[20px]">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            <div className="flex items-center justify-between border-t border-[#324467] bg-[#1a2436] px-4 py-3 sm:px-6">
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-[#92a4c9]">
                    显示 <span className="font-medium text-white">{(page - 1) * 10 + 1}</span> 到{' '}
                    <span className="font-medium text-white">
                      {Math.min(page * 10, total)}
                    </span>{' '}
                    条，共 <span className="font-medium text-white">{total}</span> 条结果
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="relative inline-flex items-center rounded-l-md px-2 py-2 text-[#92a4c9] ring-1 ring-inset ring-[#324467] hover:bg-[#232f48] focus:z-20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                          pageNum === page
                            ? 'z-10 bg-primary text-white'
                            : 'text-[#92a4c9] ring-1 ring-inset ring-[#324467] hover:bg-[#232f48]'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                      className="relative inline-flex items-center rounded-r-md px-2 py-2 text-[#92a4c9] ring-1 ring-inset ring-[#324467] hover:bg-[#232f48] focus:z-20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 创建用户弹窗 */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            fetchUsers();
            fetchStats();
          }}
        />
      )}

      {/* 编辑用户弹窗 */}
      {showEditModal && selectedUser && (
        <EditUserModal
          user={selectedUser}
          onClose={() => {
            setShowEditModal(false);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            fetchUsers();
            fetchStats();
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      {showDeleteModal && selectedUser && (
        <DeleteUserModal
          user={selectedUser}
          onClose={() => {
            setShowDeleteModal(false);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            fetchUsers();
            fetchStats();
          }}
        />
      )}
    </div>
  );
}
