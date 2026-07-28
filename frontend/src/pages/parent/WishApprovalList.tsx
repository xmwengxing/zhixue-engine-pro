import React, { useState, useEffect, useCallback } from 'react';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

/**
 * 愿望接口
 */
interface Wish {
  id: string;
  studentId: string;
  description: string;
  requiredPoints: number;
  imageUrl: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
  reviewedBy: string | null;
  reviewReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  fulfilledAt: string | null;
  student: {
    id: string;
    username: string;
    studentProfile: {
      realName: string;
    } | null;
  };
  reviewer: {
    id: string;
    username: string;
  } | null;
}

/**
 * 愿望审批列表页面
 */
const WishApprovalList: React.FC = () => {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'all'>('PENDING');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedWish, setSelectedWish] = useState<Wish | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalReason, setApprovalReason] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const limit = 10;

  /**
   * 加载愿望列表
   * 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
   */
  const loadWishes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string | number> = {
        page,
        limit,
      };

      if (currentTab !== 'all') {
        params.status = currentTab;
      }

      const response = await request.get('/parent/wishes', { params });

      setWishes(response.wishes);
      setTotal(response.total);
    } catch (err: unknown) {
      console.error('加载愿望列表失败:', err);
      setError(getErrorMessage(err, '加载愿望列表失败'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, currentTab]);

  useEffect(() => {
    loadWishes();
  }, [loadWishes]);

  /**
   * 打开审批弹窗
   */
  const handleOpenApprovalModal = (wish: Wish) => {
    setSelectedWish(wish);
    setApprovalReason('');
    setShowApprovalModal(true);
  };

  /**
   * 关闭审批弹窗
   */
  const handleCloseApprovalModal = () => {
    setShowApprovalModal(false);
    setSelectedWish(null);
    setApprovalReason('');
  };

  /**
   * 审批愿望
   */
  const handleApproveWish = async (approved: boolean) => {
    if (!selectedWish) return;

    try {
      setIsApproving(true);

      await request.put(`/parent/wishes/${selectedWish.id}/approve`, {
        approved,
        reason: approvalReason || undefined,
      });

      // 刷新列表
      await loadWishes();

      // 关闭弹窗
      handleCloseApprovalModal();

      // 显示成功提示
      alert(approved ? '愿望已同意' : '愿望已拒绝');
    } catch (err: unknown) {
      console.error('审批失败:', err);
      alert(getErrorMessage(err, '审批失败'));
    } finally {
      setIsApproving(false);
    }
  };

  /**
   * 格式化日期
   */
  const formatDate = (dateString: string): string => {
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
   * 获取状态标签
   */
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="px-2.5 py-1 rounded bg-yellow-500/10 text-yellow-400 text-xs font-bold uppercase">
            待审批
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2.5 py-1 rounded bg-green-500/10 text-green-400 text-xs font-bold uppercase">
            已同意
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2.5 py-1 rounded bg-red-500/10 text-red-400 text-xs font-bold uppercase">
            已拒绝
          </span>
        );
      case 'FULFILLED':
        return (
          <span className="px-2.5 py-1 rounded bg-blue-500/10 text-blue-400 text-xs font-bold uppercase">
            已兑现
          </span>
        );
      default:
        return null;
    }
  };

  if (loading && wishes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#111722]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-[#92a4c9]">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#111722]">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={loadWishes}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111722]">
      <main className="max-w-[1280px] mx-auto px-6 lg:px-20 py-8">
        {/* 面包屑导航 */}
        <nav className="flex items-center gap-2 mb-4 text-sm">
          <a
            href="/parent"
            className="text-[#92a4c9] hover:text-primary transition-colors"
          >
            首页
          </a>
          <span className="text-[#92a4c9]/50">/</span>
          <span className="text-white font-medium">愿望审批</span>
        </nav>

        {/* 页面标题 */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-white text-3xl font-bold tracking-tight">
              愿望审批列表
            </h1>
            <p className="text-[#92a4c9] text-base">
              审批孩子提交的愿望申请，通过积分激励促进学习积极性。
            </p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* 主内容区域 */}
          <div className="flex-1 min-w-0">
            {/* 筛选和标签 */}
            <div className="bg-[#1a2235] rounded-xl border border-[#324467] p-2 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex border-b border-transparent">
                  <button
                    onClick={() => setCurrentTab('PENDING')}
                    className={`px-6 py-3 text-sm font-bold ${
                      currentTab === 'PENDING'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-[#92a4c9] hover:text-primary'
                    }`}
                  >
                    待审批
                  </button>
                  <button
                    onClick={() => setCurrentTab('APPROVED')}
                    className={`px-6 py-3 text-sm font-medium ${
                      currentTab === 'APPROVED'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-[#92a4c9] hover:text-primary'
                    }`}
                  >
                    已同意
                  </button>
                  <button
                    onClick={() => setCurrentTab('REJECTED')}
                    className={`px-6 py-3 text-sm font-medium ${
                      currentTab === 'REJECTED'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-[#92a4c9] hover:text-primary'
                    }`}
                  >
                    已拒绝
                  </button>
                  <button
                    onClick={() => setCurrentTab('all')}
                    className={`px-6 py-3 text-sm font-medium ${
                      currentTab === 'all'
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-[#92a4c9] hover:text-primary'
                    }`}
                  >
                    全部 ({total})
                  </button>
                </div>
              </div>
            </div>

            {/* 愿望列表 */}
            <div className="space-y-4">
              {wishes.length === 0 ? (
                <div className="bg-[#1a2235] border border-[#324467] rounded-xl p-12 text-center">
                  <p className="text-[#92a4c9]">暂无愿望</p>
                </div>
              ) : (
                wishes.map((wish) => (
                  <div
                    key={wish.id}
                    className="bg-[#1a2235] border border-[#324467] rounded-xl p-5 hover:border-primary/50 transition-all"
                  >
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* 愿望图片 */}
                      {wish.imageUrl && (
                        <div className="w-full md:w-32 h-32 rounded-lg overflow-hidden bg-[#111722] flex-shrink-0">
                          <img
                            src={wish.imageUrl}
                            alt={wish.description}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          {getStatusBadge(wish.status)}
                          <span className="text-[#92a4c9] text-sm">
                            {formatDate(wish.submittedAt)}
                          </span>
                        </div>

                        {/* 学员信息 */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[#92a4c9] text-sm">
                            学员：
                          </span>
                          <span className="text-white font-medium">
                            {wish.student.studentProfile?.realName || wish.student.username}
                          </span>
                        </div>

                        {/* 愿望描述 */}
                        <p className="text-white text-base font-medium mb-3">
                          {wish.description}
                        </p>

                        {/* 所需积分 */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className="material-symbols-outlined text-yellow-500 text-xl">
                            stars
                          </span>
                          <span className="text-[#92a4c9] text-sm">
                            所需积分：
                          </span>
                          <span className="text-primary text-lg font-bold">
                            {wish.requiredPoints}
                          </span>
                        </div>

                        {/* 审批信息 */}
                        {wish.reviewedAt && (
                          <div className="bg-[#111722]/50 rounded-lg p-3 mt-3">
                            <div className="flex items-start gap-2">
                              <span className="material-symbols-outlined text-[#92a4c9] text-lg">
                                {wish.status === 'APPROVED' ? 'check_circle' : 'cancel'}
                              </span>
                              <div className="flex-1">
                                <p className="text-[#92a4c9] text-sm">
                                  <span className="font-bold">审批时间：</span>
                                  {formatDate(wish.reviewedAt)}
                                </p>
                                {wish.reviewReason && (
                                  <p className="text-[#92a4c9] text-sm mt-1">
                                    <span className="font-bold">审批理由：</span>
                                    {wish.reviewReason}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 操作按钮 */}
                      {wish.status === 'PENDING' && (
                        <div className="flex flex-row md:flex-col justify-center items-end gap-3 border-t md:border-t-0 md:border-l border-[#324467] pt-4 md:pt-0 md:pl-6">
                          <button
                            onClick={() => handleOpenApprovalModal(wish)}
                            className="w-full md:w-auto px-4 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:shadow-lg hover:shadow-primary/20 transition-all"
                          >
                            审批
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 分页 */}
            {total > limit && (
              <div className="flex justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-[#1a2235] border border-[#324467] rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#232f48]"
                >
                  上一页
                </button>
                <span className="px-4 py-2 text-sm text-[#92a4c9]">
                  第 {page} 页 / 共 {Math.ceil(total / limit)} 页
                </span>
                <button
                  onClick={() => setPage(Math.min(Math.ceil(total / limit), page + 1))}
                  disabled={page >= Math.ceil(total / limit)}
                  className="px-4 py-2 bg-[#1a2235] border border-[#324467] rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#232f48]"
                >
                  下一页
                </button>
              </div>
            )}
          </div>

          {/* 侧边栏 */}
          <aside className="w-full lg:w-80 space-y-6">
            {/* 审批统计 */}
            <div className="bg-[#1a2235] border border-[#324467] rounded-xl p-5">
              <h4 className="text-white font-bold text-sm mb-4">
                审批统计
              </h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#92a4c9]">待审批</span>
                  <span className="text-xs font-bold text-yellow-500">
                    {wishes.filter((w) => w.status === 'PENDING').length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#92a4c9]">已同意</span>
                  <span className="text-xs font-bold text-green-500">
                    {wishes.filter((w) => w.status === 'APPROVED').length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#92a4c9]">已拒绝</span>
                  <span className="text-xs font-bold text-red-500">
                    {wishes.filter((w) => w.status === 'REJECTED').length}
                  </span>
                </div>
              </div>
            </div>

            {/* 温馨提示 */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-blue-700 p-5 text-white shadow-lg">
              <div className="relative z-10">
                <h4 className="font-bold text-sm mb-2">温馨提示</h4>
                <p className="text-[11px] text-white/80 leading-relaxed mb-4">
                  积分激励系统可以有效提升孩子的学习积极性。建议根据孩子的实际表现和愿望合理性进行审批。
                </p>
              </div>
              <div className="absolute -right-4 -bottom-4 opacity-10">
                <span className="material-symbols-outlined text-8xl">lightbulb</span>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* 审批弹窗 */}
      {showApprovalModal && selectedWish && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a2235] rounded-xl max-w-md w-full p-6 border border-[#324467]">
            <h3 className="text-white text-xl font-bold mb-4">
              审批愿望
            </h3>

            {/* 愿望信息 */}
            <div className="bg-[#111722]/50 rounded-lg p-4 mb-4">
              <p className="text-[#92a4c9] text-sm mb-2">
                <span className="font-bold">学员：</span>
                {selectedWish.student.studentProfile?.realName ||
                  selectedWish.student.username}
              </p>
              <p className="text-[#92a4c9] text-sm mb-2">
                <span className="font-bold">愿望：</span>
                {selectedWish.description}
              </p>
              <p className="text-[#92a4c9] text-sm">
                <span className="font-bold">所需积分：</span>
                <span className="text-primary font-bold">{selectedWish.requiredPoints}</span>
              </p>
            </div>

            {/* 审批理由 */}
            <div className="mb-6">
              <label className="block text-white text-sm font-medium mb-2">
                审批理由（可选）
              </label>
              <textarea
                value={approvalReason}
                onChange={(e) => setApprovalReason(e.target.value)}
                placeholder="请输入审批理由..."
                className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#111722] text-white placeholder-[#92a4c9] focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                rows={4}
              />
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => handleApproveWish(false)}
                disabled={isApproving}
                className="flex-1 px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isApproving ? '处理中...' : '拒绝'}
              </button>
              <button
                onClick={() => handleApproveWish(true)}
                disabled={isApproving}
                className="flex-1 px-4 py-2 bg-green-500 text-white text-sm font-bold rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isApproving ? '处理中...' : '同意'}
              </button>
              <button
                onClick={handleCloseApprovalModal}
                disabled={isApproving}
                className="px-4 py-2 bg-[#324467] text-white text-sm font-bold rounded-lg hover:bg-[#3d5478] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WishApprovalList;
