import { Router } from 'express';
import { adminUserController } from '../controllers/adminUserController';
import { adminStudentIdController } from '../controllers/adminStudentIdController';
import { adminAuthCodeController } from '../controllers/adminAuthCodeController';
import { adminRelationController } from '../controllers/adminRelationController';
import * as adminMaterialController from '../controllers/adminMaterialController';
import * as adminAIController from '../controllers/adminAIController';
import * as adminOcrController from '../controllers/adminOcrController';
import { authenticate, requireAdmin } from '../middlewares/auth';
import * as questionBankController from '../controllers/questionBankController';
import * as adminAgentController from '../controllers/adminAgentController';

const router = Router();

/**
 * 管理员路由
 * 基础路径: /api/admin
 * 所有路由都需要管理员权限
 */

// 应用认证和管理员权限中间件
router.use(authenticate);
router.use(requireAdmin);

// ============ 用户管理路由 ============

/**
 * @route   GET /api/admin/users/stats
 * @desc    获取用户统计信息
 * @access  Admin
 */
router.get('/users/stats', (req, res, next) => 
  adminUserController.getUserStats(req, res, next)
);

/**
 * @route   GET /api/admin/users
 * @desc    获取用户列表（分页查询）
 * @access  Admin
 * @query   role - 角色筛选（可选）
 * @query   status - 状态筛选（可选）
 * @query   page - 页码（可选，默认 1）
 * @query   limit - 每页数量（可选，默认 10）
 * @query   search - 搜索关键词（可选）
 */
router.get('/users', (req, res, next) => 
  adminUserController.getUsers(req, res, next)
);

/**
 * @route   GET /api/admin/users/:id
 * @desc    获取用户详情
 * @access  Admin
 */
router.get('/users/:id', (req, res, next) => 
  adminUserController.getUserById(req, res, next)
);

/**
 * @route   POST /api/admin/users
 * @desc    创建新用户
 * @access  Admin
 * @body    username - 用户名（必填）
 * @body    password - 密码（必填）
 * @body    role - 角色（必填）
 * @body    email - 邮箱（可选）
 * @body    phone - 手机号（可选）
 */
router.post('/users', (req, res, next) => 
  adminUserController.createUser(req, res, next)
);

/**
 * @route   PUT /api/admin/users/:id
 * @desc    更新用户信息
 * @access  Admin
 * @body    email - 邮箱（可选）
 * @body    phone - 手机号（可选）
 * @body    status - 状态（可选）
 * @body    password - 新密码（可选）
 */
router.put('/users/:id', (req, res, next) => 
  adminUserController.updateUser(req, res, next)
);

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    删除用户（软删除）
 * @access  Admin
 */
router.delete('/users/:id', (req, res, next) => 
  adminUserController.deleteUser(req, res, next)
);

// ============ 学号管理路由 ============

/**
 * @route   GET /api/admin/student-ids/stats
 * @desc    获取学号统计信息
 * @access  Admin
 */
router.get('/student-ids/stats', (req, res, next) => 
  adminStudentIdController.getStudentIdStats(req, res, next)
);

/**
 * @route   GET /api/admin/student-ids
 * @desc    获取学号列表（分页查询）
 * @access  Admin
 * @query   status - 状态筛选（可选）
 * @query   page - 页码（可选，默认 1）
 * @query   limit - 每页数量（可选，默认 10）
 * @query   search - 搜索关键词（可选）
 */
router.get('/student-ids', (req, res, next) => 
  adminStudentIdController.getStudentIds(req, res, next)
);

/**
 * @route   GET /api/admin/student-ids/:id
 * @desc    获取学号详情
 * @access  Admin
 */
router.get('/student-ids/:id', (req, res, next) => 
  adminStudentIdController.getStudentIdById(req, res, next)
);

/**
 * @route   POST /api/admin/student-ids/assign
 * @desc    分配学号给用户
 * @access  Admin
 * @body    studentIdId - 学号 ID（必填）
 * @body    userId - 用户 ID（必填）
 */
