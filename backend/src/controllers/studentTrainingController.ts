// 学员训练控制器
import { Request, Response, NextFunction } from 'express';
import { studentTrainingService } from '../services/studentTrainingService';
import { logger } from '../middlewares/logger';

/**
 * 获取当前任务
 * GET /api/student/tasks/current
 */
export const getCurrentTask = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    const task = await studentTrainingService.getCurrentTask(userId);

    res.json({
      success: true,
      task,
    });
  } catch (error) {
    logger.error('获取当前任务失败:', error);
    next(error);
  }
};

/**
 * 开始训练
 * POST /api/student/training/start/:taskId
 */
export const startTraining = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const { taskId } = req.params;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    if (!taskId || Array.isArray(taskId)) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '任务 ID 为必填项',
        },
      });
      return;
    }

    const session = await studentTrainingService.startTraining(taskId, userId);

    res.status(200).json({
      success: true,
      message: '训练会话已创建',
      session,
    });
  } catch (error: any) {
    logger.error('开始训练失败:', error);

    if (error.message === '任务不存在') {
      res.status(404).json({
        error: {
          code: 'TASK_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '无权访问此任务' || error.message === '任务已完成') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '没有找到符合条件的题目') {
      res.status(422).json({
        error: {
          code: 'NO_QUESTIONS',
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
};

/**
 * 获取下一道题目（档案提取模式）
 * GET /api/student/training/next-question/:sessionId
 */
export const getNextQuestion = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    if (!sessionId || Array.isArray(sessionId)) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '会话 ID 为必填项',
        },
      });
      return;
    }

    const question = await studentTrainingService.getNextQuestion(sessionId, userId);

    res.json({
      success: true,
      data: question,
    });
  } catch (error: any) {
    logger.error('获取下一道题目失败:', error);

    if (error.message === '训练会话不存在') {
      res.status(404).json({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '无权访问此会话') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '此方法仅适用于档案提取模式') {
      res.status(400).json({
        error: {
          code: 'INVALID_MODE',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '已完成所有题目') {
      res.status(400).json({
        error: {
          code: 'ALL_QUESTIONS_COMPLETED',
          message: error.message,
        },
      });
      return;
    }

    if (error.message && error.message.includes('AI 生成题目失败')) {
      res.status(500).json({
        error: {
          code: 'AI_GENERATION_FAILED',
          message: 'AI 生成题目失败，请稍后重试',
        },
      });
      return;
    }

    next(error);
  }
};

/**
 * 获取训练会话详情
 * GET /api/student/training/session/:sessionId
 */
export const getSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    if (!sessionId || Array.isArray(sessionId)) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '会话 ID 为必填项',
        },
      });
      return;
    }

    const session = await studentTrainingService.getSession(sessionId, userId);

    res.json({
      success: true,
      session,
    });
  } catch (error: any) {
    logger.error('获取训练会话失败:', error);

    if (error.message === '训练会话不存在') {
      res.status(404).json({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '无权访问此会话') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
};

/**
 * 提交答案（支持档案提取模式）
 * POST /api/student/training/submit-answer/:sessionId
 */
export const submitAnswer = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;
    const { questionData, answer, timeSpent } = req.body;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    if (!sessionId || Array.isArray(sessionId)) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '会话 ID 为必填项',
        },
      });
      return;
    }

    // 验证必填字段
    if (!questionData || answer === undefined) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '题目数据和答案为必填项',
        },
      });
      return;
    }

    // 验证用时
    const validTimeSpent = typeof timeSpent === 'number' && timeSpent >= 0 ? timeSpent : 0;

    const result = await studentTrainingService.submitAnswer(
      sessionId,
      userId,
      questionData,
      answer,
      validTimeSpent
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    logger.error('提交答案失败:', error);

    if (error.message === '训练会话不存在' || error.message === '题目不存在') {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '无权访问此会话' || error.message === '会话未激活') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
      return;
    }

    if (error.message && error.message.includes('AI')) {
      res.status(500).json({
        error: {
          code: 'AI_SERVICE_ERROR',
          message: 'AI 服务暂时不可用，请稍后重试',
        },
      });
      return;
    }

    next(error);
  }
};

/**
 * 完成训练
 * POST /api/student/training/complete/:sessionId
 */
