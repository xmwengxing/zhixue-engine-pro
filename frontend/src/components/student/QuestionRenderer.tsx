// 题目渲染器 - 支持选择题、填空题、问答题
import React from 'react';
import type { Question } from '../../services/studentTrainingService';

interface QuestionRendererProps {
  question: Question;
  answer: string;
  onAnswerChange: (answer: string) => void;
  disabled?: boolean;
}

const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  answer,
  onAnswerChange,
  disabled = false,
}) => {
  // 解析题目内容
  const content = typeof question.content === 'string'
    ? JSON.parse(question.content)
    : question.content;

  // 渲染选择题
  const renderChoiceQuestion = () => {
    if (!content.options || !Array.isArray(content.options)) {
      return <p className="text-red-500">题目格式错误：缺少选项</p>;
    }

    return (
      <div className="space-y-3">
        {content.options.map((option: { key?: string; text?: string } | string, index: number) => {
          const optionKey = typeof option === 'object' && option.key 
            ? option.key 
            : String.fromCharCode(65 + index); // A, B, C, D...
          const optionText = typeof option === 'object' && option.text 
            ? option.text 
            : String(option);

          return (
            <label
              key={index}
              className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                answer === optionKey
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="answer"
                value={optionKey}
                checked={answer === optionKey}
                onChange={(e) => onAnswerChange(e.target.value)}
                className="mt-1 mr-3"
                disabled={disabled}
              />
              <div className="flex-1">
                <span className="font-medium text-gray-700">{optionKey}. </span>
                <span className="text-gray-700">{optionText}</span>
              </div>
            </label>
          );
        })}
      </div>
    );
  };

  // 渲染填空题
  const renderFillQuestion = () => {
    return (
      <div>
        <textarea
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          placeholder="请输入你的答案..."
          className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none"
          rows={3}
          disabled={disabled}
        />
        <p className="text-xs text-gray-500 mt-2">
          提示：填空题答案应简洁明了
        </p>
      </div>
    );
  };

  // 渲染问答题
  const renderEssayQuestion = () => {
    return (
      <div>
        <textarea
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          placeholder="请详细阐述你的答案..."
          className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none"
          rows={8}
          disabled={disabled}
        />
        <div className="flex justify-between items-center mt-2">
          <p className="text-xs text-gray-500">
            提示：问答题需要详细说明你的思路和理由
          </p>
          <span className="text-xs text-gray-400">
            {answer.length} 字
          </span>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* 题目文本 */}
      <div className="mb-6">
        <div className="text-lg text-gray-800 leading-relaxed whitespace-pre-wrap">
          {content.question || content.text || '题目内容'}
        </div>

        {/* 题目图片（如果有） */}
        {content.image && (
          <div className="mt-4">
            <img
              src={content.image}
              alt="题目图片"
              className="max-w-full rounded-lg border border-gray-200"
            />
          </div>
        )}
      </div>

      {/* 根据题型渲染不同的答题区域 */}
      <div className="mt-6">
        {question.type === 'CHOICE' && renderChoiceQuestion()}
        {question.type === 'FILL' && renderFillQuestion()}
        {question.type === 'ESSAY' && renderEssayQuestion()}
      </div>
    </div>
  );
};

export default QuestionRenderer;