router.post('/student-ids/assign', (req, res, next) => 
  adminStudentIdController.assignStudentId(req, res, next)
);

/**
 * @route   PUT /api/admin/student-ids/:id/lock
 * @desc    锁定学号
 * @access  Admin
 */
router.put('/student-ids/:id/lock', (req, res, next) => 
  adminStudentIdController.lockStudentId(req, res, next)
);

/**
 * @route   PUT /api/admin/student-ids/:id/unlock
 * @desc    解锁学号
 * @access  Admin
 */
router.put('/student-ids/:id/unlock', (req, res, next) => 
  adminStudentIdController.unlockStudentId(req, res, next)
);

/**
 * @route   PUT /api/admin/student-ids/:id/unbind
 * @desc    解绑学号
 * @access  Admin
 */
router.put('/student-ids/:id/unbind', (req, res, next) => 
  adminStudentIdController.unbindStudentId(req, res, next)
);

// ============ 授权码管理路由 ============

/**
 * @route   GET /api/admin/auth-codes/stats
 * @desc    获取授权码统计信息
 * @access  Admin
 */
router.get('/auth-codes/stats', (req, res, next) => 
  adminAuthCodeController.getAuthCodeStats(req, res, next)
);

// ============ 亲子关系管理路由 ============

/**
 * @route   GET /api/admin/relations/stats
 * @desc    获取亲子关系统计信息
 * @access  Admin
 */
router.get('/relations/stats', (req, res, next) => 
  adminRelationController.getRelationStats(req, res, next)
);

/**
 * @route   GET /api/admin/relations
 * @desc    获取亲子关系列表（分页查询）
 * @access  Admin
 * @query   page - 页码（可选，默认 1）
 * @query   limit - 每页数量（可选，默认 10）
 * @query   search - 搜索关键词（可选）
 * @query   parentId - 家长ID筛选（可选）
 * @query   studentId - 学员ID筛选（可选）
 * @query   status - 状态筛选（可选）
 */
router.get('/relations', (req, res, next) => 
  adminRelationController.getRelations(req, res, next)
);

/**
 * @route   GET /api/admin/relations/:id
 * @desc    获取亲子关系详情
 * @access  Admin
 */
router.get('/relations/:id', (req, res, next) => 
  adminRelationController.getRelationById(req, res, next)
);

/**
 * @route   DELETE /api/admin/relations/:id/unbind
 * @desc    解绑亲子关系
 * @access  Admin
 */
router.delete('/relations/:id/unbind', (req, res, next) => 
  adminRelationController.unbindRelation(req, res, next)
);

// ============ 授权码管理路由（续） ============

/**
 * @route   GET /api/admin/auth-codes/export
 * @desc    导出授权码为 CSV
 * @access  Admin
 * @query   status - 状态筛选（可选）
 */
router.get('/auth-codes/export', (req, res, next) => 
  adminAuthCodeController.exportAuthCodes(req, res, next)
);

/**
 * @route   GET /api/admin/auth-codes
 * @desc    获取授权码列表（分页查询）
 * @access  Admin
 * @query   status - 状态筛选（可选）
 * @query   page - 页码（可选，默认 1）
 * @query   limit - 每页数量（可选，默认 10）
 * @query   search - 搜索关键词（可选）
 */
router.get('/auth-codes', (req, res, next) => 
  adminAuthCodeController.getAuthCodes(req, res, next)
);

/**
 * @route   GET /api/admin/auth-codes/:id
 * @desc    获取授权码详情
 * @access  Admin
 */
router.get('/auth-codes/:id', (req, res, next) => 
  adminAuthCodeController.getAuthCodeById(req, res, next)
);

/**
 * @route   POST /api/admin/auth-codes/generate
 * @desc    批量生成授权码
 * @access  Admin
 * @body    count - 生成数量（必填，1-1000）
 * @body    expiryDays - 有效期天数（必填，1-365）
 */
router.post('/auth-codes/generate', (req, res, next) => 
  adminAuthCodeController.generateAuthCodes(req, res, next)
);

