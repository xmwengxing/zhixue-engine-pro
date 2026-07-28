// 学员训练服务
import { PrismaClient } from '@prisma/client';
import { logger } from '../middlewares/logger';
import { aiServiceManager } from './aiServiceManager';
import { completeTaskTransaction } from '../utils/transaction';
import { reportStatusService, ReportStatus } from './reportStatusService';
import { safeJsonParse } from '../utils/aiJson';
import { recordReviewResult, initialReviewFields } from './spacedRepetitionService';

const prisma = new PrismaClient();

/**
 * 训练会话服务类
 */
export class StudentTrainingService {
  /**
   * 获取学员当前任务
   */
  async getCurrentTask(studentId: string) {
    try {
      // 查找状态为 PENDING 或 IN_PROGRESS 的任务
      const task = await prisma.task.findFirst({
        where: {
          studentId,
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
        throw new Error('任务已完成');
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
      };
      
      // 检测是否为档案提取模式
      const isProfileMode = config.profileBased || config.mode === 'PROFILE';
      
      let questions: any[] = [];
      let initialPhase: any = 'PRE_TEST';
      let diagnosticTestData = null;
      
      if (isProfileMode) {
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
        questions = await this.generateQuestions(
          config.materialNodeIds || [],
          config.questionCount || 10,
          config.difficulty || 3
        );

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
    difficulty: number
  ) {
    try {
      // 从指定的教材节点中随机选择题目
      const questions = await prisma.question.findMany({
        where: {
          materialNodeId: {
            in: materialNodeIds,
          },
          difficulty: {
            gte: Math.max(1, difficulty - 1),
            lte: Math.min(5, difficulty + 1),
          },
        },
        take: questionCount * 2, // 多取一些以便随机选择
      });

      // 随机打乱并取指定数量
      const shuffled = questions.sort(() => Math.random() - 0.5);
      return shuffled.slice(0, questionCount);
    } catch (error) {
      logger.error('生成题目列表失败:', error);
      throw new Error('生成题目列表失败');
    }
  }

  /**
   * 获取下一道题目（支持档案提取模式的所有阶段）
   * @param sessionId 训练会话 ID
   * @param studentId 学员 ID
   * @returns 生成的题目
   */
  async getNextQuestion(sessionId: string, studentId: string) {
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

      // 根据当前阶段生成题目
      if (session.phase === 'DIAGNOSTIC_TEST') {
        return await this.getNextDiagnosticQuestion(session, aiQuestionGeneratorService);
      } else if (session.phase === 'GUIDED_TRAINING') {
        return await this.getNextTrainingQuestion(session, aiQuestionGeneratorService);
      } else if (session.phase === 'FINAL_EXAM') {
        throw new Error('综合考试题目需要通过 startFinalExam 方法批量生成');
      } else {
        throw new Error(`当前阶段 ${session.phase} 不支持获取题目`);
      }
    } catch (error) {
      logger.error('获取下一道题目失败:', error);
      throw error;
    }
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

    logger.info(`为会话 ${session.id} 生成第 ${questionNumber}/${totalQuestions} 道诊断题目`);

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

    // 构建诊断测试上下文
    const context = {
      grade: profile.grade,
      materialVersion: profile.materialVersion || '人教版',
      learningFoundation: profile.learningFoundation || '未知',
      trainingGoal: taskConfig.trainingGoal || '提升学习能力',
      totalQuestions: totalQuestions,
      questionNumber: questionNumber,
    };

    // 调用 AI 生成题目
    const question = await aiService.generateDiagnosticQuestion(context, questionNumber);

    logger.info(`成功生成第 ${questionNumber} 道诊断题目，知识点：${question.knowledgePoint}`);

    return question;
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

    // 调用 AI 生成题目
    const question = await aiService.generateTrainingQuestion(currentStage, context, questionNumber);

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

      // 调用 AI 生成训练计划
      const trainingPlan = await aiQuestionGeneratorService.generateTrainingPlan(
        diagnosticResults,
        {
          grade: profile.grade,
          materialVersion: profile.materialVersion,
          learningFoundation: profile.learningFoundation || '未知',
        },
        taskConfig.trainingGoal || '提升学习能力'
      );

      // 保存训练计划
      await prisma.trainingSession.update({
        where: { id: sessionId },
        data: {
          trainingPlanData: trainingPlan as any,
        },
      });

      logger.info(`成功生成训练计划，包含 ${trainingPlan.stages ? Object.keys(trainingPlan.stages).length : 0} 个训练阶段`);

      return trainingPlan;
    } catch (error) {
      logger.error('生成训练计划失败:', error);
      throw error;
    }
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

      const trainingPlan = session.trainingPlanData as any;
      if (!trainingPlan) {
        throw new Error('训练计划未生成');
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

      // 获取当前题目
      const currentQuestion = session.currentStep < session.questions.length
        ? await prisma.question.findUnique({
            where: { id: session.questions[session.currentStep] },
          })
        : null;

      return {
        ...session,
        currentQuestion,
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

      if (session.status !== 'ACTIVE') {
        throw new Error('会话未激活');
      }

      // 检查是否为档案提取模式
      const taskConfig = session.task.config as any;
      const isProfileMode = taskConfig.profileBased || taskConfig.mode === 'PROFILE';

      if (isProfileMode) {
        // 档案提取模式：根据阶段处理答案
        if (session.phase === 'DIAGNOSTIC_TEST') {
          return await this.submitDiagnosticAnswer(session, questionData, answer, timeSpent);
        } else if (session.phase === 'GUIDED_TRAINING') {
          return await this.submitTrainingAnswer(session, questionData, answer, timeSpent);
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

    // 使用 AI 判断答案
    const evaluation = await aiQuestionGeneratorService.evaluateAnswer(
      questionData,
      answer,
      {
        grade: profile.grade,
        trainingGoal: taskConfig.trainingGoal || '提升学习能力',
      }
    );

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

    return {
      correct: evaluation.isCorrect,
      feedback: evaluation.feedback,
      explanation: evaluation.explanation,
      guidance: evaluation.guidance,
      progress: Math.round((diagnosticData.currentQuestion / diagnosticData.totalQuestions) * 100),
      phase: newPhase,
      completed: isCompleted,
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

    // 使用 AI 判断答案
    const evaluation = await aiQuestionGeneratorService.evaluateAnswer(
      questionData,
      answer,
      {
        grade: profile.grade,
        trainingGoal: taskConfig.trainingGoal || '提升学习能力',
      }
    );

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

    // 检查是否完成当前阶段
    const stageCompleted = stageData.currentQuestion >= stageData.totalQuestions;

    return {
      correct: evaluation.isCorrect,
      feedback: evaluation.feedback,
      explanation: evaluation.explanation,
      guidance: evaluation.guidance,
      stageCompleted: stageCompleted,
      currentStage: currentStage,
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

      // 调用 AI 批量生成考试题目
      const examQuestions = await aiQuestionGeneratorService.generateExamQuestions(
        trainingPlan,
        trainingHistory,
        {
          grade: profile.grade,
          materialVersion: profile.materialVersion,
        },
        taskConfig.trainingGoal || '提升学习能力'
      );

      logger.info(`成功生成 ${examQuestions.length} 道综合考试题目`);

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

    const evaluations = [];
    let totalScore = 0;
    let maxScore = questions.length * 10; // 假设每题 10 分

    // 逐题评估
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const studentAnswer = answers[i] || '';

      // 使用 AI 评估答案
      const evaluation = await aiService.evaluateAnswer(
        question,
        studentAnswer,
        {
          grade: profile.grade,
          trainingGoal: taskConfig.trainingGoal || '提升学习能力',
        }
      );

      evaluations.push({
        questionIndex: i,
        question: question,
        studentAnswer: studentAnswer,
        correctAnswer: evaluation.correctAnswer,
        isCorrect: evaluation.isCorrect,
        score: evaluation.isCorrect ? 10 : 0,
        feedback: evaluation.feedback,
      });

      if (evaluation.isCorrect) {
        totalScore += 10;
      }
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
      if (!context?.isCorrect) {
        trainingProgress.socratic.hintCount += 1;
        await prisma.trainingSession.update({
          where: { id: sessionId },
          data: { trainingProgress },
        });
      }
      const hintLevel = trainingProgress.socratic.hintCount;

      // 构建 AI 提示词（苏格拉底式分步引导）
      const prompt = await this.buildAIPrompt(session, message, context, hintLevel);

      // 获取科目信息
      const subject = await this.getSessionSubject(session);

      // 调用 AI 服务
      const reply = await aiServiceManager.callAIWithSubject(
        subject,
        prompt,
        {
          maxTokens: 1000,
          temperature: 0.7,
        }
      );

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
    },
    hintLevel: number = 1
  ): Promise<string> {
    let prompt = '';

    // 添加会话上下文
    prompt += `当前训练阶段: ${this.getPhaseText(session.phase)}\n`;
    prompt += `训练进度: ${session.progress}%\n\n`;

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
