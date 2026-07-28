import { Loading } from '../shared';

/**
 * AI 生成进度提示组件
 */
interface AIGeneratingProgressProps {
  title: string;
  description: string;
  progress?: number;
}

export const AIGeneratingProgress = ({
  title,
  description,
  progress,
}: AIGeneratingProgressProps) => {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 flex flex-col items-center">
      {/* AI 图标 */}
      <div className="relative mb-8">
        <div className="size-24 rounded-full bg-gradient-to-tr from-primary to-blue-400 p-1 animate-pulse">
          <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-5xl">
              smart_toy
            </span>
          </div>
        </div>
        <div className="absolute -bottom-2 -right-2 size-8 rounded-full bg-green-500 flex items-center justify-center animate-bounce">
          <span className="material-symbols-outlined text-white text-sm">
            auto_awesome
          </span>
        </div>
      </div>

      {/* 标题 */}
      <h2 className="text-slate-900 dark:text-white text-3xl font-bold text-center mb-4">
        {title}
      </h2>
      <p className="text-slate-500 dark:text-slate-400 text-lg text-center max-w-md mb-8">
        {description}
      </p>

      {/* 进度条 */}
      {progress !== undefined ? (
        <div className="w-full max-w-md">
          <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 mb-2">
            <span>生成进度</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      ) : (
        <Loading size="lg" />
      )}

      {/* 提示信息 */}
      <div className="mt-12 flex flex-col gap-4 w-full max-w-md">
        <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
          <span className="material-symbols-outlined text-primary">psychology</span>
          <span>AI 正在分析您的学习数据...</span>
        </div>
        <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
          <span className="material-symbols-outlined text-primary">auto_awesome</span>
          <span>智能生成个性化内容...</span>
        </div>
        <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
          <span className="material-symbols-outlined text-primary">verified</span>
          <span>质量检查与优化中...</span>
        </div>
      </div>
    </div>
  );
};

export default AIGeneratingProgress;
