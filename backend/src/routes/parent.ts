import { Router } from 'express';
import { parentChildController } from '../controllers/parentChildController';
import { parentOverviewController } from '../controllers/parentOverviewController';
import { parentTaskController } from '../controllers/parentTaskController';
import { parentReportController } from '../controllers/parentReportController';
import { parentWishController } from '../controllers/parentWishController';
import { parentProfileController } from '../controllers/parentProfileController';
import * as adminMaterialController from '../controllers/adminMaterialController';
import { authenticate, requireParent } from '../middlewares/auth';
import {
  validateOwnership,
  taskOwnership,
  reportOwnership,
  wishOwnership,
} from '../middlewares/ownership';
import { idempotencyMiddleware } from '../middlewares/idempotency';
import { subjectLearningStateService } from '../services/subjectLearningStateService';
import { parentDashboardService } from '../services/parentDashboardService';

const router = Router();

/**
 * 家长端路由
 * 基础路径: /api/parent
 * 所有路由都需要家长权限
 */

// 应用认证和家长权限中间件
router.use(authenticate);
router.use(requireParent);

// ============ 首页统计 ============

/**
 * @route   GET /api/parent/dashboard/stats
 * @desc    家长首页统计（子女数 / 待完成任务 / 待审批愿望 / 近 7 天报告）
 * @access  Parent
 */
router.get('/dashboard/stats', async (req, res, next) => {
  try {
    const parentId = req.user?.userId;
    if (!parentId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未认证' } });
      return;
    }
    const stats = await parentDashboardService.getStats(parentId);
    res.json({ success: true, data: stats });
    return;
  } catch (error) {
    next(error);
  }
});

// ============ 个人中心路由 ============

/**
 * @route   GET /api/parent/profile
 * @desc    获取家长个人信息
 * @access  Parent
 */
router.get('/profile', (req, res, next) =>
  parentProfileController.getProfile(req, res, next)
);

/**
 * @route   PUT /api/parent/profile
 * @desc    更新家长个人信息
 * @access  Parent
 * @body    email - 邮箱（可选）
 * @body    phone - 联系方式（可选）
 * @body    realName - 姓名（可选）
 * @body    gender - 性别（可选）
 * @body    address - 家庭住址（可选）
 * @body    industry - 从事行业（可选）
 */
router.put('/profile', (req, res, next) =>
  parentProfileController.updateProfile(req, res, next)
);

/**
 * @route   PUT /api/parent/password
 * @desc    修改密码
 * @access  Parent
 * @body    oldPassword - 原密码（必填）
 * @body    newPassword - 新密码（必填）
 */
router.put('/password', (req, res, next) =>
  parentProfileController.changePassword(req, res, next)
);

// ============ 亲子关系管理路由 ============

/**
 * @route   GET /api/parent/children
 * @desc    获取家长的所有子女列表
 * @access  Parent
 */
router.get('/children', (req, res, next) =>
  parentChildController.getChildren(req, res, next)
);

/**
 * @route   POST /api/parent/children/bind
 * @desc    绑定学员
 * @access  Parent
 * @body    authCode - 授权码（可选，与 studentIdNumber 二选一）
 * @body    studentIdNumber - 学号（可选，与 authCode 二选一）
 * @body    relation - 关系类型（必填：父亲/母亲/监护人）
 */
router.post('/children/bind', (req, res, next) =>
  parentChildController.bindChild(req, res, next)
);

/**
 * @route   POST /api/parent/children/create
 * @desc    创建学员并绑定
 * @access  Parent
 * @body    authCode - 授权码（必填）
 * @body    username - 用户名（必填）
 * @body    password - 密码（必填）
 * @body    profile - 学员档案信息（必填）
 * @body    profile.name - 姓名（必填）
 * @body    profile.gender - 性别（必填）
 * @body    profile.birthDate - 出生年月（必填）
 * @body    profile.grade - 年级（必填）
 * @body    profile.school - 就读院校（可选）
 * @body    profile.learningFoundation - 学习基础（可选）
 * @body    profile.interests - 兴趣爱好（可选）
 * @body    relation - 关系类型（必填：父亲/母亲/监护人）
 */
