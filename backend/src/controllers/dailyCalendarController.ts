import { Request, Response, NextFunction } from 'express';
import { dailyTrainingService } from '../services/dailyTrainingService';

/** GET /student/training/daily-calendar/:taskId — 任务最近 N 天日程表（√/×） */
export const getDailyCalendar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
      return;
    }
    const taskId = String(req.params.taskId);
    const days = Math.min(31, Math.max(1, parseInt(String(req.query.days ?? '14'), 10) || 14));
    const data = await dailyTrainingService.getDailyCalendar(taskId, studentId, days);
    if (!data) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在或无权访问' } });
      return;
    }
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

export const dailyCalendarController = { getDailyCalendar };
