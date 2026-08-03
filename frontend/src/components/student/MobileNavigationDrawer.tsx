// 移动端导航抽屉组件
import React from 'react';
import TrainingNavigation from './TrainingNavigation';

interface MobileNavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  phase: 'PRE_TEST' | 'TRAINING' | 'FINAL_EXAM';
  currentStep: number;
  totalSteps: number;
  progress: number;
}

const MobileNavigationDrawer: React.FC<MobileNavigationDrawerProps> = ({
  isOpen,
  onClose,
  phase,
  currentStep,
  totalSteps,
  progress,
}) => {
  if (!isOpen) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex">
      {/* 遮罩层 */}
      <div
        className="flex-1 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 抽屉内容 */}
      <div className="w-80 max-w-[85vw] bg-[#232f48] shadow-2xl flex flex-col animate-slide-in">
        {/* 抽屉头部 */}
        <div className="flex items-center justify-between border-b border-[#324467] px-6 py-4">
          <h2 className="text-lg font-bold text-white">
            训练进度
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-[#1a2332] text-[#92a4c9] hover:bg-[#324467]"
            aria-label="关闭"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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

        {/* 导航内容 */}
        <div className="flex-1 overflow-y-auto">
          <TrainingNavigation
            phase={phase}
            currentStep={currentStep}
            totalSteps={totalSteps}
            progress={progress}
          />
        </div>
      </div>

      {/* 添加滑入动画 */}
      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default MobileNavigationDrawer;