export const completeTraining = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    if (!sessionId || Array.isArray(sessionId)) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '会话 ID 为必填项',
        },
      });
      return;
    }

    const result = await studentTrainingService.completeSession(sessionId, userId);

    res.json({
      message: '训练完成，恭喜你！',
      ...result,
    });
  } catch (error: any) {
    logger.error('完成训练失败:', error);

    if (error.message === '训练会话不存在') {
      res.status(404).json({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '无权访问此会话' || error.message === '会话已完成') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
};

/**
 * 确认训练计划
 * POST /api/student/training/confirm-plan/:sessionId
 */
export const confirmTrainingPlan = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    if (!sessionId || Array.isArray(sessionId)) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '会话 ID 为必填项',
        },
      });
      return;
    }

    const result = await studentTrainingService.confirmTrainingPlan(sessionId, userId);

    res.json({
      message: '训练计划已确认，开始训练',
      ...result,
    });
  } catch (error: any) {
    logger.error('确认训练计划失败:', error);

    if (error.message === '训练会话不存在') {
      res.status(404).json({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '无权访问此会话') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '当前阶段不是规划阶段' || error.message === '训练计划未生成') {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
};

/**
 * 完成当前训练阶段
 * POST /api/student/training/complete-stage/:sessionId
 */
export const completeStage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    if (!sessionId || Array.isArray(sessionId)) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '会话 ID 为必填项',
        },
      });
      return;
    }

    const result = await studentTrainingService.completeStage(sessionId, userId);

    res.json({
      message: '阶段完成',
      ...result,
    });
  } catch (error: any) {
    logger.error('完成训练阶段失败:', error);

    if (error.message === '训练会话不存在') {
      res.status(404).json({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '无权访问此会话') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
      return;
    }

    if (error.message.includes('还有') || error.message.includes('不是引导式训练阶段')) {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
};

/**
 * 开始综合考试
 * POST /api/student/training/start-exam/:sessionId
 */
export const startFinalExam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    if (!sessionId || Array.isArray(sessionId)) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '会话 ID 为必填项',
        },
      });
      return;
    }

    const result = await studentTrainingService.startFinalExam(sessionId, userId);

    res.json({
      message: '综合考试已开始',
      ...result,
    });
  } catch (error: any) {
    logger.error('开始综合考试失败:', error);

    if (error.message === '训练会话不存在') {
      res.status(404).json({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '无权访问此会话') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
      return;
    }

    if (error.message.includes('必须完成') || error.message.includes('训练进度数据不存在')) {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: error.message,
        },
      });
      return;
    }

    if (error.message && error.message.includes('AI')) {
      res.status(500).json({
        error: {
          code: 'AI_SERVICE_ERROR',
          message: 'AI 生成考试题目失败，请稍后重试',
        },
      });
      return;
    }

    next(error);
  }
};

/**
 * 提交综合考试
 * POST /api/student/training/submit-exam/:sessionId
 */
export const submitFinalExam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;
    const { answers } = req.body;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    if (!sessionId || Array.isArray(sessionId)) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '会话 ID 为必填项',
        },
      });
      return;
    }

    if (!answers || typeof answers !== 'object') {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '答案数据为必填项',
        },
      });
      return;
    }

    const result = await studentTrainingService.submitFinalExam(
      sessionId,
      userId,
      answers
    );

    res.json({
      message: '综合考试已提交',
      ...result,
    });
  } catch (error: any) {
    logger.error('提交综合考试失败:', error);

    if (error.message === '训练会话不存在') {
      res.status(404).json({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '无权访问此会话') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
      return;
    }

    if (error.message.includes('不是综合考试阶段') || error.message.includes('综合考试数据不存在')) {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: error.message,
        },
      });
      return;
    }

    if (error.message && error.message.includes('AI')) {
      res.status(500).json({
        error: {
          code: 'AI_SERVICE_ERROR',
          message: 'AI 评估答案失败，请稍后重试',
        },
      });
      return;
    }

    next(error);
  }
};

/**
 * 获取训练报告
 * GET /api/student/training/report/:sessionId
 */
export const getTrainingReport = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    if (!sessionId || Array.isArray(sessionId)) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '会话 ID 为必填项',
        },
      });
      return;
    }

    const report = await studentTrainingService.getTrainingReport(sessionId, userId);

    res.json({
      success: true,
      ...report,
    });
  } catch (error: any) {
    logger.error('获取训练报告失败:', error);

    if (error.message === '训练会话不存在') {
      res.status(404).json({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '无权访问此会话') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '训练尚未完成') {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE',
          message: error.message,
        },
      });
      return;
    }

    if (error.message && error.message.includes('AI')) {
      res.status(500).json({
        error: {
          code: 'AI_SERVICE_ERROR',
          message: 'AI 生成报告失败，请稍后重试',
        },
      });
      return;
    }

    next(error);
  }
};

/**
 * AI 对话
 * POST /api/student/training/chat/:sessionId
 */
export const aiChat = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;
    const { message, context } = req.body;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权访问',
        },
      });
      return;
    }

    if (!sessionId || Array.isArray(sessionId)) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '会话 ID 为必填项',
        },
      });
      return;
    }

    // 验证必填字段
    if (!message) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '消息内容为必填项',
        },
      });
      return;
    }

    // 检查会话状态，考试期间禁用 AI 助手
    const session = await studentTrainingService.getSession(sessionId, userId);
    
    if (session.phase === 'FINAL_EXAM') {
      res.status(403).json({
        error: {
          code: 'AI_DISABLED',
          message: '综合考试期间 AI 助手不可用',
        },
      });
      return;
    }

    const reply = await studentTrainingService.handleAIChat(
      sessionId,
      userId,
      message,
      context
    );

    res.json({
      success: true,
      reply,
    });
  } catch (error: any) {
    logger.error('AI 对话失败:', error);

    if (error.message === '训练会话不存在') {
      res.status(404).json({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    if (error.message === '无权访问此会话') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
      return;
    }

    if (error.message.includes('AI 服务')) {
      res.status(502).json({
        error: {
          code: 'AI_SERVICE_ERROR',
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
};

