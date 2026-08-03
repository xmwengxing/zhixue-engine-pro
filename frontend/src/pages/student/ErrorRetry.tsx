// 学员端 - 错题重做练习区
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as studentTrainingService from '../../services/studentTrainingService';
import type { TrainingSession, Question } from '../../services/studentTrainingService';
import QuestionArea from '../../components/student/QuestionArea';
import AIAssistant from '../../components/student/AIAssistant';
import ProgressIndicator from '../../components/student/ProgressIndicator';

/**
 * 错题重做练习区
 * 参照设计稿：学员端-错题重做练习区
 * 复用训练舱组件进行错题重做
 */
const ErrorRetry: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(
    null
  );

  // 加载会话信息
  // 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
  const loadSession = useCallback(async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      const sessionData = await studentTrainingService.getSession(sessionId);
      setSession(sessionData);
      setCurrentQuestion(sessionData.currentQuestion || null);
    } catch (error) {
      console.error('加载会话失败:', error);
      alert('加载会话失败，请返回重试');
      navigate('/student/errors');
    } finally {
      setLoading(false);
    }
  }, [sessionId, navigate]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // 提交答案
  const handleSubmitAnswer = async (answer: string, timeSpent: number) => {
    if (!session || !currentQuestion) return;

    try {
      setIsSubmitting(true);
      const result = await studentTrainingService.submitAnswer(
        session.id,
        currentQuestion.id,
        answer,
        timeSpent
      );

      // 显示反馈
      setFeedback({
        correct: result.correct,
        message: result.feedback,
      });

      // 如果答对了
      if (result.correct) {
        // 延迟后继续
        setTimeout(() => {
          if (!result.nextQuestion) {
            // 完成错题重做
            handleComplete();
          } else {
            // 更新到下一题
            setCurrentQuestion(result.nextQuestion);
            setFeedback(null);
            // 重新加载会话以更新进度
            loadSession();
          }
        }, 2000);
      } else {
        // 答错了，显示 AI 引导
        setShowAI(true);
      }
    } catch (error) {
      console.error('提交答案失败:', error);
      alert('提交答案失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 完成错题重做
  const handleComplete = async () => {
    if (!session) return;

    try {
      const result = await studentTrainingService.completeSession(session.id);
      setEarnedPoints(result.points);
      setCompleted(true);
    } catch (error) {
      console.error('完成错题重做失败:', error);
      alert('完成错题重做失败，请重试');
    }
  };

  // 返回错题本
  const handleBackToErrorBook = () => {
    navigate('/student/errors');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111722] flex items-center justify-center">
        <div className="text-[#5b6b8c]">加载中...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#111722] flex items-center justify-center">
        <div className="text-center">
          <div className="text-[#5b6b8c] mb-4">会话不存在</div>
          <button
            onClick={handleBackToErrorBook}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            返回错题本
          </button>
        </div>
      </div>
    );
  }

  // 完成页面
  if (completed) {
    return (
      <div className="min-h-screen bg-[#111722] flex items-center justify-center p-6">
        <div className="bg-[#232f48] rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="mb-6">
            <svg
              className="w-16 h-16 text-green-500 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            错题重做完成！
          </h2>

          <p className="text-[#92a4c9] mb-6">
            恭喜你完成了错题重做，继续努力攻克薄弱知识点！
          </p>

          <div className="bg-blue-500/10 rounded-lg p-4 mb-6">
            <div className="text-sm text-[#92a4c9] mb-1">本次获得积分</div>
            <div className="text-3xl font-bold text-blue-400">
              +{earnedPoints}
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleBackToErrorBook}
              className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              返回错题本
            </button>
            <button
              onClick={() => navigate('/student/dashboard')}
              className="w-full px-4 py-3 border border-[#324467] text-[#c3cfe6] font-medium rounded-lg hover:bg-[#1a2332] transition-colors"
            >
              返回首页
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 错题重做主界面
  return (
    <div className="min-h-screen bg-[#111722]">
      {/* 顶部导航栏 */}
      <div className="bg-[#232f48] border-b border-[#324467] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackToErrorBook}
              className="text-[#92a4c9] hover:text-white"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">
                错题重做练习
              </h1>
              <p className="text-sm text-[#92a4c9]">
                通过 AI 引导，攻克薄弱知识点
              </p>
            </div>
          </div>

          {/* 进度指示器 */}
          <ProgressIndicator
            current={session.currentStep + 1}
            total={session.totalSteps}
            progress={session.progress}
            phase={session.phase}
          />
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* 题目区域 */}
        <div className={`flex-1 ${showAI ? 'lg:w-2/3' : 'w-full'} overflow-y-auto`}>
          {currentQuestion ? (
            <QuestionArea
              question={currentQuestion}
              onSubmit={handleSubmitAnswer}
              feedback={feedback}
              isSubmitting={isSubmitting}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-[#5b6b8c]">没有更多题目了</div>
            </div>
          )}
        </div>

        {/* AI 助手区域 */}
        {showAI && (
          <div className="hidden lg:block lg:w-1/3 border-l border-[#324467] bg-[#232f48]">
            <AIAssistant
              sessionId={session.id}
              questionId={currentQuestion?.id}
              currentAnswer=""
              isCorrect={false}
            />
          </div>
        )}
      </div>

      {/* 移动端 AI 助手弹窗 */}
      {showAI && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-50">
          <div className="absolute bottom-0 left-0 right-0 bg-[#232f48] rounded-t-2xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-[#324467] flex justify-between items-center">
              <h3 className="font-semibold text-white">AI 学习助手</h3>
              <button
                onClick={() => setShowAI(false)}
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
            <AIAssistant
              sessionId={session.id}
              questionId={currentQuestion?.id}
              currentAnswer=""
              isCorrect={false}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorRetry;
