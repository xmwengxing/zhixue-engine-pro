// 学员端路由
import { Router } from 'express';
import { authenticate, requireStudent } from '../middlewares/auth';
import * as studentProfileController from '../controllers/studentProfileController';
import * as studentTrainingController from '../controllers/studentTrainingController';
import * as studentErrorController from '../controllers/studentErrorController';
import { studentPointsController } from '../controllers/studentPointsController';
import { studentWishController } from '../controllers/studentWishController';
import { reportStatusController } from '../controllers/reportStatusController';

const router = Router();

// ============ 所有学员端路由都需要认证和学员角色 ============
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
 * @desc    获取当前任务
 * @access  Private (Student)
 */
router.get('/tasks/current', studentTrainingController.getCurrentTask);

/**
 * @route   POST /api/student/training/start/:taskId
 * @desc    开始训练会话
 * @access  Private (Student)
 */
router.post('/training/start/:taskId', studentTrainingController.startTraining);

/**
 * @route   GET /api/student/training/next-question/:sessionId
 * @desc    获取下一道题目（档案提取模式）
 * @access  Private (Student)
 */
router.get('/training/next-question/:sessionId', studentTrainingController.getNextQuestion);

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
router.post('/training/submit-answer/:sessionId', studentTrainingController.submitAnswer);

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
router.post('/training/start-exam/:sessionId', studentTrainingController.startFinalExam);

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

// ============ 错题本相关路由 ============

/**
 * @route   GET /api/student/errors
 * @desc    获取错题列表（支持筛选）
 * @access  Private (Student)
 */
router.get('/errors', studentErrorController.getErrors);

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
router.post('/wishes', studentWishController.createWish.bind(studentWishController));

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
