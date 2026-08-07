// 学员训练控制器
import { Request, Response, NextFunction } from 'express';
import { studentTrainingService } from '../services/studentTrainingService';
import { enqueueAIJob } from '../queue/aiQueue';
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
 * P3 双轨：获取学员任务列表（学科总任务 / 专项攻克双区）
 * GET /api/student/tasks?category=SUBJECT_MAIN|SPECIAL&subject=&status=&page=&limit=
 */
export const getTasks = async (
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

    const { category, subject, status, page, limit } = req.query;

    if (category && !['SUBJECT_MAIN', 'SPECIAL'].includes(String(category))) {
      res.status(400).json({
        error: {
          code: 'INVALID_PARAMETER',
          message: '无效的任务大类',
        },
      });
      return;
    }

    const result = await studentTrainingService.getTasks(userId, {
      category: category as 'SUBJECT_MAIN' | 'SPECIAL' | undefined,
      subject: subject ? String(subject) : undefined,
      status: status ? String(status) : undefined,
      page: page ? parseInt(String(page)) : undefined,
      limit: limit ? parseInt(String(limit)) : undefined,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('获取学员任务列表失败:', error);
    next(error);
  }
};

/**
 * 学员主动创建专项攻克任务（主动学习入口，功能与家长端一致）
 * POST /api/student/tasks/special
 * body: { subject, specialType, unitIds?, knowledgePoints?, errorQuestionIds?, questionCount?, title?, examConfig? }
 */
export const createSpecialTask = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
      return;
    }
    const {
      subject,
      specialType,
      unitIds,
      knowledgePoints,
      errorQuestionIds,
      questionCount,
      title,
      examConfig,
      wordConfig,
    } = req.body ?? {};
    if (!subject || !specialType) {
      res.status(400).json({ error: { code: 'INVALID_PARAMETER', message: '专项任务必须指定学科与类型' } });
      return;
    }
    const { parentTaskService } = await import('../services/parentTaskService');
    const task = await parentTaskService.createSpecialTask(
      studentId,
      {
        studentId,
        subject: String(subject),
        specialType,
        unitIds,
        knowledgePoints,
        errorQuestionIds,
        questionCount,
        title,
        examConfig,
        wordConfig,
      },
      { asStudent: true }
    );
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    logger.error('学员创建专项任务失败:', error);
    next(error);
  }
};

/** 删除专项任务（仅本人创建；进行中会话拦截；积分流水保留）DELETE /api/student/special-tasks/:id */
export const deleteSpecialTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
      return;
    }
    const taskId = String(req.params.id);
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, createdBy: true, category: true } });
    await prisma.$disconnect();
    if (!task) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
      return;
    }
    if (task.createdBy !== studentId || task.category !== 'SPECIAL') {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: '只能删除自己创建的专项任务' } });
      return;
    }
    const { deleteTaskWithDeps } = await import('../services/taskDeletionService');
    const result = await deleteTaskWithDeps(taskId, { checkActive: true });
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
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
 * ① 断点续答：获取「当前应该答的那道题」
 * GET /api/student/training/resume/:sessionId
 *
 * 与 next-question 的区别：优先返回已下发但未提交的题目快照，
 * 保证刷新页面 / 换设备继续时看到同一道题，且不会重复触发 AI 出题。
 */
export const resumeSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;

    if (!userId) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: '未授权访问' },
      });
      return;
    }

    if (!sessionId || Array.isArray(sessionId)) {
      res.status(400).json({
        error: { code: 'INVALID_INPUT', message: '会话 ID 为必填项' },
      });
      return;
    }

    const data = await studentTrainingService.resumeSession(sessionId, userId);

    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('断点续答失败:', error);

    if (error.message === '训练会话不存在') {
      res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: error.message } });
      return;
    }
    if (error.message === '无权访问此会话') {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: error.message } });
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

    // 入队异步生成综合考试题目；队列不可用时降级为同步执行
    const jobId = await enqueueAIJob({ kind: 'exam', sessionId, studentId: userId });
    if (jobId) {
      res.status(202).json({
        success: true,
        status: 'generating',
        jobId,
        message: '综合考试题目生成中',
      });
      return;
    }

    // 降级：队列不可用，同步生成（保持原有行为）
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

    // 非阻塞获取报告：已生成直接返回，否则触发异步生成并返回 generating 状态
    const report = await studentTrainingService.requestTrainingReport(sessionId, userId);

    if (report.status === 'completed') {
      res.json({
        success: true,
        content: report.content,
        status: 'completed',
      });
      return;
    }

    res.status(202).json({
      success: true,
      status: 'generating',
      message: '报告生成中',
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

    // 考试模式：综合考试进行中 AI 助教暂时收起，交卷后（phase → COMPLETED）自动解锁逐题精讲
    const session = await studentTrainingService.getSession(sessionId, userId);

    if (session.phase === 'FINAL_EXAM') {
      res.status(403).json({
        error: {
          code: 'AI_EXAM_MODE',
          message: '考试模式进行中，交卷后我会立刻解锁为你逐题精讲',
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

