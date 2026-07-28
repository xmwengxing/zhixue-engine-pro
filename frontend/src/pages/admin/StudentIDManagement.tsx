import { useState, useEffect, useCallback } from 'react';

// 学号状态类型
type StudentIDStatus = 'AVAILABLE' | 'ASSIGNED' | 'LOCKED';

// 学号数据类型
interface StudentID {
  id: string;
  studentIdNumber: string;
  status: StudentIDStatus;
  userId?: string;
  user?: {
    id: string;
    username: string;
    realName?: string;
    role: string;
    status: string;
  };
  assignedAt?: string;
  createdAt: string;
}

// 学号统计数据类型
interface StudentIDStats {
  total: number;
  available: number;
  assigned: number;
  locked: number;
}

/**
 * 管理员学号管理页面
 */
export default function StudentIDManagement() {
  const [studentIds, setStudentIds] = useState<StudentID[]>([]);
  const [stats, setStats] = useState<StudentIDStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StudentIDStatus | ''>('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showUnbindModal, setShowUnbindModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<StudentID | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // 获取学号列表
  const fetchStudentIds = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
      });

      if (statusFilter) params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/admin/student-ids?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setStudentIds(data.data.studentIds);
        setTotal(data.data.total);
        setTotalPages(data.data.totalPages);
      }
    } catch (error) {
      console.error('获取学号列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchQuery]);

  // 获取学号统计
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/admin/student-ids/stats`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('获取学号统计失败:', error);
    }
  }, []);

  useEffect(() => {
    fetchStudentIds();
    fetchStats();
  }, [fetchStudentIds, fetchStats]);

  // 搜索处理
  const handleSearch = () => {
    setPage(1);
    fetchStudentIds();
  };

  // 分配学号
  const handleAssign = async () => {
    if (!selectedStudentId || !assignUserId.trim()) return;

    try {
      setActionLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/admin/student-ids/assign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentIdId: selectedStudentId.id,
          userId: assignUserId.trim(),
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert('学号分配成功');
        setShowAssignModal(false);
        setAssignUserId('');
        fetchStudentIds();
        fetchStats();
      } else {
        alert(`分配失败: ${data.error?.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('分配学号失败:', error);
      alert('分配失败，请稍后重试');
    } finally {
      setActionLoading(false);
    }
  };

  // 解绑学号
  const handleUnbind = async () => {
    if (!selectedStudentId) return;

    try {
      setActionLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/admin/student-ids/${selectedStudentId.id}/unbind`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        alert('学号解绑成功');
        setShowUnbindModal(false);
        fetchStudentIds();
        fetchStats();
      } else {
        alert(`解绑失败: ${data.error?.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('解绑学号失败:', error);
      alert('解绑失败，请稍后重试');
    } finally {
      setActionLoading(false);
    }
  };

  // 锁定学号
  const handleLock = async () => {
    if (!selectedStudentId) return;

    try {
      setActionLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/admin/student-ids/${selectedStudentId.id}/lock`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        alert('学号锁定成功');
        setShowLockModal(false);
        fetchStudentIds();
        fetchStats();
      } else {
        alert(`锁定失败: ${data.error?.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('锁定学号失败:', error);
      alert('锁定失败，请稍后重试');
    } finally {
      setActionLoading(false);
    }
  };

  // 解锁学号
  const handleUnlock = async () => {
    if (!selectedStudentId) return;

    try {
      setActionLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/admin/student-ids/${selectedStudentId.id}/unlock`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        alert('学号解锁成功');
        setShowUnlockModal(false);
        fetchStudentIds();
        fetchStats();
      } else {
        alert(`解锁失败: ${data.error?.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('解锁学号失败:', error);
      alert('解锁失败，请稍后重试');
    } finally {
      setActionLoading(false);
    }
  };

  // 状态徽章颜色
  const getStatusBadgeClass = (status: StudentIDStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-green-500/10 text-green-400 ring-green-500/20';
      case 'ASSIGNED':
        return 'bg-cyan-500/10 text-cyan-400 ring-cyan-500/20';
      case 'LOCKED':
        return 'bg-red-500/10 text-red-400 ring-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 ring-gray-500/20';
    }
  };

  // 状态中文名
  const getStatusLabel = (status: StudentIDStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return '可用';
      case 'ASSIGNED':
        return '已分配';
      case 'LOCKED':
        return '已锁定';
      default:
        return status;
    }
  };

  // 格式化时间
  const formatTime = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
  };

  return (
    <div className="flex flex-1 flex-col h-full min-h-screen bg-[#111722]">
      <div className="px-4 md:px-8 lg:px-12 flex flex-1 justify-center py-8">
        <div className="flex flex-col max-w-[1200px] flex-1 gap-8">
          {/* 页面标题 */}
          <div className="flex flex-wrap justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="text-white tracking-tight text-[32px] font-bold leading-tight">
                学号管理中心
              </h1>
              <p className="text-[#92a4c9] text-sm font-normal leading-normal max-w-2xl">
                管理学号的分配状态，支持分配、解绑、锁定和解锁操作。
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
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="flex flex-col gap-2 rounded-xl p-6 border border-[#324467] bg-[#1a2436]">
                <div className="flex items-center justify-between">
                  <p className="text-[#92a4c9] text-sm font-medium leading-normal">总学号数</p>
                  <span className="material-symbols-outlined text-[#135bec]">badge</span>
                </div>
                <p className="text-white tracking-tight text-3xl font-bold leading-tight">
                  {stats.total}
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-xl p-6 border border-[#324467] bg-[#1a2436]">
                <div className="flex items-center justify-between">
                  <p className="text-[#92a4c9] text-sm font-medium leading-normal">可用学号</p>
                  <span className="material-symbols-outlined text-[#10b981]">check_circle</span>
                </div>
                <p className="text-white tracking-tight text-3xl font-bold leading-tight">
                  {stats.available}
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-xl p-6 border border-[#324467] bg-[#1a2436]">
                <div className="flex items-center justify-between">
                  <p className="text-[#92a4c9] text-sm font-medium leading-normal">已分配</p>
                  <span className="material-symbols-outlined text-[#06b6d4]">person</span>
                </div>
                <p className="text-white tracking-tight text-3xl font-bold leading-tight">
                  {stats.assigned}
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-xl p-6 border border-[#324467] bg-[#1a2436]">
                <div className="flex items-center justify-between">
                  <p className="text-[#92a4c9] text-sm font-medium leading-normal">已锁定</p>
                  <span className="material-symbols-outlined text-[#ef4444]">lock</span>
                </div>
                <p className="text-white tracking-tight text-3xl font-bold leading-tight">
                  {stats.locked}
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
                  placeholder="搜索学号或用户名..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>

              {/* 筛选按钮 */}
              <div className="flex gap-2">
                <select
                  className="h-10 rounded-lg bg-[#232f48] hover:bg-[#324467] px-4 text-white text-sm transition-colors focus:outline-none"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StudentIDStatus | '')}
                >
                  <option value="">状态：全部</option>
                  <option value="AVAILABLE">可用</option>
                  <option value="ASSIGNED">已分配</option>
                  <option value="LOCKED">已锁定</option>
                </select>
              </div>
            </div>
          </div>

          {/* 学号列表表格 */}
          <div className="w-full overflow-hidden rounded-xl border border-[#324467] bg-[#1a2436] shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-white whitespace-nowrap">
                <thead className="bg-[#232f48] text-[#92a4c9]">
                  <tr>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      学号
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      状态
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      关联用户
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      姓名
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      分配时间
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      创建时间
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-right">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#324467]">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-[#92a4c9]">
                        加载中...
                      </td>
                    </tr>
                  ) : studentIds.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-[#92a4c9]">
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    studentIds.map((studentId) => (
                      <tr
                        key={studentId.id}
                        className="group hover:bg-[#232f48]/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <span className="font-medium text-white">{studentId.studentIdNumber}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${getStatusBadgeClass(
                              studentId.status
                            )}`}
                          >
                            {getStatusLabel(studentId.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {studentId.user?.username || '-'}
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {studentId.user?.realName || '-'}
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {formatTime(studentId.assignedAt)}
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {formatTime(studentId.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {studentId.status === 'AVAILABLE' && (
                              <button
                                onClick={() => {
                                  setSelectedStudentId(studentId);
                                  setShowAssignModal(true);
                                }}
                                className="text-[#92a4c9] hover:text-white transition-colors"
                                title="分配"
                              >
                                <span className="material-symbols-outlined text-[20px]">person_add</span>
                              </button>
                            )}
                            {studentId.status === 'ASSIGNED' && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedStudentId(studentId);
                                    setShowUnbindModal(true);
                                  }}
                                  className="text-[#92a4c9] hover:text-yellow-400 transition-colors"
                                  title="解绑"
                                >
                                  <span className="material-symbols-outlined text-[20px]">link_off</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedStudentId(studentId);
                                    setShowLockModal(true);
                                  }}
                                  className="text-[#92a4c9] hover:text-red-400 transition-colors"
                                  title="锁定"
                                >
                                  <span className="material-symbols-outlined text-[20px]">lock</span>
                                </button>
                              </>
                            )}
                            {studentId.status === 'LOCKED' && (
                              <button
                                onClick={() => {
                                  setSelectedStudentId(studentId);
                                  setShowUnlockModal(true);
                                }}
                                className="text-[#92a4c9] hover:text-green-400 transition-colors"
                                title="解锁"
                              >
                                <span className="material-symbols-outlined text-[20px]">lock_open</span>
                              </button>
                            )}
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

      {/* 分配学号弹窗 */}
      {showAssignModal && selectedStudentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#1a2436] rounded-xl border border-[#324467] p-6 w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">分配学号</h2>
            <p className="text-[#92a4c9] text-sm mb-4">
              学号：<span className="text-white font-medium">{selectedStudentId.studentIdNumber}</span>
            </p>
            <div className="mb-6">
              <label className="block text-[#92a4c9] text-sm mb-2">用户 ID</label>
              <input
                type="text"
                className="w-full h-10 rounded-lg bg-[#232f48] px-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="请输入用户 ID"
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setAssignUserId('');
                }}
                className="px-4 py-2 rounded-lg bg-[#232f48] hover:bg-[#324467] text-white text-sm transition-colors"
                disabled={actionLoading}
              >
                取消
              </button>
              <button
                onClick={handleAssign}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-blue-600 text-white text-sm transition-colors"
                disabled={actionLoading || !assignUserId.trim()}
              >
                {actionLoading ? '处理中...' : '确认分配'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 解绑学号确认弹窗 */}
      {showUnbindModal && selectedStudentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#1a2436] rounded-xl border border-[#324467] p-6 w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">解绑学号</h2>
            <p className="text-[#92a4c9] text-sm mb-6">
              确定要解绑学号 <span className="text-white font-medium">{selectedStudentId.studentIdNumber}</span> 吗？
              解绑后该学号将变为可用状态。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowUnbindModal(false)}
                className="px-4 py-2 rounded-lg bg-[#232f48] hover:bg-[#324467] text-white text-sm transition-colors"
                disabled={actionLoading}
              >
                取消
              </button>
              <button
                onClick={handleUnbind}
                className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white text-sm transition-colors"
                disabled={actionLoading}
              >
                {actionLoading ? '处理中...' : '确认解绑'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 锁定学号确认弹窗 */}
      {showLockModal && selectedStudentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#1a2436] rounded-xl border border-[#324467] p-6 w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">锁定学号</h2>
            <p className="text-[#92a4c9] text-sm mb-6">
              确定要锁定学号 <span className="text-white font-medium">{selectedStudentId.studentIdNumber}</span> 吗？
              锁定后该学号将无法使用。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLockModal(false)}
                className="px-4 py-2 rounded-lg bg-[#232f48] hover:bg-[#324467] text-white text-sm transition-colors"
                disabled={actionLoading}
              >
                取消
              </button>
              <button
                onClick={handleLock}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm transition-colors"
                disabled={actionLoading}
              >
                {actionLoading ? '处理中...' : '确认锁定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 解锁学号确认弹窗 */}
      {showUnlockModal && selectedStudentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#1a2436] rounded-xl border border-[#324467] p-6 w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">解锁学号</h2>
            <p className="text-[#92a4c9] text-sm mb-6">
              确定要解锁学号 <span className="text-white font-medium">{selectedStudentId.studentIdNumber}</span> 吗？
              解锁后该学号将恢复为已分配状态。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowUnlockModal(false)}
                className="px-4 py-2 rounded-lg bg-[#232f48] hover:bg-[#324467] text-white text-sm transition-colors"
                disabled={actionLoading}
              >
                取消
              </button>
              <button
                onClick={handleUnlock}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm transition-colors"
                disabled={actionLoading}
              >
                {actionLoading ? '处理中...' : '确认解锁'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
