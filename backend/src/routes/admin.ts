import { Router } from 'express';
import { adminUserController } from '../controllers/adminUserController';
import { adminStudentIdController } from '../controllers/adminStudentIdController';
import { adminAuthCodeController } from '../controllers/adminAuthCodeController';
import { adminRelationController } from '../controllers/adminRelationController';
import * as adminMaterialController from '../controllers/adminMaterialController';
import * as adminAIController from '../controllers/adminAIController';
import { authenticate, requireAdmin } from '../middlewares/auth';

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

export default router;
