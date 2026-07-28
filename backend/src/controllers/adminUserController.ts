import { Request, Response, NextFunction } from 'express';
import { adminUserService } from '../services/adminUserService';
import { Role, UserStatus } from '@prisma/client';
import { logger } from '../middlewares/logger';

/**
 * 管理员用户管理控制器
 */
class AdminUserController {
  /**
   * 获取用户列表
   * GET /api/admin/users
   */
  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        role,
        status,
        page,
        limit,
        search,
      } = req.query;

      // 验证参数
      const params: any = {};

      if (role && Object.values(Role).includes(role as Role)) {
        params.role = role as Role;
      }

      if (status && Object.values(UserStatus).includes(status as UserStatus)) {
        params.status = status as UserStatus;
      }

      if (page) {
        params.page = parseInt(page as string, 10);
        if (isNaN(params.page) || params.page < 1) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '页码必须是大于 0 的整数',
            },
          });
        }
      }

      if (limit) {
        params.limit = parseInt(limit as string, 10);
        if (isNaN(params.limit) || params.limit < 1 || params.limit > 100) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '每页数量必须在 1-100 之间',
            },
          });
        }
      }

      if (search) {
        params.search = search as string;
      }

      const result = await adminUserService.getUsers(params);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('获取用户列表失败:', error);
      return next(error);
    }
  }

  /**
   * 获取用户详情
   * GET /api/admin/users/:id
   */
  async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '用户 ID 不能为空',
          },
        });
      }

      const user = await adminUserService.getUserById(id);

      return res.json({
        success: true,
        data: { user },
      });
    } catch (error: any) {
      if (error.message === '用户不存在') {
        return res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: error.message,
          },
        });
      }
      logger.error('获取用户详情失败:', error);
      return next(error);
    }
  }

  /**
   * 创建用户
   * POST /api/admin/users
   */
  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { 
        username, 
        password, 
        role, 
        email, 
        phone,
        authCode,
        // 家长特有字段
        realName,
        gender,
        address,
        industry,
        // 学员特有字段
        studentName,
        studentGender,
        birthDate,
        grade,
        school,
        learningFoundation,
        interests
      } = req.body;

      // 验证必填字段
      if (!username || !password || !role) {
        return res.status(400).json({
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: '用户名、密码和角色为必填项',
          },
        });
      }

      // 验证用户名格式
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({
          error: {
            code: 'INVALID_USERNAME',
            message: '用户名长度必须在 3-20 个字符之间',
          },
        });
      }

      // 验证密码强度
      if (password.length < 6) {
        return res.status(400).json({
          error: {
            code: 'WEAK_PASSWORD',
            message: '密码长度至少为 6 个字符',
          },
        });
      }

      // 验证角色
      if (!Object.values(Role).includes(role)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_ROLE',
            message: '无效的用户角色',
          },
        });
      }

      // 家长角色验证必填字段
      if (role === 'PARENT') {
        if (!email) {
          return res.status(400).json({
            error: {
              code: 'MISSING_REQUIRED_FIELDS',
              message: '家长注册需要邮箱',
            },
          });
        }
      }

      // 学员角色验证必填字段
      if (role === 'STUDENT') {
        if (!studentName || !studentGender || !birthDate || !grade) {
          return res.status(400).json({
            error: {
              code: 'MISSING_REQUIRED_FIELDS',
              message: '学员注册需要姓名、性别、出生年月和年级',
            },
          });
        }
        if (!authCode) {
          return res.status(400).json({
            error: {
              code: 'MISSING_AUTH_CODE',
              message: '学员注册需要授权码',
            },
          });
        }
      }

      // 验证邮箱格式
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_EMAIL',
              message: '邮箱格式不正确',
            },
          });
        }
      }

      // 验证手机号格式
      if (phone) {
        const phoneRegex = /^1[3-9]\d{9}$/;
        if (!phoneRegex.test(phone)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PHONE',
              message: '手机号格式不正确',
            },
          });
        }
      }

      const user = await adminUserService.createUser({
        username,
        password,
        role,
        email,
        phone,
        authCode,
        realName,
        gender,
        address,
        industry,
        studentName,
        studentGender,
        birthDate,
        grade,
        school,
        learningFoundation,
        interests,
      });

      // 统一返回格式
      const responseData: any = { user };
      
      // 如果是学员，添加学号信息
      if (role === 'STUDENT' && 'studentIdNumber' in user) {
        responseData.studentIdNumber = user.studentIdNumber;
        logger.info('学员创建成功，学号:', user.studentIdNumber);
      }

      return res.status(201).json({
        success: true,
        data: responseData,
        message: '用户创建成功',
      });
    } catch (error: any) {
      if (error.message === '用户名已存在' || error.message === '邮箱已被使用') {
        return res.status(409).json({
          error: {
            code: 'CONFLICT',
            message: error.message,
          },
        });
      }
      if (error.message.includes('授权码')) {
        return res.status(422).json({
          error: {
            code: 'AUTH_CODE_ERROR',
            message: error.message,
          },
        });
      }
      logger.error('创建用户失败:', error);
      return next(error);
    }
  }

  /**
   * 更新用户
   * PUT /api/admin/users/:id
   */
  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { 
        email, 
        phone, 
        status, 
        password,
        // 家长特有字段
        realName,
        gender,
        address,
        industry,
        // 学员档案字段（兼容旧格式）
        grade,
        school,
        learningFoundation,
        interests,
        // 学员档案对象（新格式）
        studentProfile
      } = req.body;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '用户 ID 不能为空',
          },
        });
      }

      // 验证邮箱格式
      if (email !== undefined && email !== null && email !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_EMAIL',
              message: '邮箱格式不正确',
            },
          });
        }
      }

      // 验证手机号格式
      if (phone !== undefined && phone !== null && phone !== '') {
        const phoneRegex = /^1[3-9]\d{9}$/;
        if (!phoneRegex.test(phone)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PHONE',
              message: '手机号格式不正确',
            },
          });
        }
      }

      // 验证状态
      if (status && !Object.values(UserStatus).includes(status)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_STATUS',
            message: '无效的用户状态',
          },
        });
      }

      // 验证密码
      if (password && password.length < 6) {
        return res.status(400).json({
          error: {
            code: 'WEAK_PASSWORD',
            message: '密码长度至少为 6 个字符',
          },
        });
      }

      const updateData: any = {};
      if (email !== undefined) updateData.email = email || null;
      if (phone !== undefined) updateData.phone = phone || null;
      if (status !== undefined) updateData.status = status;
      if (password !== undefined) updateData.password = password;
      if (realName !== undefined) updateData.realName = realName;
      if (gender !== undefined) updateData.gender = gender;
      if (address !== undefined) updateData.address = address;
      if (industry !== undefined) updateData.industry = industry;
      
      // 处理学员档案更新（支持新旧两种格式）
      if (studentProfile) {
        // 新格式：完整的 studentProfile 对象
        updateData.studentProfile = studentProfile;
      } else {
        // 旧格式：单独的字段（向后兼容）
        if (grade !== undefined) updateData.grade = grade;
        if (school !== undefined) updateData.school = school;
        if (learningFoundation !== undefined) updateData.learningFoundation = learningFoundation;
        if (interests !== undefined) updateData.interests = interests;
      }

      const user = await adminUserService.updateUser(id, updateData);

      return res.json({
        success: true,
        data: { user },
        message: '用户更新成功',
      });
    } catch (error: any) {
      if (error.message === '用户不存在') {
        return res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: error.message,
          },
        });
      }
      if (error.message === '邮箱已被其他用户使用' || error.message === '管理员角色仅可修改密码') {
        return res.status(409).json({
          error: {
            code: 'CONFLICT',
            message: error.message,
          },
        });
      }
      logger.error('更新用户失败:', error);
      return next(error);
    }
  }

  /**
   * 删除用户
   * DELETE /api/admin/users/:id
   */
  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '用户 ID 不能为空',
          },
        });
      }

      const result = await adminUserService.deleteUser(id);

      return res.json({
        success: true,
        data: result,
        message: '用户删除成功',
      });
    } catch (error: any) {
      if (error.message === '用户不存在') {
        return res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: error.message,
          },
        });
      }
      
      // 检查是否是亲子关系绑定错误
      if (error.message && error.message.includes('亲子绑定关系')) {
        return res.status(400).json({
          error: {
            code: 'HAS_ACTIVE_RELATIONS',
            message: error.message,
          },
        });
      }
      
      if (error.message === '用户已被删除') {
        return res.status(400).json({
          error: {
            code: 'USER_ALREADY_DELETED',
            message: error.message,
          },
        });
      }
      
      logger.error('删除用户失败:', error);
      return next(error);
    }
  }

  /**
   * 获取用户统计信息
   * GET /api/admin/users/stats
   */
  async getUserStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await adminUserService.getUserStats();

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      logger.error('获取用户统计失败:', error);
      return next(error);
    }
  }
}

export const adminUserController = new AdminUserController();