/**
 * @route   DELETE /api/admin/auth-codes/:id
 * @desc    删除授权码
 * @access  Admin
 */
router.delete('/auth-codes/:id', (req, res, next) => 
  adminAuthCodeController.deleteAuthCode(req, res, next)
);

// ============ 教材体系管理路由 ============

/**
 * @route   POST /api/admin/materials/import
 * @desc    批量导入教材数据
 * @access  Admin
 * @body    materials - 教材数据数组（必填）
 */
router.post('/materials/import', (req, res) => 
  adminMaterialController.importMaterials(req, res)
);

/**
 * @route   GET /api/admin/materials/template
 * @desc    下载教材导入模板
 * @access  Admin
 */
router.get('/materials/template', (req, res) => 
  adminMaterialController.downloadTemplate(req, res)
);

/**
 * @route   POST /api/admin/materials/upload
 * @desc    上传并导入教材Excel文件
 * @access  Admin
 * @body    file - Excel文件（必填）
 */
router.post('/materials/upload', 
  adminMaterialController.uploadAndImport
);

/**
 * @route   GET /api/admin/materials
 * @desc    获取所有教材节点（树形结构）
 * @access  Admin
 */
router.get('/materials', (req, res) => 
  adminMaterialController.getMaterials(req, res)
);

// ============ 教材（TEXTBOOK）专有路由 ============
// 注意：以下更具体的路径必须定义在 /materials/:id 之前，避免被参数路由捕获。

/**
 * @route   GET /api/admin/materials/textbooks
 * @desc    扁平列出教材（教材体系表格 / 题库选单）
 * @access  Admin
 */
router.get('/materials/textbooks', (req, res) =>
  adminMaterialController.listTextbooks(req, res)
);

/**
 * @route   POST /api/admin/materials/textbooks
 * @desc    创建教材（含子单元）
 * @access  Admin
 */
router.post('/materials/textbooks', (req, res) =>
  adminMaterialController.createTextbook(req, res)
);

/**
 * @route   GET /api/admin/materials/textbooks/:id/units
 * @desc    获取教材下单元
 * @access  Admin
 */
router.get('/materials/textbooks/:id/units', (req, res) =>
  adminMaterialController.getTextbookUnits(req, res)
);

/**
 * @route   PUT /api/admin/materials/textbooks/:id
 * @desc    更新教材（同步单元）
 * @access  Admin
 */
router.put('/materials/textbooks/:id', (req, res) =>
  adminMaterialController.updateTextbook(req, res)
);

/**
 * @route   DELETE /api/admin/materials/textbooks/:id
 * @desc    删除教材（级联删子单元）
 * @access  Admin
 */
router.delete('/materials/textbooks/:id', (req, res) =>
  adminMaterialController.deleteTextbook(req, res)
);

/**
 * @route   GET /api/admin/materials/:id
 * @desc    根据 ID 获取教材节点
 * @access  Admin
 */
router.get('/materials/:id', (req, res) => 
  adminMaterialController.getMaterialById(req, res)
);

/**
 * @route   POST /api/admin/materials
 * @desc    创建教材节点
 * @access  Admin
 * @body    name - 节点名称（必填）
 * @body    type - 节点类型（必填）
 * @body    parentId - 父节点 ID（可选）
 * @body    order - 排序序号（可选）
 * @body    metadata - 元数据（可选）
 */
router.post('/materials', (req, res) => 
  adminMaterialController.createMaterial(req, res)
);

/**
 * @route   PUT /api/admin/materials/:id
 * @desc    更新教材节点
 * @access  Admin
 * @body    name - 节点名称（可选）
 * @body    type - 节点类型（可选）
 * @body    parentId - 父节点 ID（可选）
 * @body    order - 排序序号（可选）
 * @body    metadata - 元数据（可选）
 */
router.put('/materials/:id', (req, res) => 
  adminMaterialController.updateMaterial(req, res)
);

/**
 * @route   DELETE /api/admin/materials/:id
 * @desc    删除教材节点（检查引用）
 * @access  Admin
 */
router.delete('/materials/:id', (req, res) => 
  adminMaterialController.deleteMaterial(req, res)
);

