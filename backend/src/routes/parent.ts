import { Router } from 'express';
import { parentChildController } from '../controllers/parentChildController';
import { parentOverviewController } from '../controllers/parentOverviewController';
import { parentTaskController } from '../controllers/parentTaskController';
import { parentReportController } from '../controllers/parentReportController';
import { parentWishController } from '../controllers/parentWishController';
import { parentProfileController } from '../controllers/parentProfileController';
import { authenticate, requireParent } from '../middlewares/auth';

const router = Router();

/**
 * 家长端路由
 * 基础路径: /api/parent
 * 所有路由都需要家长权限
 */

// 应用认证和家长权限中间件
router.use(authenticate);
router.use(requireParent);

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
router.get('/overview/:studentId', (req, res, next) =>
  parentOverviewController.getStudentOverview(req, res, next)
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
router.get('/tasks', (req, res, next) =>
  parentTaskController.getTasks(req, res, next)
);

/**
 * @route   GET /api/parent/tasks/:id
 * @desc    获取单个任务详情
 * @access  Parent
 * @param   id - 任务 ID
 */
router.get('/tasks/:id', (req, res, next) =>
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
router.post('/tasks', (req, res, next) =>
  parentTaskController.createTask(req, res, next)
);

/**
 * @route   DELETE /api/parent/tasks/:id
 * @desc    删除任务
 * @access  Parent
 * @param   id - 任务 ID
 */
router.delete('/tasks/:id', (req, res, next) =>
  parentTaskController.deleteTask(req, res, next)
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
router.get('/reports', (req, res, next) =>
  parentReportController.getReports(req, res, next)
);

/**
 * @route   GET /api/parent/reports/:id
 * @desc    获取单个报告详情
 * @access  Parent
 * @param   id - 报告 ID
 */
router.get('/reports/:id', (req, res, next) =>
  parentReportController.getReportById(req, res, next)
);

/**
 * @route   GET /api/parent/reports/:id/export
 * @desc    导出报告为 PDF
 * @access  Parent
 * @param   id - 报告 ID
 */
router.get('/reports/:id/export', (req, res, next) =>
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
router.get('/wishes', (req, res, next) =>
  parentWishController.getWishes(req, res, next)
);

/**
 * @route   GET /api/parent/wishes/:id
 * @desc    获取单个愿望详情
 * @access  Parent
 * @param   id - 愿望 ID
 */
router.get('/wishes/:id', (req, res, next) =>
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
router.put('/wishes/:id/approve', (req, res, next) =>
  parentWishController.approveWish(req, res, next)
);

export default router;
