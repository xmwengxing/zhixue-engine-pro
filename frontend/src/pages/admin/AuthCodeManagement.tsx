import { useState, useEffect, useCallback } from 'react';

// 授权码状态类型
type AuthCodeStatus = 'UNUSED' | 'USED' | 'EXPIRED';

// 授权码数据类型
interface AuthCode {
  id: string;
  code: string;
  status: AuthCodeStatus;
  expiryDate: string;
  usedBy?: string;
  usedByUsername?: string;
  usedAt?: string;
  createdAt: string;
}

// 授权码统计数据类型
interface AuthCodeStats {
  total: number;
  unused: number;
  used: number;
  expired: number;
}

/**
 * 管理员授权码管理页面
 */
export default function AuthCodeManagement() {
  const [authCodes, setAuthCodes] = useState<AuthCode[]>([]);
  const [stats, setStats] = useState<AuthCodeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AuthCodeStatus | ''>('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAuthCode, setSelectedAuthCode] = useState<AuthCode | null>(null);
  const [generateCount, setGenerateCount] = useState('10');
  const [expiryDays, setExpiryDays] = useState('30');
  const [actionLoading, setActionLoading] = useState(false);

  // 获取授权码列表
  const fetchAuthCodes = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
      });

      if (statusFilter) params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/auth-codes?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setAuthCodes(data.data.authCodes);
        setTotal(data.data.total);
        setTotalPages(data.data.totalPages);
      }
    } catch (error) {
      console.error('获取授权码列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchQuery]);

  // 获取授权码统计
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/auth-codes/stats`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('获取授权码统计失败:', error);
    }
  }, []);

  useEffect(() => {
    fetchAuthCodes();
    fetchStats();
  }, [fetchAuthCodes, fetchStats, page, statusFilter]);

  // 搜索处理
  const handleSearch = () => {
    setPage(1);
    fetchAuthCodes();
  };

  // 批量生成授权码
  const handleGenerate = async () => {
    const count = parseInt(generateCount);
    const days = parseInt(expiryDays);

    if (isNaN(count) || count <= 0 || count > 1000) {
      alert('请输入有效的生成数量（1-1000）');
      return;
    }

    if (isNaN(days) || days <= 0 || days > 365) {
      alert('请输入有效的有效期天数（1-365）');
      return;
    }

    try {
      setActionLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/auth-codes/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          count,
          expiryDays: days,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`成功生成 ${data.data.authCodes.length} 个授权码`);
        setShowGenerateModal(false);
        setGenerateCount('10');
        setExpiryDays('30');
        fetchAuthCodes();
        fetchStats();
      } else {
        alert(`生成失败: ${data.error?.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('生成授权码失败:', error);
      alert('生成失败，请稍后重试');
    } finally {
      setActionLoading(false);
    }
  };

  // 导出授权码为 CSV
  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/auth-codes/export?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `auth-codes-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        alert('导出成功');
      } else {
        alert('导出失败');
      }
    } catch (error) {
      console.error('导出授权码失败:', error);
      alert('导出失败，请稍后重试');
    }
  };

  // 删除授权码
  const handleDelete = async () => {
    if (!selectedAuthCode) return;

    try {
      setActionLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/auth-codes/${selectedAuthCode.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        alert('删除成功');
        setShowDeleteModal(false);
        fetchAuthCodes();
        fetchStats();
      } else {
        alert(`删除失败: ${data.error?.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('删除授权码失败:', error);
      alert('删除失败，请稍后重试');
    } finally {
      setActionLoading(false);
    }
  };

  // 状态徽章颜色
  const getStatusBadgeClass = (status: AuthCodeStatus) => {
    switch (status) {
      case 'UNUSED':
        return 'bg-green-500/10 text-green-400 ring-green-500/20';
      case 'USED':
        return 'bg-cyan-500/10 text-cyan-400 ring-cyan-500/20';
      case 'EXPIRED':
        return 'bg-red-500/10 text-red-400 ring-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 ring-gray-500/20';
    }
  };

  // 状态中文名
  const getStatusLabel = (status: AuthCodeStatus) => {
    switch (status) {
      case 'UNUSED':
        return '未使用';
      case 'USED':
        return '已使用';
      case 'EXPIRED':
        return '已过期';
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

  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN');
  };

  // 检查是否过期
  const isExpired = (expiryDate: string) => {
    return new Date(expiryDate) < new Date();
  };

  return (
    <div className="flex flex-1 flex-col h-full min-h-screen bg-[#111722]">
      <div className="px-4 md:px-8 lg:px-12 flex flex-1 justify-center py-8">
        <div className="flex flex-col max-w-[1200px] flex-1 gap-8">
          {/* 页面标题 */}
          <div className="flex flex-wrap justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="text-white tracking-tight text-[32px] font-bold leading-tight">
                授权码批量管理中心
              </h1>
              <p className="text-[#92a4c9] text-sm font-normal leading-normal max-w-2xl">
                批量生成授权码，管理授权码状态，支持导出为 CSV 格式。
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
                  <p className="text-[#92a4c9] text-sm font-medium leading-normal">总授权码数</p>
                  <span className="material-symbols-outlined text-[#135bec]">key</span>
                </div>
                <p className="text-white tracking-tight text-3xl font-bold leading-tight">
                  {stats.total}
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-xl p-6 border border-[#324467] bg-[#1a2436]">
                <div className="flex items-center justify-between">
                  <p className="text-[#92a4c9] text-sm font-medium leading-normal">未使用</p>
                  <span className="material-symbols-outlined text-[#10b981]">check_circle</span>
                </div>
                <p className="text-white tracking-tight text-3xl font-bold leading-tight">
                  {stats.unused}
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-xl p-6 border border-[#324467] bg-[#1a2436]">
                <div className="flex items-center justify-between">
                  <p className="text-[#92a4c9] text-sm font-medium leading-normal">已使用</p>
                  <span className="material-symbols-outlined text-[#06b6d4]">done_all</span>
                </div>
                <p className="text-white tracking-tight text-3xl font-bold leading-tight">
                  {stats.used}
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-xl p-6 border border-[#324467] bg-[#1a2436]">
                <div className="flex items-center justify-between">
                  <p className="text-[#92a4c9] text-sm font-medium leading-normal">已过期</p>
                  <span className="material-symbols-outlined text-[#ef4444]">event_busy</span>
                </div>
                <p className="text-white tracking-tight text-3xl font-bold leading-tight">
                  {stats.expired}
                </p>
              </div>
            </div>
          )}

          {/* 搜索和操作栏 */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="flex flex-1 flex-col md:flex-row gap-3 w-full md:w-auto">
              {/* 搜索框 */}
              <div className="relative flex h-10 w-full md:w-64 items-center rounded-lg bg-[#232f48] px-3 border border-transparent focus-within:border-primary transition-colors">
                <span className="material-symbols-outlined text-[#92a4c9] text-[20px]">search</span>
                <input
                  className="flex-1 bg-transparent px-2 text-sm text-white placeholder:text-[#92a4c9] focus:outline-none"
                  placeholder="搜索授权码..."
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
                  onChange={(e) => setStatusFilter(e.target.value as AuthCodeStatus | '')}
                >
                  <option value="">状态：全部</option>
                  <option value="UNUSED">未使用</option>
                  <option value="USED">已使用</option>
                  <option value="EXPIRED">已过期</option>
                </select>
              </div>
            </div>

            {/* 操作按钮组 */}
            <div className="flex gap-3">
              <button
                onClick={handleExport}
                className="flex h-10 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-[#232f48] hover:bg-[#324467] px-5 transition-colors"
              >
                <span className="material-symbols-outlined text-white text-[20px]">download</span>
                <span className="text-white text-sm font-medium leading-normal">导出 CSV</span>
              </button>
              <button
                onClick={() => setShowGenerateModal(true)}
                className="flex h-10 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-primary hover:bg-blue-600 px-5 transition-colors shadow-lg shadow-blue-900/20"
              >
                <span className="material-symbols-outlined text-white text-[20px]">add</span>
                <span className="text-white text-sm font-bold leading-normal">批量生成</span>
              </button>
            </div>
          </div>

          {/* 授权码列表表格 */}
          <div className="w-full overflow-hidden rounded-xl border border-[#324467] bg-[#1a2436] shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-white whitespace-nowrap">
                <thead className="bg-[#232f48] text-[#92a4c9]">
                  <tr>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      授权码
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      状态
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      过期时间
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      使用者
                    </th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                      使用时间
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
                  ) : authCodes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-[#92a4c9]">
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    authCodes.map((authCode) => (
                      <tr
                        key={authCode.id}
                        className="group hover:bg-[#232f48]/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <span className="font-mono text-white">{authCode.code}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${getStatusBadgeClass(
                              authCode.status
                            )}`}
                          >
                            {getStatusLabel(authCode.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={isExpired(authCode.expiryDate) ? 'text-red-400' : 'text-[#92a4c9]'}>
                            {formatDate(authCode.expiryDate)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {authCode.usedByUsername || '-'}
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {formatTime(authCode.usedAt)}
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {formatTime(authCode.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {authCode.status === 'UNUSED' && (
                              <button
                                onClick={() => {
                                  setSelectedAuthCode(authCode);
                                  setShowDeleteModal(true);
                                }}
                                className="text-[#92a4c9] hover:text-red-400 transition-colors"
                                title="删除"
                              >
                                <span className="material-symbols-outlined text-[20px]">delete</span>
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

      {/* 批量生成授权码弹窗 */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#1a2436] rounded-xl border border-[#324467] p-6 w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">批量生成授权码</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[#92a4c9] text-sm mb-2">生成数量</label>
                <input
                  type="number"
                  className="w-full h-10 rounded-lg bg-[#232f48] px-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="请输入生成数量（1-1000）"
                  value={generateCount}
                  onChange={(e) => setGenerateCount(e.target.value)}
                  min="1"
                  max="1000"
                />
              </div>
              <div>
                <label className="block text-[#92a4c9] text-sm mb-2">有效期（天）</label>
                <input
                  type="number"
                  className="w-full h-10 rounded-lg bg-[#232f48] px-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="请输入有效期天数（1-365）"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  min="1"
                  max="365"
                />
              </div>
              <div className="bg-[#232f48] rounded-lg p-3">
                <p className="text-[#92a4c9] text-xs">
                  <span className="material-symbols-outlined text-[16px] align-middle mr-1">info</span>
                  生成的授权码将在 {expiryDays} 天后过期
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowGenerateModal(false);
                  setGenerateCount('10');
                  setExpiryDays('30');
                }}
                className="px-4 py-2 rounded-lg bg-[#232f48] hover:bg-[#324467] text-white text-sm transition-colors"
                disabled={actionLoading}
              >
                取消
              </button>
              <button
                onClick={handleGenerate}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-blue-600 text-white text-sm transition-colors"
                disabled={actionLoading}
              >
                {actionLoading ? '生成中...' : '确认生成'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除授权码确认弹窗 */}
      {showDeleteModal && selectedAuthCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#1a2436] rounded-xl border border-[#324467] p-6 w-full max-w-md">
            <h2 className="text-white text-xl font-bold mb-4">删除授权码</h2>
            <p className="text-[#92a4c9] text-sm mb-6">
              确定要删除授权码 <span className="text-white font-mono">{selectedAuthCode.code}</span> 吗？
              此操作不可恢复。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-lg bg-[#232f48] hover:bg-[#324467] text-white text-sm transition-colors"
                disabled={actionLoading}
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm transition-colors"
                disabled={actionLoading}
              >
                {actionLoading ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
