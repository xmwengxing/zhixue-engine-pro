// 学员端 - 错题本中心
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as studentErrorService from '../../services/studentErrorService';
import type { ErrorQuestion } from '../../services/studentErrorService';

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
      UNMASTERED: 'bg-red-100 text-red-800',
      MASTERING: 'bg-yellow-100 text-yellow-800',
      MASTERED: 'bg-green-100 text-green-800',
    };
    return colorMap[mastery] || 'bg-gray-100 text-gray-800';
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">错题本中心</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          系统自动收集您的错题，帮助您针对性攻克薄弱知识点
        </p>
      </div>

      {/* 筛选器 */}
      <div className="mb-6 bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-wrap gap-4">
          {/* 科目筛选 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              科目筛选
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => {
                setSelectedSubject(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              掌握度筛选
            </label>
            <select
              value={selectedMastery}
              onChange={(e) => {
                setSelectedMastery(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部状态</option>
              <option value="UNMASTERED">未掌握</option>
              <option value="MASTERING">攻克中</option>
              <option value="MASTERED">已掌握</option>
            </select>
          </div>

          {/* 统计信息 */}
          <div className="flex-1 min-w-[200px] flex items-end">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              共 <span className="font-semibold text-blue-600">{total}</span> 道错题
            </div>
          </div>
        </div>
      </div>

      {/* 错题列表 */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-slate-500 dark:text-slate-400">加载中...</div>
        </div>
      ) : errors.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="text-slate-400 dark:text-slate-500 text-lg mb-2">暂无错题</div>
          <div className="text-slate-500 dark:text-slate-400 text-sm">
            继续努力学习，争取不出错！
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {errors.map((error) => (
            <div
              key={error.id}
              className="bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow p-4 cursor-pointer"
              onClick={() => handleViewDetail(error)}
            >
              {/* 错题卡片头部 */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {error.subject}
                  </span>
                  <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
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
                <div className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                  {typeof error.question.content === 'string'
                    ? error.question.content
                    : (error.question.content.text ||
                      (error.question.content as { question?: string }).question ||
                      '题目内容')}
                </div>
              </div>

              {/* 错题信息 */}
              <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-3">
                <span>难度: {'★'.repeat(error.question.difficulty)}</span>
                <span>重做 {error.retryCount} 次</span>
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
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-700 dark:text-slate-300">
              第 {page} 页 / 共 {Math.ceil(total / limit)} 页
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / limit)}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗头部 */}
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">错题详情</h2>
              <button
                onClick={handleCloseDetail}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
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
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {selectedError.subject}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {getQuestionTypeText(selectedError.question.type)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
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
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  题目内容：
                </div>
                <div className="text-sm text-slate-900 dark:text-white">
                  {typeof selectedError.question.content === 'string'
                    ? selectedError.question.content
                    : (selectedError.question.content.text ||
                      (selectedError.question.content as { question?: string }).question ||
                      '题目内容')}
                </div>
              </div>

              {/* 您的答案 */}
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                  您的答案：
                </div>
                <div className="text-sm text-slate-900 dark:text-white">
                  {selectedError.answer.studentAnswer}
                </div>
              </div>

              {/* 正确答案 */}
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <div className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                  正确答案：
                </div>
                <div className="text-sm text-slate-900 dark:text-white">
                  {selectedError.question.answer}
                </div>
              </div>

              {/* 知识点 */}
              {selectedError.question.knowledgePoints.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    相关知识点：
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedError.question.knowledgePoints.map((point, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs rounded"
                      >
                        {point}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 统计信息 */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">收集时间：</span>
                    <span className="text-slate-900 dark:text-white">
                      {new Date(selectedError.collectedAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">重做次数：</span>
                    <span className="text-slate-900 dark:text-white">{selectedError.retryCount} 次</span>
                  </div>
                  {selectedError.lastRetryAt && (
                    <div className="col-span-2">
                      <span className="text-slate-600 dark:text-slate-400">最后重做：</span>
                      <span className="text-slate-900 dark:text-white">
                        {new Date(selectedError.lastRetryAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 弹窗底部操作 */}
            <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleCloseDetail}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
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
