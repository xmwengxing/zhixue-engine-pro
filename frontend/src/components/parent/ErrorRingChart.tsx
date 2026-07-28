import { useEffect, useRef } from 'react';

interface ErrorRingChartProps {
  unmastered: number;
  mastering: number;
  mastered: number;
}

/**
 * 错题攻克环形图组件
 * 使用 Canvas 绘制环形图
 */
export default function ErrorRingChart({ unmastered, mastering, mastered }: ErrorRingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置画布尺寸
    const size = 200;
    canvas.width = size;
    canvas.height = size;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = 70;
    const lineWidth = 20;

    // 清空画布
    ctx.clearRect(0, 0, size, size);

    const total = unmastered + mastering + mastered;
    if (total === 0) {
      // 绘制空圆环
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      // 绘制中心文字
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('0', centerX, centerY - 10);
      ctx.font = '12px sans-serif';
      ctx.fillText('道错题', centerX, centerY + 10);
      return;
    }

    // 计算角度
    const unmasteredAngle = (unmastered / total) * Math.PI * 2;
    const masteringAngle = (mastering / total) * Math.PI * 2;
    const masteredAngle = (mastered / total) * Math.PI * 2;

    let startAngle = -Math.PI / 2;

    // 绘制未掌握部分（红色）
    if (unmastered > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + unmasteredAngle);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      startAngle += unmasteredAngle;
    }

    // 绘制攻克中部分（黄色）
    if (mastering > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + masteringAngle);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      startAngle += masteringAngle;
    }

    // 绘制已掌握部分（绿色）
    if (mastered > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + masteredAngle);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    // 绘制中心文字
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total.toString(), centerX, centerY - 10);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('道错题', centerX, centerY + 15);
  }, [unmastered, mastering, mastered]);

  return (
    <div className="flex flex-col items-center">
      <canvas ref={canvasRef} className="max-w-full" />
      
      {/* 图例 */}
      <div className="mt-4 flex gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span className="text-slate-600 dark:text-slate-400">
            未掌握 <span className="font-bold text-slate-900 dark:text-white">{unmastered}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <span className="text-slate-600 dark:text-slate-400">
            攻克中 <span className="font-bold text-slate-900 dark:text-white">{mastering}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-slate-600 dark:text-slate-400">
            已掌握 <span className="font-bold text-slate-900 dark:text-white">{mastered}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
