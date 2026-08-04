// 学员训练服务
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../middlewares/logger';
import { aiServiceManager } from './aiServiceManager';
import { completeTaskTransaction } from '../utils/transaction';
import { reportStatusService, ReportStatus } from './reportStatusService';
import { safeJsonParse } from '../utils/aiJson';
import { recordReviewResult, initialReviewFields } from './spacedRepetitionService';

const prisma = new PrismaClient();

/**
 * ④ 正式可下发题目的过滤条件：
 * reviewStatus 为空（导入/手动题，无需审核）或已被管理员采纳（APPROVED）。
 * PENDING（AI 生成待审核）与 REJECTED（已驳回）不参与任何自动抽题。
 */
export const REVIEWED_QUESTION_FILTER = (): Prisma.QuestionWhereInput => ({
  OR: [{ reviewStatus: null }, { reviewStatus: 'APPROVED' }],
});

/**
 * 训练会话服务类
 */
export class StudentTrainingService {
  /** 正在生成训练计划的会话（防止并发重复调用 AI） */
  private planGeneratingSessions = new Set<string>();

  /**
   * 获取学员当前任务
   */
  async getCurrentTask(studentId: string) {
    try {
      // 查找状态为 PENDING 或 IN_PROGRESS 的任务
      // P3 双轨：仅取学科总任务，专项攻克任务（含错题重做临时任务）走独立列表
      const task = await prisma.task.findFirst({
        where: {
          studentId,
          category: 'SUBJECT_MAIN',
          status: {
            in: ['PENDING', 'IN_PROGRESS'],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      return task;
    } catch (error) {
      logger.error('获取当前任务失败:', error);
      throw new Error('获取当前任务失败');
    }
  }

  /**
   * P3 双轨：获取学员任务列表（学科总任务 / 专项攻克双区隔离查询）
   */
  async getTasks(
    studentId: string,
    filters: {
      category?: 'SUBJECT_MAIN' | 'SPECIAL';
      subject?: string;
      status?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    try {
      const { category, subject, status, page = 1, limit = 20 } = filters;

      const where: any = { studentId };
      if (category) {
        where.category = category;
        // 专项区：展示「家长/系统布置的专项」+「学员主动创建的专项（config.source='SPECIAL'）」；
        // 排除错题重做临时任务（createdBy=自己 且无 source 标记，入口在错题本，不重复展示）
        if (category === 'SPECIAL') {
          where.OR = [
            { createdBy: { not: studentId } },
            { createdBy: studentId, config: { path: ['source'], equals: 'SPECIAL' } },
          ];
        }
      }
      if (subject) {
        where.subject = subject;
      }
      if (status && ['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
        where.status = status;
      }

      const skip = (page - 1) * limit;

      const [tasks, total] = await Promise.all([
        prisma.task.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            creator: {
              select: { id: true, username: true },
            },
          },
        }),
        prisma.task.count({ where }),
      ]);

      return { tasks, total, page, limit };
    } catch (error) {
      logger.error('获取学员任务列表失败:', error);
      throw new Error('获取学员任务列表失败');
    }
  }

  /**
   * 开始训练会话
   */
  async startTraining(taskId: string, studentId: string) {
    try {
      // 验证任务存在且属于该学员
      const task = await prisma.task.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new Error('任务不存在');
      }

      if (task.studentId !== studentId) {
        throw new Error('无权访问此任务');
      }

      if (task.status === 'COMPLETED') {
        // 学期延续模式：归档后的总任务不可继续训练，新学期由家长发布新任务并重新初测
        throw new Error(
          task.archivedAt
            ? '该学科总任务已归档，新学期训练请等待家长发布新任务'
            : '任务已完成'
        );
      }

      // 检查是否已有活跃会话
      const existingSession = await prisma.trainingSession.findFirst({
        where: {
          taskId,
          studentId,
          status: {
            in: ['ACTIVE', 'PAUSED'],
          },
        },
      });

      if (existingSession) {
        return existingSession;
      }

      // 根据任务配置生成题目列表
      const config = task.config as {
        materialNodeIds?: string[];
        questionCount?: number;
        difficulty?: number;
        profileBased?: boolean;
        mode?: string;
        diagnosticQuestionCount?: number; // 诊断测试题目数量
        trainingGoal?: string; // 训练目标
        questionIds?: string[]; // 组卷模式：固定题目列表
        unitIds?: string[]; // 自定义模式：所选单元节点 id
        subject?: string; // 学科
        assessment?: { source: 'PAPER' | 'AI'; paperId?: string } | null; // 水平评估（初测）
      };
      
      // 检测是否为档案提取模式
      const isProfileMode = config.profileBased || config.mode === 'PROFILE';
      // 检测是否为组卷模式（固定题目、保持顺序）
      const isExamPaperMode = config.mode === 'EXAM_PAPER';
      
      let questions: any[] = [];
      let initialPhase: any = 'PRE_TEST';
      let diagnosticTestData = null;
      
      if (isExamPaperMode) {
        // 组卷模式：使用任务配置中固定的题目列表（保持出卷顺序）
        const questionIds = config.questionIds || [];
        if (questionIds.length === 0) {
          throw new Error('组卷任务没有题目');
        }
        const found = await prisma.question.findMany({
          where: { id: { in: questionIds } },
        });
        const byId = new Map(found.map((q) => [q.id, q]));
        questions = questionIds
          .map((id) => byId.get(id))
          .filter((q): q is NonNullable<typeof q> => !!q);
        if (questions.length === 0) {
          throw new Error('组卷任务的题目已不存在，请联系家长重新布置');
        }
        logger.info(`组卷模式：加载固定题目 ${questions.length}/${questionIds.length} 道`);
      } else if (isProfileMode) {
        // 档案提取模式：由 AI 动态生成题目，不需要预先查找题库
        logger.info('档案提取模式：将由 AI 动态生成题目');
        
        // 创建空的题目列表，题目将在训练过程中由 AI 动态生成
        questions = [];
        
        // 设置初始阶段为诊断测试
        initialPhase = 'DIAGNOSTIC_TEST';
        
        // 初始化诊断测试数据
        const diagnosticQuestionCount = config.diagnosticQuestionCount || 10;
        diagnosticTestData = {
          totalQuestions: diagnosticQuestionCount,
          currentQuestion: 0,
          answers: [],
        };
        
        logger.info(`初始化诊断测试：共 ${diagnosticQuestionCount} 道题目`);
      } else {
        // 自定义模式：从题库中查找题目
        // 水平评估（初测）：若配置了 assessment，则初测部分从「初测与水平评估」题库取卷/组卷，
        // 拼到题集头部作为 PRE_TEST，其余仍按教材单元出题。
        const assessment = (config as any).assessment as
          | { source: 'PAPER' | 'AI'; paperId?: string }
          | undefined;
        const exerciseQuestions = await this.generateQuestions(
          config.materialNodeIds || [],
          config.questionCount || 10,
          config.difficulty || 3,
          config.unitIds
        );

        if (assessment && assessment.source) {
          const assessmentIds = await this.loadAssessmentQuestionIds(
            assessment,
            config.subject,
            config.unitIds
          );
          if (assessmentIds.length > 0) {
            const assessQs = await prisma.question.findMany({
              where: { id: { in: assessmentIds } },
            });
            // 初测题集 + 教材练习题集（初测在前，作为 PRE_TEST 阶段）
            questions = [...assessQs, ...exerciseQuestions];
            logger.info(
              `自定义模式含水平评估初测：${assessQs.length} 道初测题 + ${exerciseQuestions.length} 道练习题`
            );
          } else {
            questions = exerciseQuestions;
          }
        } else {
          questions = exerciseQuestions;
        }

        if (questions.length === 0) {
          throw new Error('没有找到符合条件的题目');
        }
      }

      // 创建新的训练会话
      const session = await prisma.trainingSession.create({
        data: {
          taskId,
          studentId,
          phase: initialPhase,
          currentStep: 0,
          totalSteps: isProfileMode 
            ? (config.diagnosticQuestionCount || 10) 
            : questions.length,
          progress: 0,
          questions: questions.map((q) => q.id),
          status: 'ACTIVE',
          // 档案提取模式专用字段
          diagnosticTestData: diagnosticTestData as any,
          trainingPlanData: null as any,
          trainingProgress: null as any,
          finalExamData: null as any,
          trainingReport: null,
        },
        include: {
          task: true,
        },
      });

      // 更新任务状态为进行中
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });

      logger.info(`学员 ${studentId} 开始训练会话 ${session.id}，模式：${isProfileMode ? '档案提取' : '自定义'}，初始阶段：${initialPhase}`);

      return session;
    } catch (error: unknown) {
      logger.error('开始训练失败:', error);
      throw error;
    }
  }

  /**
   * 生成题目列表
   */
  private async generateQuestions(
    materialNodeIds: string[],
    questionCount: number,
    difficulty: number,
    unitIds?: string[]
  ) {
    try {
      // 题目 materialNodeId 指向 SUBJECT 节点；unitIds（UNIT 节点 id）用于进一步按单元过滤。
      // ⚠️ 现网大量题目 unitIds 为空（试卷导入未回填单元），若只按「单元 + 难度」严格过滤会返回 0 题，
      // 导致自定义任务训练题为空。因此按「精确 → 放宽」逐级降级，确保始终能出题。
      const difficultyRange = {
        gte: Math.max(1, difficulty - 1),
        lte: Math.min(5, difficulty + 1),
      };
      const reviewed = REVIEWED_QUESTION_FILTER();
      const hasUnits = Array.isArray(unitIds) && unitIds.length > 0;
      const hasNodes = Array.isArray(materialNodeIds) && materialNodeIds.length > 0;

      // 候选条件按优先级排列，命中即止
      const candidates: Array<{ label: string; where: Prisma.QuestionWhereInput }> = [];
      if (hasNodes && hasUnits) {
        candidates.push({
          label: '学科+单元+难度',
          where: {
            materialNodeId: { in: materialNodeIds },
            unitIds: { hasSome: unitIds! },
            difficulty: difficultyRange,
            ...reviewed,
          },
        });
        candidates.push({
          label: '学科+单元',
          where: {
            materialNodeId: { in: materialNodeIds },
            unitIds: { hasSome: unitIds! },
            ...reviewed,
          },
        });
      }
      if (hasNodes) {
        candidates.push({
          label: '学科+难度',
          where: {
            materialNodeId: { in: materialNodeIds },
            difficulty: difficultyRange,
            ...reviewed,
          },
        });
        candidates.push({
          label: '学科',
          where: { materialNodeId: { in: materialNodeIds }, ...reviewed },
        });
      }
      candidates.push({ label: '全库+难度', where: { difficulty: difficultyRange, ...reviewed } });
      candidates.push({ label: '全库兜底', where: { ...reviewed } });

      for (const [idx, c] of candidates.entries()) {
        const questions = await prisma.question.findMany({
          where: c.where,
          take: questionCount * 3, // 多取一些以便随机选择
        });
        if (questions.length > 0) {
          if (idx > 0) {
            logger.warn(
              `[generateQuestions] 精确条件无题，已降级至「${c.label}」取到 ${questions.length} 题` +
                `（nodes=${materialNodeIds.length}, units=${unitIds?.length ?? 0}, difficulty=${difficulty}）`
            );
          }
          const shuffled = questions.sort(() => Math.random() - 0.5);
          return shuffled.slice(0, questionCount);
        }
      }

      logger.error('[generateQuestions] 全部候选条件均无可用题目，题库可能为空');
      return [];
    } catch (error) {
      logger.error('生成题目列表失败:', error);
      throw new Error('生成题目列表失败');
    }
  }

  /**
   * 读取「水平评估」初测题目的 id 列表（用于自定义模式的 PRE_TEST 阶段）。
   * - PAPER：直接取所选「初测与水平评估」试卷的题（保序）。
   * - AI：从该学科 ASSESSMENT 分类已发布试卷中组卷（可进一步按单元收敛），打乱后取前 N 道。
   * 返回空数组表示无可用初测卷，调用方退化为教材出题。
   */
  private async loadAssessmentQuestionIds(
    assessment: { source: 'PAPER' | 'AI'; paperId?: string },
    subject?: string,
    unitIds?: string[]
  ): Promise<string[]> {
    try {
      const questionBankService = await import('./questionBankService');
      if (assessment.source === 'PAPER' && assessment.paperId) {
        const paper = await questionBankService.getPaper(assessment.paperId);
        if (!paper) {
          logger.warn('水平评估试卷不存在:', assessment.paperId);
          return [];
        }
        return paper.items.map((it: any) => it.questionId);
      }
      if (assessment.source === 'AI') {
        const papers = await prisma.questionPaper.findMany({
          where: { subject: subject || '', category: 'ASSESSMENT', status: 'PUBLISHED' },
          include: { items: true },
        });
        let ids: string[] = [];
        for (const p of papers) ids.push(...p.items.map((it: any) => it.questionId));
        if (ids.length === 0) {
          logger.warn('初测库为空，无法为学科自动组卷:', subject);
          return [];
        }
        // 若指定单元，优先保留属于这些单元的题目
        if (unitIds && unitIds.length > 0) {
          const matched = await prisma.question.findMany({
            where: { id: { in: ids }, unitIds: { hasSome: unitIds } },
            select: { id: true },
          });
          if (matched.length > 0) ids = matched.map((q: any) => q.id);
        }
        return ids.sort(() => Math.random() - 0.5).slice(0, 20);
      }
      return [];
    } catch (error) {
      logger.error('读取水平评估初测题失败（退化为教材出题）:', error);
      return [];
    }
  }

  /**
   * 获取下一道题目（支持档案提取模式的所有阶段）
   * @param sessionId 训练会话 ID
   * @param studentId 学员 ID
   * @returns 生成的题目
   */
  async getNextQuestion(sessionId: string, studentId: string, opts?: { forceNew?: boolean }) {
    try {
      // 导入 AI 题目生成服务
      const { aiQuestionGeneratorService } = await import('./aiQuestionGeneratorService');

      // 获取会话信息
      const session = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
        include: {
          task: true,
          student: {
            include: {
              studentProfile: true,
            },
          },
        },
      });

      if (!session) {
        throw new Error('训练会话不存在');
      }

      if (session.studentId !== studentId) {
        throw new Error('无权访问此会话');
      }

      // 检查是否为档案提取模式
      const taskConfig = session.task.config as any;
      if (!taskConfig.profileBased && taskConfig.mode !== 'PROFILE') {
        throw new Error('此方法仅适用于档案提取模式');
      }

      // ① 断点续答：同一「阶段 + 题序」下若已有下发过但未提交的题目快照，直接复用，
      //    既保证跨设备/刷新后看到的是同一道题，也省掉一次 20~30s 的 AI 生成。
      if (!opts?.forceNew) {
        const cached = this.readValidSnapshot(session);
        if (cached) {
          logger.info(`会话 ${sessionId} 命中断点快照（${cached.phase} 第 ${cached.questionNumber} 题），跳过重新出题`);
          return { ...cached.question, resumed: true };
        }
      }

      // 根据当前阶段生成题目
      let question: any;
      if (session.phase === 'DIAGNOSTIC_TEST') {
        question = await this.getNextDiagnosticQuestion(session, aiQuestionGeneratorService);
      } else if (session.phase === 'GUIDED_TRAINING') {
        question = await this.getNextTrainingQuestion(session, aiQuestionGeneratorService);
      } else if (session.phase === 'FINAL_EXAM') {
        throw new Error('综合考试题目需要通过 startFinalExam 方法批量生成');
      } else {
        throw new Error(`当前阶段 ${session.phase} 不支持获取题目`);
      }

