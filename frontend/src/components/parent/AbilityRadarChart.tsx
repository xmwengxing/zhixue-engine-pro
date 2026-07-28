import { useEffect, useRef } from 'react';

interface AbilityRadarChartProps {
  subjects: string[];
  scores: number[];
}

/**
 * 能力雷达图组件
 * 使用 Canvas 绘制雷达图
 */
export default function AbilityRadarChart({ subjects, scores }: AbilityRadarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置画布尺寸
    const size = 300;
    canvas.width = size;
    canvas.height = size;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 60;
    const levels = 5; // 5 个等级圈

    // 清空画布
    ctx.clearRect(0, 0, size, size);

    // 绘制背景圆圈
    for (let i = levels; i > 0; i--) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (radius / levels) * i, 0, Math.PI * 2);
      ctx.strokeStyle = i === levels ? '#e2e8f0' : '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 绘制轴线和标签
    const angleStep = (Math.PI * 2) / subjects.length;
    subjects.forEach((subject, index) => {
      const angle = angleStep * index - Math.PI / 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      // 绘制轴线
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 绘制标签
      const labelX = centerX + Math.cos(angle) * (radius + 30);
      const labelY = centerY + Math.sin(angle) * (radius + 30);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(subject, labelX, labelY);
    });

    // 绘制数据区域
    ctx.beginPath();
    scores.forEach((score, index) => {
      const angle = angleStep * index - Math.PI / 2;
      const distance = (radius / 100) * score;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制数据点
    scores.forEach((score, index) => {
      const angle = angleStep * index - Math.PI / 2;
      const distance = (radius / 100) * score;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.fill();
    });
  }, [subjects, scores]);

  return (
    <div className="flex items-center justify-center">
      <canvas ref={canvasRef} className="max-w-full" />
    </div>
  );
}
