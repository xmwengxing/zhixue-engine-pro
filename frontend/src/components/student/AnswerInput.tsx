// 答题输入组件
import React from 'react';

interface AnswerInputProps {
  type: 'CHOICE' | 'FILL' | 'ESSAY';
  value: string;
  onChange: (value: string) => void;
  options?: Array<{ key: string; text: string }>;
  disabled?: boolean;
  placeholder?: string;
}

const AnswerInput: React.FC<AnswerInputProps> = ({
  type,
  value,
  onChange,
  options = [],
  disabled = false,
  placeholder,
}) => {
  // 选择题输入
  if (type === 'CHOICE') {
    return (
      <div className="space-y-3">
        {options.map((option, index) => (
          <label
            key={index}
            className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
              value === option.key
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-blue-300'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              type="radio"
              name="answer"
              value={option.key}
              checked={value === option.key}
              onChange={(e) => onChange(e.target.value)}
              className="mt-1 mr-3"
              disabled={disabled}
            />
            <div className="flex-1">
              <span className="font-medium text-gray-700">{option.key}. </span>
              <span className="text-gray-700">{option.text}</span>
            </div>
          </label>
        ))}
      </div>
    );
  }

  // 填空题输入
  if (type === 'FILL') {
    return (
      <div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || '请输入你的答案...'}
          className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none"
          rows={3}
          disabled={disabled}
        />
        <p className="text-xs text-gray-500 mt-2">
          提示：填空题答案应简洁明了
        </p>
      </div>
    );
  }

  // 问答题输入
  if (type === 'ESSAY') {
    return (
      <div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || '请详细阐述你的答案...'}
          className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none"
          rows={8}
          disabled={disabled}
        />
        <div className="flex justify-between items-center mt-2">
          <p className="text-xs text-gray-500">
            提示：问答题需要详细说明你的思路和理由
          </p>
          <span className="text-xs text-gray-400">{value.length} 字</span>
        </div>
      </div>
    );
  }

  return null;
};

export default AnswerInput;
