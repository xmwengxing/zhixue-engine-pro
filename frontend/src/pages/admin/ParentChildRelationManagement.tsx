import React, { useState, useEffect } from 'react';
import request from '../../utils/request';

/**
 * 亲子关系数据接口
 */
interface ParentChildRelation {
  id: string;
  parentId: string;
  parentName: string;
  parentUsername: string;
  parentEmail?: string;
  parentPhone?: string;
  studentId: string;
  studentName: string;
  studentUsername: string;
  studentIdNumber: string;
  studentGender?: string;
  studentGrade?: string;
  studentSchool?: string;
  relation: string;
  bindedAt: string;
  status: string;
}

/**
 * API 响应接口
 */
interface RelationsResponse {
  success: boolean;
  data: {
    relations: ParentChildRelation[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * 统计信息接口
 */
interface StatsResponse {
  success: boolean;
  data: {
    totalRelations: number;
    activeRelations: number;
    unboundRelations: number;
    totalParents: number;
    totalStudents: number;
  };
}

/**
 * 管理员亲子关系管理页面
 */
const ParentChildRelationManagement: React.FC = () => {
  const [relations, setRelations] = useState<ParentChildRelation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(10);
  
  // 搜索和筛选状态
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  
  // 统计信息
  const [stats, setStats] = useState({
    totalRelations: 0,
    activeRelations: 0,
    unboundRelations: 0,
    totalParents: 0,
    totalStudents: 0,
  });
  
  // 解绑确认对话框
  const [unbindDialogOpen, setUnbindDialogOpen] = useState(false);
  const [selectedRelation, setSelectedRelation] = useState<ParentChildRelation | null>(null);
  const [unbinding, setUnbinding] = useState(false);

  /**
   * 获取统计信息
   */
  const fetchStats = async () => {
    try {
      const response = await request.get<StatsResponse>('/admin/relations/stats');

      if (response.success) {
        setStats(response.data);
      }
    } catch (err: any) {
      console.error('获取统计信息失败:', err);
    }
  };

  /**
   * 获取亲子关系列表
   */
  const fetchRelations = async () => {
    setLoading(true);
    setError(null);

    try {
      const params: any = {
        page: currentPage,
        limit: pageSize,
      };

      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      if (statusFilter) {
        params.status = statusFilter;
      }

      const response = await request.get<RelationsResponse>(
        '/admin/relations',
        {
          params,
        }
      );

      if (response.success) {
        setRelations(response.data.relations);
        setTotal(response.data.total);
        setTotalPages(response.data.totalPages);
      }
    } catch (err: any) {
      console.error('获取亲子关系列表失败:', err);
      setError(err.response?.data?.error?.message || '获取亲子关系列表失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理搜索
   */
  const handleSearch = () => {
    setCurrentPage(1);
    fetchRelations();
  };

  /**
   * 处理重置搜索
   */
  const handleResetSearch = () => {
    setSearchTerm('');
    setStatusFilter('');
    setCurrentPage(1);
  };

  /**
   * 打开解绑确认对话框
   */
  const handleOpenUnbindDialog = (relation: ParentChildRelation) => {
    setSelectedRelation(relation);
    setUnbindDialogOpen(true);
  };

  /**
   * 关闭解绑确认对话框
   */
  const handleCloseUnbindDialog = () => {
    setUnbindDialogOpen(false);
    setSelectedRelation(null);
  };

  /**
   * 执行解绑操作
   */
  const handleUnbind = async () => {
    if (!selectedRelation) return;

    setUnbinding(true);
    setError(null);

    try {
      const response = await request.delete(
        `/admin/relations/${selectedRelation.id}/unbind`
      );

      if (response.success) {
        // 刷新列表和统计信息
        await Promise.all([fetchRelations(), fetchStats()]);
        handleCloseUnbindDialog();
        
        // 显示成功提示
        alert('解绑成功');
      }
    } catch (err: any) {
      console.error('解绑失败:', err);
      setError(err.response?.data?.error?.message || '解绑失败');
    } finally {
      setUnbinding(false);
    }
  };

  /**
   * 格式化日期
   */
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * 获取状态标签样式
   */
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-500/20 text-green-400';
      case 'UNBOUND':
        return 'bg-gray-500/20 text-gray-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  /**
   * 获取状态文本
   */
  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return '活跃';
      case 'UNBOUND':
        return '已解绑';
      default:
        return status;
    }
  };

  // 初始加载
  useEffect(() => {
    fetchStats();
    fetchRelations();
  }, [currentPage, statusFilter]);

  // 重置搜索时重新加载
  useEffect(() => {
    if (!searchTerm && !statusFilter) {
      fetchRelations();
    }
  }, [searchTerm, statusFilter]);

  return (
    <div className="flex flex-1 flex-col h-full min-h-screen bg-[#111722]">
      <div className="px-4 md:px-8 lg:px-12 flex flex-1 flex-col py-8">
        <div className="flex flex-col max-w-[1400px] w-full mx-auto gap-8">
          {/* 页面标题 */}
          <div className="flex flex-col gap-2">
            <h1 className="text-white tracking-tight text-[32px] font-bold leading-tight">
              亲子关系管理
            </h1>
            <p className="text-[#92a4c9] text-sm">
              查看和管理家长与学员的绑定关系
            </p>
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-[#1a2332] rounded-xl p-4 border border-[#324467]">
              <div className="flex items-center gap-3">
                <div className="bg-blue-500/20 rounded-lg p-2">
                  <span className="material-symbols-outlined text-blue-400 text-[24px]">
                    account_tree
                  </span>
                </div>
                <div>
                  <p className="text-[#92a4c9] text-xs">总关系数</p>
                  <p className="text-white text-xl font-bold">{stats.totalRelations}</p>
                </div>
              </div>
            </div>

            <div className="bg-[#1a2332] rounded-xl p-4 border border-[#324467]">
              <div className="flex items-center gap-3">
                <div className="bg-green-500/20 rounded-lg p-2">
                  <span className="material-symbols-outlined text-green-400 text-[24px]">
                    check_circle
                  </span>
                </div>
                <div>
                  <p className="text-[#92a4c9] text-xs">活跃关系</p>
                  <p className="text-white text-xl font-bold">{stats.activeRelations}</p>
                </div>
              </div>
            </div>

            <div className="bg-[#1a2332] rounded-xl p-4 border border-[#324467]">
              <div className="flex items-center gap-3">
                <div className="bg-gray-500/20 rounded-lg p-2">
                  <span className="material-symbols-outlined text-gray-400 text-[24px]">
                    link_off
                  </span>
                </div>
                <div>
                  <p className="text-[#92a4c9] text-xs">已解绑</p>
                  <p className="text-white text-xl font-bold">{stats.unboundRelations}</p>
                </div>
              </div>
            </div>

            <div className="bg-[#1a2332] rounded-xl p-4 border border-[#324467]">
              <div className="flex items-center gap-3">
                <div className="bg-purple-500/20 rounded-lg p-2">
                  <span className="material-symbols-outlined text-purple-400 text-[24px]">
                    supervisor_account
                  </span>
                </div>
                <div>
                  <p className="text-[#92a4c9] text-xs">家长数</p>
                  <p className="text-white text-xl font-bold">{stats.totalParents}</p>
                </div>
              </div>
            </div>

            <div className="bg-[#1a2332] rounded-xl p-4 border border-[#324467]">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500/20 rounded-lg p-2">
                  <span className="material-symbols-outlined text-orange-400 text-[24px]">
                    school
                  </span>
                </div>
                <div>
                  <p className="text-[#92a4c9] text-xs">学员数</p>
                  <p className="text-white text-xl font-bold">{stats.totalStudents}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 搜索和筛选 */}
          <div className="bg-[#1a2332] rounded-xl p-6 border border-[#324467]">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="搜索家长或学员姓名、账户名、学号..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full px-4 py-2 bg-[#111722] border border-[#324467] rounded-lg text-white placeholder-[#92a4c9] focus:outline-none focus:border-primary"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 bg-[#111722] border border-[#324467] rounded-lg text-white focus:outline-none focus:border-primary"
              >
                <option value="">全部状态</option>
                <option value="ACTIVE">活跃</option>
                <option value="UNBOUND">已解绑</option>
              </select>

              <button
                onClick={handleSearch}
                className="px-6 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">search</span>
                搜索
              </button>

              <button
                onClick={handleResetSearch}
                className="px-6 py-2 bg-[#324467] hover:bg-[#3d5478] text-white rounded-lg transition-colors"
              >
                重置
              </button>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* 关系列表 */}
          <div className="bg-[#1a2332] rounded-xl border border-[#324467] overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : relations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <span className="material-symbols-outlined text-[#92a4c9] text-[48px]">
                  account_tree
                </span>
                <p className="text-[#92a4c9] text-sm">暂无亲子关系数据</p>
              </div>
            ) : (
              <>
                {/* 表格 - 桌面端 */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#111722] border-b border-[#324467]">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-[#92a4c9] uppercase tracking-wider">
                          家长信息
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-[#92a4c9] uppercase tracking-wider">
                          学员信息
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-[#92a4c9] uppercase tracking-wider">
                          关系
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-[#92a4c9] uppercase tracking-wider">
                          绑定时间
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-[#92a4c9] uppercase tracking-wider">
                          状态
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-[#92a4c9] uppercase tracking-wider">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#324467]">
                      {relations.map((relation) => (
                        <tr key={relation.id} className="hover:bg-[#111722]/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <p className="text-white text-sm font-medium">{relation.parentName}</p>
                              <p className="text-[#92a4c9] text-xs">@{relation.parentUsername}</p>
                              {relation.parentEmail && (
                                <p className="text-[#92a4c9] text-xs">{relation.parentEmail}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <p className="text-white text-sm font-medium">{relation.studentName}</p>
                              <p className="text-[#92a4c9] text-xs">@{relation.studentUsername}</p>
                              <p className="text-[#92a4c9] text-xs">学号: {relation.studentIdNumber}</p>
                              {relation.studentGrade && (
                                <p className="text-[#92a4c9] text-xs">{relation.studentGrade}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-white text-sm">{relation.relation}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[#92a4c9] text-sm">
                              {formatDate(relation.bindedAt)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(
                                relation.status
                              )}`}
                            >
                              {getStatusText(relation.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {relation.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleOpenUnbindDialog(relation)}
                                className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                              >
                                解绑
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 卡片列表 - 移动端 */}
                <div className="md:hidden divide-y divide-[#324467]">
                  {relations.map((relation) => (
                    <div key={relation.id} className="p-4">
                      <div className="flex flex-col gap-3">
                        {/* 家长信息 */}
                        <div>
                          <p className="text-[#92a4c9] text-xs mb-1">家长</p>
                          <p className="text-white text-sm font-medium">{relation.parentName}</p>
                          <p className="text-[#92a4c9] text-xs">@{relation.parentUsername}</p>
                        </div>

                        {/* 学员信息 */}
                        <div>
                          <p className="text-[#92a4c9] text-xs mb-1">学员</p>
                          <p className="text-white text-sm font-medium">{relation.studentName}</p>
                          <p className="text-[#92a4c9] text-xs">@{relation.studentUsername}</p>
                          <p className="text-[#92a4c9] text-xs">学号: {relation.studentIdNumber}</p>
                        </div>

                        {/* 关系和状态 */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[#92a4c9] text-xs">关系: {relation.relation}</p>
                            <p className="text-[#92a4c9] text-xs">
                              {formatDate(relation.bindedAt)}
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(
                              relation.status
                            )}`}
                          >
                            {getStatusText(relation.status)}
                          </span>
                        </div>

                        {/* 操作按钮 */}
                        {relation.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleOpenUnbindDialog(relation)}
                            className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors text-sm font-medium"
                          >
                            解绑
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 分页 */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 border-t border-[#324467] flex items-center justify-between">
                    <p className="text-[#92a4c9] text-sm">
                      共 {total} 条记录，第 {currentPage} / {totalPages} 页
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 bg-[#324467] hover:bg-[#3d5478] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        上一页
                      </button>
                      <button
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 bg-[#324467] hover:bg-[#3d5478] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 解绑确认对话框 */}
      {unbindDialogOpen && selectedRelation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a2332] rounded-xl border border-[#324467] max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-500/20 rounded-lg p-2">
                <span className="material-symbols-outlined text-red-400 text-[24px]">
                  warning
                </span>
              </div>
              <h3 className="text-white text-lg font-bold">确认解绑</h3>
            </div>

            <div className="mb-6">
              <p className="text-[#92a4c9] text-sm mb-4">
                您确定要解绑以下亲子关系吗？
              </p>
              <div className="bg-[#111722] rounded-lg p-4 space-y-2">
                <p className="text-white text-sm">
                  <span className="text-[#92a4c9]">家长：</span>
                  {selectedRelation.parentName} (@{selectedRelation.parentUsername})
                </p>
                <p className="text-white text-sm">
                  <span className="text-[#92a4c9]">学员：</span>
                  {selectedRelation.studentName} (@{selectedRelation.studentUsername})
                </p>
                <p className="text-white text-sm">
                  <span className="text-[#92a4c9]">学号：</span>
                  {selectedRelation.studentIdNumber}
                </p>
              </div>
              <p className="text-[#92a4c9] text-xs mt-4">
                注意：解绑后，家长和学员的账户及历史数据将保留，仅删除绑定关系。
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCloseUnbindDialog}
                disabled={unbinding}
                className="flex-1 px-4 py-2 bg-[#324467] hover:bg-[#3d5478] text-white rounded-lg transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleUnbind}
                disabled={unbinding}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {unbinding ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    解绑中...
                  </>
                ) : (
                  '确认解绑'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentChildRelationManagement;
