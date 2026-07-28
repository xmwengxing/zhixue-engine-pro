// 训练舱中间栏 - 题目区域
import React, { useState, useEffect } from 'react';
import TrainingPlanDisplay from './TrainingPlanDisplay';
import TrainingReportDisplay from './TrainingReportDisplay';
import type { TrainingSession, Question } from '../../pages/student/TrainingCabin';

interface TrainingCenterPanelProps {
  session: TrainingSession;
  currentQuestion: Question | null;
  onSessionUpdate: (session: Partial<TrainingSession>) => void;
  onQuestionUpdate: (question: Question | null) => void;
}

const TrainingCenterPanel: React.FC<TrainingCenterPanelProps> = ({
  session,
  currentQuestion,
  onSessionUpdate,
  onQuestionUpdate,
}) => {
  const [answer, setAnswer] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    message: string;
    explanation?: string;
  } | null>(null);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // 当题目变化时重置状态
  useEffect(() => {
    setAnswer('');
    setFeedback(null);
    setStartTime(Date.now());
  }, [currentQuestion]);

  // 自动加载第一道题目（诊断测试或训练阶段）
  useEffect(() => {
    const shouldLoadQuestion = 
      !currentQuestion && 
      !isLoading && 
      (session.phase === 'DIAGNOSTIC_TEST' || session.phase === 'GUIDED_TRAINING');
    
    if (shouldLoadQuestion) {
      loadNextQuestion();
    }
  }, [session.phase, currentQuestion, isLoading]);

  // 加载下一道题目
  const loadNextQuestion = async () => {
    setIsLoading(true);
    try {
      // 调用 API 获取下一道题目
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/student/training/next-question/${session.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '获取题目失败');
      }
      
      const data = await response.json();
      onQuestionUpdate(data.data); // 后端返回的是 { success: true, data: question }
    } catch (error) {
      console.error('加载题目失败:', error);
      alert('加载题目失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  // 提交答案
  const handleSubmitAnswer = async () => {
    if (!answer.trim() || !currentQuestion) {
      alert('请先作答');
      return;
    }

    setIsSubmitting(true);
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    try {
      // 调用 API 提交答案
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/student/training/submit-answer/${session.id}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          questionData: currentQuestion,
          answer,
          timeSpent,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '提交答案失败');
      }
      
      const data = await response.json();
      
      // 显示AI反馈
      setFeedback({
        isCorrect: data.evaluation.isCorrect,
        message: data.evaluation.feedback,
        explanation: data.evaluation.explanation,
      });

      // 更新会话状态
      if (data.session) {
        onSessionUpdate(data.session);
      }

      // 延迟后加载下一题或进入下一阶段
      setTimeout(() => {
        setFeedback(null);
        if (data.nextPhase) {
          // 阶段切换，刷新页面状态
          onSessionUpdate({ phase: data.nextPhase });
        } else if (data.hasNextQuestion) {
          loadNextQuestion();
        }
      }, 3000);
    } catch (error) {
      console.error('提交答案失败:', error);
      alert('提交答案失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 确认训练计划
  const handleConfirmPlan = async () => {
    try {
      // 调用 API 确认训练计划
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/student/training/confirm-plan/${session.id}`, { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '确认训练计划失败');
      }
      
      const data = await response.json();
      
      // 更新会话状态
      onSessionUpdate({ phase: 'GUIDED_TRAINING' });
      
      // 加载第一道训练题目
      loadNextQuestion();
    } catch (error) {
      console.error('确认训练计划失败:', error);
      alert('确认训练计划失败，请重试');
    }
  };

  // 渲染诊断测试阶段
  const renderDiagnosticTest = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
          <p className="text-gray-600">AI 正在为你生成题目...</p>
        </div>
      );
    }

    if (!currentQuestion) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <svg className="w-16 h-16 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-600">准备开始诊断测试</p>
          <button
            onClick={loadNextQuestion}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            开始测试
          </button>
        </div>
      );
    }

    return renderQuestion();
  };

  // 渲染训练计划阶段
  const renderPlanning = () => {
    if (!session.trainingPlanData) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
          <p className="text-gray-600">AI 正在分析你的诊断结果...</p>
          <p className="text-sm text-gray-500">正在生成个性化训练计划</p>
        </div>
      );
    }

    return (
      <div className="h-full overflow-y-auto">
        <TrainingPlanDisplay
          trainingPlan={session.trainingPlanData}
          onConfirm={handleConfirmPlan}
        />
      </div>
    );
  };

  // 渲染引导式训练阶段
  const renderGuidedTraining = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500" />
          <p className="text-gray-600">AI 正在为你生成训练题目...</p>
        </div>
      );
    }

    if (!currentQuestion) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <svg className="w-16 h-16 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-600">准备开始训练</p>
          <button
            onClick={loadNextQuestion}
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            开始训练
          </button>
        </div>
      );
    }

    return renderQuestion();
  };

  // 渲染综合考试阶段
  const renderFinalExam = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
          <p className="text-gray-600">AI 正在生成考试题目...</p>
        </div>
      );
    }

    if (!currentQuestion) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <svg className="w-16 h-16 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-gray-600">准备开始综合考试</p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-md">
            <p className="text-sm text-yellow-800">
              <strong>注意：</strong>考试期间 AI 助手将不可用，请独立完成考试。
            </p>
          </div>
          <button
            onClick={loadNextQuestion}
            className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
          >
            开始考试
          </button>
        </div>
      );
    }

    return renderQuestion();
  };

  // 渲染训练完成阶段
  const renderCompleted = () => {
    if (!session.trainingReport) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500" />
          <p className="text-gray-600">AI 正在生成训练报告...</p>
        </div>
      );
    }

    return (
      <div className="h-full overflow-y-auto">
        <TrainingReportDisplay report={session.trainingReport} />
      </div>
    );
  };

  // 渲染题目
  const renderQuestion = () => {
    if (!currentQuestion) return null;

    return (
      <div className="h-full flex flex-col p-6 space-y-6">
        {/* 题目头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
              {currentQuestion.knowledgePoint}
            </span>
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${
              currentQuestion.difficulty === 'easy' ? 'bg-green-100 text-green-800' :
              currentQuestion.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {currentQuestion.difficulty === 'easy' ? '简单' :
               currentQuestion.difficulty === 'medium' ? '中等' : '困难'}
            </span>
          </div>
          {session.diagnosticTestData && (
            <span className="text-sm text-gray-600">
              第 {session.diagnosticTestData.currentQuestion + 1} / {session.diagnosticTestData.totalQuestions} 题
            </span>
          )}
        </div>

        {/* 题目内容 */}
        <div className="flex-1 bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">题目</h3>
          <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap">
            {currentQuestion.stem}
          </p>

          {/* 选项 */}
          {currentQuestion.options && currentQuestion.options.length > 0 && (
            <div className="mt-6 space-y-3">
              {currentQuestion.options.map((option, index) => (
                <label
                  key={index}
                  className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    answer === option
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  } ${feedback ? 'pointer-events-none' : ''}`}
                >
                  <input
                    type="radio"
                    name="answer"
                    value={option}
                    checked={answer === option}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={!!feedback}
                    className="mt-1 mr-3"
                  />
                  <span className="text-gray-800">{option}</span>
                </label>
              ))}
            </div>
          )}

          {/* 填空题/简答题输入框 */}
          {currentQuestion.type === 'fill_blank' || currentQuestion.type === 'short_answer' && (
            <div className="mt-6">
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={!!feedback}
                placeholder="请输入你的答案..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={4}
              />
            </div>
          )}

          {/* 反馈信息 */}
          {feedback && (
            <div className={`mt-6 p-4 rounded-lg ${
              feedback.isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-start space-x-3">
                {feedback.isCorrect ? (
                  <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                <div className="flex-1">
                  <p className={`font-medium ${feedback.isCorrect ? 'text-green-900' : 'text-red-900'}`}>
                    {feedback.message}
                  </p>
                  {feedback.explanation && (
                    <p className="mt-2 text-sm text-gray-700">{feedback.explanation}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 提交按钮 */}
        {!feedback && (
          <button
            onClick={handleSubmitAnswer}
            disabled={!answer.trim() || isSubmitting}
            className="w-full py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? '提交中...' : '提交答案'}
          </button>
        )}
      </div>
    );
  };

  // 根据阶段渲染不同内容
  switch (session.phase) {
    case 'DIAGNOSTIC_TEST':
      return renderDiagnosticTest();
    case 'PLANNING':
      return renderPlanning();
    case 'GUIDED_TRAINING':
      return renderGuidedTraining();
    case 'FINAL_EXAM':
      return renderFinalExam();
    case 'COMPLETED':
      return renderCompleted();
    default:
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-600">未知阶段</p>
        </div>
      );
  }
};

export default TrainingCenterPanel;