      await this.saveQuestionSnapshot(session, question);
      return question;
    } catch (error) {
      logger.error('获取下一道题目失败:', error);
      throw error;
    }
  }

  /**
   * ① 断点续答：读取仍然有效的题目快照
   * 有效条件 = 阶段一致 + 题序一致（说明这道题下发后学员还没提交）
   */
  private readValidSnapshot(
    session: any
  ): { phase: string; questionNumber: number; question: any } | null {
    const snap = session.lastQuestionSnapshot as any;
    if (!snap?.question || snap.phase !== session.phase) return null;

    const expected = this.getExpectedQuestionNumber(session);
    if (expected === null || snap.questionNumber !== expected) return null;

    return { phase: snap.phase, questionNumber: snap.questionNumber, question: snap.question };
  }

  /**
   * 计算当前阶段「下一道应答的题序」（1-based）；无法判定返回 null
   */
  private getExpectedQuestionNumber(session: any): number | null {
    if (session.phase === 'DIAGNOSTIC_TEST') {
      const d = session.diagnosticTestData as any;
      if (!d) return null;
      return (d.currentQuestion ?? 0) + 1;
    }
    if (session.phase === 'GUIDED_TRAINING') {
      const p = session.trainingProgress as any;
      const stage = p?.stages?.[p?.currentStage];
      if (!stage) return null;
      return (stage.completedQuestions ?? 0) + 1;
    }
    return null;
  }

  /**
   * ① 断点续答：题目下发后写入快照（失败不阻断出题）
   */
  private async saveQuestionSnapshot(session: any, question: any): Promise<void> {
    try {
      const expected = this.getExpectedQuestionNumber(session);
      if (expected === null || !question) return;
      await prisma.trainingSession.update({
        where: { id: session.id },
        data: {
          lastQuestionSnapshot: {
            phase: session.phase,
            questionNumber: expected,
            totalQuestions: question.totalQuestions ?? null,
            stage: (session.trainingProgress as any)?.currentStage ?? null,
            question,
            issuedAt: new Date().toISOString(),
          } as any,
        },
      });
    } catch (error) {
      logger.warn(`会话 ${session.id} 写入题目快照失败（不影响答题）:`, error as any);
    }
  }

  /**
   * ① 断点续答：提交作答后清除快照，避免续答时拿到已答过的题
   */
  private async clearQuestionSnapshot(sessionId: string): Promise<void> {
    try {
      await prisma.trainingSession.update({
        where: { id: sessionId },
        data: { lastQuestionSnapshot: Prisma.DbNull },
      });
    } catch (error) {
      logger.warn(`会话 ${sessionId} 清除题目快照失败:`, error as any);
    }
  }

  /**
   * ① 断点续答统一入口：GET /training/resume/:sessionId
   * 前端进入训练舱先调这里，由后端决定「接着答哪一道」，而不是无脑 loadNextQuestion。
   */
  async resumeSession(sessionId: string, studentId: string) {
    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: {
        task: true,
        student: { include: { studentProfile: true } },
      },
    });

    if (!session) throw new Error('训练会话不存在');
    if (session.studentId !== studentId) throw new Error('无权访问此会话');

    const base = {
      sessionId: session.id,
      phase: session.phase,
      status: session.status,
      progress: session.progress,
      currentStage: (session.trainingProgress as any)?.currentStage ?? null,
    };

    // 只有诊断 / 引导训练两个阶段是「单题下发」，其他阶段交给对应页面
    if (session.phase !== 'DIAGNOSTIC_TEST' && session.phase !== 'GUIDED_TRAINING') {
      return { ...base, resumable: false, question: null, reason: `当前阶段 ${session.phase} 无单题续答` };
    }

    const expected = this.getExpectedQuestionNumber(session);
    const cached = this.readValidSnapshot(session);

    if (cached) {
      return {
        ...base,
        resumable: true,
        fromSnapshot: true,
        questionNumber: cached.questionNumber,
        question: { ...cached.question, resumed: true },
      };
    }

    // 无有效快照 → 现出一道并落快照
    const question = await this.getNextQuestion(sessionId, studentId, { forceNew: true });
    return {
      ...base,
      resumable: true,
      fromSnapshot: false,
      questionNumber: expected,
      question,
    };
  }

  /**
   * 获取下一道诊断测试题目
   */
  private async getNextDiagnosticQuestion(session: any, aiService: any) {
    const diagnosticData = session.diagnosticTestData as any;
    
    if (!diagnosticData) {
      throw new Error('诊断测试数据未初始化');
    }

    const questionNumber = diagnosticData.currentQuestion + 1;
    const totalQuestions = diagnosticData.totalQuestions;

    // 检查是否已完成所有题目
    if (questionNumber > totalQuestions) {
      throw new Error('已完成所有诊断题目');
    }

    // P2 题库化初测：任务发布时已从题库预抽题目，优先从题集出题
    const taskConfigForBank = session.task.config as any;
    const bankQuestionIds: string[] | undefined = taskConfigForBank?.initialTest?.questionIds;
    if (Array.isArray(bankQuestionIds) && bankQuestionIds.length > 0) {
      return await this.getBankDiagnosticQuestion(session, bankQuestionIds, questionNumber, totalQuestions);
    }

    // ③ 改进：存量任务（无预抽题集）也优先用题库真题，避免每题都等 AI 生成（本地模型 20~33s/题）。
    //    仅当题库确实无可用题时才走 AI 生成路径。
    const usedIds = this.getUsedQuestionIds(session);
    const bankFirst = await this.getFallbackBankQuestion(
      session,
      questionNumber,
      totalQuestions,
      usedIds
    );
    if (bankFirst) {
      logger.info(
        `会话 ${session.id} 第 ${questionNumber}/${totalQuestions} 道诊断题优先取自题库（免 AI 生成）`
      );
      return bankFirst;
    }

    // ---- 以下为题库无覆盖时的 AI 生成兜底路径 ----
    logger.info(`为会话 ${session.id} 生成第 ${questionNumber}/${totalQuestions} 道诊断题目（AI 兜底）`);

    // 获取学员档案
    const profile = session.student?.studentProfile;
    
    // 详细的错误检查和日志
    if (!session.student) {
      logger.error(`会话 ${session.id} 没有关联学员用户`);
      throw new Error('训练会话没有关联学员用户');
    }
    
    if (!profile) {
      logger.error(`学员 ${session.studentId} 没有学员档案，请先完善学员信息`);
      throw new Error('学员档案不存在，请先在个人中心完善学员信息');
    }

    if (!profile.grade) {
      logger.error(`学员 ${session.studentId} 的档案缺少年级信息`);
      throw new Error('学员档案缺少年级信息，请先完善学员信息');
    }

    // 获取任务配置
    const taskConfig = session.task.config as any;

    // 构建诊断测试上下文（与 aiPromptBuilder.DiagnosticContext 保持一致：studentProfile 嵌套）
    const context = {
      studentProfile: {
        grade: profile.grade,
        materialVersion: profile.materialVersion || '人教版',
        learningFoundation: profile.learningFoundation || '未知',
      },
      trainingGoal: taskConfig.trainingGoal || '提升学习能力',
      totalQuestions: totalQuestions,
      questionNumber: questionNumber,
    };

    // 调用 AI 生成题目；失败则降级到题库真题，避免整个训练舱 500 卡死
    try {
      const question = await aiService.generateDiagnosticQuestion(context, questionNumber);
      logger.info(`成功生成第 ${questionNumber} 道诊断题目，知识点：${question.knowledgePoint}`);
      return question;
    } catch (error: any) {
      logger.warn(
        `AI 生成第 ${questionNumber} 道诊断题失败（${error?.message || error}），尝试题库兜底`
      );
      const fallback = await this.getFallbackBankQuestion(
        session,
        questionNumber,
        totalQuestions,
        this.getUsedQuestionIds(session)
      );
      if (fallback) return fallback;
      throw error; // 题库也无可用题，才向上抛
    }
  }

  /**
   * 收集本会话已出过的题库题 ID（诊断 + 引导训练），用于题库取题去重，
   * 避免同一会话反复出到同一道题。
   */
  private getUsedQuestionIds(session: any): string[] {
    const ids = new Set<string>();
    const collect = (answers: any) => {
      if (!Array.isArray(answers)) return;
      for (const a of answers) {
        const qid = a?.question?.id ?? a?.questionId;
        if (typeof qid === 'string' && qid) ids.add(qid);
      }
    };
    collect((session.diagnosticTestData as any)?.answers);
    collect((session.trainingProgress as any)?.answers);
    collect((session.finalExamData as any)?.answers);
    return Array.from(ids);
  }

  /**
   * 从预抽题库题集中取诊断题目（P2 题库化初测）
   * 将 Question 记录转换为诊断题目结构（与 AI 生成题目结构保持一致）
   */
  private async getBankDiagnosticQuestion(
    session: any,
    questionIds: string[],
    questionNumber: number,
    totalQuestions: number
  ) {
    const qid = questionIds[questionNumber - 1];
    if (!qid) {
      throw new Error(`预抽题集中不存在第 ${questionNumber} 题（共 ${questionIds.length} 题）`);
    }

    const q = await prisma.question.findUnique({
      where: { id: qid },
      include: { materialNode: { select: { name: true } } },
    });
    if (!q) {
      throw new Error(`题库题目 ${qid} 不存在（可能已被删除），请联系家长重新发布任务`);
    }

    logger.info(`会话 ${session.id} 第 ${questionNumber}/${totalQuestions} 道诊断题目取自题库: ${qid}`);
    return this.toDiagnosticShape(q, questionNumber, totalQuestions);
  }

  /**
   * 题库 Question → 诊断题目结构（与 AI 生成题目结构保持一致）
   */
  private toDiagnosticShape(q: any, questionNumber: number, totalQuestions: number) {
    const content = (q.content ?? {}) as { stem?: string; options?: string[] };
    const answerConfig = (q.answerConfig ?? {}) as {
      options?: string[];
      correctAnswer?: string;
      explanation?: string;
    };
    const options = content.options ?? answerConfig.options ?? [];

    // 题型映射：题库 QuestionType → 诊断题目 type
    const typeMap: Record<string, string> = {
      CHOICE: 'single_choice',
      FILL: 'fill_blank',
      JUDGE: 'judge',
      ESSAY: 'short_answer',
      CALC: 'calculation',
      COMPREHENSIVE: 'comprehensive',
    };

    return {
      id: q.id,
      fromBank: true,
      stem: content.stem ?? '',
      options,
      correctAnswer: answerConfig.correctAnswer ?? q.answer,
      explanation: answerConfig.explanation ?? '',
      knowledgePoint: q.knowledgePoints?.[0] ?? '',
      knowledgePoints: q.knowledgePoints ?? [],
      difficulty: q.difficulty,
      type: typeMap[q.type] ?? 'single_choice',
      subject: q.materialNode?.name,
      questionNumber,
      totalQuestions,
    };
  }

  /**
   * AI 出题失败时的题库兜底：本地模型不稳定（截断/超时/格式漂移）时
   * 不能让整个训练舱 500 卡死，退化为「用题库真题继续训练」。
   * 匹配优先级：同学科+同年级 → 同学科 → 全库随机。
   */
  private async getFallbackBankQuestion(
    session: any,
    questionNumber: number,
    totalQuestions: number,
    excludeIds: string[] = []
  ) {
    try {
      const subject = await this.getSessionSubject(session);
      const grade = session.student?.studentProfile?.grade;
      const notUsed = excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {};
      // ④ 待审核 / 已驳回的 AI 生成题不得作为正式题库题下发
      const reviewOk = REVIEWED_QUESTION_FILTER();

      const candidates: any[] = [];
      if (subject && subject !== '通用') {
        if (grade) candidates.push({ materialNode: { name: subject }, grade });
        candidates.push({ materialNode: { name: subject } });
      }
      if (grade) candidates.push({ grade });
      candidates.push({});

      // 先带去重条件跑一遍；全部落空再放开去重（题库存量不足时优先「有题」而非「不重复」）
      for (const dedup of [notUsed, {}]) {
        for (const base of candidates) {
          const where = { ...base, ...dedup, ...reviewOk };
          const count = await prisma.question.count({ where });
          if (!count) continue;
          const q = await prisma.question.findFirst({
            where,
            skip: Math.floor(Math.random() * count),
            include: { materialNode: { select: { name: true } } },
          });
          if (!q) continue;
          logger.info(
            `会话 ${session.id} 第 ${questionNumber} 题取自题库真题 ${q.id}（条件: ${JSON.stringify(base)}）`
          );
          return this.toDiagnosticShape(q, questionNumber, totalQuestions);
        }
        if (excludeIds.length === 0) break; // 没有去重条件时无需第二轮
      }
      return null;
    } catch (error) {
      logger.error('题库兜底取题失败:', error);
      return null;
    }
  }

  /**
   * ③ 引导训练题库优先取题（与诊断一致，但多一层知识点/难度匹配）：
   * 优先用题库真题覆盖当前阶段的 focus 知识点与全局 weakPoints，命中即下发；
   * 同知识点池内再优先匹配目标难度。仅当全库（146 题）在排除已做题后都无可下发题时
   * 才返回 null，由调用方回退到 AI 生成路径。
   *
   * 候选池按「特异性」升级（与 getFallbackBankQuestion 一致）：
   *   学科+年级 → 学科 → 年级 → 全库
   * 这样即使任务未配置 materialNodeIds（subject='通用'）或年级与题库不完全对齐，
   * 也能退到更宽的池拿到题，避免每题 20~47s 的 AI 等待。学科匹配优先于知识点命中，
   * 保证不会拿错学科的题（除非任务本身就没配学科）。
   */
  private async getBankTrainingQuestion(
    session: any,
    currentStage: string,
    questionNumber: number,
    totalQuestions: number,
    targetDifficulty: string,
    excludeIds: string[]
  ): Promise<any | null> {
    try {
      const subject = await this.getSessionSubject(session);
      const grade = session.student?.studentProfile?.grade;
      const trainingPlan = session.trainingPlanData as any;
      const stageFocus: string[] = trainingPlan?.stages?.[currentStage]?.focus ?? [];
      const weakPoints: string[] = (session.trainingProgress as any)?.weakPoints ?? [];
      const targetPoints = Array.from(new Set([...stageFocus, ...weakPoints].filter(Boolean)));
      const reviewOk = REVIEWED_QUESTION_FILTER();

      // 候选池：特异性从高到低
      const pools: any[] = [];
      if (subject && subject !== '通用') {
        if (grade) pools.push({ materialNode: { name: subject }, grade });
        pools.push({ materialNode: { name: subject } });
      }
      if (grade) pools.push({ grade });
      pools.push({}); // 全库兜底

      const norm = (s: any) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

      // 目标难度 → 题库 difficulty(1-5) 区间
      const diffRange: number[] =
        targetDifficulty === 'easy' ? [1, 2] :
        targetDifficulty === 'hard' ? [4, 5] :
        targetDifficulty === 'medium' ? [3] : [];
      const inDiff = (q: any) => diffRange.length > 0 && diffRange.includes(Number(q.difficulty));

      const pick = (pool: any[]): any | null => {
        if (pool.length === 0) return null;
        const byDiff = diffRange.length > 0 ? pool.filter(inDiff) : [];
        const src = byDiff.length > 0 ? byDiff : pool; // 难度细分落空则退回该池任意题
        return src[Math.floor(Math.random() * src.length)];
      };

      let best: any[] | null = null; // 知识点命中的最优池（优先更具体的池）
      let anyPool: any[] | null = null; // 任意可用题库题（兜底）

      // 知识点命中：双向子串（AI 计划 focus 形如「两步混合运算应用题的基本题型分析」，
      // 题库 KP 为「两步混合运算应用题」，精确相等匹配不上，子串匹配能命中）。
      const kpHit = (bankKp: string, target: string): boolean => {
        const a = norm(bankKp);
        const b = norm(target);
        return a !== '' && (a === b || a.includes(b) || b.includes(a));
      };

      for (const base of pools) {
        const where: any = { ...base, ...reviewOk };
        if (excludeIds.length) where.id = { notIn: excludeIds };
        const count = await prisma.question.count({ where });
        if (!count) continue;
        const list = await prisma.question.findMany({
          where,
          include: { materialNode: { select: { name: true } } },
          take: 300,
        });
        const matched = list.filter(
          (q) =>
            Array.isArray(q.knowledgePoints) &&
            q.knowledgePoints.some((p: string) => targetPoints.some((t) => kpHit(p, t)))
        );
        if (matched.length > 0 && !best) best = matched; // 首个（最具体）命中的池
        if (!anyPool) anyPool = list;
        if (best) break; // 已找到最具体池的知识点命中，停止升级
      }

      const pool = best ?? anyPool;
      if (!pool || pool.length === 0) return null;

      const chosen = pick(pool);
      if (!chosen) return null;

      logger.info(
        `会话 ${session.id} ${currentStage} 第 ${questionNumber}/${totalQuestions} 题优先取自题库` +
          `（知识点命中=${best ? 'Y' : 'N'}，目标难度=${targetDifficulty}）`
      );
      return this.toDiagnosticShape(chosen, questionNumber, totalQuestions);
    } catch (error) {
      logger.error('引导训练题库优先取题失败:', error);
      return null;
    }
  }

  /**
   * 综合考试的「批量」题库兜底。
   * 单题兜底 getFallbackBankQuestion 一次只出一道，综合考试要一次拿 N 道，
   * 逐题调用会产生 N 轮 count+findFirst 往返，所以这里按候选条件批量取。
   * 触发场景：AI 批量出题整体失败，或出题数量不足计划题量。
   */
  private async getFallbackExamQuestions(
    session: any,
    need: number,
    excludeIds: string[] = []
  ): Promise<any[]> {
    if (need <= 0) return [];
    try {
      const subject = await this.getSessionSubject(session);
      const grade = session.student?.studentProfile?.grade;
      // ④ 待审核 / 已驳回的 AI 生成题不得进正式考卷
      const reviewOk = REVIEWED_QUESTION_FILTER();
      const exclude = new Set<string>(excludeIds);

      const candidates: any[] = [];
      if (subject && subject !== '通用') {
        if (grade) candidates.push({ materialNode: { name: subject }, grade });
        candidates.push({ materialNode: { name: subject } });
      }
      if (grade) candidates.push({ grade });
      candidates.push({});

      const picked: any[] = [];
      for (const base of candidates) {
        if (picked.length >= need) break;
        const where: any = { ...base, ...reviewOk };
        if (exclude.size > 0) where.id = { notIn: Array.from(exclude) };

        const count = await prisma.question.count({ where });
        if (!count) continue;

        const take = Math.min(need - picked.length, count);
        // 随机窗口，避免每次考试都拿到题库最前面的同一批题
        const skip = Math.floor(Math.random() * Math.max(1, count - take + 1));
        const rows = await prisma.question.findMany({
          where,
          skip,
          take,
          include: { materialNode: { select: { name: true } } },
        });

        for (const q of rows) {
          if (exclude.has(q.id)) continue;
          exclude.add(q.id);
          picked.push(this.toDiagnosticShape(q, picked.length + 1, need));
        }
      }

      if (picked.length > 0) {
        logger.info(
          `会话 ${session.id} 综合考试题库兜底取到 ${picked.length}/${need} 道题`
        );
      }
      return picked;
    } catch (error) {
      logger.error('综合考试题库批量兜底失败:', error);
      return [];
    }
  }

  /**
   * 获取下一道训练题目
   */
  private async getNextTrainingQuestion(session: any, aiService: any) {
    const trainingProgress = session.trainingProgress as any;
    
    if (!trainingProgress) {
      throw new Error('训练进度数据未初始化');
    }

    const trainingPlan = session.trainingPlanData as any;
    if (!trainingPlan) {
      throw new Error('训练计划未生成');
    }

    // 确定当前训练阶段
    const currentStage = trainingProgress.currentStage;
    const stageData = trainingProgress.stages[currentStage];

    if (!stageData) {
      throw new Error(`训练阶段 ${currentStage} 数据不存在`);
    }

    const questionNumber = stageData.currentQuestion + 1;
    const totalQuestions = stageData.totalQuestions;

    // 检查是否已完成当前阶段
    if (questionNumber > totalQuestions) {
      throw new Error(`当前阶段 ${currentStage} 已完成所有题目`);
    }

    logger.info(`为会话 ${session.id} 生成 ${currentStage} 阶段第 ${questionNumber}/${totalQuestions} 道题目`);

    // 获取学员档案
    const profile = session.student?.studentProfile;
    
    if (!session.student) {
      logger.error(`会话 ${session.id} 没有关联学员用户`);
      throw new Error('训练会话没有关联学员用户');
    }
    
    if (!profile) {
      logger.error(`学员 ${session.studentId} 没有学员档案`);
      throw new Error('学员档案不存在，请先在个人中心完善学员信息');
    }

    if (!profile.grade) {
      logger.error(`学员 ${session.studentId} 的档案缺少年级信息`);
      throw new Error('学员档案缺少年级信息，请先完善学员信息');
    }
    
    const taskConfig = session.task.config as any;

    // IRT 自适应难度：读取/初始化能力估计，推荐目标难度
    const { irtService } = await import('./irtService');
    const diagnosticAccuracy = this.getDiagnosticAccuracy(session);
    const irtState = irtService.ensureState(trainingProgress.irt, diagnosticAccuracy);
    const targetDifficulty = irtService.recommendDifficulty(irtState.theta);

    // 若为首次初始化，持久化 IRT 状态
    if (!trainingProgress.irt) {
      trainingProgress.irt = irtState;
      await prisma.trainingSession.update({
        where: { id: session.id },
        data: { trainingProgress },
      });
    }

    logger.info(
      `IRT 自适应：会话 ${session.id} theta=${irtState.theta}，推荐难度=${targetDifficulty}`
    );

    // 知识点下钻溯源（Breakdown Trace）：检测连错 ≥2 次的知识点
    let breakdownTrace: { strugglingPoint: string; consecutiveErrors: number } | undefined;
    const kpErrors: Record<string, number> = trainingProgress.knowledgePointErrors || {};
    const strugglingEntry = Object.entries(kpErrors)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])[0];

    if (strugglingEntry) {
      breakdownTrace = {
        strugglingPoint: strugglingEntry[0],
        consecutiveErrors: strugglingEntry[1],
      };
      // 触发后清零计数，避免连续多题都在溯源同一知识点；
      // 若前置微测题再答错，会以前置知识点为新目标重新累计，形成逐层下钻
      trainingProgress.knowledgePointErrors[strugglingEntry[0]] = 0;
      if (!trainingProgress.breakdownHistory) {
        trainingProgress.breakdownHistory = [];
      }
      trainingProgress.breakdownHistory.push({
        strugglingPoint: strugglingEntry[0],
        triggeredAt: new Date().toISOString(),
        stage: currentStage,
        questionNumber,
      });
      await prisma.trainingSession.update({
        where: { id: session.id },
        data: { trainingProgress },
      });
      logger.info(
        `溯源诊断触发：会话 ${session.id} 知识点「${strugglingEntry[0]}」连错 ${strugglingEntry[1]} 次，下钻前置知识点微测`
      );
    }

    // ③ 引导训练同样优先用题库真题：命中当前阶段 focus 知识点 / 全局薄弱点即下发，
    //    仅当题库无覆盖时才回到 AI 生成（本地模型单题 20~47s，逐题等会拖垮体验）。
    //    溯源模式下强制 easy 难度（前置基础微测）。
    const effectiveDifficulty: string = breakdownTrace ? 'easy' : (targetDifficulty as string);
    const bankFirst = await this.getBankTrainingQuestion(
      session,
      currentStage,
      questionNumber,
      totalQuestions,
      effectiveDifficulty,
      this.getUsedQuestionIds(session)
    );
    if (bankFirst) {
      return bankFirst;
    }

    // 构建训练上下文（buildTrainingQuestionPrompt 需要嵌套的 studentProfile 结构）
    const context = {
      studentProfile: {
        grade: profile.grade,
        materialVersion: profile.materialVersion || '人教版',
        learningFoundation: profile.learningFoundation || '中等',
      },
      trainingGoal: taskConfig.trainingGoal || '提升学习能力',
      stage: currentStage,
      stageGoal: trainingPlan.stages[currentStage].goal,
      questionNumber: questionNumber,
      totalQuestions: totalQuestions,
      masteredPoints: trainingProgress.masteredPoints || [],
      weakPoints: trainingProgress.weakPoints || [],
      // 溯源模式下强制 easy 难度（前置基础微测）
      targetDifficulty: breakdownTrace ? ('easy' as const) : targetDifficulty,
      breakdownTrace,
    };

    // 调用 AI 生成题目；失败时降级为题库真题，避免引导训练阶段整体 500
    let question: any;
    try {
      question = await aiService.generateTrainingQuestion(currentStage, context, questionNumber);
    } catch (aiError: any) {
      logger.warn(
        `会话 ${session.id} ${currentStage} 阶段第 ${questionNumber} 题 AI 出题失败，尝试题库兜底: ${aiError?.message || aiError}`
      );
      const fallback = await this.getFallbackBankQuestion(session, questionNumber, totalQuestions);
      if (!fallback) {
        throw aiError; // 题库也没题才真正失败
      }
      return fallback;
    }

    logger.info(
      `成功生成 ${currentStage} 阶段第 ${questionNumber} 道题目（目标难度 ${breakdownTrace ? 'easy·溯源' : targetDifficulty}）`
    );

    return question;
  }

  /**
   * 从诊断测试数据中计算正确率（用于 IRT 初始化）
   */
  private getDiagnosticAccuracy(session: any): number | undefined {
    const diagnosticData = session.diagnosticTestData as any;
    if (!diagnosticData?.answers || !Array.isArray(diagnosticData.answers) || diagnosticData.answers.length === 0) {
      return undefined;
    }
    const correct = diagnosticData.answers.filter((a: any) => a.isCorrect).length;
    return correct / diagnosticData.answers.length;
  }

  /**
   * 生成训练计划（在诊断测试完成后调用）
   */
  async generateTrainingPlan(sessionId: string, studentId: string) {
    try {
      // 获取会话信息
      const session = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
        include: {
          task: true,
          student: {
            include: {
              studentProfile: true,
            },
          },
        },
      });

      if (!session) {
        throw new Error('训练会话不存在');
      }

      if (session.studentId !== studentId) {
        throw new Error('无权访问此会话');
      }

      if (session.phase !== 'PLANNING') {
        throw new Error('当前阶段不是规划阶段');
      }

      const diagnosticData = session.diagnosticTestData as any;
      if (!diagnosticData || !diagnosticData.answers || diagnosticData.answers.length === 0) {
        throw new Error('诊断测试数据不完整');
      }

      logger.info(`开始为会话 ${sessionId} 生成训练计划`);

      // 导入 AI 服务
      const { aiQuestionGeneratorService } = await import('./aiQuestionGeneratorService');

      // 分析诊断结果
      const diagnosticResults = this.analyzeDiagnosticResults(diagnosticData);

      // 获取学员档案和任务配置
      const profile = session.student.studentProfile;
      if (!profile) {
        throw new Error('学员档案不存在');
      }
      
      const taskConfig = session.task.config as any;
      const trainingGoal = taskConfig?.trainingGoal || '提升学习能力';
      const profileInfo = {
        grade: profile.grade,
        materialVersion: profile.materialVersion,
        learningFoundation: profile.learningFoundation || '未知',
      };

      // 【遗留⑤ 计划秒出】本地 AI 生成计划要 40s~3min，学员干等体验极差。
      // 策略：先落一份规则计划（毫秒级）让学员马上能看到并开始，AI 结果后到再升级替换。
      const provisionalPlan: any = this.buildFallbackTrainingPlan(
        diagnosticResults,
        profileInfo,
        trainingGoal
      );
      provisionalPlan.generatedBy = 'fallback';
      provisionalPlan.provisional = true; // 前端据此显示「AI 正在优化中」
      provisionalPlan.generatedAt = new Date().toISOString();

      await prisma.trainingSession.update({
        where: { id: sessionId },
        data: { trainingPlanData: provisionalPlan as any },
      });
      logger.info(`会话 ${sessionId} 已落快速版训练计划，AI 优化版生成中…`);

      // 调用 AI 生成训练计划；AI 不可用/超时/结构不合法时保留快速版，
      // 绝不让会话停留在 trainingPlanData=null 的死锁状态。
      let trainingPlan: any = provisionalPlan;
      let planSource: 'ai' | 'fallback' = 'fallback';
      try {
        const aiPlan: any = await aiQuestionGeneratorService.generateTrainingPlan(
          diagnosticResults,
          profileInfo,
          trainingGoal
        );
        aiPlan.generatedBy = 'ai';
        aiPlan.provisional = false;
        aiPlan.generatedAt = new Date().toISOString();

        // 学员可能在 AI 返回前就已确认快速版并开始训练（trainingProgress 已按快速版初始化）。
        // 此时替换计划会让阶段题量对不上，所以仅在仍处于 PLANNING 时才升级。
        const fresh = await prisma.trainingSession.findUnique({
          where: { id: sessionId },
          select: { phase: true },
        });
        if (fresh?.phase === 'PLANNING') {
          await prisma.trainingSession.update({
            where: { id: sessionId },
            data: { trainingPlanData: aiPlan as any },
          });
          trainingPlan = aiPlan;
          planSource = 'ai';
          logger.info(`会话 ${sessionId} 训练计划已升级为 AI 版`);
        } else {
          logger.info(
            `会话 ${sessionId} 已进入 ${fresh?.phase}，保留快速版计划不做替换（避免阶段题量漂移）`
          );
        }
      } catch (aiError: any) {
        logger.warn(
          `会话 ${sessionId} AI 训练计划生成失败，保留规则计划: ${aiError?.message || aiError}`
        );
      }

      logger.info(
        `训练计划就绪（${planSource}），包含 ${trainingPlan.stages ? Object.keys(trainingPlan.stages).length : 0} 个训练阶段`
      );

      return trainingPlan;
    } catch (error) {
      logger.error('生成训练计划失败:', error);
      throw error;
    }
  }

  /**
   * 确保训练计划存在（幂等 + 并发安全）
   *
   * 诊断测试结束后由 submitDiagnosticAnswer 主动触发；
   * getSession 也会做一次自愈补偿，兜住历史卡在 PLANNING 的会话。
   * 内部吞掉全部异常，绝不阻断调用方主流程。
   */
  async ensureTrainingPlan(sessionId: string, studentId: string): Promise<void> {
    if (this.planGeneratingSessions.has(sessionId)) {
      return; // 已有生成任务在跑
    }
    this.planGeneratingSessions.add(sessionId);
    try {
      const fresh = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
        select: { phase: true, trainingPlanData: true, studentId: true },
      });
      if (!fresh || fresh.studentId !== studentId) return;
      if (fresh.phase !== 'PLANNING') return;
      if (fresh.trainingPlanData) return; // 已有计划

      await this.generateTrainingPlan(sessionId, studentId);
    } catch (error: any) {
      logger.error(`会话 ${sessionId} 训练计划生成兜底失败:`, error?.message || error);
      // 最后一道防线：即使 generateTrainingPlan 整体抛错，也写入规则计划避免死锁
      try {
        const s = await prisma.trainingSession.findUnique({
          where: { id: sessionId },
          include: { task: true, student: { include: { studentProfile: true } } },
        });
        if (s && s.phase === 'PLANNING' && !s.trainingPlanData) {
          const diagnosticData = s.diagnosticTestData as any;
          const results = diagnosticData?.answers?.length
            ? this.analyzeDiagnosticResults(diagnosticData)
            : { accuracy: 60, weakPoints: [], knowledgePointAnalysis: [] };
          const plan: any = this.buildFallbackTrainingPlan(
            results,
            {
              grade: s.student.studentProfile?.grade || '未知',
              materialVersion: s.student.studentProfile?.materialVersion || '未知',
              learningFoundation: s.student.studentProfile?.learningFoundation || '未知',
            },
            (s.task.config as any)?.trainingGoal || '提升学习能力'
          );
          plan.generatedBy = 'fallback';
          plan.generatedAt = new Date().toISOString();
          await prisma.trainingSession.update({
            where: { id: sessionId },
            data: { trainingPlanData: plan },
          });
          logger.info(`会话 ${sessionId} 已写入规则兜底训练计划`);
        }
      } catch (e: any) {
        logger.error(`会话 ${sessionId} 写入兜底训练计划仍失败:`, e?.message || e);
      }
    } finally {
      this.planGeneratingSessions.delete(sessionId);
    }
  }

  /**
   * 规则版训练计划（AI 不可用时的降级方案）
   *
   * 严格对齐 TrainingPlanSchema 的校验规则：
   * subGoals 3~5 条、knowledgePoints 5~10 条、
   * foundation 10~20 题 / improvement 15~25 题 / application 10~15 题、
   * finalExam 20~50 题且难度分布合计 100%。
   */
  private buildFallbackTrainingPlan(
    diagnosticResults: any,
    profile: { grade: string; materialVersion: string; learningFoundation: string },
    trainingGoal: string
  ): any {
    const accuracy: number = Number(diagnosticResults?.accuracy ?? 60);
    const weakPoints: string[] = Array.isArray(diagnosticResults?.weakPoints)
      ? diagnosticResults.weakPoints.filter(Boolean)
      : [];
    const kpAnalysis: any[] = Array.isArray(diagnosticResults?.knowledgePointAnalysis)
      ? diagnosticResults.knowledgePointAnalysis
      : [];

    // 依据诊断正确率决定强度档位
    const level: 'low' | 'mid' | 'high' =
      accuracy < 50 ? 'low' : accuracy < 80 ? 'mid' : 'high';
    const counts = {
      low: { foundation: 18, improvement: 22, application: 10, exam: 25 },
      mid: { foundation: 14, improvement: 20, application: 12, exam: 30 },
      high: { foundation: 10, improvement: 16, application: 15, exam: 30 },
    }[level];
    const difficultyDistribution = {
      low: { easy: 50, medium: 40, hard: 10 },
      mid: { easy: 35, medium: 45, hard: 20 },
      high: { easy: 20, medium: 50, hard: 30 },
    }[level];
    const passingScore = level === 'low' ? 60 : level === 'mid' ? 70 : 80;

    // 知识点清单：诊断覆盖到的优先，不足 5 条时用通用条目补齐
    const knowledgePoints: any[] = [];
    const sorted = [...kpAnalysis].sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0));
    sorted.slice(0, 10).forEach((kp, idx) => {
      const acc = Number(kp.accuracy ?? 0);
      knowledgePoints.push({
        point: String(kp.point || `知识点${idx + 1}`),
        masteryLevel: acc < 60 ? 'weak' : acc < 85 ? 'medium' : 'strong',
        priority: idx + 1,
      });
    });
    const genericPoints = [
      '基础概念理解',
      '核心公式与定义运用',
      '典型题型解题步骤',
      '易错点辨析',
      '综合应用与迁移',
      '审题与规范表达',
    ];
    let gi = 0;
    while (knowledgePoints.length < 5 && gi < genericPoints.length) {
      const p = genericPoints[gi++];
      if (!knowledgePoints.some((k) => k.point === p)) {
        knowledgePoints.push({
          point: p,
          masteryLevel: level === 'low' ? 'weak' : 'medium',
          priority: knowledgePoints.length + 1,
        });
      }
    }

    const weakDesc = weakPoints.length > 0 ? weakPoints.slice(0, 3).join('、') : '诊断中暴露的薄弱环节';
    const focusBase = weakPoints.length > 0 ? weakPoints.slice(0, 3) : knowledgePoints.slice(0, 3).map((k) => k.point);

    return {
      learningGoals: {
        main: `${trainingGoal}：围绕「${weakDesc}」完成基础巩固 → 能力提升 → 综合应用的三阶训练`,
        subGoals: [
          `夯实${profile.grade}阶段核心基础，把诊断正确率从 ${Math.round(accuracy)}% 提升到 ${Math.min(95, Math.round(accuracy) + 20)}% 以上`,
          `重点突破：${weakDesc}`,
          '掌握典型题型的标准解题步骤，减少非知识性失分',
          '形成稳定的审题与检查习惯，提升答题规范度',
        ],
      },
      knowledgePoints,
      stages: {
        foundation: {
          name: '基础巩固',
          goal: `补齐${weakDesc}的知识缺口，确保基础题不失分`,
          focus: focusBase,
          questionCount: counts.foundation,
          estimatedTime: counts.foundation * 3,
          criteria: ['基础题正确率达到 80% 以上', '能独立复述核心概念与公式'],
        },
        improvement: {
          name: '能力提升',
          goal: '在基础掌握之上，提升中等难度题目的解题速度与准确率',
          focus: focusBase,
          questionCount: counts.improvement,
          estimatedTime: counts.improvement * 4,
          criteria: ['中等难度题正确率达到 70% 以上', '单题平均用时低于 4 分钟'],
        },
        application: {
          name: '综合应用',
          goal: '训练综合题、跨知识点题的分析与迁移能力',
          focus: [...focusBase, '综合应用与迁移'],
          questionCount: counts.application,
          estimatedTime: counts.application * 6,
          criteria: ['综合题正确率达到 60% 以上', '能写出完整解题思路'],
        },
      },
      finalExam: {
        questionCount: counts.exam,
        timeLimit: 60,
        passingScore,
        difficultyDistribution,
      },
      estimatedDuration:
        counts.foundation * 3 + counts.improvement * 4 + counts.application * 6 + 60,
    };
  }

  /**
   * 分析诊断测试结果
   */
  private analyzeDiagnosticResults(diagnosticData: any): any {
    const answers = diagnosticData.answers;
    const totalQuestions = answers.length;
    const correctCount = answers.filter((a: any) => a.isCorrect).length;
    const accuracy = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

    // 按知识点统计
    const knowledgePointMap = new Map<string, { total: number; correct: number }>();
    answers.forEach((answer: any) => {
      const kp = answer.knowledgePoint;
      if (!knowledgePointMap.has(kp)) {
        knowledgePointMap.set(kp, { total: 0, correct: 0 });
      }
      const stat = knowledgePointMap.get(kp)!;
      stat.total += 1;
      if (answer.isCorrect) {
        stat.correct += 1;
      }
    });

    // 识别薄弱知识点（正确率 < 60%）
    const weakPoints: string[] = [];
    const knowledgePointAnalysis: any[] = [];
    
    knowledgePointMap.forEach((stat, kp) => {
      const kpAccuracy = (stat.correct / stat.total) * 100;
      knowledgePointAnalysis.push({
        point: kp,
        totalQuestions: stat.total,
        correctCount: stat.correct,
        accuracy: kpAccuracy,
      });
      
      if (kpAccuracy < 60) {
        weakPoints.push(kp);
      }
    });

    // 按难度统计
    const difficultyMap = new Map<string, { total: number; correct: number }>();
    answers.forEach((answer: any) => {
      const diff = answer.difficulty || 'medium';
      if (!difficultyMap.has(diff)) {
        difficultyMap.set(diff, { total: 0, correct: 0 });
      }
      const stat = difficultyMap.get(diff)!;
      stat.total += 1;
      if (answer.isCorrect) {
        stat.correct += 1;
      }
    });

    const difficultyAnalysis: any = {};
    difficultyMap.forEach((stat, diff) => {
      difficultyAnalysis[diff] = {
        total: stat.total,
        correct: stat.correct,
      };
    });

    // 计算平均用时
    const totalTime = answers.reduce((sum: number, a: any) => sum + (a.timeSpent || 0), 0);
    const avgTimePerQuestion = totalQuestions > 0 ? totalTime / totalQuestions : 0;

    return {
      totalQuestions,
      correctCount,
      accuracy,
      knowledgePointAnalysis,
      difficultyAnalysis,
      weakPoints,
      learningStyle: {
        averageTimePerQuestion: avgTimePerQuestion,
        errorPatterns: this.identifyErrorPatterns(answers),
      },
    };
  }

  /**
   * 识别错误模式
   */
  private identifyErrorPatterns(answers: any[]): string[] {
    const patterns: string[] = [];
    
    // 分析错题的难度分布
    const wrongAnswers = answers.filter(a => !a.isCorrect);
    if (wrongAnswers.length > 0) {
      const easyWrong = wrongAnswers.filter(a => a.difficulty === 'easy').length;
      const mediumWrong = wrongAnswers.filter(a => a.difficulty === 'medium').length;
      const hardWrong = wrongAnswers.filter(a => a.difficulty === 'hard').length;
      
      if (easyWrong > wrongAnswers.length * 0.5) {
        patterns.push('基础题目掌握不牢');
      }
      if (mediumWrong > wrongAnswers.length * 0.5) {
        patterns.push('中等难度题目需要加强');
      }
      if (hardWrong > wrongAnswers.length * 0.5) {
        patterns.push('难题挑战性较大');
      }
    }
    
    return patterns;
  }

  /**
   * 确认训练计划，开始训练
   */
  async confirmTrainingPlan(sessionId: string, studentId: string) {
    try {
      // 获取会话信息
      const session = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new Error('训练会话不存在');
      }

      if (session.studentId !== studentId) {
        throw new Error('无权访问此会话');
      }

      if (session.phase !== 'PLANNING') {
        throw new Error('当前阶段不是规划阶段');
      }

      let trainingPlan = session.trainingPlanData as any;
      if (!trainingPlan) {
        // 计划尚未就绪（AI 仍在生成或此前失败）→ 同步补一次，确保学员一定能往下走
        logger.warn(`会话 ${sessionId} 确认计划时 trainingPlanData 为空，触发同步补生成`);
        await this.ensureTrainingPlan(sessionId, studentId);
        const refreshed = await prisma.trainingSession.findUnique({
          where: { id: sessionId },
          select: { trainingPlanData: true },
        });
        trainingPlan = refreshed?.trainingPlanData as any;
      }
      if (!trainingPlan) {
        throw new Error('训练计划生成中，请稍后重试');
      }

      logger.info(`学员确认训练计划，会话 ${sessionId} 进入引导式训练阶段`);

      // 初始化训练进度数据
      const trainingProgress = {
        currentStage: 'foundation', // 从基础巩固阶段开始
        masteredPoints: [],
        weakPoints: [],
        stages: {
          foundation: {
            currentQuestion: 0,
            totalQuestions: trainingPlan.stages.foundation.questionCount,
            answers: [],
            completed: false,
          },
          improvement: {
            currentQuestion: 0,
            totalQuestions: trainingPlan.stages.improvement.questionCount,
            answers: [],
            completed: false,
          },
          application: {
            currentQuestion: 0,
            totalQuestions: trainingPlan.stages.application.questionCount,
            answers: [],
            completed: false,
          },
        },
      };

      // 更新会话状态
      await prisma.trainingSession.update({
        where: { id: sessionId },
        data: {
          phase: 'GUIDED_TRAINING',
          trainingProgress: trainingProgress as any,
        },
      });

      logger.info(`会话 ${sessionId} 成功进入引导式训练阶段`);

      return {
        success: true,
        phase: 'GUIDED_TRAINING',
        currentStage: 'foundation',
      };
    } catch (error) {
      logger.error('确认训练计划失败:', error);
      throw error;
    }
  }

  /**
   * 获取训练会话详情
   */
  async getSession(sessionId: string, studentId: string) {
    try {
      const session = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
        include: {
          task: true,
          answers: {
            include: {
              question: true,
            },
            orderBy: {
              answeredAt: 'asc',
            },
          },
          aiConversations: {
            orderBy: {
              timestamp: 'asc',
            },
          },
        },
      });

      if (!session) {
        throw new Error('训练会话不存在');
      }

      if (session.studentId !== studentId) {
        throw new Error('无权访问此会话');
      }

      // 自愈：卡在 PLANNING 且无训练计划的会话（含历史脏会话），后台补生成
      if (session.phase === 'PLANNING' && !session.trainingPlanData) {
        void this.ensureTrainingPlan(session.id, studentId);
      }

      // 获取当前题目
      const currentQuestion = session.currentStep < session.questions.length
        ? await prisma.question.findUnique({
            where: { id: session.questions[session.currentStep] },
          })
        : null;

      return {
        ...session,
        currentQuestion,
        planGenerating:
          session.phase === 'PLANNING' && !session.trainingPlanData,
      };
    } catch (error: unknown) {
      logger.error('获取训练会话失败:', error);
      throw error;
    }
  }

  /**
   * 提交答案（支持档案提取模式的所有阶段）
   */
  async submitAnswer(
    sessionId: string,
    studentId: string,
    questionData: any, // 题目数据（档案提取模式中题目不在数据库）
    answer: string,
    timeSpent: number
  ) {
    try {
      // 获取会话信息
      const session = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
        include: {
          task: true,
        },
      });

      if (!session) {
        throw new Error('训练会话不存在');
      }

      if (session.studentId !== studentId) {
        throw new Error('无权访问此会话');
      }

      // 状态校验：ACTIVE 直接放行；PAUSED 视为"续答"自动恢复为 ACTIVE。
      // 说明：会话查询（getCurrentTask）与 answerZoneService 本就同时接受 ACTIVE/PAUSED，
      // 唯独这里只认 ACTIVE，会造成"能取到题却交不了卷"的半死状态
      // （例如脏数据清理把超 24h 会话置为 PAUSED 之后）。
      if (session.status === 'PAUSED') {
        await prisma.trainingSession.update({
          where: { id: session.id },
          data: { status: 'ACTIVE' },
        });
        session.status = 'ACTIVE';
        logger.info(`会话 ${session.id} 由 PAUSED 自动恢复为 ACTIVE（学员继续作答）`);
      } else if (session.status !== 'ACTIVE') {
        throw new Error('会话未激活');
      }

      // 检查是否为档案提取模式
      const taskConfig = session.task.config as any;
      const isProfileMode = taskConfig.profileBased || taskConfig.mode === 'PROFILE';

      if (isProfileMode) {
        // 档案提取模式：根据阶段处理答案
        if (session.phase === 'DIAGNOSTIC_TEST') {
          const result = await this.submitDiagnosticAnswer(session, questionData, answer, timeSpent);
          await this.clearQuestionSnapshot(session.id); // ① 本题已作答，快照失效
          return result;
        } else if (session.phase === 'GUIDED_TRAINING') {
          const result = await this.submitTrainingAnswer(session, questionData, answer, timeSpent);
          await this.clearQuestionSnapshot(session.id); // ① 本题已作答，快照失效
          return result;
        } else if (session.phase === 'FINAL_EXAM') {
          throw new Error('综合考试答案需要通过 submitFinalExam 方法批量提交');
        } else {
          throw new Error(`当前阶段 ${session.phase} 不支持提交答案`);
        }
      } else {
        // 自定义模式：使用原有逻辑
        return await this.submitCustomModeAnswer(session, questionData.id, answer, timeSpent, studentId);
      }
    } catch (error: unknown) {
      logger.error('提交答案失败:', error);
      throw error;
    }
  }

  /**
   * 提交诊断测试答案
   */
  private async submitDiagnosticAnswer(
    session: any,
    questionData: any,
    answer: string,
    timeSpent: number
  ) {
    // 导入 AI 服务
    const { aiQuestionGeneratorService } = await import('./aiQuestionGeneratorService');

    // 获取学员档案
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: session.studentId },
    });

    if (!profile) {
      throw new Error('学员档案不存在');
    }

    const taskConfig = session.task.config as any;

    // P2：题库客观题（单选/判断）本地判分，主观题与 AI 生成题仍走 AI 评估
    let evaluation: any;
    const isObjectiveBankQuestion =
      questionData?.fromBank &&
      questionData?.correctAnswer &&
      ['single_choice', 'judge'].includes(questionData?.type);

    if (isObjectiveBankQuestion) {
      const normalize = (s: string) =>
        String(s ?? '').trim().toUpperCase().replace(/[．.、\s]/g, '');
      const isCorrect = normalize(answer) === normalize(questionData.correctAnswer);
      evaluation = {
        isCorrect,
        correctAnswer: questionData.correctAnswer,
        feedback: isCorrect ? '回答正确！' : `回答错误，正确答案是 ${questionData.correctAnswer}`,
        explanation: questionData.explanation || '',
        guidance: isCorrect ? '' : (questionData.explanation || '建议复习该知识点后再试。'),
      };
    } else {
      // 使用 AI 判断答案
      evaluation = await aiQuestionGeneratorService.evaluateAnswer(
        questionData,
        answer,
        {
          grade: profile.grade,
          trainingGoal: taskConfig.trainingGoal || '提升学习能力',
        }
      );
    }

    // 获取诊断测试数据
    const diagnosticData = session.diagnosticTestData as any;
    
    // 创建答题记录
    const answerRecord = {
      questionNumber: diagnosticData.currentQuestion + 1,
      question: questionData,
      studentAnswer: answer,
      correctAnswer: evaluation.correctAnswer,
      isCorrect: evaluation.isCorrect,
      timeSpent: timeSpent,
      feedback: evaluation.feedback,
      explanation: evaluation.explanation,
      knowledgePoint: questionData.knowledgePoint,
      difficulty: questionData.difficulty,
      answeredAt: new Date(),
    };

    // 更新诊断测试数据
    diagnosticData.answers.push(answerRecord);
    diagnosticData.currentQuestion += 1;

    // 检查是否完成所有诊断题目
    const isCompleted = diagnosticData.currentQuestion >= diagnosticData.totalQuestions;
    let newPhase = session.phase;

    if (isCompleted) {
      // 完成诊断测试，进入规划阶段
      newPhase = 'PLANNING';
      logger.info(`会话 ${session.id} 完成诊断测试，进入规划阶段`);
    }

    // 更新会话
    await prisma.trainingSession.update({
      where: { id: session.id },
      data: {
        diagnosticTestData: diagnosticData,
        phase: newPhase,
        progress: Math.round((diagnosticData.currentQuestion / diagnosticData.totalQuestions) * 100),
      },
    });

    // 作答落库（Answer 表 + 错题本联动），失败不阻断流程
    await this.persistTrainingAnswer(session, questionData, answer, evaluation, timeSpent);

    // 诊断完成 → 立刻异步生成训练计划（AI 本地推理耗时较长，不阻塞本次响应）
    if (isCompleted) {
      void this.ensureTrainingPlan(session.id, session.studentId);
    }

    return {
      correct: evaluation.isCorrect,
      feedback: evaluation.feedback,
      explanation: evaluation.explanation,
      guidance: evaluation.guidance,
      progress: Math.round((diagnosticData.currentQuestion / diagnosticData.totalQuestions) * 100),
      phase: newPhase,
      completed: isCompleted,
      planGenerating: isCompleted, // 前端据此展示「AI 正在生成训练计划」
    };
  }

  /**
   * 提交训练阶段答案
   */
  private async submitTrainingAnswer(
    session: any,
    questionData: any,
    answer: string,
    timeSpent: number
  ) {
    // 导入 AI 服务
    const { aiQuestionGeneratorService } = await import('./aiQuestionGeneratorService');

    // 获取学员档案
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: session.studentId },
    });

    if (!profile) {
      throw new Error('学员档案不存在');
    }

    const taskConfig = session.task.config as any;

    // 客观题（单选/判断）且题目带标准答案时本地精确判分，省去 AI 调用（降低延迟 + 成本）
    let evaluation: any;
    const isObjectiveWithAnswer =
      questionData?.correctAnswer && ['single_choice', 'judge'].includes(questionData?.type);

    if (isObjectiveWithAnswer) {
      const normalize = (s: string) =>
        String(s ?? '').trim().toUpperCase().replace(/[．.、\s]/g, '');
      const isCorrect = normalize(answer) === normalize(questionData.correctAnswer);
      evaluation = {
        isCorrect,
        correctAnswer: questionData.correctAnswer,
        feedback: isCorrect ? '回答正确！' : `回答错误，正确答案是 ${questionData.correctAnswer}`,
        explanation: questionData.explanation || '',
        guidance: isCorrect ? '' : questionData.explanation || '建议复习该知识点后再试。',
      };
    } else {
      // 主观题 / 无标准答案的题才调用 AI 评估
      evaluation = await aiQuestionGeneratorService.evaluateAnswer(questionData, answer, {
        grade: profile.grade,
        trainingGoal: taskConfig.trainingGoal || '提升学习能力',
      });
    }

    // 获取训练进度数据
    const trainingProgress = session.trainingProgress as any;
    const currentStage = trainingProgress.currentStage;
    const stageData = trainingProgress.stages[currentStage];

    // 创建答题记录
    const answerRecord = {
      questionNumber: stageData.currentQuestion + 1,
      question: questionData,
      studentAnswer: answer,
      correctAnswer: evaluation.correctAnswer,
      isCorrect: evaluation.isCorrect,
      timeSpent: timeSpent,
      feedback: evaluation.feedback,
      explanation: evaluation.explanation,
      guidance: evaluation.guidance,
      knowledgePoint: questionData.knowledgePoint,
      answeredAt: new Date(),
    };

    // 更新阶段数据
    if (!stageData.answers) {
      stageData.answers = [];
    }
    stageData.answers.push(answerRecord);
    stageData.currentQuestion += 1;

    // IRT 自适应：根据本次作答更新能力估计
    const { irtService } = await import('./irtService');
    const irtState = irtService.ensureState(
      trainingProgress.irt,
      this.getDiagnosticAccuracy(session)
    );
    const questionDifficulty = (['easy', 'medium', 'hard'] as const).includes(
      questionData?.difficulty
    )
      ? questionData.difficulty
      : 'medium';
    trainingProgress.irt = irtService.update(
      irtState,
      questionDifficulty,
      evaluation.isCorrect,
      timeSpent,
      questionData?.type
    );

    // 苏格拉底式引导奖励：AI 分步引导后学员独立答对 → 给予部分积分
    // （满分 5 分，每次提示 -1，最低 2 分；直接答对不在此奖励，走任务完成积分）
    let guidedReward = 0;
    if (evaluation.isCorrect && trainingProgress.socratic?.hintCount > 0) {
      guidedReward = Math.max(2, 5 - trainingProgress.socratic.hintCount);
      try {
        const lastTransaction = await prisma.pointsTransaction.findFirst({
          where: { studentId: session.studentId },
          orderBy: { createdAt: 'desc' },
        });
        await prisma.pointsTransaction.create({
          data: {
            studentId: session.studentId,
            amount: guidedReward,
            type: 'GUIDED_SOLVE',
            relatedId: session.id,
            balance: (lastTransaction?.balance || 0) + guidedReward,
          },
        });
        logger.info(
          `苏格拉底引导奖励：学员 ${session.studentId} 经 ${trainingProgress.socratic.hintCount} 次引导后答对，+${guidedReward} 分`
        );
      } catch (error) {
        logger.error('发放引导奖励积分失败:', error);
        guidedReward = 0;
      }
    }
    // 本题作答完毕，重置提示计数
    if (trainingProgress.socratic) {
      trainingProgress.socratic = { questionKey: null, hintCount: 0 };
    }

    // 知识点下钻溯源（Breakdown Trace）：跟踪同一知识点的连续错误次数
    // 答对清零；连错 ≥2 次将在下一次出题时触发"前置知识点微测"
    const knowledgePoint = questionData?.knowledgePoint;
    if (knowledgePoint && typeof knowledgePoint === 'string') {
      if (!trainingProgress.knowledgePointErrors) {
        trainingProgress.knowledgePointErrors = {};
      }
      if (evaluation.isCorrect) {
        trainingProgress.knowledgePointErrors[knowledgePoint] = 0;
      } else {
        trainingProgress.knowledgePointErrors[knowledgePoint] =
          (trainingProgress.knowledgePointErrors[knowledgePoint] || 0) + 1;
      }
    }

    // 更新会话
    await prisma.trainingSession.update({
      where: { id: session.id },
      data: {
        trainingProgress: trainingProgress,
      },
    });

    // 作答落库（Answer 表 + 错题本联动），失败不阻断流程
    await this.persistTrainingAnswer(session, questionData, answer, evaluation, timeSpent);

    // 检查是否完成当前阶段
    const stageCompleted = stageData.currentQuestion >= stageData.totalQuestions;

    // 阶段完成标准（借鉴 edu-learning-path「可验证完成标准」）：本阶段正确率 + 验收标准清单
    let stageCriteria: string[] = [];
    let stageAccuracy: number | null = null;
    let remedyAdvice: string | null = null;
    if (stageCompleted) {
      const plan = session.trainingPlanData as any;
      stageCriteria = plan?.stages?.[currentStage]?.criteria ?? [];
      const records = Array.isArray(stageData.answers) ? stageData.answers : [];
      if (records.length > 0) {
        const correct = records.filter((r: any) => r.isCorrect).length;
        stageAccuracy = Math.round((correct / records.length) * 1000) / 10;
        if (stageAccuracy < 60) {
          const stageName =
            currentStage === 'foundation'
              ? '基础巩固'
              : currentStage === 'improvement'
                ? '能力提升'
                : '综合应用';
          remedyAdvice = `本阶段正确率偏低（${stageAccuracy}%），建议回到「${stageName}」重做一轮巩固后再进入下一阶段`;
        }
      }
    }

    return {
      correct: evaluation.isCorrect,
      feedback: evaluation.feedback,
      explanation: evaluation.explanation,
      guidance: evaluation.guidance,
      stageCompleted: stageCompleted,
      currentStage: currentStage,
      // 学习路径完成标准（edu-learning-path 方法论）：验收清单 + 正确率 + 回炉建议
      stageCriteria,
      stageAccuracy,
      remedyAdvice,
      // IRT 自适应信息（供前端展示难度变化）
      nextDifficulty: trainingProgress.irt.lastRecommended,
      abilityTheta: trainingProgress.irt.theta,
      // 苏格拉底引导奖励积分（>0 表示经引导后独立解出）
      guidedReward,
    };
  }

  /**
   * 提交自定义模式答案（原有逻辑）
   */
  private async submitCustomModeAnswer(
    session: any,
    questionId: string,
    answer: string,
    timeSpent: number,
    studentId: string
  ) {
    // 验证题目
    const question = await prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new Error('题目不存在');
    }

    // 判断答案是否正确
    const isCorrect = this.checkAnswer(answer, question.answer, question.type);

    // 保存答题记录
    const answerRecord = await prisma.answer.create({
      data: {
        sessionId: session.id,
        questionId,
        studentAnswer: answer,
        isCorrect,
        timeSpent,
        attemptCount: 1,
      },
    });

    // 每日训练记录聚合（日程表 √/× 与终测前置校验数据源；非致命）
    try {
      const { dailyTrainingService } = await import('./dailyTrainingService');
      await dailyTrainingService.recordDailyTraining(session.taskId, studentId, {
        questions: 1,
        timeSpent: timeSpent || 0,
      });
    } catch (error) {
      logger.warn('[daily] 每日训练聚合失败:', (error as Error).message);
    }

    // 错题本联动（艾宾浩斯间隔重复）：
    // - 答错 → 收集/重置错题复习周期
    // - 答对 → 若该题在错题本中，推进复习周期（连续 3 周期答对才归档）
    if (!isCorrect) {
      await this.collectErrorQuestion(studentId, questionId, answerRecord.id, question);
    } else {
      try {
        await recordReviewResult(studentId, questionId, true);
      } catch (error) {
        logger.error('推进错题复习周期失败:', error);
      }
    }

    // 更新会话进度
    const newStep = session.currentStep + 1;
    const newProgress = Math.round((newStep / session.totalSteps) * 100);

    // 判断是否需要切换阶段
    let newPhase = session.phase;
    if (session.phase === 'PRE_TEST' && newStep >= Math.ceil(session.totalSteps * 0.2)) {
      // 完成 20% 后进入训练阶段
      newPhase = 'TRAINING';
    } else if (session.phase === 'TRAINING' && newStep >= Math.ceil(session.totalSteps * 0.8)) {
      // 完成 80% 后进入综合考试阶段
      newPhase = 'FINAL_EXAM';
    }

    await prisma.trainingSession.update({
      where: { id: session.id },
      data: {
        currentStep: newStep,
        progress: newProgress,
        phase: newPhase,
      },
    });

    // 获取下一题
    const nextQuestion = newStep < session.questions.length
      ? await prisma.question.findUnique({
          where: { id: session.questions[newStep] },
        })
      : null;

    return {
      correct: isCorrect,
      feedback: isCorrect ? '回答正确！' : '回答错误，请继续努力',
      nextQuestion,
      progress: newProgress,
      phase: newPhase,
    };
  }

  /**
   * 训练舱答题统一落库（诊断阶段 / 引导训练阶段共用）
   *
   * 背景：此前诊断与引导训练的作答只写进 TrainingSession 的 JSON 快照
   *（diagnosticTestData / trainingProgress），从未写入 Answer 表，导致
   * 错题本、学情档案、学习报告在 PROFILE 模式下永远拿不到数据。
   *
   * 处理策略：
   * - 题库题（fromBank）→ 直接用其 questionId 落 Answer
   * - AI 生成题 → 先沉淀为 source='AI_GENERATED' 的 Question 再落 Answer
   *   （Question.materialNodeId 必须指向 SUBJECT 节点，此为项目不变量）
   * - 全流程 try/catch：落库失败只记录日志，绝不阻断学员答题主流程
   */
  private async persistTrainingAnswer(
    session: any,
    questionData: any,
    studentAnswer: string,
    evaluation: any,
    timeSpent: number
  ): Promise<void> {
    try {
      let questionId: string | null = null;
      try {
        questionId = await this.resolveQuestionIdForAnswer(session, questionData, evaluation);
      } catch (resolveError) {
        logger.warn('沉淀题目失败，作答改用题面快照落库:', resolveError as any);
      }

      // 遗留②：questionId 现已可空，题目沉淀失败也要保住作答记录（用 questionSnapshot 还原题面）
      const answerRecord = await prisma.answer.create({
        data: {
          sessionId: session.id,
          questionId,
          studentAnswer: String(studentAnswer ?? ''),
          isCorrect: Boolean(evaluation?.isCorrect),
          timeSpent: Number.isFinite(timeSpent) ? Math.max(0, Math.round(timeSpent)) : 0,
          attemptCount: 1,
          questionSnapshot: questionId
            ? undefined
            : ({
                stem: questionData?.stem ?? questionData?.question ?? '',
                options: questionData?.options ?? null,
                type: questionData?.type ?? null,
                correctAnswer: questionData?.correctAnswer ?? evaluation?.correctAnswer ?? null,
                explanation: questionData?.explanation ?? evaluation?.explanation ?? null,
                knowledgePoint: questionData?.knowledgePoint ?? null,
                capturedAt: new Date().toISOString(),
              } as any),
        },
      });

      // 每日训练记录聚合（日程表 √/× 与终测前置校验数据源；非致命）
      try {
        const { dailyTrainingService } = await import('./dailyTrainingService');
        await dailyTrainingService.recordDailyTraining(session.taskId, session.studentId, {
          questions: 1,
          timeSpent,
        });
      } catch (error) {
        logger.warn('[daily] 每日训练聚合失败:', (error as Error).message);
      }

      if (!questionId) {
        logger.warn(`会话 ${session.id} 作答已落库但无 questionId（快照兜底），跳过错题本联动`);
        return;
      }

      const question = await prisma.question.findUnique({ where: { id: questionId } });
      if (!question) return;

      // 错题本联动（与 submitCustomModeAnswer 保持一致的艾宾浩斯策略）
      if (!evaluation?.isCorrect) {
        await this.collectErrorQuestion(
          session.studentId,
          questionId,
          answerRecord.id,
          question
        );
      } else {
        try {
          await recordReviewResult(session.studentId, questionId, true);
        } catch (error) {
          logger.error('推进错题复习周期失败:', error);
        }
      }
    } catch (error) {
      // 落库失败不能影响学员继续答题
      logger.error('训练舱答题落库失败（不影响答题流程）:', error);
    }
  }

  /**
   * 解析作答对应的 Question.id：题库题直接取，AI 生成题按需沉淀入库
   */
  private async resolveQuestionIdForAnswer(
    session: any,
    questionData: any,
    evaluation: any
  ): Promise<string | null> {
    // 1) 题库题：校验 id 真实存在再用
    const bankId = questionData?.questionId || questionData?.id;
    if (bankId && typeof bankId === 'string') {
      const exists = await prisma.question.findUnique({
        where: { id: bankId },
        select: { id: true },
      });
      if (exists) return exists.id;
    }

    // 2) AI 生成题：沉淀为题库记录（source=AI_GENERATED）
    const stem = String(
      questionData?.question ?? questionData?.content?.stem ?? questionData?.stem ?? ''
    ).trim();
    if (!stem) return null;

    const subjectNodeId = await this.ensureSubjectNodeForSession(session);
    if (!subjectNodeId) return null;

    // 去重：同学科同题干只沉淀一次
    const duplicated = await prisma.question.findFirst({
      where: {
        materialNodeId: subjectNodeId,
        source: 'AI_GENERATED',
        content: { path: ['stem'], equals: stem },
      },
      select: { id: true },
    });
    if (duplicated) return duplicated.id;

    const typeMap: Record<string, any> = {
      single_choice: 'CHOICE',
      choice: 'CHOICE',
      multiple_choice: 'MULTIPLE_CHOICE',
      judge: 'JUDGE',
      fill_blank: 'FILL',
      fill: 'FILL',
      short_answer: 'ESSAY',
      essay: 'ESSAY',
    };
    const difficultyMap: Record<string, number> = { easy: 2, medium: 3, hard: 4 };

    const correctAnswer = String(questionData?.correctAnswer ?? evaluation?.correctAnswer ?? '');
    const explanation = String(questionData?.explanation ?? evaluation?.explanation ?? '');

    const created = await prisma.question.create({
      data: {
        materialNodeId: subjectNodeId,
        type: typeMap[String(questionData?.type || '').toLowerCase()] || 'ESSAY',
        content: {
          stem,
          options: questionData?.options ?? null,
          explanation,
        },
        answer: correctAnswer,
        // 结构化答案配置：管理端审核页与后续复用都读这里
        answerConfig: {
          options: questionData?.options ?? null,
          correctAnswer,
          explanation,
        },
        difficulty: difficultyMap[String(questionData?.difficulty || '').toLowerCase()] || 3,
        knowledgePoints: questionData?.knowledgePoint
          ? [String(questionData.knowledgePoint)]
          : [],
        source: 'AI_GENERATED',
        // ④ AI 生成题进入「待审核」池，管理员采纳后才算正式题库题
        reviewStatus: 'PENDING',
        grade: session.student?.studentProfile?.grade ?? null,
      },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * 获取（必要时创建）会话对应学科的 SUBJECT 节点
   */
  private async ensureSubjectNodeForSession(session: any): Promise<string | null> {
    try {
      const subject = await this.getSessionSubject(session);
      const name = subject && subject !== '未知科目' ? subject : '通用';

      const existing = await prisma.materialNode.findFirst({
        where: { type: 'SUBJECT', name },
        select: { id: true },
      });
      if (existing) return existing.id;

      const created = await prisma.materialNode.create({
        data: { name, type: 'SUBJECT', metadata: { subject: name } },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      logger.error('获取学科节点失败:', error);
      return null;
    }
  }

  /**
   * 检查答案是否正确
   */
  private checkAnswer(studentAnswer: string, correctAnswer: string, questionType: string): boolean {
    // 标准化答案（去除空格，转小写）
    const normalize = (str: string) => str.trim().toLowerCase();

    const normalizedStudent = normalize(studentAnswer);
    const normalizedCorrect = normalize(correctAnswer);

    if (questionType === 'CHOICE') {
      // 选择题：精确匹配
      return normalizedStudent === normalizedCorrect;
    } else if (questionType === 'FILL') {
      // 填空题：包含关键词即可
      return normalizedStudent.includes(normalizedCorrect) || 
             normalizedCorrect.includes(normalizedStudent);
    } else {
      // 问答题：需要 AI 评分（暂时简化为关键词匹配）
      const keywords = normalizedCorrect.split(/\s+/);
      return keywords.some(keyword => normalizedStudent.includes(keyword));
    }
  }

  /**
   * 收集错题到错题本
   */
  private async collectErrorQuestion(
    studentId: string,
    questionId: string,
    answerId: string,
    question: {
      materialNodeId: string;
      type: string;
      content: unknown;
      answer: string;
    }
  ) {
    try {
      // 检查是否已存在
      const existing = await prisma.errorQuestion.findFirst({
        where: {
          studentId,
          questionId,
        },
      });

      if (existing) {
        // 更新错题记录，并重置艾宾浩斯复习周期（再次答错说明未掌握）
        await prisma.errorQuestion.update({
          where: { id: existing.id },
          data: {
            answerId, // 更新为最新的答题记录
            retryCount: existing.retryCount + 1,
            mastery: 'UNMASTERED',
            ...initialReviewFields(),
            updatedAt: new Date(),
          },
        });
      } else {
        // 创建新的错题记录
        // 从教材节点获取科目信息
        const materialNode = await prisma.materialNode.findUnique({
          where: { id: question.materialNodeId },
          include: {
            parent: {
              include: {
                parent: true,
              },
            },
          },
        });

        let subject = '未知科目';
        if (materialNode) {
          // 优先从 metadata 中获取科目信息
          if (materialNode.metadata && typeof materialNode.metadata === 'object') {
            const metadata = materialNode.metadata as any;
            if (metadata.subject) {
              subject = metadata.subject;
            }
          }
          
          // 如果 metadata 中没有，向上查找科目节点
          if (subject === '未知科目') {
            let current: any = materialNode;
            while (current && current.type !== 'SUBJECT') {
              current = current.parent;
            }
            if (current) {
              subject = current.name;
            }
          }
        }

        await prisma.errorQuestion.create({
          data: {
            studentId,
            questionId,
            answerId,
            subject,
            mastery: 'UNMASTERED',
            retryCount: 0,
            ...initialReviewFields(), // 排期第 1 天复习周期
          },
        });
      }

      logger.info(`收集错题: 学员 ${studentId}, 题目 ${questionId}`);
    } catch (error) {
      logger.error('收集错题失败:', error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 完成当前训练阶段
   */
  async completeStage(sessionId: string, studentId: string) {
    try {
      // 获取会话信息
      const session = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new Error('训练会话不存在');
      }

      if (session.studentId !== studentId) {
        throw new Error('无权访问此会话');
      }

      if (session.phase !== 'GUIDED_TRAINING') {
        throw new Error('当前阶段不是引导式训练阶段');
      }

      const trainingProgress = session.trainingProgress as any;
      if (!trainingProgress) {
        throw new Error('训练进度数据不存在');
      }

      const currentStage = trainingProgress.currentStage;
      const stageData = trainingProgress.stages[currentStage];

      if (!stageData) {
        throw new Error(`训练阶段 ${currentStage} 数据不存在`);
      }

      // 检查是否完成了所有题目
      if (stageData.currentQuestion < stageData.totalQuestions) {
        throw new Error(`当前阶段还有 ${stageData.totalQuestions - stageData.currentQuestion} 道题目未完成`);
      }

      logger.info(`会话 ${sessionId} 完成 ${currentStage} 阶段`);

      // 导入 AI 服务生成阶段小结
      const { aiQuestionGeneratorService } = await import('./aiQuestionGeneratorService');
      
      // 生成阶段小结
      const stageSummary = await this.generateStageSummary(stageData, currentStage, aiQuestionGeneratorService);

      // 标记当前阶段为已完成
      stageData.completed = true;
      stageData.summary = stageSummary;

      // 确定下一个阶段
      let nextStage = null;
      if (currentStage === 'foundation') {
        nextStage = 'improvement';
      } else if (currentStage === 'improvement') {
        nextStage = 'application';
      }

      // 更新训练进度
      if (nextStage) {
        trainingProgress.currentStage = nextStage;
        logger.info(`会话 ${sessionId} 进入 ${nextStage} 阶段`);
      }

      // 更新会话
      await prisma.trainingSession.update({
        where: { id: sessionId },
        data: {
          trainingProgress: trainingProgress as any,
        },
      });

      return {
        success: true,
        completedStage: currentStage,
        summary: stageSummary,
        nextStage: nextStage,
        allStagesCompleted: !nextStage,
      };
    } catch (error) {
      logger.error('完成训练阶段失败:', error);
      throw error;
    }
  }

  /**
   * 生成阶段小结
   */
  private async generateStageSummary(stageData: any, stageName: string, _aiService: any) {
    const answers = stageData.answers || [];
    const totalQuestions = answers.length;
    const correctCount = answers.filter((a: any) => a.isCorrect).length;
    const accuracy = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    const totalTime = answers.reduce((sum: number, a: any) => sum + (a.timeSpent || 0), 0);

    // 基础统计
    const summary = {
      stageName: this.getStageDisplayName(stageName),
      totalQuestions,
      correctCount,
      accuracy: Math.round(accuracy * 10) / 10,
      timeSpent: totalTime,
      highlights: [] as string[],
      improvements: [] as string[],
    };

    // 分析亮点
    if (accuracy >= 80) {
      summary.highlights.push('整体表现优秀，掌握扎实');
    } else if (accuracy >= 60) {
      summary.highlights.push('基本掌握了本阶段内容');
    }

    // 分析需要改进的地方
    if (accuracy < 60) {
      summary.improvements.push('需要加强基础知识的理解');
    }

    const wrongAnswers = answers.filter((a: any) => !a.isCorrect);
    if (wrongAnswers.length > 0) {
      // 统计错题的知识点
      const wrongKnowledgePoints = new Set(wrongAnswers.map((a: any) => a.knowledgePoint));
      if (wrongKnowledgePoints.size > 0) {
        summary.improvements.push(`重点关注：${Array.from(wrongKnowledgePoints).slice(0, 3).join('、')}`);
      }
    }

    return summary;
  }

  /**
   * 获取阶段显示名称
   */
  private getStageDisplayName(stageName: string): string {
    const stageMap: Record<string, string> = {
      foundation: '基础巩固',
      improvement: '能力提升',
      application: '综合应用',
    };
    return stageMap[stageName] || stageName;
  }

  /**
   * 开始综合考试
   */
  async startFinalExam(sessionId: string, studentId: string) {
    try {
      // 获取会话信息
      const session = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
        include: {
          task: true,
          student: {
            include: {
              studentProfile: true,
            },
          },
        },
      });

      if (!session) {
        throw new Error('训练会话不存在');
      }

      if (session.studentId !== studentId) {
        throw new Error('无权访问此会话');
      }

      if (session.phase !== 'GUIDED_TRAINING') {
        throw new Error('必须完成引导式训练后才能开始综合考试');
      }

      // 每日训练体量约束：家长配置了 dailyGoal 时，当日训练量达标才允许参加终测
      try {
        const { dailyTrainingService } = await import('./dailyTrainingService');
        const goal = dailyTrainingService.getDailyGoal(session.task.config as any);
        if (goal.questions || goal.minutes) {
          const calendar = await dailyTrainingService.getDailyCalendar(session.taskId, studentId, 1);
          if (!calendar?.todayMet) {
            const hint = [
              goal.questions ? `题量 ≥ ${goal.questions} 题` : '',
              goal.minutes ? `时长 ≥ ${goal.minutes} 分钟` : '',
            ].filter(Boolean).join(' 且 ');
            throw new Error(`今日训练量未达标（需${hint}），完成每日目标后才能参加期末测试`);
          }
        }
      } catch (e: any) {
        if (e instanceof Error && e.message.includes('训练量未达标')) throw e;
        // 非致命：聚合服务异常时不阻塞终测
      }

      const trainingProgress = session.trainingProgress as any;
      if (!trainingProgress) {
        throw new Error('训练进度数据不存在');
      }

      // 检查是否完成了所有训练阶段
      const allStagesCompleted = 
        trainingProgress.stages.foundation.completed &&
        trainingProgress.stages.improvement.completed &&
        trainingProgress.stages.application.completed;

      if (!allStagesCompleted) {
        throw new Error('必须完成所有训练阶段后才能开始综合考试');
      }

      logger.info(`会话 ${sessionId} 开始生成综合考试题目`);

      // 导入 AI 服务
      const { aiQuestionGeneratorService } = await import('./aiQuestionGeneratorService');

      // 获取训练计划和训练历史
      const trainingPlan = session.trainingPlanData as any;
      const trainingHistory = this.buildTrainingHistory(session);

      // 获取学员档案
      const profile = session.student.studentProfile;
      if (!profile) {
        throw new Error('学员档案不存在');
      }

      const taskConfig = session.task.config as any;

      // 计划题量：AI 出题失败或数量不足时，用题库真题补齐到这个数
      const plannedCount = Number(trainingPlan?.finalExam?.questionCount) || 10;

      // 调用 AI 批量生成考试题目；整体失败不再直接 500，退化为题库组卷
      let examQuestions: any[] = [];
      try {
        examQuestions = await aiQuestionGeneratorService.generateExamQuestions(
          trainingPlan,
          trainingHistory,
          {
            grade: profile.grade,
            materialVersion: profile.materialVersion,
          },
          taskConfig.trainingGoal || '提升学习能力'
        );
      } catch (error: any) {
        logger.warn(
          `AI 批量生成综合考试题失败（${error?.message || error}），转为题库组卷兜底`
        );
        examQuestions = [];
      }

      // 数量不足则用题库真题补齐（排除本会话已出过的题，避免考卷和训练题重复）
      if (examQuestions.length < plannedCount) {
        const used = this.getUsedQuestionIds(session);
        const aiIds = examQuestions
          .map((q: any) => q?.id)
          .filter((x: any) => typeof x === 'string' && x);
        const supplement = await this.getFallbackExamQuestions(
          session,
          plannedCount - examQuestions.length,
          [...used, ...aiIds]
        );
        examQuestions = [...examQuestions, ...supplement];
      }

      if (examQuestions.length === 0) {
        throw new Error('综合考试组卷失败：AI 出题不可用且题库暂无可用题目');
      }

      // 统一重排题号，保证 AI 题 + 题库题混排后编号连续
      examQuestions = examQuestions.map((q: any, i: number) => ({
        ...q,
        questionNumber: i + 1,
        totalQuestions: examQuestions.length,
      }));

      logger.info(
        `会话 ${sessionId} 综合考试组卷完成，共 ${examQuestions.length} 道题（计划 ${plannedCount} 道）`
      );

      // 初始化考试数据
      const finalExamData = {
        questions: examQuestions,
        answers: {},
        startedAt: new Date(),
      };

      // 更新会话状态
      await prisma.trainingSession.update({
        where: { id: sessionId },
        data: {
          phase: 'FINAL_EXAM',
          finalExamData: finalExamData as any,
        },
      });

      logger.info(`会话 ${sessionId} 进入综合考试阶段`);

      return {
        success: true,
        questions: examQuestions,
        totalQuestions: examQuestions.length,
        timeLimit: trainingPlan.finalExam?.timeLimit || 60, // 默认 60 分钟
      };
    } catch (error) {
      logger.error('开始综合考试失败:', error);
      throw error;
    }
  }

  /**
   * 构建训练历史数据
   */
  private buildTrainingHistory(session: any): any {
    const diagnosticData = session.diagnosticTestData as any;
    const trainingProgress = session.trainingProgress as any;

    // 收集所有训练过的知识点
    const trainedPoints = new Set<string>();
    
    // 从诊断测试中收集
    if (diagnosticData && diagnosticData.answers) {
      diagnosticData.answers.forEach((answer: any) => {
        if (answer.knowledgePoint) {
          trainedPoints.add(answer.knowledgePoint);
        }
      });
    }

    // 从训练阶段中收集
    if (trainingProgress && trainingProgress.stages) {
      Object.values(trainingProgress.stages).forEach((stage: any) => {
        if (stage.answers) {
          stage.answers.forEach((answer: any) => {
            if (answer.knowledgePoint) {
              trainedPoints.add(answer.knowledgePoint);
            }
          });
        }
      });
    }

    // 统计训练表现
    let totalTrainingQuestions = 0;
    let totalCorrect = 0;

    if (trainingProgress && trainingProgress.stages) {
      Object.values(trainingProgress.stages).forEach((stage: any) => {
        if (stage.answers) {
          totalTrainingQuestions += stage.answers.length;
          totalCorrect += stage.answers.filter((a: any) => a.isCorrect).length;
        }
      });
    }

    return {
      trainedPoints: Array.from(trainedPoints),
      totalTrainingQuestions,
      trainingPerformance: totalTrainingQuestions > 0 
        ? Math.round((totalCorrect / totalTrainingQuestions) * 100) 
        : 0,
    };
  }

  /**
   * 提交综合考试
   */
  async submitFinalExam(
    sessionId: string,
    studentId: string,
    answers: Record<number, string> // { questionIndex: answer }
  ) {
    try {
      // 获取会话信息（包含 task 关系）
      const session = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
        include: {
          task: true,
        },
      });

      if (!session) {
        throw new Error('训练会话不存在');
      }

      if (session.studentId !== studentId) {
        throw new Error('无权访问此会话');
      }

      if (session.phase !== 'FINAL_EXAM') {
        throw new Error('当前阶段不是综合考试阶段');
      }

      const finalExamData = session.finalExamData as any;
      if (!finalExamData || !finalExamData.questions) {
        throw new Error('综合考试数据不存在');
      }

      logger.info(`会话 ${sessionId} 提交综合考试答案`);

      // 导入 AI 服务
      const { aiQuestionGeneratorService } = await import('./aiQuestionGeneratorService');

      // 批量评估答案
      const examResults = await this.evaluateExamAnswers(
        finalExamData.questions,
        answers,
        aiQuestionGeneratorService,
        session
      );

      // 更新考试数据
      finalExamData.answers = answers;
      finalExamData.results = examResults;
      finalExamData.completedAt = new Date();

      // 更新会话状态
      await prisma.trainingSession.update({
        where: { id: sessionId },
        data: {
          phase: 'COMPLETED',
          finalExamData: finalExamData as any,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      logger.info(`会话 ${sessionId} 完成综合考试，正确率：${examResults.accuracy}%`);

      return {
        success: true,
        results: examResults,
      };
    } catch (error) {
      logger.error('提交综合考试失败:', error);
      throw error;
    }
  }

  /**
   * 评估考试答案
   */
  private async evaluateExamAnswers(
    questions: any[],
    answers: Record<number, string>,
    aiService: any,
    session: any
  ) {
    // 获取学员档案
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: session.studentId },
    });

    if (!profile) {
      throw new Error('学员档案不存在');
    }

    const taskConfig = session.task.config as any;

    const evaluations: any[] = [];
    let totalScore = 0;
    let maxScore = questions.length * 10; // 假设每题 10 分

    // 客观题本地判分，主观题 AI 判分；主观题并行执行以降低综合考试评分耗时
    const normalize = (s: string) =>
      String(s ?? '').trim().toUpperCase().replace(/[．.、\s]/g, '');
    const tasks = questions.map(async (question: any, i: number) => {
      const studentAnswer = answers[i] || '';
      const isObjective = question?.correctAnswer && ['single_choice', 'judge'].includes(question?.type);

      let evaluation: any;
      if (isObjective) {
        const isCorrect = normalize(studentAnswer) === normalize(question.correctAnswer);
        evaluation = {
          isCorrect,
          correctAnswer: question.correctAnswer,
          feedback: isCorrect ? '回答正确！' : `回答错误，正确答案是 ${question.correctAnswer}`,
          explanation: question.explanation || '',
        };
      } else {
        evaluation = await aiService.evaluateAnswer(question, studentAnswer, {
          grade: profile.grade,
          trainingGoal: taskConfig.trainingGoal || '提升学习能力',
        });
      }

      return {
        questionIndex: i,
        question,
        studentAnswer,
        correctAnswer: evaluation.correctAnswer,
        isCorrect: evaluation.isCorrect,
        score: evaluation.isCorrect ? 10 : 0,
        feedback: evaluation.feedback,
      };
    });

    const results = await Promise.all(tasks);
    for (const e of results) {
      evaluations.push(e);
      if (e.isCorrect) totalScore += 10;
    }

    // 按知识点统计
    const knowledgePointScores = this.calculateKnowledgePointScores(evaluations);

    return {
      totalScore,
      maxScore,
      accuracy: Math.round((totalScore / maxScore) * 100 * 10) / 10,
      correctCount: evaluations.filter(e => e.isCorrect).length,
      totalQuestions: questions.length,
      knowledgePointScores,
      evaluations,
    };
  }

  /**
   * 计算各知识点得分
   */
  private calculateKnowledgePointScores(evaluations: any[]) {
    const kpMap = new Map<string, { total: number; correct: number }>();

    evaluations.forEach(evaluation => {
      const kp = evaluation.question.knowledgePoint;
      if (!kpMap.has(kp)) {
        kpMap.set(kp, { total: 0, correct: 0 });
      }
      const stat = kpMap.get(kp)!;
      stat.total += 1;
      if (evaluation.isCorrect) {
        stat.correct += 1;
      }
    });

    const result: any[] = [];
    kpMap.forEach((stat, kp) => {
      result.push({
        point: kp,
        score: stat.correct * 10,
        accuracy: Math.round((stat.correct / stat.total) * 100 * 10) / 10,
      });
    });

    return result;
  }

  /**
   * 获取训练报告
   */
  async getTrainingReport(sessionId: string, studentId: string) {
    try {
      // 获取会话信息
      const session = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
        include: {
          task: true,
        },
      });

      if (!session) {
        throw new Error('训练会话不存在');
      }

      if (session.studentId !== studentId) {
        throw new Error('无权访问此会话');
      }

      if (session.phase !== 'COMPLETED') {
        throw new Error('训练尚未完成');
      }

      // 如果报告已生成，直接返回
      if (session.trainingReport) {
        logger.info(`返回已生成的训练报告，会话 ${sessionId}`);
        return {
          content: session.trainingReport,
          status: 'completed',
        };
      }

      // 生成报告
      logger.info(`开始生成训练报告，会话 ${sessionId}`);

      // 导入 AI 服务
      const { aiQuestionGeneratorService } = await import('./aiQuestionGeneratorService');

      // 构建训练会话数据
      const sessionData = this.buildSessionDataForReport(session);

      // 调用 AI 生成报告
      const report = await aiQuestionGeneratorService.generateTrainingReport(
        sessionData
      );

      // 保存报告
      await prisma.trainingSession.update({
        where: { id: sessionId },
        data: {
          trainingReport: report.content,
        },
      });

      // 计算并发放积分
      await this.awardPointsForTraining(
        studentId,
        sessionId,
        report.pointsAwarded
      );

      // 更新任务状态为已完成
      await prisma.task.update({
        where: { id: session.taskId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      logger.info(`训练报告生成成功，会话 ${sessionId}，发放积分 ${report.pointsAwarded}`);

      return {
        content: report.content,
        pointsAwarded: report.pointsAwarded,
        status: 'completed',
      };
    } catch (error) {
      logger.error('获取训练报告失败:', error);
      throw error;
    }
  }

  /**
   * 请求训练报告（非阻塞）
   * - 若报告已生成，直接返回 completed 内容；
   * - 否则确保异步生成已触发（复用 generateReportAsync + reportStatusService），
   *   立即返回 generating 状态，由调用方通过 SSE 订阅进度。
   */
  async requestTrainingReport(
    sessionId: string,
    studentId: string
  ): Promise<{ status: 'completed' | 'generating'; content?: unknown; pointsAwarded?: number }> {
    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error('训练会话不存在');
    }

    if (session.studentId !== studentId) {
      throw new Error('无权访问此会话');
    }

    if (session.phase !== 'COMPLETED') {
      throw new Error('训练尚未完成');
    }

    if (session.trainingReport) {
      return {
        status: 'completed',
        content: session.trainingReport,
      };
    }

    // 报告尚未生成：若状态机无进行中的任务，则触发异步生成
    const existing = reportStatusService.getStatus(sessionId);
    if (!existing || existing.status === ReportStatus.FAILED) {
      this.generateReportAsync(sessionId).catch((error) => {
        logger.error('触发报告异步生成失败:', error);
      });
    }

    return { status: 'generating' };
  }

  /**
   * 构建用于报告生成的会话数据
   */
  private buildSessionDataForReport(session: any): any {
    return {
      id: session.id,
      taskId: session.taskId,
      studentId: session.studentId,
      diagnosticTestData: session.diagnosticTestData,
      trainingPlanData: session.trainingPlanData,
      trainingProgress: session.trainingProgress,
      finalExamData: session.finalExamData,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    };
  }

  /**
   * 为训练发放积分
   */
  private async awardPointsForTraining(
    studentId: string,
    sessionId: string,
    amount: number
  ) {
    try {
      // 获取当前积分余额
      const lastTransaction = await prisma.pointsTransaction.findFirst({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
      });

      const currentBalance = lastTransaction?.balance || 0;
      const newBalance = currentBalance + amount;

      // 创建积分交易记录
      await prisma.pointsTransaction.create({
        data: {
          studentId,
          amount,
          type: 'TASK_COMPLETE',
          relatedId: sessionId,
          balance: newBalance,
        },
      });

      logger.info(`发放训练积分: 学员 ${studentId}, 数量 ${amount}, 新余额 ${newBalance}`);
    } catch (error) {
      logger.error('发放积分失败:', error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 完成训练会话
   */
  async completeSession(sessionId: string, studentId: string) {
    try {
      // 验证会话
      const session = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
        include: {
          task: true,
          answers: {
            include: {
              question: true,
            },
          },
        },
      });

      if (!session) {
        throw new Error('训练会话不存在');
      }

      if (session.studentId !== studentId) {
        throw new Error('无权访问此会话');
      }

      if (session.status === 'COMPLETED') {
        throw new Error('会话已完成');
      }

      // 计算积分
      const points = this.calculatePoints(session.answers);

      // 使用事务管理器完成任务（包含状态更新和积分发放）
      await completeTaskTransaction(sessionId, points);

      logger.info(`学员 ${studentId} 完成训练会话 ${sessionId}, 获得 ${points} 积分`);

      // 异步生成报告（不阻塞响应）
      this.generateReportAsync(sessionId).catch((error) => {
        logger.error('异步生成报告失败:', error);
      });

      return {
        success: true,
        points,
        sessionId,
        report: {
          status: 'generating',
          message: '报告正在生成中，请稍后查看',
        },
      };
    } catch (error: any) {
      logger.error('完成训练会话失败:', error);
      throw error;
    }
  }

  /**
   * 异步生成报告
   */
  private async generateReportAsync(sessionId: string) {
    try {
      // 设置报告状态为等待
      const { reportStatusService } = await import('./reportStatusService');
      reportStatusService.setPending(sessionId);

      // 动态导入以避免循环依赖
      const { reportGenerationService } = await import('./reportGenerationService');
      await reportGenerationService.generateReport(sessionId);
      logger.info(`报告生成成功: 会话 ${sessionId}`);
    } catch (error) {
      logger.error(`报告生成失败: 会话 ${sessionId}`, error);
      throw error;
    }
  }

  /**
   * 计算积分
   */
  private calculatePoints(answers: any[]): number {
    if (answers.length === 0) return 0;

    // 计算正确率
    const correctCount = answers.filter(a => a.isCorrect).length;
    const correctRate = correctCount / answers.length;

    // 计算平均难度
    const avgDifficulty = answers.reduce((sum, a) => sum + (a.question?.difficulty || 3), 0) / answers.length;

    // 计算平均用时（秒）
    const avgTimeSpent = answers.reduce((sum, a) => sum + a.timeSpent, 0) / answers.length;

    // 基础分 = 正确率 * 100
    let points = correctRate * 100;

    // 难度加成：难度越高，加成越多
    points *= (1 + (avgDifficulty - 3) * 0.1);

    // 速度加成：用时越短，加成越多（假设标准用时为 60 秒）
    if (avgTimeSpent < 60) {
      points *= (1 + (60 - avgTimeSpent) / 60 * 0.2);
    }

    return Math.round(points);
  }

  /**
   * 发放积分
   * 注意：此方法暂未使用，保留供将来扩展
   */
  // private async awardPoints(
  //   studentId: string,
  //   amount: number,
  //   type: 'TASK_COMPLETE' | 'ERROR_RETRY' | 'WISH_REDEEM',
  //   relatedId: string
  // ) {
  //   try {
  //     // 获取当前积分余额
  //     const lastTransaction = await prisma.pointsTransaction.findFirst({
  //       where: { studentId },
  //       orderBy: { createdAt: 'desc' },
  //     });

  //     const currentBalance = lastTransaction?.balance || 0;
  //     const newBalance = currentBalance + amount;

  //     // 创建积分交易记录
  //     await prisma.pointsTransaction.create({
  //       data: {
  //         studentId,
  //         amount,
  //         type,
  //         relatedId,
  //         balance: newBalance,
  //       },
  //     });

  //     logger.info(`发放积分: 学员 ${studentId}, 数量 ${amount}, 类型 ${type}`);
  //   } catch (error) {
  //     logger.error('发放积分失败:', error);
  //     throw new Error('发放积分失败');
  //   }
  // }

  /**
   * 处理 AI 对话
   */
  async handleAIChat(
    sessionId: string,
    studentId: string,
    message: string,
    context?: {
      questionId?: string;
      answer?: string;
      isCorrect?: boolean;
      mode?: string;
    }
  ) {
    try {
      // 验证会话
      const session = await prisma.trainingSession.findUnique({
        where: { id: sessionId },
        include: {
          task: true,
          answers: {
            include: {
              question: true,
            },
            orderBy: {
              answeredAt: 'desc',
            },
            take: 5, // 获取最近 5 次答题记录作为上下文
          },
          aiConversations: {
            orderBy: {
              timestamp: 'desc',
            },
            take: 10, // 获取最近 10 条对话记录
          },
        },
      });

      if (!session) {
        throw new Error('训练会话不存在');
      }

      if (session.studentId !== studentId) {
        throw new Error('无权访问此会话');
      }

      // 保存用户消息
      await prisma.aIConversation.create({
        data: {
          sessionId,
          questionId: context?.questionId,
          role: 'USER',
          message,
        },
      });

      // 考后精讲模式：综合考试已交卷（phase 变为 COMPLETED）后，AI 解锁并可直接讲解答案
      // 此时不再苏格拉底式"卡答案"，也不累计提示次数
      const isExamReview =
        context?.mode === 'EXAM_REVIEW' || session.phase === 'COMPLETED';

      // 苏格拉底式引导：累计当前题目的提示次数（答对前每次求助 +1）
      // hintCount 决定引导深度（第 1 次只问"题目求什么"，逐级加深，绝不直接给答案）
      const trainingProgress = (session.trainingProgress as any) || {};
      if (!trainingProgress.socratic) {
        trainingProgress.socratic = { questionKey: null, hintCount: 0 };
      }
      const questionKey = context?.questionId || 'current';
      if (trainingProgress.socratic.questionKey !== questionKey) {
        // 切换到新题目，重置提示计数
        trainingProgress.socratic = { questionKey, hintCount: 0 };
      }
      if (!isExamReview && !context?.isCorrect) {
        trainingProgress.socratic.hintCount += 1;
        await prisma.trainingSession.update({
          where: { id: sessionId },
          data: { trainingProgress },
        });
      }
      const hintLevel = trainingProgress.socratic.hintCount;

      // 构建 AI 提示词（训练中：苏格拉底式引导；考后：逐题精讲）
      const prompt = await this.buildAIPrompt(
        session,
        message,
        context,
        hintLevel,
        isExamReview
      );

      // 获取科目信息
      const subject = await this.getSessionSubject(session);

      // P5：分层上下文装配（L1约束→L2指令→L3流程→L4记忆→L5学情→L6会话状态）
      // 装配失败时回退到原有单层学科指令路径，保证对话永远可用
      let layeredSystemPrompt: string | undefined;
      try {
        const { buildAgentContext } = await import('./agentContextBuilder');
        const built = await buildAgentContext({
          studentId,
          subject,
          phase: session.phase,
          scene: isExamReview
            ? '综合考试已交卷，进入考后逐题精讲（可直接讲解答案与思路）'
            : '训练舱引导式对话（苏格拉底式，不直接给答案）',
          sessionState: [
            `任务：《${(session.task as any)?.title ?? '未知'}》`,
            isExamReview
              ? `阶段：${session.phase}｜考后精讲模式（允许直接给出答案与完整解析）`
              : `阶段：${session.phase}｜提示深度：第 ${hintLevel} 次求助`,
            context?.questionId ? `当前题目ID：${context.questionId}` : '',
            context?.isCorrect !== undefined ? `最近作答：${context.isCorrect ? '正确' : '错误'}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        });
        if (built.systemPrompt && built.systemPrompt.length > 0) {
          layeredSystemPrompt = built.systemPrompt;
        }
      } catch (e) {
        logger.warn('分层上下文装配失败，回退单层学科指令:', e);
      }

      // 调用 AI 服务
      const reply = layeredSystemPrompt
        ? await aiServiceManager.callAI(prompt, {
            maxTokens: 1000,
            temperature: 0.7,
            systemPrompt: layeredSystemPrompt,
          })
        : await aiServiceManager.callAIWithSubject(subject, prompt, {
            maxTokens: 1000,
            temperature: 0.7,
          });

      // 保存 AI 回复
      await prisma.aIConversation.create({
        data: {
          sessionId,
          questionId: context?.questionId,
          role: 'ASSISTANT',
          message: reply,
        },
      });

      logger.info(`AI 对话: 会话 ${sessionId}, 学员消息长度 ${message.length}, AI 回复长度 ${reply.length}`);

      return reply;
    } catch (error: any) {
      logger.error('处理 AI 对话失败:', error);
      throw error;
    }
  }

  /**
   * 构建 AI 提示词
   */
  private async buildAIPrompt(
    session: any,
    userMessage: string,
    context?: {
      questionId?: string;
      answer?: string;
      isCorrect?: boolean;
      mode?: string;
    },
    hintLevel: number = 1,
    isExamReview: boolean = false
  ): Promise<string> {
    let prompt = '';

    // 添加会话上下文
    prompt += `当前训练阶段: ${this.getPhaseText(session.phase)}\n`;
    prompt += `训练进度: ${session.progress}%\n\n`;

    // 考后精讲：把整张考卷的判分结果作为上下文喂给 AI
    // （考试题多为 AI 现场生成，未必落在 Question 表里，必须用 finalExamData 兜底）
    if (isExamReview) {
      prompt += this.buildExamReviewContext(session);
    }

    // 如果有题目上下文，添加题目信息
    if (context?.questionId) {
      const question = await prisma.question.findUnique({
        where: { id: context.questionId },
      });

      if (question) {
        prompt += `当前题目:\n`;
        prompt += `题型: ${this.getQuestionTypeText(question.type)}\n`;
        prompt += `难度: ${question.difficulty}/5\n`;
        
        // 解析题目内容（自身持久化数据，安全解析兜底）
        try {
          let text: string;
          if (typeof question.content === 'string') {
            const parsed = safeJsonParse<{ text?: string; question?: string }>(
              question.content
            );
            text = parsed?.text || parsed?.question || question.content;
          } else {
            text = String(question.content);
          }
          prompt += `题目内容: ${text}\n`;
        } catch {
          prompt += `题目内容: ${question.content}\n`;
        }

        if (context.answer) {
          prompt += `学员答案: ${context.answer}\n`;
          prompt += `答案是否正确: ${context.isCorrect ? '正确' : '错误'}\n`;
        }

        prompt += `\n`;
      }
    }

    // 添加最近的对话历史
    if (session.aiConversations && session.aiConversations.length > 0) {
      prompt += `最近的对话历史:\n`;
      // 对话历史是倒序的，需要反转
      const recentConversations = [...session.aiConversations].reverse();
      recentConversations.forEach((conv: any) => {
        const role = conv.role === 'USER' ? '学员' : 'AI助手';
        prompt += `${role}: ${conv.message}\n`;
      });
      prompt += `\n`;
    }

    // 添加用户当前消息
    prompt += `学员当前问题: ${userMessage}\n\n`;

    // 考后精讲模式：考试已结束，直接讲清楚，不再"卡答案"
    if (isExamReview) {
      prompt += `请以"考后精讲老师"的身份回复学员。综合考试已经交卷并完成判分，此时可以直接给出答案和完整解析。\n\n`;
      prompt += `讲解要求:\n`;
      prompt += `1. 如果学员指定了某一题，就针对那道题讲：先点明这题考的知识点，再讲正确解法的关键步骤，然后指出他这次错在哪一步（对照他的作答）\n`;
      prompt += `2. 如果学员问的是整体复盘，就归纳 2-3 个主要失分知识点，并给出下一步练习建议\n`;
      prompt += `3. 讲完一题后，补一句"同类题再遇到时怎么快速判断"的方法提示\n`;
      prompt += `4. 语言友好耐心，适合中小学生理解，避免堆术语\n`;
      prompt += `5. 单次回复控制在 300 字以内，条理清晰可以用短列表\n`;
      prompt += `6. 不要再用反问把答案藏起来——学员现在需要的是把题真正弄懂\n`;
      return prompt;
    }

    // 苏格拉底式分步引导原则（引导深度随提示次数递进，绝不直接给答案）
    const socraticStages: Record<number, string> = {
      1: '第 1 级引导（澄清目标）：只通过提问帮学员明确"这道题要求的是什么？已知条件里有哪个关键信息或公式？"，不要给出任何解题步骤。',
      2: '第 2 级引导（启动第一步）：提示学员尝试第一个动作，例如"试着把已知数值代入那个公式看看？"，仍然不要透露中间结果。',
      3: '第 3 级引导（定位卡点）：针对学员卡住的具体步骤给出方向性提示（指出该用什么方法），但保留最终计算和结论让学员自己完成。',
    };
    const stageInstruction =
      socraticStages[Math.min(hintLevel, 3)] || socraticStages[3];

    prompt += `请根据以上信息，以苏格拉底式提问法回复学员。当前是学员在这道题上的第 ${hintLevel} 次求助。\n\n`;
    prompt += `【本次引导要求】${stageInstruction}\n\n`;
    prompt += `通用原则:\n`;
    prompt += `1. 绝对不要直接给出最终答案或完整解析，通过提问一步步引导学员自己想出来\n`;
    prompt += `2. 每次回复以一个引导性问题结尾，等待学员回应\n`;
    prompt += `3. 如果学员答错，先肯定其思考中正确的部分，再用提问指出矛盾之处\n`;
    prompt += `4. 语言要友好、耐心，适合中小学生理解\n`;
    prompt += `5. 回复要简洁明了，不超过 200 字\n`;
    prompt += `6. 如果学员已经答对并只是想确认思路，可以总结解题思维方法并给予表扬\n`;

    return prompt;
  }

  /**
   * 构建考后精讲上下文
   * 考试题多由 AI 现场生成，未必落在 Question 表，所以直接从 finalExamData.results.evaluations 取
   */
  private buildExamReviewContext(session: any): string {
    try {
      const finalExamData = (session.finalExamData as any) || {};
      const results = finalExamData.results;
      if (!results || !Array.isArray(results.evaluations)) {
        return '';
      }

      const evaluations: any[] = results.evaluations;
      let text = `【本次综合考试成绩】\n`;
      text += `总题数 ${results.totalQuestions ?? evaluations.length}｜答对 ${
        results.correctCount ?? evaluations.filter((e) => e.isCorrect).length
      }｜正确率 ${results.accuracy ?? '-'}%\n\n`;

      const wrong = evaluations.filter((e) => !e.isCorrect);
      if (wrong.length === 0) {
        text += `本次全部答对。\n\n`;
        return text;
      }

      const clip = (s: any, n: number) => {
        const v = String(s ?? '').replace(/\s+/g, ' ').trim();
        return v.length > n ? `${v.slice(0, n)}…` : v;
      };

      text += `【错题清单（最多列 8 题）】\n`;
      // 只带前 8 题，避免 prompt 过长把上下文撑爆
      wrong.slice(0, 8).forEach((e) => {
        const q = e.question || {};
        text += `第 ${Number(e.questionIndex ?? 0) + 1} 题｜知识点：${
          q.knowledgePoint || '未标注'
        }\n`;
        text += `  题干：${clip(q.stem, 120)}\n`;
        if (Array.isArray(q.options) && q.options.length > 0) {
          text += `  选项：${clip(q.options.join(' / '), 120)}\n`;
        }
        text += `  学员作答：${clip(e.studentAnswer, 60) || '（未作答）'}｜正确答案：${clip(
          e.correctAnswer ?? q.correctAnswer,
          60
        )}\n`;
        if (q.explanation) {
          text += `  参考解析：${clip(q.explanation, 120)}\n`;
        }
      });
      text += `\n`;

      return text;
    } catch (e) {
      logger.warn('构建考后精讲上下文失败，忽略:', e);
      return '';
    }
  }

  /**
   * 获取会话科目
   */
  private async getSessionSubject(session: any): Promise<string> {
    try {
      // 从任务配置中获取教材节点
      const config = session.task.config as any;
      const materialNodeIds = config.materialNodeIds || [];

      if (materialNodeIds.length === 0) {
        return '通用';
      }

      // 获取第一个教材节点
      const materialNode = await prisma.materialNode.findUnique({
        where: { id: materialNodeIds[0] },
        include: {
          parent: {
            include: {
              parent: true,
            },
          },
        },
      });

      if (!materialNode) {
        return '通用';
      }

      // 向上查找科目节点
      let current: any = materialNode;
      while (current && current.type !== 'SUBJECT') {
        current = current.parent;
      }

      return current?.name || '通用';
    } catch (error) {
      logger.error('获取会话科目失败:', error);
      return '通用';
    }
  }

  /**
   * 获取阶段文本
   */
  private getPhaseText(phase: string): string {
    const phaseMap: Record<string, string> = {
      PRE_TEST: '训前测试',
      TRAINING: '动态训练',
      FINAL_EXAM: '综合考试',
    };
    return phaseMap[phase] || phase;
  }

  /**
   * 获取题型文本
   */
  private getQuestionTypeText(type: string): string {
    const typeMap: Record<string, string> = {
      CHOICE: '选择题',
      FILL: '填空题',
      ESSAY: '问答题',
    };
    return typeMap[type] || type;
  }
}

export const studentTrainingService = new StudentTrainingService();
