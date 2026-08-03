import { Button, Card } from '../shared';

/**
 * 训前测试准备界面组件
 */
interface PreTestReadyProps {
  taskTitle: string;
  questionCount: number;
  estimatedTime: number;
  onStart: () => void;
}

export const PreTestReady = ({
  taskTitle,
  questionCount,
  estimatedTime,
  onStart,
}: PreTestReadyProps) => {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 flex flex-col items-center">
      {/* 标题 */}
      <div className="text-center mb-8">
        <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full mb-4">
          第一阶段：基础诊断
        </span>
        <h1 className="text-white tracking-tight text-4xl font-extrabold leading-tight">
          训前测试准备就绪
        </h1>
        <p className="text-[#5b6b8c] mt-3 text-lg max-w-lg mx-auto">
          我们将通过这组题目，为您构建个性化的知识图谱，锁定薄弱环节。
        </p>
      </div>

      {/* 卡片 */}
      <div className="w-full">
        <Card className="flex flex-col lg:flex-row shadow-2xl shadow-black/20 overflow-hidden">
          {/* 左侧图片 */}
          <div className="w-full lg:w-1/2 bg-gradient-to-br from-blue-500 to-purple-600 aspect-video lg:aspect-square flex items-center justify-center relative">
            <div className="absolute inset-0 bg-primary/20 backdrop-blur-[2px] flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-8xl opacity-50">
                calculate
              </span>
            </div>
          </div>

          {/* 右侧内容 */}
          <div className="flex w-full lg:w-1/2 flex-col justify-between gap-6 p-8">
            <div>
              <h3 className="text-white text-2xl font-bold leading-tight tracking-tight">
                {taskTitle}
              </h3>
              <div className="mt-4 flex flex-col gap-4">
                <div className="flex items-center gap-3 text-[#92a4c9]">
                  <span className="material-symbols-outlined text-primary">
                    description
                  </span>
                  <p className="text-base font-normal">基础知识诊断性测评</p>
                </div>
                <div className="flex items-center gap-3 text-[#92a4c9]">
                  <span className="material-symbols-outlined text-primary">
                    psychology
                  </span>
                  <p className="text-base font-normal">测试将实时调整后续练习难度</p>
                </div>
              </div>
            </div>

            {/* 统计信息 */}
            <div className="flex gap-4">
              <div className="flex-1 flex flex-col gap-1 rounded-xl p-4 bg-[#1a2332] border border-[#324467]">
                <p className="text-[#5b6b8c] text-xs font-medium uppercase tracking-wider">
                  题目数量
                </p>
                <p className="text-white text-xl font-bold">
                  {questionCount} 题
                </p>
              </div>
              <div className="flex-1 flex flex-col gap-1 rounded-xl p-4 bg-[#1a2332] border border-[#324467]">
                <p className="text-[#5b6b8c] text-xs font-medium uppercase tracking-wider">
                  预计用时
                </p>
                <p className="text-white text-xl font-bold">
                  {estimatedTime} 分钟
                </p>
              </div>
            </div>

            {/* 开始按钮 */}
            <Button
              onClick={onStart}
              className="w-full py-4 text-lg shadow-lg shadow-primary/30 flex items-center justify-center gap-3"
            >
              开始训前测试
              <span className="material-symbols-outlined">arrow_forward</span>
            </Button>
          </div>
        </Card>
      </div>

      {/* 底部提示 */}
      <div className="mt-12 flex flex-wrap items-center gap-8 text-[#5b6b8c] justify-center">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">verified_user</span>
          <span className="text-xs uppercase tracking-widest font-bold">
            专注力保护模式已开启
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">bolt</span>
          <span className="text-xs uppercase tracking-widest font-bold">
            智能适配引擎加载完毕
          </span>
        </div>
      </div>
    </div>
  );
};

export default PreTestReady;
