import { Request, Response, NextFunction } from 'express';
import { parentTaskService } from '../services/parentTaskService';
import { logger } from '../middlewares/logger';
import { TaskStatus } from '@prisma/client';

/**
 * 家长端任务管理控制器
 */
class ParentTaskController {
  /**
   * 获取可用的 AI 科目老师列表
   * GET /api/parent/tasks/ai-teachers
   */
  async getAITeachers(req: Request, res: Response, next: NextFunction) {
    try {
      // 从认证中间件获取家长 ID
      const parentId = req.user?.userId;

      if (!parentId) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: '未认证',
          },
        });
      }

      // 获取所有科目指令
      const aiTeachers = await parentTaskService.getAITeachers();

      return res.json({
        success: true,
        data: aiTeachers,
      });
    } catch (error: any) {
      logger.error('获取 AI 科目老师列表失败:', error);
      return next(error);
    }
  }

  /**
   * 获取任务列表
   * GET /api/parent/tasks
   */
  async getTasks(req: Request, res: Response, next: NextFunction) {
    try {
      // 从认证中间件获取家长 ID
      const parentId = req.user?.userId;

      if (!parentId) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: '未认证',
          },
        });
      }

      // 获取查询参数
      const { studentId, status, page, limit } = req.query;

      // 验证状态参数
      let taskStatus: TaskStatus | undefined;
      if (status) {
        const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];
        if (!validStatuses.includes(status as string)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '无效的任务状态',
            },
          });
        }
        taskStatus = status as TaskStatus;
      }

      // 获取任务列表
      const result = await parentTaskService.getTasks(parentId, {
        studentId: studentId as string,
        status: taskStatus,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('获取任务列表失败:', error);
      return next(error);
    }
  }

  /**
   * 获取单个任务详情
   * GET /api/parent/tasks/:id
   */
  async getTaskById(req: Request, res: Response, next: NextFunction) {
    try {
      // 从认证中间件获取家长 ID
      const parentId = req.user?.userId;

      if (!parentId) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: '未认证',
          },
        });
      }

      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '任务 ID 不能为空',
          },
        });
      }

      // 获取任务详情
      const task = await parentTaskService.getTaskById(id, parentId);

      return res.json({
        success: true,
        data: task,
      });
    } catch (error: any) {
      logger.error('获取任务详情失败:', error);

      if (error.message === '任务不存在') {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: '任务不存在',
          },
        });
      }

      if (error.message === '无权访问该任务') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: '无权访问该任务',
          },
        });
      }

      return next(error);
    }
  }

  /**
   * 创建任务
   * POST /api/parent/tasks/create
   * 支持两种模式:
   * - CUSTOM: 自定义配置模式,需要完整配置
   * - PROFILE: 档案提取模式,基于学员档案 + 临时修改
   */
  async createTask(req: Request, res: Response, next: NextFunction) {
    try {
      // 从认证中间件获取家长 ID
      const parentId = req.user?.userId;

      if (!parentId) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: '未认证',
          },
        });
      }

      // 验证请求体
      const { mode, studentId, customConfig, profileConfig } = req.body;

      // 验证必填字段
      if (!mode || !['CUSTOM', 'PROFILE'].includes(mode)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '任务模式必须是 CUSTOM 或 PROFILE',
          },
        });
      }

      if (!studentId) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '学员 ID 不能为空',
          },
        });
      }

      // 自定义模式验证
      if (mode === 'CUSTOM') {
        if (!customConfig) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '自定义模式需要提供 customConfig',
            },
          });
        }

        const { title, aiTeacher, subject, materialVersion, units, goal } = customConfig;

        if (!title || !aiTeacher || !subject || !materialVersion || !units || !goal) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '自定义模式缺少必填字段: title, aiTeacher, subject, materialVersion, units, goal',
            },
          });
        }

        if (!Array.isArray(units) || units.length === 0) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '单元列表不能为空',
            },
          });
        }
      }

      // 档案模式验证
      if (mode === 'PROFILE') {
        if (!profileConfig) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '档案模式需要提供 profileConfig',
            },
          });
        }

        const { aiTeacher, trainingGoal, diagnosticQuestionCount } = profileConfig;

        if (!aiTeacher) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '档案模式需要选择 AI 科目老师',
            },
          });
        }

        // 验证训练目标（如果提供）
        if (trainingGoal) {
          if (typeof trainingGoal !== 'string') {
            return res.status(400).json({
              error: {
                code: 'INVALID_PARAMETER',
                message: '训练目标必须是字符串',
              },
            });
          }

          if (trainingGoal.length < 10 || trainingGoal.length > 500) {
            return res.status(400).json({
              error: {
                code: 'INVALID_PARAMETER',
                message: '训练目标长度必须在 10-500 字符之间',
              },
            });
          }
        }

        // 验证诊断题目数量（如果提供）
        if (diagnosticQuestionCount !== undefined) {
          if (typeof diagnosticQuestionCount !== 'number' || !Number.isInteger(diagnosticQuestionCount)) {
            return res.status(400).json({
              error: {
                code: 'INVALID_PARAMETER',
                message: '诊断题目数量必须是整数',
              },
            });
          }

          if (diagnosticQuestionCount < 5 || diagnosticQuestionCount > 20) {
            return res.status(400).json({
              error: {
                code: 'INVALID_PARAMETER',
                message: '诊断题目数量必须在 5-20 之间',
              },
            });
          }
        }
      }

      // 创建任务
      const task = await parentTaskService.createTask(parentId, {
        mode,
        studentId,
        customConfig,
        profileConfig,
      });

      return res.status(201).json({
        success: true,
        data: task,
      });
    } catch (error: any) {
      logger.error('创建任务失败:', error);

      if (error.message === '学员不存在') {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: '学员不存在',
          },
        });
      }

      if (error.message === '无权为该学员创建任务') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: '无权为该学员创建任务',
          },
        });
      }

      if (error.message === '学员档案不完整，无法使用档案模式') {
        return res.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: '学员档案不完整，无法使用档案模式',
          },
        });
      }

      if (error.message.includes('AI 科目老师') || error.message.includes('科目指令')) {
        return res.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      if (
        error.message.includes('教材') ||
        error.message.includes('题目') ||
        error.message.includes('难度')
      ) {
        return res.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
          },
        });
      }

      return next(error);
    }
  }

  /**
   * 删除任务
   * DELETE /api/parent/tasks/:id
   */
  async deleteTask(req: Request, res: Response, next: NextFunction) {
    try {
      // 从认证中间件获取家长 ID
      const parentId = req.user?.userId;

      if (!parentId) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: '未认证',
          },
        });
      }

      const { id } = req.params;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '任务 ID 不能为空',
          },
        });
      }

      // 删除任务
      const result = await parentTaskService.deleteTask(id, parentId);

      return res.json({
        success: true,
        message: result.message,
      });
    } catch (error: any) {
      logger.error('删除任务失败:', error);

      if (error.message === '任务不存在') {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: '任务不存在',
          },
        });
      }

      if (error.message === '无权删除该任务') {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: '无权删除该任务',
          },
        });
      }

      if (
        error.message.includes('进行中的任务') ||
        error.message.includes('训练会话')
      ) {
        return res.status(400).json({
          error: {
            code: 'TASK_IN_PROGRESS',
            message: error.message,
          },
        });
      }

      return next(error);
    }
  }
}

export const parentTaskController = new ParentTaskController();
