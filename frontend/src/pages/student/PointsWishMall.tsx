import { useState, useEffect } from 'react';
import { studentPointsService, type PointsData } from '../../services/studentPointsService';
import { studentWishService, type Wish, type WishType } from '../../services/studentWishService';
import { getErrorMessage } from '../../types/error';

/**
 * 积分愿望商城页面
 */
const PointsWishMall: React.FC = () => {
  const [pointsData, setPointsData] = useState<PointsData | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWishForm, setShowWishForm] = useState(false);
  const [wishFormType, setWishFormType] = useState<WishType>('CUSTOM');

  // 加载数据
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [points, wishList] = await Promise.all([
        studentPointsService.getPoints(),
        studentWishService.getWishes(),
      ]);

      if (points) {
        setPointsData(points);
      }
      
      if (wishList && wishList.wishes) {
        setWishes(wishList.wishes);
      } else {
        setWishes([]);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      setWishes([]);
      if (!pointsData) {
        setPointsData({ available: 0, total: 0, history: [] });
      }
    } finally {
      setLoading(false);
    }
  };

  // 获取愿望状态标签
  const getStatusBadge = (status: string) => {
    const badges = {
      PENDING: { text: '审核中', className: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20' },
      APPROVED: { text: '待确认', className: 'bg-green-100 text-green-600 dark:bg-green-900/20' },
      REJECTED: { text: '已拒绝', className: 'bg-red-100 text-red-600 dark:bg-red-900/20' },
      FULFILLED: { text: '已兑现', className: 'bg-gray-100 text-gray-600 dark:bg-gray-900/20' },
    };
    return badges[status as keyof typeof badges] || badges.PENDING;
  };

  // 计算愿望进度
  const calculateProgress = (wish: Wish) => {
    if (!pointsData || !pointsData.available) return 0;
    return Math.min((pointsData.available / wish.requiredPoints) * 100, 100);
  };

  // 确认愿望（扣除积分）
  const handleConfirmWish = async (wishId: string) => {
    if (!confirm('确认兑换此愿望？积分将被扣除。')) {
      return;
    }

    try {
      await studentWishService.confirmWish(wishId);
      alert('兑换成功！积分已扣除。');
      loadData();
    } catch (error) {
      console.error('确认愿望失败:', error);
      alert(getErrorMessage(error, '确认失败，请重试'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* 导航栏 */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 px-4 lg:px-20 py-3">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white">
              <span className="material-symbols-outlined font-bold">military_tech</span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">智能提升训练平台</h2>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a className="text-sm font-semibold hover:text-blue-500 transition-colors" href="/student">
              首页
            </a>
            <a className="text-sm font-semibold hover:text-blue-500 transition-colors" href="/student/training">
              课程中心
            </a>
            <a className="text-sm font-semibold hover:text-blue-500 transition-colors" href="/student/errors">
              错题本
            </a>
            <a className="text-sm font-semibold text-blue-500 border-b-2 border-blue-500" href="/student/points-wish">
              积分愿望商城
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-[1200px] mx-auto w-full px-4 lg:px-10 py-8">
        {/* 积分统计卡片 */}
        <div className="mb-8 flex flex-col md:flex-row items-center gap-6 bg-gradient-to-r from-blue-500 to-blue-600 p-8 rounded-xl shadow-lg text-white">
          <div className="bg-white/20 p-4 rounded-full">
            <span className="material-symbols-outlined text-[48px]">database</span>
          </div>
          <div className="flex-1 text-center md:text-left">
            <p className="text-white/80 text-lg font-medium">当前可用积分</p>
            <div className="flex items-baseline justify-center md:justify-start gap-2">
              <span className="text-5xl font-black tracking-tighter">
                {(pointsData?.available ?? 0).toLocaleString()}
              </span>
              <span className="text-xl font-bold">pts</span>
            </div>
          </div>
          <div className="flex gap-4">
            <button className="bg-white text-blue-500 px-6 py-2.5 rounded-full font-bold hover:bg-blue-50 transition-colors shadow-md">
              积分明细
            </button>
            <button className="bg-black/20 text-white px-6 py-2.5 rounded-full font-bold hover:bg-black/30 transition-colors">
              如何赚积分?
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 左侧：现金奖励和自定义愿望区域 */}
          <div className="lg:col-span-7">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-500">auto_awesome</span>
                愿望商城
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* 现金奖励卡片 */}
              <div
                className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-6 rounded-xl border-2 border-amber-200 dark:border-amber-800 hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => {
                  setWishFormType('CASH');
                  setShowWishForm(true);
                }}
              >
                <div className="flex flex-col items-center text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform mb-4">
                    <span className="material-symbols-outlined text-[32px]">payments</span>
                  </div>
                  <h4 className="text-lg font-bold text-amber-900 dark:text-amber-100 mb-2">兑换现金</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    10 积分 = 1 元
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    实时到账微信/支付宝
                  </p>
                </div>
              </div>

              {/* 自定义愿望卡片 */}
              <div
                className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-6 rounded-xl border-2 border-blue-200 dark:border-blue-800 hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => {
                  setWishFormType('CUSTOM');
                  setShowWishForm(true);
                }}
              >
                <div className="flex flex-col items-center text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform mb-4">
                    <span className="material-symbols-outlined text-[32px]">add_circle</span>
                  </div>
                  <h4 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-2">自定义愿望</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    设定你的目标
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                    乐高、运动鞋或出去玩
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：愿望列表 */}
          <div className="lg:col-span-5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-500">list_alt</span>
                我的愿望
              </h3>
            </div>

            {/* 愿望列表 */}
            <div className="space-y-4">
              {wishes && wishes.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-8 rounded-xl text-center text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  <p>还没有愿望，快去创建一个吧！</p>
                </div>
              ) : (
                wishes && wishes.map((wish) => {
                  const badge = getStatusBadge(wish.status);
                  const progress = calculateProgress(wish);
                  const isCash = wish.type === 'CASH';
                  const cashAmount = isCash ? (wish.requiredPoints / 10).toFixed(2) : null;

                  return (
                    <div
                      key={wish.id}
                      className={`p-5 rounded-xl shadow-sm border relative overflow-hidden ${
                        isCash
                          ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800'
                          : 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800'
                      }`}
                    >
                      <div className="flex gap-4">
                        {wish.imageUrl && (
                          <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 dark:bg-slate-700">
                            <img
                              src={wish.imageUrl}
                              alt={wish.description}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-1">
                            <div>
                              <p className="font-bold text-lg text-slate-900 dark:text-white">
                                {isCash ? `兑换现金 ¥${cashAmount}` : wish.description}
                              </p>
                              {isCash && wish.description && (
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                  {wish.description}
                                </p>
                              )}
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.className}`}
                            >
                              {badge.text}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`material-symbols-outlined text-sm ${isCash ? 'text-amber-500' : 'text-blue-500'}`}>
                              {isCash ? 'payments' : 'stars'}
                            </span>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                              目标: {wish.requiredPoints} 积分
                              {isCash && ` (¥${cashAmount})`}
                            </span>
                          </div>

                          {/* 进度条（仅已批准的愿望显示） */}
                          {wish.status === 'APPROVED' && (
                            <>
                              <div className="w-full bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden mb-2">
                                <div
                                  className={`h-full rounded-full transition-all ${isCash ? 'bg-amber-500' : 'bg-blue-500'}`}
                                  style={{ width: `${progress}%` }}
                                ></div>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                  {pointsData?.available ?? 0} / {wish.requiredPoints}
                                </span>
                                <span className={`text-[10px] font-bold ${isCash ? 'text-amber-500' : 'text-blue-500'}`}>
                                  {progress.toFixed(0)}% 已达成
                                </span>
                              </div>
                              {/* 确认按钮 */}
                              {progress >= 100 && (
                                <button
                                  onClick={() => handleConfirmWish(wish.id)}
                                  className={`mt-3 w-full py-2 rounded-lg font-bold text-white transition-colors ${
                                    isCash
                                      ? 'bg-amber-500 hover:bg-amber-600'
                                      : 'bg-blue-500 hover:bg-blue-600'
                                  }`}
                                >
                                  确认兑换
                                </button>
                              )}
                            </>
                          )}

                          {/* 审核理由 */}
                          {wish.reviewReason && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 italic">
                              {wish.reviewReason}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 推广横幅 */}
        <div className="mt-16 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl p-8 relative overflow-hidden border border-slate-700">
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h4 className="text-2xl font-black mb-2 italic">邀请同学一起进步!</h4>
              <p className="text-white/60">
                每成功邀请一位同学加入，双方均可获得{' '}
                <span className="text-blue-400 font-bold">200 积分</span>
              </p>
            </div>
            <button className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-xl font-black transition-transform hover:scale-105">
              立即邀请
            </button>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl -ml-24 -mb-24"></div>
        </div>
      </main>

      {/* 愿望提交表单模态框 */}
      {showWishForm && (
        <WishSubmitModal
          type={wishFormType}
          onClose={() => setShowWishForm(false)}
          onSuccess={() => {
            setShowWishForm(false);
            loadData();
          }}
          currentPoints={pointsData?.available || 0}
        />
      )}
    </div>
  );
};

/**
 * 愿望提交表单模态框
 */
interface WishSubmitModalProps {
  type: WishType;
  onClose: () => void;
  onSuccess: () => void;
  currentPoints: number;
}

const WishSubmitModal: React.FC<WishSubmitModalProps> = ({
  type,
  onClose,
  onSuccess,
  currentPoints,
}) => {
  const [description, setDescription] = useState('');
  const [requiredPoints, setRequiredPoints] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isCash = type === 'CASH';
  const cashAmount = isCash ? (requiredPoints / 10).toFixed(2) : null;

  // 处理图片文件选择
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('请选择图片文件');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('图片大小不能超过 5MB');
        return;
      }
      setImageFile(file);
      const previewUrl = URL.createObjectURL(file);
      setImageUrl(previewUrl);
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isCash && !description.trim()) {
      setError('请输入愿望描述');
      return;
    }

    if (requiredPoints <= 0) {
      setError('所需积分必须大于 0');
      return;
    }

    try {
      setSubmitting(true);

      let finalImageUrl = imageUrl;
      if (imageFile) {
        console.log('图片上传功能待实现');
      }

      const result = await studentWishService.createWish({
        type,
        description: isCash ? `兑换现金 ¥${cashAmount}` : description.trim(),
        requiredPoints,
        imageUrl: finalImageUrl.trim() || undefined,
      });

      if (!result.hasEnoughPoints) {
        alert(`愿望已提交！还需 ${result.pointsNeeded} 积分才能达成目标。`);
      } else {
        alert('愿望已提交，等待家长审批！');
      }

      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err, '提交失败，请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* 表单头部 */}
        <div className={`p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between ${
          isCash ? 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20' : 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isCash ? 'bg-amber-500/20' : 'bg-blue-500/20'}`}>
              <span className={`material-symbols-outlined ${isCash ? 'text-amber-500' : 'text-blue-500'}`}>
                {isCash ? 'payments' : 'edit_square'}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {isCash ? '兑换现金' : '提交新愿望'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 现金模式：输入积分，自动计算金额 */}
          {isCash ? (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">兑换积分</label>
                <div className="relative">
                  <input
                    type="number"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 px-4 py-3 pl-11 outline-none transition-all"
                    placeholder="输入积分数值"
                    value={requiredPoints || ''}
                    onChange={(e) => setRequiredPoints(parseInt(e.target.value) || 0)}
                    min={10}
                    step={10}
                    max={10000}
                  />
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-amber-500">
                    monetization_on
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  当前积分: {currentPoints} | 10 积分 = 1 元
                </p>
              </div>

              {/* 显示兑换金额 */}
              {requiredPoints > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      兑换金额
                    </span>
                    <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      ¥{cashAmount}
                    </span>
                  </div>
                </div>
              )}

              {/* 备注（可选） */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  备注（可选）
                </label>
                <textarea
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 px-4 py-3 outline-none transition-all resize-none"
                  placeholder="例如：用于购买学习用品"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                />
              </div>
            </>
          ) : (
            <>
              {/* 自定义愿望模式 */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">愿望描述</label>
                <textarea
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 px-4 py-3 outline-none transition-all resize-none"
                  placeholder="请详细描述你的愿望，为什么想要这个愿望呢？"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                />
                <p className="text-xs text-slate-400 dark:text-slate-500">{description.length} / 500</p>
              </div>

              {/* 所需积分 */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">所需积分</label>
                <div className="relative">
                  <input
                    type="number"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 px-4 py-3 pl-11 outline-none transition-all"
                    placeholder="输入积分数值"
                    value={requiredPoints || ''}
                    onChange={(e) => setRequiredPoints(parseInt(e.target.value) || 0)}
                    min={1}
                    max={10000}
                  />
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-blue-500">
                    stars
                  </span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">当前积分: {currentPoints}</p>
              </div>

              {/* 图片上传 */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  愿望图片
                </label>
                
                {/* 图片预览 */}
                {imageUrl && (
                  <div className="relative w-full h-48 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 mb-2">
                    <img
                      src={imageUrl}
                      alt="预览"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImageUrl('');
                        setImageFile(null);
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                )}

                {/* 上传按钮 */}
                <div className="flex gap-2">
                  <label className="flex-1 cursor-pointer">
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                      <span className="material-symbols-outlined text-slate-400 text-3xl mb-2">
                        upload
                      </span>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        点击上传图片
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        支持 JPG、PNG，最大 5MB
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* 或者输入 URL */}
                <div className="relative">
                  <span className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">或输入图片链接</span>
                  <input
                    type="url"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 px-4 py-2 outline-none transition-all text-sm"
                    placeholder="https://example.com/image.jpg"
                    value={imageFile ? '' : imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      setImageFile(null);
                    }}
                    disabled={!!imageFile}
                  />
                </div>
              </div>
            </>
          )}

          {/* 提示信息 */}
          <div className={`border rounded-xl p-4 flex gap-3 ${
            isCash 
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' 
              : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
          }`}>
            <span className={`material-symbols-outlined shrink-0 ${isCash ? 'text-amber-500' : 'text-blue-500'}`}>
              tips_and_updates
            </span>
            <p className={`text-xs leading-relaxed ${
              isCash ? 'text-amber-800 dark:text-amber-200' : 'text-blue-800 dark:text-blue-200'
            }`}>
              <strong>提示：</strong> 
              {isCash 
                ? '提交后需要家长审批，审批通过后请点击"确认兑换"按钮完成积分扣除。' 
                : '上传真实且精美的图片，可以让家长或老师更快看到你的决心哦！审批通过后请点击"确认兑换"按钮完成积分扣除。'
              }
            </p>
          </div>

          {/* 表单操作 */}
          <div className="flex items-center justify-end gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-8 py-2.5 rounded-lg text-white text-sm font-bold shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                isCash 
                  ? 'bg-amber-500 hover:bg-amber-600' 
                  : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              <span>{submitting ? '提交中...' : '提交申请'}</span>
              <span className="material-symbols-outlined text-sm">send</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PointsWishMall;