// ============ AI 服务配置路由 ============

/**
 * @route   GET /api/admin/ai-providers
 * @desc    获取所有 AI 服务商
 * @access  Admin
 */
router.get('/ai-providers', (req, res) => 
  adminAIController.getAllProviders(req, res)
);

/**
 * @route   POST /api/admin/ai-providers/test-all
 * @desc    测试所有 AI 服务商连通性
 * @access  Admin
 */
router.post('/ai-providers/test-all', (req, res) => 
  adminAIController.testAllProviders(req, res)
);

/**
 * @route   POST /api/admin/ai-providers/test
 * @desc    测试单个 AI 服务商连通性（不保存到数据库）
 * @access  Admin
 * @body    type - 服务商类型（必填）
 * @body    apiKey - API 密钥（必填）
 * @body    endpoint - API 端点（必填）
 * @body    model - 模型名称（必填）
 */
router.post('/ai-providers/test', (req, res) => 
  adminAIController.testProvider(req, res)
);

/**
 * @route   POST /api/admin/ai-providers/models
 * @desc    列出指定端点上的可用模型（"识别模型"按钮）
 * @access  Admin
 * @body    type - 服务商类型（必填）
 * @body    endpoint - API 端点（必填）
 * @body    apiKey - API 密钥（可选，OpenAI 兼容需携带）
 */
router.post('/ai-providers/models', (req, res) =>
  adminAIController.listModels(req, res)
);

/**
 * @route   GET /api/admin/ai-providers/:id
 * @desc    获取单个 AI 服务商
 * @access  Admin
 */
router.get('/ai-providers/:id', (req, res) => 
  adminAIController.getProviderById(req, res)
);

/**
 * @route   POST /api/admin/ai-providers
 * @desc    创建 AI 服务商
 * @access  Admin
 * @body    name - 服务商名称（必填）
 * @body    type - 服务商类型（必填）
 * @body    apiKey - API 密钥（必填）
 * @body    endpoint - API 端点（必填）
 * @body    model - 模型名称（必填）
 * @body    priority - 优先级（可选）
 * @body    status - 状态（可选）
 */
router.post('/ai-providers', (req, res) => 
  adminAIController.createProvider(req, res)
);

/**
 * @route   PUT /api/admin/ai-providers/:id
 * @desc    更新 AI 服务商
 * @access  Admin
 * @body    name - 服务商名称（可选）
 * @body    type - 服务商类型（可选）
 * @body    apiKey - API 密钥（可选）
 * @body    endpoint - API 端点（可选）
 * @body    model - 模型名称（可选）
 * @body    priority - 优先级（可选）
 * @body    status - 状态（可选）
 */
router.put('/ai-providers/:id', (req, res) => 
  adminAIController.updateProvider(req, res)
);

/**
 * @route   DELETE /api/admin/ai-providers/:id
 * @desc    删除 AI 服务商
 * @access  Admin
 */
router.delete('/ai-providers/:id', (req, res) => 
  adminAIController.deleteProvider(req, res)
);

// ============ OCR / 视觉识别服务商路由 ============

/**
 * @route   GET /api/admin/ocr-providers
 * @desc    获取所有 OCR / 视觉识别服务商
 * @access  Admin
 */
router.get('/ocr-providers', (req, res) => adminOcrController.getAllProviders(req, res));

/**
 * @route   POST /api/admin/ocr-providers/test
 * @desc    测试连通性（不保存到数据库）
 * @access  Admin
 */
router.post('/ocr-providers/test', (req, res) => adminOcrController.testProvider(req, res));

/**
 * @route   GET /api/admin/ocr-providers/:id
 * @desc    获取单个 OCR 服务商
 * @access  Admin
 */
router.get('/ocr-providers/:id', (req, res) => adminOcrController.getProviderById(req, res));

/**
 * @route   POST /api/admin/ocr-providers
 * @desc    创建 OCR 服务商
 * @access  Admin
 */
router.post('/ocr-providers', (req, res) => adminOcrController.createProvider(req, res));

