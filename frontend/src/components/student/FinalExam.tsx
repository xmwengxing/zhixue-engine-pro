import { useState } from 'react';
import { Button, Card, Progress } from '../shared';
import QuestionRenderer from './QuestionRenderer';
import type { Question } from '../../services/studentTrainingService';

/**
 * 综合考试界面组件
 */
interface FinalExamProps {
  questions: Question[];
  currentQuestionIndex: number;
  onSubmitAnswer: (answer: string) => void;
  onComplete: () => void;
}

export const FinalExam = ({
  questions,
  currentQuestionIndex,
  onSubmitAnswer,
  onComplete,
}: FinalExamProps) => {
  const [answer, setAnswer] = useState('');
  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  const handleSubmit = () => {
    if (answer.trim()) {
      onSubmitAnswer(answer);
      setAnswer('');
    }
  };

  const handleComplete = () => {
    if (currentQuestionIndex === questions.length - 1) {
      onComplete();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部进度条 */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-orange-500">
                quiz
              </span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                综合考试
              </h3>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              第 {currentQuestionIndex + 1} / {questions.length} 题
            </div>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* 题目内容 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="p-8">
            {/* 题目标签 */}
            <div className="flex items-center gap-2 mb-6">
              <span className="px-3 py-1 bg-orange-100 text-orange-600 dark:bg-orange-900/20 text-xs font-bold rounded-full">
                综合测试
              </span>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-xs font-medium rounded-full">
                难度: {currentQuestion?.difficulty || 3}
              </span>
            </div>

            {/* 题目渲染 */}
            {currentQuestion && (
              <QuestionRenderer
                question={currentQuestion}
                answer={answer}
                onAnswerChange={setAnswer}
                disabled={false}
              />
            )}

            {/* 答题区域 - 已经在 QuestionRenderer 中包含 */}

            {/* 操作按钮 */}
            <div className="mt-6 flex gap-4">
              {currentQuestionIndex < questions.length - 1 ? (
                <Button
                  onClick={handleSubmit}
                  disabled={!answer.trim()}
                  className="flex-1"
                >
                  提交答案并继续
                  <span className="material-symbols-outlined ml-2">
                    arrow_forward
                  </span>
                </Button>
              ) : (
                <Button
                  onClick={handleComplete}
                  disabled={!answer.trim()}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  提交答案并完成考试
                  <span className="material-symbols-outlined ml-2">
                    check_circle
                  </span>
                </Button>
              )}
            </div>
          </Card>

          {/* 提示信息 */}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">
                info
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                  考试提示
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  这是综合考试环节，请认真作答。完成后将生成详细的学习报告。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinalExam;
