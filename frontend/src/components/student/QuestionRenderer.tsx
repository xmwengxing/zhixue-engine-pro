// 题目渲染器 - 支持选择题、填空题、问答题 + LaTeX 公式 + 图片
import React, { useMemo } from 'react';
import type { Question } from '../../services/studentTrainingService';
import { LatexText } from '../common/MathFormula';

interface QuestionRendererProps {
  question: Question;
  answer: string;
  onAnswerChange: (answer: string) => void;
  disabled?: boolean;
}

/** 清洗选项文本：移除解析残留 */
function cleanOptionText(text: string): string {
  if (!text) return '';
  return text
    // 移除解析残留（如 "，故A不符合题意"、"解：..."）
    .replace(/[,，]?\s*故\s*[A-Z]\s*不符合题意.*$/s, '')
    .replace(/[,，]?\s*故\s*[A-Z]\s*符合题意.*$/s, '')
    .replace(/\s*解[：:].*$/s, '')
    .replace(/\s*答案[：:].*$/s, '')
    .replace(/\s*解析[：:].*$/s, '')
    .trim();
}

/** 去重选项（按 key 去重，保留首次出现的） */
function deduplicateOptions(options: Array<{ key?: string; text?: string } | string>) {
  const seen = new Set<string>();
  return options.filter((opt) => {
    const key = typeof opt === 'object' && opt.key ? opt.key : '';
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 渲染含公式的文本（支持图片标记 {{IMG:path}}） */
function renderRichText(text: string) {
  if (!text) return null;
  // 分割图片标记
  const parts = text.split(/(\{\{IMG:[^}]+\}\})/);
  return parts.map((part, i) => {
    const imgMatch = part.match(/\{\{IMG:([^}]+)\}\}/);
    if (imgMatch) {
      return (
        <img
          key={i}
          src={imgMatch[1]}
          alt="题目图片"
          className="my-2 max-w-full rounded border border-[#324467]"
        />
      );
    }
    return <LatexText key={i} text={part} />;
  });
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

  // 去重选项
  const uniqueOptions = useMemo(() => {
    if (!content.options || !Array.isArray(content.options)) return [];
    return deduplicateOptions(content.options);
  }, [content.options]);

  // 题干文本（兼容 stem / question / text 字段）
  const stemText = content.stem || content.question || content.text || '';

  // 渲染选择题
  const renderChoiceQuestion = () => {
    if (!uniqueOptions.length) {
      return <p className="text-red-500">题目格式错误：缺少选项</p>;
    }

    return (
      <div className="space-y-3">
        {uniqueOptions.map((option: { key?: string; text?: string } | string, index: number) => {
          const optionKey = typeof option === 'object' && option.key
            ? option.key
            : String.fromCharCode(65 + index);
          const rawText = typeof option === 'object' && option.text
            ? option.text
            : String(option);
          const optionText = cleanOptionText(rawText);

          return (
            <label
              key={index}
              className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                answer === optionKey
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-[#324467] hover:border-blue-500/40'
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
                <span className="font-medium text-[#c3cfe6]">{optionKey}. </span>
                <span className="text-[#c3cfe6]">
                  <LatexText text={optionText} />
                </span>
              </div>
            </label>
          );
        })}
      </div>
    );
  };

  // 渲染填空题
  const renderFillQuestion = () => (
    <div>
      <textarea
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="请输入你的答案..."
        className="w-full p-4 border-2 border-[#324467] rounded-lg focus:border-blue-500 focus:outline-none resize-none text-[#e2e8f5] bg-[#1a2332]"
        rows={3}
        disabled={disabled}
      />
      <p className="text-xs text-[#5b6b8c] mt-2">
        提示：填空题答案应简洁明了
      </p>
    </div>
  );

  // 渲染问答题
  const renderEssayQuestion = () => (
    <div>
      <textarea
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="请详细阐述你的答案..."
        className="w-full p-4 border-2 border-[#324467] rounded-lg focus:border-blue-500 focus:outline-none resize-none text-[#e2e8f5] bg-[#1a2332]"
        rows={8}
        disabled={disabled}
      />
      <div className="flex justify-between items-center mt-2">
        <p className="text-xs text-[#5b6b8c]">
          提示：问答题需要详细说明你的思路和理由
        </p>
        <span className="text-xs text-[#5b6b8c]">
          {answer.length} 字
        </span>
      </div>
    </div>
  );

  return (
    <div>
      {/* 题目文本 + 公式渲染 */}
      <div className="mb-6">
        <div className="text-lg text-[#e2e8f5] leading-relaxed">
          {renderRichText(stemText)}
        </div>

        {/* 题目图片（如果有） */}
        {content.image && (
          <div className="mt-4">
            <img
              src={content.image}
              alt="题目图片"
              className="max-w-full rounded-lg border border-[#324467]"
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