/**
 * @route   PUT /api/admin/ocr-providers/:id
 * @desc    更新 OCR 服务商
 * @access  Admin
 */
router.put('/ocr-providers/:id', (req, res) => adminOcrController.updateProvider(req, res));

/**
 * @route   DELETE /api/admin/ocr-providers/:id
 * @desc    删除 OCR 服务商
 * @access  Admin
 */
router.delete('/ocr-providers/:id', (req, res) => adminOcrController.deleteProvider(req, res));

/**
 * @route   GET /api/admin/ai-instructions
 * @desc    获取所有科目教学指令
 * @access  Admin
 * @query   subject - 科目筛选（可选）
 */
router.get('/ai-instructions', (req, res) => 
  adminAIController.getAllInstructions(req, res)
);

/**
 * @route   PUT /api/admin/ai-instructions/:subject
 * @desc    更新科目教学指令
 * @access  Admin
 * @body    systemPrompt - System Prompt（必填）
 * @body    examples - 示例对话（可选）
 */
router.put('/ai-instructions/:subject', (req, res) => 
  adminAIController.updateInstruction(req, res)
);

/**
 * @route   DELETE /api/admin/ai-instructions/:subject
 * @desc    删除科目教学指令
 * @access  Admin
 */
router.delete('/ai-instructions/:subject', (req, res) => 
  adminAIController.deleteInstruction(req, res)
);

/**
 * @route   GET /api/admin/api-metrics
 * @desc    获取 API 监控指标
 * @access  Admin
 * @query   startDate - 开始日期（可选）
 * @query   endDate - 结束日期（可选）
 */
router.get('/api-metrics', (req, res) => 
  adminAIController.getAPIMetrics(req, res)
);

/**
 * @route   GET /api/admin/api-metrics/export
 * @desc    导出 API 监控数据为 CSV
 * @access  Admin
 * @query   startDate - 开始日期（可选）
 * @query   endDate - 结束日期（可选）
 */
router.get('/api-metrics/export', (req, res) => 
  adminAIController.exportAPIMetrics(req, res)
);

/**
 * @route   GET /api/admin/api-metrics/alert
 * @desc    检查错误率告警
 * @access  Admin
 * @query   threshold - 错误率阈值（可选，默认 10）
 */
router.get('/api-metrics/alert', (req, res) => 
  adminAIController.checkErrorRateAlert(req, res)
);

/**
 * @route   GET /api/admin/rate-limiter/status
 * @desc    获取 AI 请求限流器状态
 * @access  Admin
 */
router.get('/rate-limiter/status', (req, res) => 
  adminAIController.getRateLimiterStatus(req, res)
);

/**
 * @route   POST /api/admin/rate-limiter/clear-queue
 * @desc    清空 AI 请求队列
 * @access  Admin
 */
router.post('/rate-limiter/clear-queue', (req, res) => 
  adminAIController.clearRequestQueue(req, res)
);

// ============ 题库管理路由 ============

/**
 * @route   GET /api/admin/question-bank/subjects
 * @desc    获取所有已配置科目
 * @access  Admin
 */
router.get('/question-bank/subjects', (req, res) =>
  questionBankController.listSubjects(req, res)
);

/**
 * @route   GET /api/admin/question-bank/textbooks
 * @desc    教材列表（题库选单 / 分类用）
 * @access  Admin
 */
router.get('/question-bank/textbooks', (req, res) =>
  adminMaterialController.listTextbooks(req, res)
);

/**
 * @route   GET /api/admin/question-bank/papers
 * @desc    试卷列表（分页）
 * @access  Admin
 */
router.get('/question-bank/papers', (req, res) =>
  questionBankController.listPapers(req, res)
);

/**
 * @route   POST /api/admin/question-bank/papers
 * @desc    创建试卷
 * @access  Admin
 */
router.post('/question-bank/papers', (req, res) =>
  questionBankController.createPaper(req, res)
);

/**
 * @route   GET /api/admin/question-bank/papers/:id
 * @desc    试卷详情（含题目）
 * @access  Admin
 */
