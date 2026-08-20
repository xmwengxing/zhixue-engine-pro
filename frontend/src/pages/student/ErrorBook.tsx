// 学员端 - 错题本中心
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as studentErrorService from '../../services/studentErrorService';
import { LatexText } from "../../components/common/MathFormula";
import type { ErrorQuestion, DueReviewResponse } from '../../services/studentErrorService';

/**
 * 错题本中心页面
 * 参照设计稿：学员端-错题本中心
 */
const ErrorBook: React.FC = () => {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<ErrorQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // 筛选条件
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedMastery, setSelectedMastery] = useState<string>('');

  // 科目列表（从错题中提取）
  const [subjects, setSubjects] = useState<string[]>([]);

  // 选中的错题（用于详情查看）
  const [selectedError, setSelectedError] = useState<ErrorQuestion | null>(null);

  // 今日待复习（艾宾浩斯间隔重复）
  const [dueReviews, setDueReviews] = useState<ErrorQuestion[]>([]);
  const [dueTotal, setDueTotal] = useState(0);
  const [cyclesToMaster, setCyclesToMaster] = useState(3);

  // 加载错题列表
  // 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
  const loadErrors = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page, limit };

      if (selectedSubject) {
        params.subject = selectedSubject;
      }

      if (selectedMastery) {
        params.mastery = selectedMastery;
      }

      const response = await studentErrorService.getErrors(params);
      setErrors(response.errors);
      setTotal(response.total);

      // 提取科目列表
      const subjectSet = new Set(response.errors.map((e) => e.subject));
      setSubjects(Array.from(subjectSet));
    } catch (error) {
      console.error('加载错题列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, selectedSubject, selectedMastery]);

  useEffect(() => {
    loadErrors();
  }, [loadErrors]);

  // 加载今日待复习列表
  const loadDueReviews = useCallback(async () => {
    try {
      const res: DueReviewResponse = await studentErrorService.getDueReviews(20);
      setDueReviews(res.items || []);
      setDueTotal(res.total || 0);
      if (typeof res.cyclesToMaster === 'number') {
        setCyclesToMaster(res.cyclesToMaster);
      }
    } catch (error) {
      console.error('加载今日待复习失败:', error);
    }
  }, []);

  useEffect(() => {
    loadDueReviews();
  }, [loadDueReviews]);

  // 开始重做错题
  const handleRetry = async (errorId: string) => {
    try {
      const session = await studentErrorService.retryError(errorId);
      // 跳转到错题重做页面
      navigate(`/student/error-retry/${session.id}`);
    } catch (error) {
      console.error('开始错题重做失败:', error);
      alert('开始错题重做失败，请稍后重试');
    }
  };

  // 更新掌握度
  const handleUpdateMastery = async (
    errorId: string,
    mastery: 'UNMASTERED' | 'MASTERING' | 'MASTERED'
  ) => {
    try {
      await studentErrorService.updateMastery(errorId, mastery);
      // 重新加载列表
      loadErrors();
    } catch (error) {
      console.error('更新掌握度失败:', error);
      alert('更新掌握度失败，请稍后重试');
    }
  };

  // 查看错题详情
  const handleViewDetail = (error: ErrorQuestion) => {
    setSelectedError(error);
  };

  // 关闭详情弹窗
  const handleCloseDetail = () => {
    setSelectedError(null);
  };

  // 获取掌握度文本
  const getMasteryText = (mastery: string) => {
    const masteryMap: Record<string, string> = {
      UNMASTERED: '未掌握',
      MASTERING: '攻克中',
      MASTERED: '已掌握',
    };
    return masteryMap[mastery] || mastery;
  };

  // 获取掌握度颜色
  const getMasteryColor = (mastery: string) => {
    const colorMap: Record<string, string> = {
      UNMASTERED: 'bg-red-500/15 text-red-300',
      MASTERING: 'bg-yellow-500/15 text-yellow-300',
      MASTERED: 'bg-green-500/15 text-green-300',
    };
    return colorMap[mastery] || 'bg-[#1a2332] text-[#e2e8f5]';
  };

  // 获取题型文本
  const getQuestionTypeText = (type: string) => {
    const typeMap: Record<string, string> = {
      CHOICE: '选择题',
      FILL: '填空题',
      ESSAY: '问答题',
    };
    return typeMap[type] || type;
  };

  // 复习阶段文案：已通过 X / 共 N 阶段
  const getReviewStageText = (error: ErrorQuestion) => {
    const stage = error.reviewStage ?? 0;
    return `复习 ${stage}/${cyclesToMaster} 阶段`;
  };

  // 下次复习时间格式化
  const formatNextReview = (nextReviewAt?: string | null) => {
    if (!nextReviewAt) return '已彻底掌握';
    const d = new Date(nextReviewAt);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const label = d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    return isToday ? '今天复习' : `下次 ${label}`;
  };

  // 题目内容预览（兼容字符串与对象两种结构）
  const getQuestionPreview = (error: ErrorQuestion) => {
    const c = error.question.content;
    return typeof c === 'string'
      ? c
      : (c.text || (c as { question?: string }).question || '题目内容');
  };

  return (
    <div className="min-h-screen bg-[#111722] p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">错题本中心</h1>
        <p className="mt-1 text-sm text-[#92a4c9]">
          系统自动收集您的错题，帮助您针对性攻克薄弱知识点
        </p>
      </div>

      {/* 今日待复习（艾宾浩斯间隔重复） */}
      <div className="mb-6 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-500/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-indigo-300">
              今日待复习
            </h2>
            <p className="text-xs text-indigo-300">
              基于艾宾浩斯遗忘曲线，连续 {cyclesToMaster} 个周期答对即可彻底掌握
            </p>
          </div>
          <span className="px-3 py-1 bg-indigo-600 text-white rounded-full text-sm font-medium">
            {dueTotal} 道
          </span>
        </div>

        {dueReviews.length === 0 ? (
          <p className="text-sm text-indigo-300">
            🎉 今天没有待复习的错题，继续保持！
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {dueReviews.map((error) => (
              <div
                key={error.id}
                className="bg-[#232f48] rounded-lg border border-indigo-500/30 p-3 flex flex-col"
              >
                <div className="text-sm font-medium text-white mb-1">
                  {error.subject}
                  <span className="ml-2 text-xs text-[#5b6b8c]">
                    {getQuestionTypeText(error.question.type)}
                  </span>
                </div>
                <div className="text-xs text-[#5b6b8c] mb-3 line-clamp-2">
                  {getQuestionPreview(error)}
                </div>
                <div className="mt-auto flex items-center justify-between">
                  <span className="text-xs text-indigo-400">
                    {getReviewStageText(error)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRetry(error.id);
                    }}
                    className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded hover:bg-indigo-700 transition-colors"
                  >
                    立即复习
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 筛选器 */}
      <div className="mb-6 bg-[#232f48] rounded-lg shadow border border-[#324467] p-4">
        <div className="flex flex-wrap gap-4">
          {/* 科目筛选 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-[#c3cfe6] mb-2">
              科目筛选
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => {
                setSelectedSubject(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-[#324467] rounded-md bg-[#232f48] text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部科目</option>
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </div>

          {/* 掌握度筛选 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-[#c3cfe6] mb-2">
              掌握度筛选
            </label>
            <select
              value={selectedMastery}
              onChange={(e) => {
                setSelectedMastery(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-[#324467] rounded-md bg-[#232f48] text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部状态</option>
              <option value="UNMASTERED">未掌握</option>
              <option value="MASTERING">攻克中</option>
              <option value="MASTERED">已掌握</option>
            </select>
          </div>

          {/* 统计信息 */}
          <div className="flex-1 min-w-[200px] flex items-end">
            <div className="text-sm text-[#92a4c9]">
              共 <span className="font-semibold text-blue-400">{total}</span> 道错题
            </div>
          </div>
        </div>
      </div>

      {/* 错题列表 */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-[#5b6b8c]">加载中...</div>
        </div>
      ) : errors.length === 0 ? (
        <div className="bg-[#232f48] rounded-lg shadow border border-[#324467] p-12 text-center">
          <div className="text-[#5b6b8c] text-lg mb-2">暂无错题</div>
          <div className="text-[#5b6b8c] text-sm">
            继续努力学习，争取不出错！
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {errors.map((error) => (
            <div
              key={error.id}
              className="bg-[#232f48] rounded-lg shadow border border-[#324467] hover:shadow-lg transition-shadow p-4 cursor-pointer"
              onClick={() => handleViewDetail(error)}
            >
              {/* 错题卡片头部 */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-sm font-medium text-white">
                    {error.subject}
                  </span>
                  <span className="ml-2 text-xs text-[#5b6b8c]">
                    {getQuestionTypeText(error.question.type)}
                  </span>
                </div>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded ${getMasteryColor(
                    error.mastery
                  )}`}
                >
                  {getMasteryText(error.mastery)}
                </span>
              </div>

              {/* 题目内容预览 */}
              <div className="mb-3">
                <div className="text-sm text-[#c3cfe6] line-clamp-2">
                  <LatexText text={typeof error.question.content === 'string'
                    ? error.question.content
                    : (error.question.content.text || (error.question.content as { question?: string }).question || '')} />
                </div>
              </div>

              {/* 错题信息 */}
              <div className="flex justify-between items-center text-xs text-[#5b6b8c] mb-3">
                <span>难度: {'★'.repeat(error.question.difficulty)}</span>
                <span>重做 {error.retryCount} 次</span>
              </div>

              {/* 间隔重复信息 */}
              <div className="flex justify-between items-center text-xs text-indigo-400 mb-3">
                <span>{getReviewStageText(error)}</span>
                <span>{formatNextReview(error.nextReviewAt)}</span>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetry(error.id);
                  }}
                  className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
                >
                  重做练习
                </button>
                {error.mastery !== 'MASTERED' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const nextMastery =
                        error.mastery === 'UNMASTERED' ? 'MASTERING' : 'MASTERED';
                      handleUpdateMastery(error.id, nextMastery);
                    }}
                    className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors"
                  >
                    标记掌握
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {!loading && total > limit && (
        <div className="mt-6 flex justify-center">
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-[#232f48] border border-[#324467] rounded text-sm font-medium text-[#c3cfe6] hover:bg-[#1a2332] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="px-4 py-2 bg-[#232f48] border border-[#324467] rounded text-sm text-[#c3cfe6]">
              第 {page} 页 / 共 {Math.ceil(total / limit)} 页
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / limit)}
              className="px-4 py-2 bg-[#232f48] border border-[#324467] rounded text-sm font-medium text-[#c3cfe6] hover:bg-[#1a2332] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* 错题详情弹窗 */}
      {selectedError && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseDetail}
        >
          <div
            className="bg-[#232f48] rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗头部 */}
            <div className="sticky top-0 bg-[#232f48] border-b border-[#324467] px-6 py-4 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">错题详情</h2>
              <button
                onClick={handleCloseDetail}
                className="text-[#5b6b8c] hover:text-[#92a4c9]"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="px-6 py-4 space-y-4">
              {/* 题目信息 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-[#c3cfe6]">
                    {selectedError.subject}
                  </span>
                  <span className="text-xs text-[#5b6b8c]">
                    {getQuestionTypeText(selectedError.question.type)}
                  </span>
                  <span className="text-xs text-[#5b6b8c]">
                    难度: {'★'.repeat(selectedError.question.difficulty)}
                  </span>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${getMasteryColor(
                      selectedError.mastery
                    )}`}
                  >
                    {getMasteryText(selectedError.mastery)}
                  </span>
                </div>
              </div>

              {/* 题目内容 */}
              <div className="bg-[#1a2332] rounded-lg p-4">
                <div className="text-sm font-medium text-[#c3cfe6] mb-2">
                  题目内容：
                </div>
                <div className="text-sm text-white">
                  <LatexText text={typeof selectedError.question.content === 'string'
                    ? selectedError.question.content
                    : (selectedError.question.content.text ||
                      (selectedError.question.content as { question?: string }).question ||
                      '')} />
              </div>
                </div>

              {/* 您的答案 */}
              <div className="bg-red-500/10 rounded-lg p-4">
                <div className="text-sm font-medium text-red-300 mb-2">
                  您的答案：
                </div>
                <div className="text-sm text-white">
                  {selectedError.answer.studentAnswer}
                </div>
              </div>

              {/* 正确答案 */}
              <div className="bg-green-500/10 rounded-lg p-4">
                <div className="text-sm font-medium text-green-300 mb-2">
                  正确答案：
                </div>
                <div className="text-sm text-white">
                  {selectedError.question.answer}
                </div>
              </div>

              {/* 知识点 */}
              {selectedError.question.knowledgePoints.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-[#c3cfe6] mb-2">
                    相关知识点：
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedError.question.knowledgePoints.map((point, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-blue-500/15 text-blue-300 text-xs rounded"
                      >
                        {point}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 统计信息 */}
              <div className="border-t border-[#324467] pt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[#92a4c9]">收集时间：</span>
                    <span className="text-white">
                      {new Date(selectedError.collectedAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#92a4c9]">重做次数：</span>
                    <span className="text-white">{selectedError.retryCount} 次</span>
                  </div>
                  {selectedError.lastRetryAt && (
                    <div className="col-span-2">
                      <span className="text-[#92a4c9]">最后重做：</span>
                      <span className="text-white">
                        {new Date(selectedError.lastRetryAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 弹窗底部操作 */}
            <div className="sticky bottom-0 bg-[#232f48] border-t border-[#324467] px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleCloseDetail}
                className="px-4 py-2 border border-[#324467] rounded text-sm font-medium text-[#c3cfe6] hover:bg-[#1a2332]"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  handleCloseDetail();
                  handleRetry(selectedError.id);
                }}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
              >
                开始重做
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorBook;
