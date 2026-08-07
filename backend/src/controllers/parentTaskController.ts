import { Request, Response, NextFunction } from 'express';
import { parentTaskService } from '../services/parentTaskService';
import { logger } from '../middlewares/logger';
import { ConflictError } from '../middlewares/errorHandler';
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
   * 获取已发布试卷列表（组卷模式选卷用）
   * GET /api/parent/question-bank/papers?subject=数学
   */
  async listExamPapers(req: Request, res: Response, next: NextFunction) {
    try {
      const questionBankService = await import('../services/questionBankService');
      const subjectRaw = req.query.subject;
      const subject = Array.isArray(subjectRaw) ? String(subjectRaw[0]) : (subjectRaw as string | undefined);
      const categoryRaw = req.query.category;
      const category = (Array.isArray(categoryRaw) ? String(categoryRaw[0]) : (categoryRaw as string | undefined)) as
        | 'EXERCISE'
        | 'ASSESSMENT'
        | undefined;
      const papers = await questionBankService.listPublishedPapers(subject || undefined, category ?? 'EXERCISE');
      return res.json({ success: true, data: { papers } });
    } catch (error: any) {
      logger.error('获取试卷列表失败:', error);
      return next(error);
    }
  }

  /**
   * 获取题库概况（随机组卷配置用：各题型可用数量）
   * GET /api/parent/question-bank/summary?subject=数学
   */
  async getBankSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const subjectRaw = req.query.subject;
      const subject = Array.isArray(subjectRaw) ? String(subjectRaw[0]) : (subjectRaw as string | undefined);
      if (!subject) {
        return res.status(400).json({
          error: { code: 'INVALID_PARAMETER', message: '缺少 subject 参数' },
        });
      }
      const questionBankService = await import('../services/questionBankService');
      const summary = await questionBankService.getBankSummary(subject);
      return res.json({ success: true, data: summary });
    } catch (error: any) {
      logger.error('获取题库概况失败:', error);
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
      const { studentId, status, category, subject, page, limit } = req.query;

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

      // P3 双轨：验证任务大类参数
      let taskCategory: 'SUBJECT_MAIN' | 'SPECIAL' | undefined;
      if (category) {
        if (!['SUBJECT_MAIN', 'SPECIAL'].includes(category as string)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '无效的任务大类',
            },
          });
        }
        taskCategory = category as 'SUBJECT_MAIN' | 'SPECIAL';
      }

      // 获取任务列表
      const result = await parentTaskService.getTasks(parentId, {
        studentId: studentId as string,
        status: taskStatus,
        category: taskCategory,
        subject: subject ? String(subject) : undefined,
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
      const { mode, studentId, customConfig, profileConfig, examConfig, initialTest } = req.body;

      // 初测来源校验（P2 题库化初测，PROFILE 模式生效）
      if (initialTest !== undefined) {
        if (!initialTest.source || !['PAPER', 'CRITERIA', 'AI'].includes(initialTest.source)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: 'initialTest.source 必须是 PAPER、CRITERIA 或 AI',
            },
          });
        }
        if (initialTest.source === 'PAPER' && !initialTest.paperId) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '初测选卷模式需要提供 paperId',
            },
          });
        }
      }

      // 验证必填字段
      if (!mode || !['CUSTOM', 'PROFILE', 'EXAM_PAPER'].includes(mode)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '任务模式必须是 CUSTOM、PROFILE 或 EXAM_PAPER',
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

        const { title, aiTeacher, subject, textbookId, unitIds, goal } = customConfig;

        if (!title || !aiTeacher || !subject || !textbookId || !goal) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '自定义模式缺少必填字段: title, aiTeacher, subject, textbookId, goal',
            },
          });
        }

        if (!Array.isArray(unitIds) || unitIds.length === 0) {
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

      // 组卷模式验证
      if (mode === 'EXAM_PAPER') {
        if (!examConfig) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '组卷模式需要提供 examConfig',
            },
          });
        }
        if (!['PAPER', 'RANDOM'].includes(examConfig.source)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: 'examConfig.source 必须是 PAPER（整卷）或 RANDOM（随机抽题）',
            },
          });
        }
        if (examConfig.source === 'PAPER' && !examConfig.paperId) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '整卷模式需要提供 paperId',
            },
          });
        }
        if (examConfig.source === 'RANDOM' && !examConfig.subject) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETER',
              message: '随机组卷需要指定 subject',
            },
          });
        }
      }

      // 创建任务
      const task = await parentTaskService.createTask(parentId, {
        mode,
        studentId,
        customConfig,
        profileConfig,
        examConfig,
        initialTest,
        parentEncouragement: req.body.parentEncouragement,
      });

      return res.status(201).json({
        success: true,
        data: task,
      });
    } catch (error: any) {
      logger.error('创建任务失败:', error);

      // 业务约束冲突（同学科唯一、新学期需初测等）→ 409，优先于下方关键词兜底分支
      if (error instanceof ConflictError) {
        return next(error);
      }

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
        error.message.includes('难度') ||
        error.message.includes('试卷')
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

  /**
   * 学期延续模式：调整学科总任务的单元范围（继续训练）
   * PATCH /api/parent/tasks/:id/units
   */
  async updateTaskUnits(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user?.userId;
      if (!parentId) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未认证' } });
      }

      const { id: taskId } = req.params;
      const { unitIds } = req.body;

      if (!taskId || typeof taskId !== 'string') {
        return res.status(400).json({ error: { code: 'INVALID_PARAMETER', message: '任务 ID 不能为空' } });
      }
      if (!Array.isArray(unitIds) || unitIds.length === 0) {
        return res.status(400).json({ error: { code: 'INVALID_INPUT', message: '请至少勾选一个单元' } });
      }

      const result = await parentTaskService.updateTaskUnits(taskId, parentId, unitIds);

      return res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('调整任务单元失败:', error);

      if (error.message === '任务不存在') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
      }
      if (error.message === '无权调整该任务') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权调整该任务' } });
      }
      return next(error);
    }
  }

  /**
   * 学期延续模式：归档学科总任务（学期总结）
   * POST /api/parent/tasks/:id/archive
   */
  async archiveTask(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user?.userId;
      if (!parentId) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未认证' } });
      }

      const { id: taskId } = req.params;
      if (!taskId || typeof taskId !== 'string') {
        return res.status(400).json({ error: { code: 'INVALID_PARAMETER', message: '任务 ID 不能为空' } });
      }

      const result = await parentTaskService.archiveTask(taskId, parentId);

      return res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error('归档任务失败:', error);

      if (error.message === '任务不存在') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
      }
      if (error.message === '无权归档该任务') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权归档该任务' } });
      }
      return next(error);
    }
  }

  /**
   * 设置家长激励寄语
   * PUT /api/parent/tasks/:id/encouragement
   */
  async setEncouragement(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.userId;
      const { id: taskId } = req.params;

      if (!taskId || typeof taskId !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '任务 ID 不能为空',
          },
        });
      }

      const { message } = req.body;

      if (typeof message !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMS',
            message: '激励寄语内容必须为字符串',
          },
        });
      }

      const result = await parentTaskService.setEncouragement(taskId, parentId, message);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error.message === '任务不存在') {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      if (error.message === '无权操作该任务') {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: error.message },
        });
      }
      if (error.message.includes('不能超过')) {
        return res.status(400).json({
          error: { code: 'INVALID_PARAMS', message: error.message },
        });
      }
      return next(error);
    }
  }

  /**
   * AI 智能一键派单（自动生成今日巩固小练任务）
   * POST /api/parent/tasks/smart-assign
   */
  async smartAssign(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.userId;
      const { studentId } = req.body;

      if (!studentId || typeof studentId !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '学员 ID 不能为空',
          },
        });
      }

      const result = await parentTaskService.smartAssign(parentId, studentId);

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error.message === '无权为该学员布置任务') {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: error.message },
        });
      }
      if (
        error.message === '学员不存在' ||
        error.message.includes('档案不完整') ||
        error.message.includes('AI 科目老师')
      ) {
        return res.status(400).json({
          error: { code: 'INVALID_PARAMS', message: error.message },
        });
      }
      return next(error);
    }
  }

  /**
   * AI 生成激励批语草稿（创建任务前使用）
   * POST /api/parent/encouragement/ai
   */
  async generateEncouragementDraft(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.userId;
      const { studentId, goal } = req.body;

      if (!studentId || typeof studentId !== 'string') {
        return res.status(400).json({
          error: { code: 'INVALID_PARAMS', message: 'studentId 必填' },
        });
      }

      const result = await parentTaskService.generateEncouragementDraft(
        parentId,
        studentId,
        typeof goal === 'string' ? goal : undefined
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error.message === '无权操作该学员') {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: error.message },
        });
      }
      return next(error);
    }
  }

  /**
   * AI 生成定制激励批语
   * POST /api/parent/tasks/:id/encouragement/ai
   */
  async generateEncouragement(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user!.userId;
      const { id: taskId } = req.params;

      if (!taskId || typeof taskId !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: '任务 ID 不能为空',
          },
        });
      }

      const result = await parentTaskService.generateEncouragement(taskId, parentId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error.message === '任务不存在') {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      if (error.message === '无权操作该任务') {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: error.message },
        });
      }
      return next(error);
    }
  }

  /**
   * 初测预览（P2 题库化初测）：发布任务前预览将抽到的题目
   * POST /api/parent/tasks/initial-test/preview
   * body: { source: 'PAPER'|'CRITERIA'|'AI', paperId?, studentId?, subject?, count?, criteria? }
   */
  async previewInitialTest(req: Request, res: Response, _next: NextFunction) {
    try {
      const parentId = req.user?.userId;
      if (!parentId) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: '未认证' },
        });
      }

      const { source, paperId, studentId, subject, count, criteria } = req.body;
      if (!source || !['PAPER', 'CRITERIA', 'AI'].includes(source)) {
        return res.status(400).json({
          error: { code: 'INVALID_PARAMETER', message: 'source 必须是 PAPER、CRITERIA 或 AI' },
        });
      }
      if (source === 'PAPER' && !paperId) {
        return res.status(400).json({
          error: { code: 'INVALID_PARAMETER', message: 'PAPER 模式需要 paperId' },
        });
      }
      if (source !== 'PAPER' && !subject) {
        return res.status(400).json({
          error: { code: 'INVALID_PARAMETER', message: 'CRITERIA/AI 模式需要 subject' },
        });
      }
      if (source === 'AI' && !studentId) {
        return res.status(400).json({
          error: { code: 'INVALID_PARAMETER', message: 'AI 模式需要 studentId' },
        });
      }

      const questionCount = Number(count) || 10;
      const { buildInitialTest, previewQuestions } = await import(
        '../services/questionSelectionService'
      );

      // 预览不触发 AI 补题入库（supplement: false）
      const result = await buildInitialTest(
        source === 'PAPER'
          ? { source: 'PAPER', paperId }
          : source === 'CRITERIA'
            ? { source: 'CRITERIA', criteria: { subject, count: questionCount, ...criteria } }
            : { source: 'AI', ai: { studentId, subject, count: questionCount } },
        { supplement: false }
      );

      const questions = await previewQuestions(result.questionIds);

      return res.json({
        success: true,
        data: {
          questions,
          meta: result.meta,
        },
      });
    } catch (error: any) {
      logger.error('初测预览失败:', error);
      return res.status(422).json({
        error: { code: 'PREVIEW_FAILED', message: error.message },
      });
    }
  }

  /**
   * P3 双轨：创建专项攻克任务
   * POST /api/parent/tasks/special
   * body: { studentId, subject, specialType, unitIds?, knowledgePoints?, errorQuestionIds?, questionCount?, title? }
   */
  async createSpecialTask(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user?.userId;
      if (!parentId) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: '未认证' },
        });
      }

      const {
        studentId,
        subject,
        specialType,
        unitIds,
        knowledgePoints,
        errorQuestionIds,
        questionCount,
        title,
        examConfig,
        wordConfig,
      } = req.body;

      if (!studentId || !subject) {
        return res.status(400).json({
          error: { code: 'INVALID_PARAMETER', message: 'studentId 和 subject 为必填项' },
        });
      }
      if (!specialType || !['UNIT', 'KNOWLEDGE_POINT', 'ERROR_BOOK', 'PAPER', 'WORD'].includes(specialType)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PARAMETER',
            message: 'specialType 必须是 UNIT、KNOWLEDGE_POINT、ERROR_BOOK、PAPER 或 WORD',
          },
        });
      }
      if (specialType === 'PAPER' && !examConfig) {
        return res.status(400).json({
          error: { code: 'INVALID_PARAMETER', message: '题库组卷专项需要提供 examConfig' },
        });
      }

      const task = await parentTaskService.createSpecialTask(parentId, {
        studentId,
        subject,
        specialType,
        unitIds,
        knowledgePoints,
        errorQuestionIds,
        questionCount: questionCount ? Number(questionCount) : undefined,
        title,
        examConfig,
        wordConfig,
      });

      return res.status(201).json({
        success: true,
        data: task,
      });
    } catch (error: any) {
      logger.error('创建专项攻克任务失败:', error);
      if (
        typeof error.message === 'string' &&
        (error.message.includes('无权') ||
          error.message.includes('必须') ||
          error.message.includes('需要') ||
          error.message.includes('暂无'))
      ) {
        return res.status(422).json({
          error: { code: 'CREATE_SPECIAL_FAILED', message: error.message },
        });
      }
      return next(error);
    }
  }

  /**
   * P3 双轨：获取子女错题列表（错题集专项多选来源）
   * GET /api/parent/children/:studentId/errors?subject=
   */
  async listChildErrors(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user?.userId;
      if (!parentId) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: '未认证' },
        });
      }

      const { studentId } = req.params;
      const { subject } = req.query;

      const errors = await parentTaskService.listChildErrors(
        parentId,
        String(studentId),
        subject ? String(subject) : undefined
      );

      return res.json({ success: true, data: errors });
    } catch (error: any) {
      logger.error('获取子女错题列表失败:', error);
      return next(error);
    }
  }

  /**
   * P3 双轨：获取子女薄弱知识点候选（知识点专项带出来源）
   * GET /api/parent/children/:studentId/weak-points?subject=
   */
  async listChildWeakPoints(req: Request, res: Response, next: NextFunction) {
    try {
      const parentId = req.user?.userId;
      if (!parentId) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: '未认证' },
        });
      }

      const { studentId } = req.params;
      const { subject } = req.query;

      const points = await parentTaskService.listChildWeakPoints(
        parentId,
        String(studentId),
        subject ? String(subject) : undefined
      );

      return res.json({ success: true, data: points });
    } catch (error: any) {
      logger.error('获取子女薄弱知识点失败:', error);
      return next(error);
    }
  }
}

export const parentTaskController = new ParentTaskController();
