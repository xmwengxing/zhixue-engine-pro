// 训练舱 - 左侧进度导航栏
import React from 'react';

interface TrainingNavigationProps {
  phase: 'PRE_TEST' | 'TRAINING' | 'FINAL_EXAM';
  currentStep: number;
  totalSteps: number;
  progress: number;
}

const TrainingNavigation: React.FC<TrainingNavigationProps> = ({
  phase,
  currentStep,
  totalSteps,
  progress,
}) => {
  // 计算各阶段的题目范围
  const preTestEnd = Math.ceil(totalSteps * 0.2);
  const trainingEnd = Math.ceil(totalSteps * 0.8);

  // 判断当前步骤所在阶段
  const isPreTestActive = currentStep < preTestEnd;
  const isTrainingActive = currentStep >= preTestEnd && currentStep < trainingEnd;
  const isFinalExamActive = currentStep >= trainingEnd;

  const isPreTestCompleted = currentStep >= preTestEnd;
  const isTrainingCompleted = currentStep >= trainingEnd;
  const isFinalExamCompleted = currentStep >= totalSteps;

  return (
    <div className="h-full bg-white border-r border-gray-200 p-4 flex flex-col">
      {/* 标题 */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-800">训练进度</h2>
        <p className="text-sm text-gray-500 mt-1">
          {currentStep} / {totalSteps} 题
        </p>
      </div>

      {/* 进度条 */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-600 mb-2">
          <span>进度</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 阶段列表 */}
      <div className="flex-1 space-y-3">
        {/* 训前测试 */}
        <div
          className={`p-3 rounded-lg border-2 transition-all ${
            isPreTestActive
              ? 'border-blue-500 bg-blue-50'
              : isPreTestCompleted
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {isPreTestCompleted ? (
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
                <div
                  className={`w-5 h-5 rounded-full border-2 ${
                    isPreTestActive ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                  }`}
                />
              )}
              <span
                className={`font-medium ${
                  isPreTestActive
                    ? 'text-blue-700'
                    : isPreTestCompleted
                    ? 'text-green-700'
                    : 'text-gray-600'
                }`}
              >
                训前测试
              </span>
            </div>
            {isPreTestActive && (
              <span className="text-xs text-blue-600 font-medium">进行中</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 ml-7">
            第 1-{preTestEnd} 题
          </p>
        </div>

        {/* 动态训练 */}
        <div
          className={`p-3 rounded-lg border-2 transition-all ${
            isTrainingActive
              ? 'border-blue-500 bg-blue-50'
              : isTrainingCompleted
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {isTrainingCompleted ? (
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
                <div
                  className={`w-5 h-5 rounded-full border-2 ${
                    isTrainingActive ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                  }`}
                />
              )}
              <span
                className={`font-medium ${
                  isTrainingActive
                    ? 'text-blue-700'
                    : isTrainingCompleted
                    ? 'text-green-700'
                    : 'text-gray-600'
                }`}
              >
                动态训练
              </span>
            </div>
            {isTrainingActive && (
              <span className="text-xs text-blue-600 font-medium">进行中</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 ml-7">
            第 {preTestEnd + 1}-{trainingEnd} 题
          </p>
        </div>

        {/* 综合考试 */}
        <div
          className={`p-3 rounded-lg border-2 transition-all ${
            isFinalExamActive
              ? 'border-blue-500 bg-blue-50'
              : isFinalExamCompleted
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {isFinalExamCompleted ? (
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
                <div
                  className={`w-5 h-5 rounded-full border-2 ${
                    isFinalExamActive ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                  }`}
                />
              )}
              <span
                className={`font-medium ${
                  isFinalExamActive
                    ? 'text-blue-700'
                    : isFinalExamCompleted
                    ? 'text-green-700'
                    : 'text-gray-600'
                }`}
              >
                综合考试
              </span>
            </div>
            {isFinalExamActive && (
              <span className="text-xs text-blue-600 font-medium">进行中</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 ml-7">
            第 {trainingEnd + 1}-{totalSteps} 题
          </p>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-xs text-blue-700">
          {phase === 'PRE_TEST' && '正在进行训前测试，了解你的基础水平'}
          {phase === 'TRAINING' && '根据你的表现动态调整难度'}
          {phase === 'FINAL_EXAM' && '最后冲刺，检验学习成果'}
        </p>
      </div>
    </div>
  );
};

export default TrainingNavigation;
