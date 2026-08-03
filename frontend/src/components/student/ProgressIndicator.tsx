// 进度指示器组件
import React from 'react';

interface ProgressIndicatorProps {
  current: number;
  total: number;
  progress: number;
  phase: 'PRE_TEST' | 'TRAINING' | 'FINAL_EXAM';
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  current,
  total,
  progress,
  phase,
}) => {
  const getPhaseText = () => {
    switch (phase) {
      case 'PRE_TEST':
        return '训前测试';
      case 'TRAINING':
        return '动态训练';
      case 'FINAL_EXAM':
        return '综合考试';
      default:
        return '训练中';
    }
  };

  const getPhaseColor = () => {
    switch (phase) {
      case 'PRE_TEST':
        return 'bg-yellow-500';
      case 'TRAINING':
        return 'bg-blue-500';
      case 'FINAL_EXAM':
        return 'bg-green-500';
      default:
        return 'bg-[#5b6b8c]';
    }
  };

  return (
    <div className="bg-[#232f48] border-b border-[#324467] px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <span className={`px-3 py-1 ${getPhaseColor()} text-white text-sm font-medium rounded-full`}>
            {getPhaseText()}
          </span>
          <span className="text-sm text-[#92a4c9]">
            第 {current} / {total} 题
          </span>
        </div>
        <span className="text-sm font-medium text-[#c3cfe6]">{progress}%</span>
      </div>

      {/* 进度条 */}
      <div className="w-full bg-[#324467] rounded-full h-2">
        <div
          className={`${getPhaseColor()} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 阶段提示 */}
      <div className="mt-2 text-xs text-[#5b6b8c]">
        {phase === 'PRE_TEST' && '正在评估你的基础水平...'}
        {phase === 'TRAINING' && '根据你的表现动态调整难度...'}
        {phase === 'FINAL_EXAM' && '最后冲刺，检验学习成果！'}
      </div>
    </div>
  );
};

export default ProgressIndicator;