router.post('/children/create', (req, res, next) =>
  parentChildController.createChild(req, res, next)
);

/**
 * @route   DELETE /api/parent/children/:id/unbind
 * @desc    解绑学员
 * @access  Parent
 * @param   id - 亲子关系 ID
 */
router.delete('/children/:id/unbind', (req, res, next) =>
  parentChildController.unbindChild(req, res, next)
);

// ============ 学情概览路由 ============

/**
 * @route   GET /api/parent/overview/:studentId
 * @desc    获取学员的学情概览数据
 * @access  Parent
 * @param   studentId - 学员 ID
 */
router.get(
  '/overview/:studentId',
  validateOwnership({ source: 'param', key: 'studentId' }),
  (req, res, next) => parentOverviewController.getStudentOverview(req, res, next)
);

// ============ P4 学科学情档案 ============

/**
 * @route   GET /api/parent/children/:studentId/learning-state?subject=
 * @desc    获取指定学员的学科学情档案；带 subject 返回单科，否则返回全部学科数组
 * @access  Parent（须为亲子关系）
 */
router.get(
  '/children/:studentId/learning-state',
  validateOwnership({ source: 'param', key: 'studentId' }),
  async (req, res, next) => {
    try {
      const studentId = String(req.params.studentId);
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
  }
);

/**
 * @route   GET /api/parent/children/:studentId/memories
 * @desc    查看学员 AI 长期记忆（只读；Q4：家长可见，学员端不提供该接口）
 * @access  Parent（须为亲子关系）
 */
router.get(
  '/children/:studentId/memories',
  validateOwnership({ source: 'param', key: 'studentId' }),
  async (req, res, next) => {
    try {
      const studentId = String(req.params.studentId);
      const { studentMemoryService } = await import('../services/studentMemoryService');
      const memories = await studentMemoryService.getMemories(studentId);
      res.json({ success: true, data: memories });
      return;
    } catch (error) {
      next(error);
    }
  }
);

// ============ 题库（组卷模式支撑） ============

/**
 * @route   GET /api/parent/question-bank/papers
 * @desc    获取已发布试卷列表（组卷模式选卷用）
 * @access  Parent
 * @query   subject - 科目（可选）
 */
router.get('/question-bank/papers', (req, res, next) =>
  parentTaskController.listExamPapers(req, res, next)
);

/**
 * @route   GET /api/parent/question-bank/summary
 * @desc    获取题库概况（各题型可用题目数，随机组卷配置用）
 * @access  Parent
 * @query   subject - 科目（必填）
 */
router.get('/question-bank/summary', (req, res, next) =>
  parentTaskController.getBankSummary(req, res, next)
);

/**
 * @route   GET /api/parent/question-bank/textbooks
 * @desc    教材列表（随机组卷按教材/单元筛选用）
 * @access  Parent
 */
router.get('/question-bank/textbooks', (req, res) =>
  adminMaterialController.listTextbooks(req, res)
);

/**
 * @route   GET /api/parent/question-bank/textbooks/:id/units
 * @desc    教材下单元列表（P3 单元专项目标选择用，只读）
 * @access  Parent
 */
router.get('/question-bank/textbooks/:id/units', (req, res) =>
  adminMaterialController.getTextbookUnits(req, res)
);

// ============ 任务管理路由 ============

/**
 * @route   GET /api/parent/tasks/ai-teachers
 * @desc    获取可用的 AI 科目老师列表
 * @access  Parent
 */
router.get('/tasks/ai-teachers', (req, res, next) =>
  parentTaskController.getAITeachers(req, res, next)
);

/**
 * @route   GET /api/parent/tasks
 * @desc    获取任务列表
 * @access  Parent
 * @query   studentId - 学员 ID（可选）
 * @query   status - 任务状态（可选：PENDING/IN_PROGRESS/COMPLETED）
 * @query   page - 页码（可选，默认 1）
 * @query   limit - 每页数量（可选，默认 10）
 */
router.get(
  '/tasks',
  validateOwnership({ source: 'query', key: 'studentId' }),
  (req, res, next) => parentTaskController.getTasks(req, res, next)
);

/**
 * @route   GET /api/parent/tasks/:id
 * @desc    获取单个任务详情
 * @access  Parent
 * @param   id - 任务 ID
 */
router.get('/tasks/:id', taskOwnership, (req, res, next) =>
  parentTaskController.getTaskById(req, res, next)
);

/**
 * @route   POST /api/parent/tasks
 * @desc    创建任务
 * @access  Parent
 * @body    studentId - 学员 ID（必填）
 * @body    mode - 任务模式（必填：profile/custom）
 * @body    title - 任务标题（档案模式可选，自定义模式必填）
 * @body    config - 任务配置（自定义模式必填）
 * @body    config.materialNodeIds - 教材节点 ID 列表
 * @body    config.questionCount - 题目数量
 * @body    config.difficulty - 难度（1-5）
 */
router.post(
  '/tasks',
  idempotencyMiddleware(),
  validateOwnership({ source: 'body', key: 'studentId' }),
  (req, res, next) => parentTaskController.createTask(req, res, next)
);

/**
 * @route   POST /api/parent/tasks/initial-test/preview
 * @desc    初测预览（P2 题库化初测）：发布任务前预览将抽到的题目（不入库、不补题）
 * @access  Parent
 * @body    source - PAPER（选卷）/ CRITERIA（手动条件）/ AI（自动筛题）
 * @body    paperId - source=PAPER 必填
 * @body    subject - source=CRITERIA/AI 必填
 * @body    studentId - source=AI 必填（AI 读取学员学情产出条件）
 * @body    count - 题量（默认 10）
 * @body    criteria - source=CRITERIA 的筛题条件（unitIds/difficultyDist 等）
 */
router.post(
  '/tasks/initial-test/preview',
  validateOwnership({ source: 'body', key: 'studentId' }),
  (req, res, next) => parentTaskController.previewInitialTest(req, res, next)
);

/**
 * @route   POST /api/parent/tasks/special
 * @desc    创建专项攻克任务（P3 双轨：单元/知识点/错题集专项）
 * @access  Parent
 * @body    studentId - 学员 ID（必填）
 * @body    subject - 学科（必填）
 * @body    specialType - UNIT / KNOWLEDGE_POINT / ERROR_BOOK（必填）
 * @body    unitIds - 单元节点 id 列表（UNIT 必填）
 * @body    knowledgePoints - 知识点列表（KNOWLEDGE_POINT 必填）
 * @body    errorQuestionIds - 错题 id 列表（ERROR_BOOK 可选，不传自动取未掌握错题）
 * @body    questionCount - 抽题数量（可选，默认 10）
 */
router.post(
  '/tasks/special',
  idempotencyMiddleware(),
  validateOwnership({ source: 'body', key: 'studentId' }),
  (req, res, next) => parentTaskController.createSpecialTask(req, res, next)
);

/**
 * @route   GET /api/parent/children/:studentId/errors
 * @desc    获取子女错题列表（错题集专项多选来源）
 * @access  Parent
 * @query   subject - 学科（可选）
 */
router.get(
  '/children/:studentId/errors',
  validateOwnership({ source: 'param', key: 'studentId' }),
  (req, res, next) => parentTaskController.listChildErrors(req, res, next)
);

/**
 * @route   GET /api/parent/children/:studentId/weak-points
 * @desc    获取子女薄弱知识点候选（知识点专项带出来源）
 * @access  Parent
 * @query   subject - 学科（可选）
 */
router.get(
  '/children/:studentId/weak-points',
  validateOwnership({ source: 'param', key: 'studentId' }),
  (req, res, next) => parentTaskController.listChildWeakPoints(req, res, next)
);

/**
 * @route   POST /api/parent/tasks/smart-assign
 * @desc    AI 智能一键派单：根据近 3 天错题分布 + IRT 薄弱维度自动生成今日巩固小练
 * @access  Parent
 * @body    studentId - 学员 ID（必填）
 */
router.post(
  '/tasks/smart-assign',
  idempotencyMiddleware(),
  validateOwnership({ source: 'body', key: 'studentId' }),
  (req, res, next) => parentTaskController.smartAssign(req, res, next)
);

/**
 * @route   DELETE /api/parent/tasks/:id
 * @desc    删除任务
 * @access  Parent
 * @param   id - 任务 ID
 */
router.delete('/tasks/:id', taskOwnership, (req, res, next) =>
  parentTaskController.deleteTask(req, res, next)
);

/**
 * @route   PUT /api/parent/tasks/:id/encouragement
 * @desc    设置家长激励寄语
 * @access  Parent
 * @param   id - 任务 ID
 * @body    message - 激励寄语内容（<=200 字，空字符串表示清除）
 */
router.put('/tasks/:id/encouragement', taskOwnership, (req, res, next) =>
  parentTaskController.setEncouragement(req, res, next)
);

/**
 * @route   POST /api/parent/tasks/:id/encouragement/ai
 * @desc    AI 生成定制激励批语（返回建议文本，家长可编辑后保存）
 * @access  Parent
 * @param   id - 任务 ID
 */
router.post('/tasks/:id/encouragement/ai', taskOwnership, (req, res, next) =>
  parentTaskController.generateEncouragement(req, res, next)
);

/**
 * @route   POST /api/parent/encouragement/ai
 * @desc    AI 生成激励批语草稿（创建任务前使用，无需已有任务）
 * @access  Parent
 * @body    studentId - 学员 ID（必填）
 * @body    goal - 学习目标（可选）
 */
router.post(
  '/encouragement/ai',
  validateOwnership({ source: 'body', key: 'studentId' }),
  (req, res, next) => parentTaskController.generateEncouragementDraft(req, res, next)
);

// ============ 报告管理路由 ============

/**
 * @route   GET /api/parent/reports
 * @desc    获取报告列表
 * @access  Parent
 * @query   studentId - 学员 ID（可选）
 * @query   page - 页码（可选，默认 1）
 * @query   limit - 每页数量（可选，默认 10）
 */
router.get(
  '/reports',
  validateOwnership({ source: 'query', key: 'studentId' }),
  (req, res, next) => parentReportController.getReports(req, res, next)
);

/**
 * @route   GET /api/parent/reports/:id
 * @desc    获取单个报告详情
 * @access  Parent
 * @param   id - 报告 ID
 */
router.get('/reports/:id', reportOwnership, (req, res, next) =>
  parentReportController.getReportById(req, res, next)
);

/**
 * @route   GET /api/parent/reports/:id/export
 * @desc    导出报告为 PDF
 * @access  Parent
 * @param   id - 报告 ID
 */
router.get('/reports/:id/export', reportOwnership, (req, res, next) =>
  parentReportController.exportReport(req, res, next)
);

// ============ 愿望审批路由 ============

/**
 * @route   GET /api/parent/wishes
 * @desc    获取愿望列表
 * @access  Parent
 * @query   studentId - 学员 ID（可选）
 * @query   status - 愿望状态（可选：PENDING/APPROVED/REJECTED/FULFILLED）
 * @query   page - 页码（可选，默认 1）
 * @query   limit - 每页数量（可选，默认 10）
 */
router.get(
  '/wishes',
  validateOwnership({ source: 'query', key: 'studentId' }),
  (req, res, next) => parentWishController.getWishes(req, res, next)
);

/**
 * @route   GET /api/parent/wishes/:id
 * @desc    获取单个愿望详情
 * @access  Parent
 * @param   id - 愿望 ID
 */
router.get('/wishes/:id', wishOwnership, (req, res, next) =>
  parentWishController.getWishById(req, res, next)
);

/**
 * @route   PUT /api/parent/wishes/:id/approve
 * @desc    审批愿望
 * @access  Parent
 * @param   id - 愿望 ID
 * @body    approved - 是否同意（必填：true/false）
 * @body    reason - 审批理由（可选）
 */
router.put('/wishes/:id/approve', wishOwnership, (req, res, next) =>
  parentWishController.approveWish(req, res, next)
);

export default router;
