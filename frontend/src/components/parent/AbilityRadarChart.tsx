import { useEffect, useRef } from 'react';

interface AbilityRadarChartProps {
  subjects: string[];
  scores: number[];
  /** 每个学科的样本量（答题数），用于标注可信度 */
  sampleSizes?: number[];
}

/** 样本量低于该值时提示"样本不足" */
const LOW_SAMPLE_THRESHOLD = 5;

/**
 * 能力雷达图组件（暗色主题）
 * 使用 Canvas 绘制雷达图；学科数 < 3 时退化为条形展示，避免雷达图畸变
 */
export default function AbilityRadarChart({
  subjects,
  scores,
  sampleSizes = [],
}: AbilityRadarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const useRadar = subjects.length >= 3;

  useEffect(() => {
    if (!useRadar) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 300;
    canvas.width = size;
    canvas.height = size;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 60;
    const levels = 5;

    ctx.clearRect(0, 0, size, size);

    // 背景等级圈（暗色网格）
    for (let i = levels; i > 0; i--) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (radius / levels) * i, 0, Math.PI * 2);
      ctx.strokeStyle = i === levels ? '#3d4f73' : '#2b3a58';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const angleStep = (Math.PI * 2) / subjects.length;

    subjects.forEach((subject, index) => {
      const angle = angleStep * index - Math.PI / 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = '#324467';
      ctx.lineWidth = 1;
      ctx.stroke();

      const labelX = centerX + Math.cos(angle) * (radius + 30);
      const labelY = centerY + Math.sin(angle) * (radius + 30);
      ctx.fillStyle = '#c7d3ea';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(subject, labelX, labelY - 7);

      ctx.fillStyle = '#5b6b8c';
      ctx.font = '11px sans-serif';
      ctx.fillText(`${scores[index] ?? 0}%`, labelX, labelY + 8);
    });

    // 数据区域
    ctx.beginPath();
    scores.forEach((score, index) => {
      const angle = angleStep * index - Math.PI / 2;
      const distance = (radius / 100) * score;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 数据点
    scores.forEach((score, index) => {
      const angle = angleStep * index - Math.PI / 2;
      const distance = (radius / 100) * score;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#60a5fa';
      ctx.fill();
    });
  }, [subjects, scores, useRadar]);

  // 空态
  if (subjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="material-symbols-outlined text-4xl text-[#3d4f73]">radar</span>
        <p className="mt-3 text-sm text-[#92a4c9]">暂无已完成的训练数据</p>
        <p className="mt-1 text-xs text-[#5b6b8c]">
          学员完成训练任务后，将按学科自动生成正确率画像
        </p>
      </div>
    );
  }

  // 学科不足 3 个：用横向条展示，避免雷达图退化成线段
  if (!useRadar) {
    return (
      <div className="space-y-4 py-2">
        <p className="text-xs text-[#5b6b8c]">
          当前仅 {subjects.length} 个学科有数据，暂以条形图展示（≥3 个学科时切换为雷达图）
        </p>
        {subjects.map((subject, index) => {
          const score = scores[index] ?? 0;
          const sample = sampleSizes[index];
          return (
            <div key={subject}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-white">
                  {subject}
                  {typeof sample === 'number' && sample < LOW_SAMPLE_THRESHOLD && (
                    <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-300">
                      样本不足
                    </span>
                  )}
                </span>
                <span className="text-[#92a4c9]">
                  {score}%
                  {typeof sample === 'number' && (
                    <span className="ml-1 text-xs text-[#5b6b8c]">({sample} 题)</span>
                  )}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#1a2332]">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <canvas ref={canvasRef} className="max-w-full" />
      {sampleSizes.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-[#5b6b8c]">
          {subjects.map((subject, index) => (
            <span key={subject}>
              {subject} {sampleSizes[index] ?? 0} 题
              {(sampleSizes[index] ?? 0) < LOW_SAMPLE_THRESHOLD && (
                <span className="ml-1 text-amber-300">样本不足</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
