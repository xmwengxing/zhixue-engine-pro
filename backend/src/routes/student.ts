// 学员端路由
import { Router } from 'express';
import { authenticate, requireStudent } from '../middlewares/auth';
import * as studentProfileController from '../controllers/studentProfileController';
import * as studentTrainingController from '../controllers/studentTrainingController';
import * as studentErrorController from '../controllers/studentErrorController';
import { studentPointsController } from '../controllers/studentPointsController';
import { studentWishController } from '../controllers/studentWishController';
import { reportStatusController } from '../controllers/reportStatusController';
import * as answerZoneController from '../controllers/answerZoneController';
import { recognize as visionRecognize } from '../controllers/visionRecognitionController';
import * as adminMaterialController from '../controllers/adminMaterialController';
import { parentTaskController } from '../controllers/parentTaskController';
import { wordTaskController } from '../controllers/wordTaskController';
import { dailyCalendarController } from '../controllers/dailyCalendarController';
import { specialTaskRecordController } from '../controllers/specialTaskRecordController';
import { pointsController } from '../controllers/pointsController';
import aiStreamRouter from './aiStream';
import { idempotencyMiddleware } from '../middlewares/idempotency';
import { subjectLearningStateService } from '../services/subjectLearningStateService';

const router = Router();

// ============ 所有学员端路由都需要认证和学员角色 ============
// SSE 端点单独挂载：EventSource 不支持自定义请求头，令牌经 ?token= 传递，
// 由 aiStreamController 自行校验，故置于全局 authenticate 之前。
router.use('/ai/stream', aiStreamRouter);
router.use(authenticate);
router.use(requireStudent);

// ============ 个人档案管理 ============

/**
 * @route   GET /api/student/profile
 * @desc    获取学员档案
 * @access  Private (Student)
 */
router.get('/profile', studentProfileController.getProfile);

/**
 * @route   PUT /api/student/profile
 * @desc    更新学员档案
 * @access  Private (Student)
 */
router.put('/profile', studentProfileController.updateProfile);

/**
 * @route   PUT /api/student/password
 * @desc    修改密码
 * @access  Private (Student)
 */
router.put('/password', studentProfileController.updatePassword);

/**
 * @route   POST /api/student/profile/self-assessment
 * @desc    学习基础自评
 * @access  Private (Student)
 */
router.post('/profile/self-assessment', studentProfileController.selfAssessment);

/**
 * @route   GET /api/student/profile/history
 * @desc    获取档案更新历史
 * @access  Private (Student)
 */
router.get('/profile/history', studentProfileController.getProfileHistory);

// ============ 训练舱相关路由 ============

/**
 * @route   GET /api/student/tasks/current
 * @desc    获取当前任务（仅学科总任务）
 * @access  Private (Student)
 */
router.get('/tasks/current', studentTrainingController.getCurrentTask);

// ============ P4 学科学情档案 ============

/**
 * @route   GET /api/student/learning-state?subject=
 * @desc    获取本人学科学情档案；带 subject 返回单科，否则返回全部学科数组
 * @access  Student
 */
router.get('/learning-state', async (req, res, next) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未认证' } });
      return;
    }
    const subject = req.query.subject ? String(req.query.subject) : undefined;
    if (subject) {
      const state = await subjectLearningStateService.getSubjectState(studentId, subject);
      res.json({ success: true, data: state });
      return;
    }
    const list = await subjectLearningStateService.listSubjects(studentId);
    res.json({ success: true, data: list });
    return;
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/student/tasks
 * @desc    获取任务列表（P3 双轨：category=SUBJECT_MAIN 学科总任务 / SPECIAL 专项攻克）
 * @access  Private (Student)
 * @query   category - 任务大类（可选）
 * @query   subject - 学科（可选）
 * @query   status - 状态（可选）
 */
router.get('/tasks', studentTrainingController.getTasks);

/**
 * @route   POST /api/student/tasks/special
 * @desc    学员主动创建专项攻克任务（主动学习入口，功能与家长端一致）
 * @access  Private (Student)
 * @body    subject, specialType(UNIT/KNOWLEDGE_POINT/ERROR_BOOK/PAPER),
 *          unitIds?/knowledgePoints?/errorQuestionIds?/questionCount?/title?/examConfig?
 */
router.post('/tasks/special', studentTrainingController.createSpecialTask);

/**
 * @route   GET /api/student/word-bank/stages
 * @desc    词库阶段概览（小学/初中/高中词数）
 * @access  Private (Student)
 */
router.get('/word-bank/stages', wordTaskController.getStages);

/**
 * @route   POST /api/student/word-task/start/:taskId
 * @desc    开始单词训练（听写/默写），返回首组单词与配置
 * @access  Private (Student)
 */
router.post('/word-task/start/:taskId', wordTaskController.startWord);

/**
 * @route   POST /api/student/word-task/submit-word/:sessionId
 * @desc    逐词提交（判定落库错题 + 推进进度，支持组中途退出恢复）
 * @access  Private (Student)
 */
router.post('/word-task/submit-word/:sessionId', wordTaskController.submitWord);

