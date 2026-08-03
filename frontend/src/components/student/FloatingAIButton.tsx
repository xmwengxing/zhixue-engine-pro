// 移动端浮动 AI 按钮组件
import React, { useState, useRef, useEffect } from 'react';
import AIAssistant from './AIAssistant';

interface FloatingAIButtonProps {
  sessionId: string;
  questionId?: string;
  currentAnswer: string;
  isCorrect?: boolean;
}

const FloatingAIButton: React.FC<FloatingAIButtonProps> = ({
  sessionId,
  questionId,
  currentAnswer,
  isCorrect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // 处理触摸开始
  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
    setCurrentY(e.touches[0].clientY);
    setIsDragging(true);
  };

  // 处理触摸移动
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const touchY = e.touches[0].clientY;
    setCurrentY(touchY);
    
    // 只允许向下拖动
    const deltaY = touchY - startY;
    if (deltaY > 0 && drawerRef.current) {
      drawerRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  };

  // 处理触摸结束
  const handleTouchEnd = () => {
    if (!isDragging) return;
    
    const deltaY = currentY - startY;
    
    // 如果向下拖动超过 100px，关闭抽屉
    if (deltaY > 100) {
      setIsOpen(false);
    }
    
    // 重置拖动状态
    if (drawerRef.current) {
      drawerRef.current.style.transform = '';
    }
    setIsDragging(false);
    setStartY(0);
    setCurrentY(0);
  };

  // 阻止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* 浮动按钮 - 仅在移动端显示 */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed bottom-6 right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
        aria-label="打开 AI 助手"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        
        {/* 脉冲动画提示 */}
        <span className="absolute inset-0 rounded-full bg-blue-600 animate-ping opacity-75" />
      </button>

      {/* 底部抽屉式 AI 对话框 */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col">
          {/* 遮罩层 */}
          <div
            className="flex-1 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* 抽屉内容 */}
          <div
            ref={drawerRef}
            className="bg-[#232f48] rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-up touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* 拖动指示条 */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 bg-[#324467] rounded-full" />
            </div>

            {/* 抽屉头部 */}
            <div className="flex items-center justify-between bg-[#232f48]/80 backdrop-blur-md sticky top-0 z-10 border-b border-[#324467] px-6 py-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/15 text-blue-400">
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
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <h2 className="text-white text-lg font-bold">
                  AI 助教
                </h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-[#1a2332] text-[#92a4c9] hover:bg-[#324467] active:scale-95 transition-all"
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

            {/* AI 助手内容 */}
            <div className="flex-1 overflow-hidden">
              <AIAssistant
                sessionId={sessionId}
                questionId={questionId}
                currentAnswer={currentAnswer}
                isCorrect={isCorrect}
              />
            </div>

            {/* iPhone 指示条 */}
            <div className="flex justify-center py-2 bg-[#232f48]">
              <div className="w-32 h-1.5 bg-[#324467] rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* 添加滑入动画 */}
      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
};

export default FloatingAIButton;
