// 训练舱 - 中间题目交互区
import React, { useState, useEffect } from 'react';
import type { Question } from '../../services/studentTrainingService';
import QuestionRenderer from './QuestionRenderer';

interface QuestionAreaProps {
  question: Question | null;
  onSubmit: (answer: string, timeSpent: number) => void;
  feedback?: {
    correct: boolean;
    message: string;
  } | null;
  isSubmitting: boolean;
}

const QuestionArea: React.FC<QuestionAreaProps> = ({
  question,
  onSubmit,
  feedback,
  isSubmitting,
}) => {
  const [answer, setAnswer] = useState('');
  const [startTime, setStartTime] = useState(() => Date.now());

  // 当题目变化时重置答案和计时
  useEffect(() => {
    // 使用 setTimeout 避免在 effect 中同步调用 setState
    const timer = setTimeout(() => {
      setAnswer('');
      setStartTime(Date.now());
    }, 0);
    
    return () => clearTimeout(timer);
  }, [question?.id]);

  const handleSubmit = () => {
    if (!answer.trim()) {
      alert('请输入答案');
      return;
    }

    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    onSubmit(answer, timeSpent);
  };

  if (!question) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1a2332]">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-[#5b6b8c]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-2 text-sm text-[#5b6b8c]">加载题目中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#232f48] p-6 overflow-y-auto">
      {/* 题目头部 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <span className="px-3 py-1 bg-blue-500/15 text-blue-300 text-sm font-medium rounded-full">
              {question.type === 'CHOICE' && '选择题'}
              {question.type === 'FILL' && '填空题'}
              {question.type === 'ESSAY' && '问答题'}
            </span>
            <span className="text-sm text-[#5b6b8c]">
              难度: {'★'.repeat(question.difficulty)}{'☆'.repeat(5 - question.difficulty)}
            </span>
          </div>
        </div>

        {/* 知识点标签 */}
        {question.knowledgePoints && question.knowledgePoints.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {question.knowledgePoints.map((point, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-[#1a2332] text-[#92a4c9] text-xs rounded"
              >
                {point}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 题目内容和答题区域 */}
      <div className="flex-1 mb-6">
        <QuestionRenderer
          question={question}
          answer={answer}
          onAnswerChange={setAnswer}
          disabled={isSubmitting || !!feedback}
        />
      </div>

      {/* 反馈信息 */}
      {feedback && (
        <div
          className={`mb-4 p-4 rounded-lg ${
            feedback.correct
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedback.correct ? (
              <svg
                className="w-5 h-5 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 text-red-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span
              className={`font-medium ${
                feedback.correct ? 'text-green-300' : 'text-red-300'
              }`}
            >
              {feedback.message}
            </span>
          </div>
        </div>
      )}

      {/* 提交按钮 */}
      <div className="flex justify-end space-x-3">
        {!feedback && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !answer.trim()}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              isSubmitting || !answer.trim()
                ? 'bg-[#324467] text-[#5b6b8c] cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {isSubmitting ? '提交中...' : '提交答案'}
          </button>
        )}
        {feedback && (
          <button
            onClick={() => {
              setAnswer('');
              setStartTime(Date.now());
            }}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all"
          >
            下一题
          </button>
        )}
      </div>
    </div>
  );
};

export default QuestionArea;
