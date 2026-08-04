import { useState, useEffect } from 'react';
import request from '../../utils/request';

/**
 * 学科总任务每日训练日程表（√ 达标 / × 未达标）
 * 展示最近 N 天每日题量/时长与目标，直观显示训练参与状态。
 */
interface CalendarDay {
  date: string;
  weekday: string;
  questions: number;
  minutes: number;
  questionsGoal: number | null;
  minutesGoal: number | null;
  met: boolean;
}

export const DailyCalendarBar = ({ taskId }: { taskId: string }) => {
  const [data, setData] = useState<{ dailyGoal: { questions: number | null; minutes: number | null }; days: CalendarDay[]; todayMet: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await request.get<{ success: boolean; data: any }>(
          `/student/training/daily-calendar/${taskId}?days=14`
        );
        if (!cancelled) setData(res.data);
      } catch {
        /* 不阻塞训练舱 */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  if (loading) return null;
  if (!data) return null;
  // 未配置每日约束时不展示（避免干扰）
  if (!data.dailyGoal.questions && !data.dailyGoal.minutes) return null;

  const goalText = [
    data.dailyGoal.questions ? `每日 ${data.dailyGoal.questions} 题` : '',
    data.dailyGoal.minutes ? `或 ${data.dailyGoal.minutes} 分钟` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="bg-[#1a2332] border-b border-[#324467] px-4 lg:px-6 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-white">📅 训练日程</div>
        <div className="text-xs text-[#92a4c9]">
          目标：{goalText || '—'}
          {data.todayMet ? (
            <span className="ml-2 text-green-400">今日已达标 ✓</span>
          ) : (
            <span className="ml-2 text-amber-300">今日未达标（达标后才能参加期末测试）</span>
          )}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {data.days.map((d) => {
          const qText = d.questionsGoal ? `${d.questions}/${d.questionsGoal}题` : `${d.questions}题`;
          const mText = d.minutesGoal ? `${d.minutes}/${d.minutesGoal}分` : `${d.minutes}分`;
          return (
            <div
              key={d.date}
              className={`flex-shrink-0 w-[76px] rounded-lg border px-2 py-1.5 text-center ${
                d.met
                  ? 'border-green-500/50 bg-green-500/10'
                  : 'border-[#324467] bg-[#111722]'
              }`}
            >
              <div className="text-xs text-[#92a4c9]">
                {d.date.slice(5)} {d.weekday}
              </div>
              <div className="text-[11px] text-[#5b6b8c] mt-0.5">{qText}</div>
              <div className="text-[11px] text-[#5b6b8c]">{mText}</div>
              <div className={`text-sm mt-0.5 font-bold ${d.met ? 'text-green-400' : 'text-red-400'}`}>
                {d.met ? '✓' : '×'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DailyCalendarBar;