router.get('/question-bank/papers/:id', (req, res) =>
  questionBankController.getPaper(req, res)
);

/**
 * @route   DELETE /api/admin/question-bank/papers/:id
 * @desc    删除试卷
 * @access  Admin
 */
router.delete('/question-bank/papers/:id', (req, res) =>
  questionBankController.deletePaper(req, res)
);

/**
 * @route   POST /api/admin/question-bank/papers/:id/publish
 * @desc    发布试卷
 * @access  Admin
 */
router.post('/question-bank/papers/:id/publish', (req, res) =>
  questionBankController.publishPaper(req, res)
);

/**
 * @route   PATCH /api/admin/question-bank/papers/:id
 * @desc    调整试卷分类（EXERCISE 习题与试卷 / ASSESSMENT 初测与水平评估）
 * @access  Admin
 */
router.patch('/question-bank/papers/:id', (req, res) =>
  questionBankController.updatePaper(req, res)
);

/**
 * @route   GET /api/admin/question-bank/knowledge-points?subject=
 * @desc    知识点先修图谱（C2：聚合该学科题目的 prerequisites）
 * @access  Admin
 */
router.get('/question-bank/knowledge-points', (req, res) =>
  questionBankController.listKnowledgePoints(req, res)
);

/**
 * @route   PUT /api/admin/question-bank/knowledge-points/prerequisites
 * @desc    维护知识点先修清单（全量替换写回该学科含该知识点的题目）
 * @access  Admin
 * @body    subject, point, prerequisites: string[]
 */
router.put('/question-bank/knowledge-points/prerequisites', (req, res) =>
  questionBankController.updateKnowledgePointPrerequisites(req, res)
);

/**
 * @route   POST /api/admin/question-bank/papers/:id/items
 * @desc    向试卷添加题目
 * @access  Admin
 */
router.post('/question-bank/papers/:id/items', (req, res) =>
  questionBankController.addPaperItem(req, res)
);

/**
 * @route   DELETE /api/admin/question-bank/paper-items/:id
 * @desc    从试卷移除题目
 * @access  Admin
 */
router.delete('/question-bank/paper-items/:id', (req, res) =>
  questionBankController.removePaperItem(req, res)
);

/**
 * @route   GET /api/admin/question-bank/questions
 * @desc    题目列表（分页）
 * @access  Admin
 */
router.get('/question-bank/questions', (req, res) =>
  questionBankController.listQuestions(req, res)
);

/**
 * @route   POST /api/admin/question-bank/questions
 * @desc    手动创建题目
 * @access  Admin
 */
router.post('/question-bank/questions', (req, res) =>
  questionBankController.createQuestion(req, res)
);

/**
 * @route   GET /api/admin/question-bank/questions/review-stats
 * @desc    ④ AI 生成题审核概览（待审 / 已采纳 / 已驳回 / AI 题总数）
 * @access  Admin
 * @note    必须注册在 /questions/:id 之前，否则会被 :id 捕获
 */
router.get('/question-bank/questions/review-stats', (req, res) =>
  questionBankController.getReviewStats(req, res)
);

/**
 * @route   POST /api/admin/question-bank/questions/review
 * @desc    ④ 批量采纳 / 驳回 AI 生成题
 * @access  Admin
 */
router.post('/question-bank/questions/review', (req, res) =>
  questionBankController.reviewQuestions(req, res)
);

/**
 * @route   GET /api/admin/question-bank/questions/:id
 * @desc    题目详情
 * @access  Admin
 */
router.get('/question-bank/questions/:id', (req, res) =>
  questionBankController.getQuestion(req, res)
);

/**
 * @route   PUT /api/admin/question-bank/questions/:id
 * @desc    编辑题目（审核）
 * @access  Admin
 */
router.put('/question-bank/questions/:id', (req, res) =>
  questionBankController.updateQuestion(req, res)
);

/**
 * @route   POST /api/admin/question-bank/import
 * @desc    上传试卷文件并启动导入（OCR+LLM 归一化）
 * @access  Admin
 * @body    file - 试卷文件；subject - 科目
 */
