import { Router, Request, Response } from 'express';
import { authenticate, requireAdmin, requireParent, requireStudent } from '../middlewares/auth';

const router = Router();

/**
 * 测试认证中间件
 * GET /api/test/auth
 * 需要认证，任何角色都可以访问
 */
router.get('/auth', authenticate, (req: Request, res: Response) => {
  res.json({
    message: '认证成功',
    user: req.user,
  });
});

/**
 * 测试管理员权限
 * GET /api/test/admin
 * 需要管理员角色
 */
router.get('/admin', authenticate, requireAdmin, (req: Request, res: Response) => {
  res.json({
    message: '管理员权限验证成功',
    user: req.user,
  });
});

/**
 * 测试家长权限
 * GET /api/test/parent
 * 需要家长角色
 */
router.get('/parent', authenticate, requireParent, (req: Request, res: Response) => {
  res.json({
    message: '家长权限验证成功',
    user: req.user,
  });
});

/**
 * 测试学员权限
 * GET /api/test/student
 * 需要学员角色
 */
router.get('/student', authenticate, requireStudent, (req: Request, res: Response) => {
  res.json({
    message: '学员权限验证成功',
    user: req.user,
  });
});

export default router;