/**
 * @route   POST /api/student/word-task/group/:sessionId
 * @desc    进入下一组（单词判定已由逐词提交完成）；最后一组完成后自动进入 AI 短语填空
 * @access  Private (Student)
 */
router.post('/word-task/group/:sessionId', wordTaskController.nextGroup);

/**
 * @route   POST /api/student/word-task/resume/:sessionId
 * @desc    恢复进行中会话（含未完成短语填空）
 * @access  Private (Student)
 */
router.post('/word-task/resume/:sessionId', wordTaskController.resumeWord);

/**
 * @route   POST /api/student/word-task/cloze/check
 * @desc    短语填空题判定
 * @access  Private (Student)
 */
router.post('/word-task/cloze/check', wordTaskController.clozeCheck);

/**
 * @route   POST /api/student/word-task/finish/:sessionId
 * @desc    完成会话（填空完成或退出保存进度）
 * @access  Private (Student)
 */
router.post('/word-task/finish/:sessionId', wordTaskController.finishWord);

/**
 * @route   GET /api/student/word-task/mistakes?stage=
 * @desc    单词错题集（错误频率排序）
 * @access  Private (Student)
 */
router.get('/word-task/mistakes', wordTaskController.getMistakes);

/**
 * @route   POST /api/student/word-task/tts
 * @desc    edge-tts 单词发音（word → mp3）
 * @access  Private (Student)
 */
router.post('/word-task/tts', wordTaskController.tts);

/**
 * @route   GET /api/student/points/balance
 * @desc    积分余额 + 总入总出 + 扣分警告（惰性发放开户基础分）
 * @access  Private (Student)
 */
router.get('/points/balance', pointsController.getBalance);

/**
 * @route   GET /api/student/points/transactions?type=&page=
 * @desc    积分流水明细
 * @access  Private (Student)
 */
router.get('/points/transactions', pointsController.getTransactions);

/**
 * @route   GET /api/student/points/rules
 * @desc    积分规则页数据
 * @access  Private (Student)
 */
router.get('/points/rules', pointsController.getRules);

/**
 * @route   POST /api/student/points/appeal/:txId
 * @desc    扣分申诉
 * @access  Private (Student)
 */
router.post('/points/appeal/:txId', pointsController.submitAppeal);

/**
 * @route   GET /api/student/points/appeals
 * @desc    我的申诉列表
 * @access  Private (Student)
 */
router.get('/points/appeals', pointsController.listMyAppeals);

/**
 * @route   GET /api/student/question-bank/textbooks
 * @desc    教材列表（学员主动创建单元/知识点专项的数据源）
 * @access  Private (Student)
 */
router.get('/question-bank/textbooks', adminMaterialController.listTextbooks);

/**
 * @route   GET /api/student/question-bank/textbooks/:id/units
 * @desc    教材下单元列表（只读）
 * @access  Private (Student)
 */
router.get('/question-bank/textbooks/:id/units', adminMaterialController.getTextbookUnits);

/**
 * @route   GET /api/student/question-bank/papers
 * @desc    已发布试卷列表（学员主动创建题库组卷专项选卷用）
 * @access  Private (Student)
 * @query   subject - 科目（可选）；category - EXERCISE/ASSESSMENT（默认 EXERCISE）
 */
router.get('/question-bank/papers', parentTaskController.listExamPapers);

/**
 * @route   POST /api/student/training/start/:taskId
 * @desc    开始训练会话
 * @access  Private (Student)
 */
router.post('/training/start/:taskId', studentTrainingController.startTraining);

/**
 * @route   GET /api/student/training/daily-calendar/:taskId?days=14
 * @desc    学科总任务最近 N 天日程表（每日题量/时长 + 达标 √/×）
 * @access  Private (Student)
 */
router.get('/training/daily-calendar/:taskId', dailyCalendarController.getDailyCalendar);

/**
 * @route   GET /api/student/answer-zone/:taskId
 * @desc    进入组卷任务，获取题目内容（不含答案）
 * @access  Private (Student)
 */
router.get('/answer-zone/:taskId', answerZoneController.loadExamPaper);

/**
 * @route   POST /api/student/answer-zone/:sessionId/submit
 * @desc    提交并批改整卷（EXAM_PAPER 模式）
 * @access  Private (Student)
 */
router.post('/answer-zone/:sessionId/submit', answerZoneController.submitExamPaper);

/**
 * @route   POST /api/student/vision/recognize
 * @desc    上传图片 → 调用非本地视觉模型 → 返回识别文本
 * @access  Private (Student)
 */
router.post('/vision/recognize', ...visionRecognize);

/**
 * @route   GET /api/student/training/next-question/:sessionId
 * @desc    获取下一道题目（档案提取模式）
 * @access  Private (Student)
 */
router.get('/training/next-question/:sessionId', studentTrainingController.getNextQuestion);

/**
 * @route   GET /api/student/training/resume/:sessionId
 * @desc    断点续答：返回当前应答的题目（优先复用未提交的题目快照）
 * @access  Private (Student)
 */
router.get('/training/resume/:sessionId', studentTrainingController.resumeSession);