router.post('/question-bank/import', questionBankController.uploadAndImport);

/**
 * @route   GET /api/admin/question-bank/import/:id
 * @desc    查询导入任务进度与结果
 * @access  Admin
 */
router.get('/question-bank/import/:id', (req, res) =>
  questionBankController.getImportJob(req, res)
);

/**
 * @route   GET /api/admin/question-bank/export
 * @desc    导出题库为 .zxbank 自描述 JSON（按试卷筛选）
 * @access  Admin
 */
router.get('/question-bank/export', (req, res) =>
  questionBankController.exportBank(req, res)
);

/**
 * @route   POST /api/admin/question-bank/import-data
 * @desc    导入 .zxbank 题库数据文件（按 id 幂等 upsert）
 * @access  Admin
 */
router.post('/question-bank/import-data', ...questionBankController.importBank);

/**
 * @route   POST /api/admin/question-bank/classify
 * @desc    启动 AI 难度一键归类后台任务（依据 STANDARD 判定标准文档）
 * @access  Admin
 * @body    scope - ALL（全量）/ UNLABELED（仅未标注）/ PAPER（按试卷）
 * @body    subject - 限定学科（可选）；paperId - scope=PAPER 必填
 */
router.post('/question-bank/classify', (req, res) =>
  questionBankController.startDifficultyClassify(req, res)
);

/**
 * @route   GET /api/admin/question-bank/classify
 * @desc    归类任务列表
 * @access  Admin
 */
router.get('/question-bank/classify', (req, res) =>
  questionBankController.listDifficultyClassifyJobs(req, res)
);

/**
 * @route   GET /api/admin/question-bank/classify/:id
 * @desc    归类任务进度与结果
 * @access  Admin
 */
router.get('/question-bank/classify/:id', (req, res) =>
  questionBankController.getDifficultyClassifyJob(req, res)
);

/**
 * @route   GET /api/admin/question-bank/needs-review
 * @desc    低置信度难度复核列表
 * @access  Admin
 */
router.get('/question-bank/needs-review', (req, res) =>
  questionBankController.listDifficultyNeedsReview(req, res)
);

// ============ P5 智能体平台配置 ============

/**
 * @route   GET/POST /api/admin/agent-docs
 * @desc    智能体文档（FLOW/INSTRUCTION/CONSTRAINT/STANDARD/MEMORY_SPEC）列表与创建
 * @access  Admin
 */
router.get('/agent-docs', (req, res, next) => adminAgentController.listAgentDocs(req, res, next));
router.post('/agent-docs', (req, res, next) => adminAgentController.createAgentDoc(req, res, next));

/**
 * @route   PUT/DELETE /api/admin/agent-docs/:id
 * @desc    智能体文档编辑（内容变更版本自增）/删除
 * @access  Admin
 */
router.put('/agent-docs/:id', (req, res, next) => adminAgentController.updateAgentDoc(req, res, next));
router.delete('/agent-docs/:id', (req, res, next) => adminAgentController.deleteAgentDoc(req, res, next));

/**
 * @route   /api/admin/student-memories
 * @desc    学员记忆管理（查看/人工修订/删除，含修订历史）
 * @access  Admin
 */
router.get('/student-memories', (req, res, next) => adminAgentController.listStudentMemories(req, res, next));
router.get('/student-memories/:id', (req, res, next) => adminAgentController.getStudentMemory(req, res, next));
router.put('/student-memories/:id', (req, res, next) => adminAgentController.updateStudentMemory(req, res, next));
router.delete('/student-memories/:id', (req, res, next) => adminAgentController.deleteStudentMemory(req, res, next));

/**
 * @route   /api/admin/platform-settings
 * @desc    平台开关（如 aiSupplementQuestions AI 补题开关）
 * @access  Admin
 */
router.get('/platform-settings', (req, res, next) => adminAgentController.listPlatformSettings(req, res, next));
router.put('/platform-settings/:key', (req, res, next) => adminAgentController.updatePlatformSetting(req, res, next));

export default router;
