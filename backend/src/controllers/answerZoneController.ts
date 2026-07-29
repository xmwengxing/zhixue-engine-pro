import { Request, Response, NextFunction } from 'express';
import {
  loadExamPaper as loadExamPaperService,
  gradeExamPaper as gradeExamPaperService,
} from '../services/answerZoneService';
import { logger } from '../middlewares/logger';

/**
 * 电子答题专区控制器（EXAM_PAPER 模式）
 */

/**
 * 进入组卷任务，获取题目内容（不含答案）
 * GET /api/student/answer-zone/:taskId
 */
export const loadExamPaper = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const { taskId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
    }
    if (!taskId || Array.isArray(taskId)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: '任务 ID 为必填项' } });
    }

    const data = await loadExamPaperService(taskId, userId);
    return res.json({ success: true, data });
  } catch (err: any) {
    logger.error('加载组卷题目失败:', err);
    if (err.message === '任务不存在') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } });
    }
    if (err.message === '无权访问此任务') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: err.message } });
    }
    if (err.message === '该任务不是题库组卷任务') {
      return res.status(400).json({ error: { code: 'INVALID_MODE', message: err.message } });
    }
    if (err.message === '组卷任务没有题目') {
      return res.status(422).json({ error: { code: 'NO_QUESTIONS', message: err.message } });
    }
    return next(err);
  }
};

/**
 * 提交并批改整卷
 * POST /api/student/answer-zone/:sessionId/submit
 */
export const submitExamPaper = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;
    const { answers } = req.body;

    if (!userId) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
    }
    if (!sessionId || Array.isArray(sessionId)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: '会话 ID 为必填项' } });
    }
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'answers 为必填数组' } });
    }

    const result = await gradeExamPaperService(sessionId, userId, answers);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    logger.error('提交组卷答案失败:', err);
    if (err.message === '训练会话不存在' || err.message === '无权访问此会话') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } });
    }
    if (err.message === '会话未激活') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: err.message } });
    }
    if (err.message === '该会话不是题库组卷任务') {
      return res.status(400).json({ error: { code: 'INVALID_MODE', message: err.message } });
    }
    return next(err);
  }
};