/**
 * @route   GET /api/student/training/session/:sessionId
 * @desc    获取训练会话详情
 * @access  Private (Student)
 */
router.get('/training/session/:sessionId', studentTrainingController.getSession);

/**
 * @route   POST /api/student/training/submit-answer/:sessionId
 * @desc    提交答案（支持档案提取模式）
 * @access  Private (Student)
 */
router.post(
  '/training/submit-answer/:sessionId',
  idempotencyMiddleware(),
  studentTrainingController.submitAnswer
);

/**
 * @route   POST /api/student/training/confirm-plan/:sessionId
 * @desc    确认训练计划
 * @access  Private (Student)
 */
router.post('/training/confirm-plan/:sessionId', studentTrainingController.confirmTrainingPlan);

/**
 * @route   POST /api/student/training/complete-stage/:sessionId
 * @desc    完成当前训练阶段
 * @access  Private (Student)
 */
router.post('/training/complete-stage/:sessionId', studentTrainingController.completeStage);

/**
 * @route   POST /api/student/training/start-exam/:sessionId
 * @desc    开始综合考试
 * @access  Private (Student)
 */
router.post(
  '/training/start-exam/:sessionId',
  idempotencyMiddleware(),
  studentTrainingController.startFinalExam
);

/**
 * @route   POST /api/student/training/submit-exam/:sessionId
 * @desc    提交综合考试
 * @access  Private (Student)
 */
router.post('/training/submit-exam/:sessionId', studentTrainingController.submitFinalExam);

/**
 * @route   GET /api/student/training/report/:sessionId
 * @desc    获取训练报告
 * @access  Private (Student)
 */
router.get('/training/report/:sessionId', studentTrainingController.getTrainingReport);

/**
 * @route   POST /api/student/training/chat/:sessionId
 * @desc    AI 助手对话
 * @access  Private (Student)
 */
router.post('/training/chat/:sessionId', studentTrainingController.aiChat);

// ============ 报告相关路由 ============

/**
 * @route   GET /api/student/report/status/:sessionId
 * @desc    获取报告生成状态
 * @access  Private (Student)
 */
router.get('/report/status/:sessionId', reportStatusController.getReportStatus);

// ============ AI 生成进度 SSE（流式响应，路由已在认证前挂载） ============

// ============ 错题本相关路由 ============

/**
 * @route   GET /api/student/errors
 * @desc    获取错题列表（支持筛选）
 * @access  Private (Student)
 */
router.get('/errors', studentErrorController.getErrors);

/**
 * @route   GET /api/student/errors/due
 * @desc    获取今日到期待复习错题（艾宾浩斯间隔重复）
 * @access  Private (Student)
 */
router.get('/errors/due', studentErrorController.getDueReviews);

/**
 * @route   GET /api/student/errors/:id
 * @desc    获取错题详情
 * @access  Private (Student)
 */
router.get('/errors/:id', studentErrorController.getErrorDetail);

/**
 * @route   POST /api/student/errors/:id/retry
 * @desc    开始错题重做
 * @access  Private (Student)
 */
router.post('/errors/:id/retry', studentErrorController.retryError);

/**
 * @route   PUT /api/student/errors/:id/mastery
 * @desc    更新错题掌握度
 * @access  Private (Student)
 */
router.put('/errors/:id/mastery', studentErrorController.updateMastery);

// ============ 积分与愿望相关路由 ============

/**
 * @route   GET /api/student/points
 * @desc    获取学员积分信息
 * @access  Private (Student)
 */
router.get('/points', studentPointsController.getPoints.bind(studentPointsController));

/**
 * @route   GET /api/student/wishes/stats
 * @desc    获取愿望统计信息
 * @access  Private (Student)
 */
router.get('/wishes/stats', studentWishController.getWishStats.bind(studentWishController));

/**
 * @route   GET /api/student/wishes
 * @desc    获取愿望列表（支持筛选）
 * @access  Private (Student)
 */
router.get('/wishes', studentWishController.getWishes.bind(studentWishController));

/**
 * @route   POST /api/student/wishes
 * @desc    提交愿望
 * @access  Private (Student)
 */
router.post(
  '/wishes',
  idempotencyMiddleware(),
  studentWishController.createWish.bind(studentWishController)
);

/**
 * @route   GET /api/student/wishes/:id
 * @desc    获取愿望详情
 * @access  Private (Student)
 */
router.get('/wishes/:id', studentWishController.getWish.bind(studentWishController));

/**
 * @route   POST /api/student/wishes/:id/confirm
 * @desc    确认愿望（扣除积分）
 * @access  Private (Student)
 */
router.post('/wishes/:id/confirm', studentWishController.confirmWish.bind(studentWishController));

export default router;


/**
 * @route   GET /api/student/special-records
 * @desc    专项攻克任务训练记录明细（单词每轮短语填空一条；其他专项整卷一条）
 * @access  Student
 * @query   taskId / specialType / page / limit
 */
router.get('/special-records', (req, res, next) =>
  specialTaskRecordController.studentListRecords(req, res, next)
);
