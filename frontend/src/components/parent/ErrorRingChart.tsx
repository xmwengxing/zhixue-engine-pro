import { useEffect, useRef } from 'react';

interface ErrorRingChartProps {
  unmastered: number;
  mastering: number;
  mastered: number;
}

/**
 * 错题攻克环形图组件（暗色主题）
 */
export default function ErrorRingChart({ unmastered, mastering, mastered }: ErrorRingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const total = unmastered + mastering + mastered;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 200;
    canvas.width = size;
    canvas.height = size;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = 70;
    const lineWidth = 20;

    ctx.clearRect(0, 0, size, size);

    if (total === 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#2b3a58';
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      ctx.fillStyle = '#5b6b8c';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('0', centerX, centerY - 10);
      ctx.font = '12px sans-serif';
      ctx.fillText('道错题', centerX, centerY + 12);
      return;
    }

    // 底环
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#1a2332';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    const unmasteredAngle = (unmastered / total) * Math.PI * 2;
    const masteringAngle = (mastering / total) * Math.PI * 2;
    const masteredAngle = (mastered / total) * Math.PI * 2;

    let startAngle = -Math.PI / 2;

    if (unmastered > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + unmasteredAngle);
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      startAngle += unmasteredAngle;
    }

    if (mastering > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + masteringAngle);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      startAngle += masteringAngle;
    }

    if (mastered > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + masteredAngle);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total.toString(), centerX, centerY - 10);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#92a4c9';
    ctx.fillText('道错题', centerX, centerY + 15);
  }, [unmastered, mastering, mastered, total]);

  const rate = total > 0 ? Math.round((mastered / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center">
      <canvas ref={canvasRef} className="max-w-full" />

      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <span className="text-[#92a4c9]">
            未掌握 <span className="font-bold text-white">{unmastered}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="text-[#92a4c9]">
            攻克中 <span className="font-bold text-white">{mastering}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-emerald-400" />
          <span className="text-[#92a4c9]">
            已掌握 <span className="font-bold text-white">{mastered}</span>
          </span>
        </div>
      </div>

      {total > 0 && (
        <p className="mt-3 text-xs text-[#5b6b8c]">
          攻克率 <span className="font-bold text-emerald-300">{rate}%</span>
        </p>
      )}
    </div>
  );
}
