import { Card, Progress } from '../shared';

/**
 * 知识点掌握度数据接口
 */
interface KnowledgePoint {
  name: string;
  mastery: number;
  change: number;
  description: string;
}

/**
 * 训练步骤接口
 */
interface TrainingStep {
  id: number;
  title: string;
  icon: string;
  status: 'active' | 'pending' | 'locked';
}

/**
 * 个性化训练计划生成组件
 */
interface TrainingPlanGeneratorProps {
  knowledgePoints: KnowledgePoint[];
  trainingSteps: TrainingStep[];
  aiMessage: string;
  estimatedTime?: number;
}

export const TrainingPlanGenerator = ({
  knowledgePoints,
  trainingSteps,
  aiMessage,
  estimatedTime = 5,
}: TrainingPlanGeneratorProps) => {
  return (
    <div className="flex max-w-[1440px] mx-auto px-6 py-8 gap-8">
      {/* 左侧训练路径 */}
      <aside className="w-72 flex-shrink-0 flex flex-col gap-6 bg-[#232f48] p-6 rounded-xl border border-[#324467] h-[calc(100vh-140px)] sticky top-24">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-bold text-white">训练路径</h1>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <p className="text-[#5b6b8c] text-xs font-medium uppercase tracking-wider">
              AI实时生成中
            </p>
          </div>
        </div>

        {/* 训练步骤列表 */}
        <div className="flex flex-col gap-4 overflow-y-auto">
          {trainingSteps.map((step) => (
            <div
              key={step.id}
              className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all ${
                step.status === 'active'
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : step.status === 'pending'
                    ? 'bg-[#1a2332] border border-primary/30'
                    : 'border border-dashed border-[#324467] opacity-40'
              }`}
            >
              <span
                className={`material-symbols-outlined ${step.status === 'active' ? '' : 'text-primary'}`}
              >
                {step.icon}
              </span>
              <p
                className={`text-sm ${step.status === 'active' ? 'font-bold' : 'font-medium'}`}
              >
                {step.title}
              </p>
            </div>
          ))}
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 flex flex-col gap-6">
        {/* 标题区域 */}
        <Card className="p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex items-center gap-3 text-primary">
              <span className="material-symbols-outlined text-4xl animate-pulse">
                psychology
              </span>
              <span className="text-sm font-bold tracking-widest uppercase">
                Intelligent Analysis
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black leading-tight tracking-tight max-w-2xl text-white">
              AI正在分析你的答题情况并生成训练计划...
            </h2>
            <p className="text-[#5b6b8c] text-lg font-normal max-w-xl">
              基于你的前测数据，我们正在计算最佳学习路径。预计还需要 {estimatedTime} 秒钟。
            </p>
          </div>
        </Card>

        {/* 知识点掌握度报告 */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xl font-bold flex items-center gap-2 text-white">
              <span className="material-symbols-outlined text-primary">analytics</span>
              知识点掌握度报告
            </h3>
            <span className="text-xs text-[#5b6b8c] bg-[#1a2332] px-2 py-1 rounded">
              实时更新
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {knowledgePoints.map((point, index) => {
              const isHigh = point.mastery >= 70;
              const color = isHigh ? 'emerald' : 'orange';

              return (
                <Card
                  key={index}
                  className={`p-6 flex flex-col gap-4 hover:border-${color}-500/50 transition-all`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[#5b6b8c] text-sm font-medium">
                        {point.name}
                      </p>
                      <p className="text-3xl font-bold mt-1 text-white">
                        {point.mastery}%
                      </p>
                    </div>
                    <div
                      className={`flex items-center gap-1 text-${color}-500 bg-${color}-500/10 px-2 py-1 rounded-full text-xs font-bold`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {point.change >= 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      <span>{point.change >= 0 ? '+' : ''}{point.change}%</span>
                    </div>
                  </div>
                  <Progress
                    value={point.mastery}
                    className={`h-2 bg-${color}-500`}
                  />
                  <p
                    className={`text-xs ${isHigh ? 'text-[#5b6b8c]' : `text-${color}-400 font-medium`}`}
                  >
                    {point.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>

        {/* AI 助手反馈 */}
        <div className="mt-4 flex gap-6 items-end">
          <div className="flex-shrink-0 relative">
            <div className="size-16 rounded-2xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-lg shadow-primary/30">
              <span className="material-symbols-outlined text-white text-4xl">
                smart_toy
              </span>
            </div>
            <div className="absolute -bottom-1 -right-1 size-5 bg-emerald-500 border-4 border-white rounded-full"></div>
          </div>
          <Card className="flex-1 p-6 rounded-2xl rounded-bl-none border-primary/20 shadow-xl relative">
            <div className="absolute left-0 bottom-0 transform -translate-x-1/2 translate-y-0 w-0 h-0 border-t-[10px] border-t-transparent border-r-[15px] border-r-white border-b-[10px] border-b-transparent"></div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-primary tracking-widest">
                  AI 学习导师
                </span>
                <div className="flex gap-1">
                  <span
                    className="size-1 bg-primary rounded-full animate-bounce"
                    style={{ animationDelay: '0.1s' }}
                  ></span>
                  <span
                    className="size-1 bg-primary rounded-full animate-bounce"
                    style={{ animationDelay: '0.2s' }}
                  ></span>
                  <span
                    className="size-1 bg-primary rounded-full animate-bounce"
                    style={{ animationDelay: '0.3s' }}
                  ></span>
                </div>
              </div>
              <p className="text-lg font-medium leading-relaxed text-white">
                {aiMessage}
              </p>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default TrainingPlanGenerator;
