import { Router } from 'express';
import { authController } from '../controllers/authController';

const router = Router();

/**
 * 认证路由
 * 基础路径: /api/auth
 */

/**
 * @route   POST /api/auth/login
 * @desc    用户登录
 * @access  Public
 */
router.post('/login', (req, res, next) => authController.login(req, res, next));

/**
 * @route   POST /api/auth/register
 * @desc    用户注册
 * @access  Public
 */
router.post('/register', (req, res, next) => authController.register(req, res, next));

export default router;
