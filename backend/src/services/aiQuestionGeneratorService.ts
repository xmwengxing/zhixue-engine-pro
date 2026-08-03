// AI 题目生成服务
// 负责所有 AI 内容生成，包括诊断题目、训练题目、训练计划和训练报告

import { aiServiceManager } from './aiServiceManager';
import {
  aiPromptBuilder,
  DiagnosticContext,
  TrainingContext,
  DiagnosticResults,
  TrainingPlan,
  TrainingHistory,
  TrainingSessionData,
  ChatContext,
} from './aiPromptBuilder';
import { parseAIJson } from '../utils/aiJson';
import {
  QuestionSchema,
  QuestionArraySchema,
  TrainingPlanSchema,
  EvaluationSchema,
} from '../utils/aiSchema';

/**
 * 题目对象
 */
export interface Question {
  id?: string;
  stem: string;
  type: 'single_choice' | 'multiple_choice' | 'fill_blank' | 'short_answer';
  options?: string[];
  correctAnswer: string;
  explanation: string;
  knowledgePoint: string;
  difficulty: 'easy' | 'medium' | 'hard';
  guidance?: string; // 答错时的引导提示
}

/**
 * 答案评估结果
 */
export interface AnswerEvaluation {
  isCorrect: boolean;
  correctAnswer: string;
  feedback: string;
  explanation: string;
  guidance?: string; // 如果答错，提供引导
}

/**
 * 训练报告
 */
export interface TrainingReport {
  content: string; // Markdown 格式的完整报告
  pointsAwarded: number; // 积分奖励
  summary: {
    diagnosticAccuracy: number;
    finalExamAccuracy: number;
    improvement: number;
    masteredPoints: string[];
    weakPoints: string[];
  };
}

/**
 * AI 题目生成服务类
 */
export class AIQuestionGeneratorService {
  private static instance: AIQuestionGeneratorService;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): AIQuestionGeneratorService {
    if (!AIQuestionGeneratorService.instance) {
      AIQuestionGeneratorService.instance = new AIQuestionGeneratorService();
    }
    return AIQuestionGeneratorService.instance;
  }

  /**
   * 生成诊断测试题目
   * @param context 诊断测试上下文
   * @param questionNumber 当前题目编号
   * @returns 题目对象
   */
  async generateDiagnosticQuestion(
    context: DiagnosticContext,
    questionNumber: number
  ): Promise<Question> {
    try {
      // 构建 Prompt
      // 兼容两种 context 形态：扁平（grade/materialVersion/learningFoundation）与嵌套 studentProfile，
      // 避免 studentProfile 为 undefined 时读取 .grade 抛错（题目加载失败 500 的根因）
      const ctx = context as any;
      const studentProfile = ctx.studentProfile || {
        grade: ctx.grade,
        materialVersion: ctx.materialVersion,
        learningFoundation: ctx.learningFoundation,
      };
      const prompt = aiPromptBuilder.buildDiagnosticQuestionPrompt({
        studentProfile,
        trainingGoal: ctx.trainingGoal,
        questionNumber,
        totalQuestions: ctx.totalQuestions,
      });

      // 调用 AI 服务
      const response = await aiServiceManager.callAI(prompt, {
        temperature: 0.7,
        maxTokens: 2500,
      });

      // 解析 JSON 响应
      const question = this.parseQuestionJSON(response);

      // 设置题目类型为单选题（结构与类型已由 zod schema 校验）
      question.type = 'single_choice';

      return question;
    } catch (error: any) {
      console.error('生成诊断测试题目失败:', error);
      throw new Error(`生成诊断测试题目失败：${error.message}`);
    }
  }

  /**
   * 评估学员答案
   * @param question 题目对象
   * @param studentAnswer 学员答案
   * @param context 评估上下文
   * @returns 答案评估结果
   */
  async evaluateAnswer(
    question: Question,
    studentAnswer: string,
    context: { grade: string; trainingGoal: string }
  ): Promise<AnswerEvaluation> {
    try {
      // 构建 Prompt
      const prompt = aiPromptBuilder.buildAnswerEvaluationPrompt(
        {
          stem: question.stem,
          options: question.options || [],
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
        },
        studentAnswer,
        context
      );

      // 调用 AI 服务
      const response = await aiServiceManager.callAI(prompt, {
        temperature: 0.3, // 降低温度，使评估更稳定
        maxTokens: 1500,
      });

      // 解析 JSON 响应
      const evaluation = this.parseEvaluationJSON(response);

      // 补充完整信息
      return {
        isCorrect: evaluation.isCorrect,
        correctAnswer: question.correctAnswer,
        feedback: evaluation.feedback,
        explanation: question.explanation,
        guidance: evaluation.guidance || question.guidance,
      };
    } catch (error: any) {
      console.error('评估答案失败:', error);
      
      // 降级方案：简单比较答案
      const isCorrect = studentAnswer.trim().toUpperCase() === question.correctAnswer.trim().toUpperCase();
      
      return {
        isCorrect,
        correctAnswer: question.correctAnswer,
        feedback: isCorrect ? '回答正确！' : '回答错误，请再想想。',
        explanation: question.explanation,
        guidance: question.guidance,
      };
    }
  }

  /**
   * 生成训练题目
   * @param stage 训练阶段
   * @param context 训练上下文
   * @param questionNumber 当前题目编号
   * @returns 题目对象
   */
  async generateTrainingQuestion(
    stage: 'foundation' | 'improvement' | 'application',
    context: TrainingContext,
    questionNumber: number
  ): Promise<Question> {
    try {
      // 构建 Prompt
      const prompt = aiPromptBuilder.buildTrainingQuestionPrompt({
        ...context,
        stage,
        questionNumber,
      });

      // 调用 AI 服务
      const response = await aiServiceManager.callAI(prompt, {
        temperature: 0.7,
        maxTokens: 2500,
      });

      // 解析 JSON 响应
      const question = this.parseQuestionJSON(response);

      // 设置题目类型为单选题（结构与类型已由 zod schema 校验）
      question.type = 'single_choice';

      return question;
    } catch (error: any) {
      console.error('生成训练题目失败:', error);
      throw new Error(`生成训练题目失败：${error.message}`);
    }
  }

  /**
   * 生成综合考试题目
   * @param trainingPlan 训练计划
   * @param trainingHistory 训练历史
   * @returns 题目数组
   */
  async generateExamQuestions(
    trainingPlan: TrainingPlan,
    trainingHistory: TrainingHistory,
    studentProfile: { grade: string; materialVersion: string },
    trainingGoal: string
  ): Promise<Question[]> {
    try {
      // 构建 Prompt
      const prompt = aiPromptBuilder.buildExamQuestionsPrompt(
        trainingPlan,
        trainingHistory,
        studentProfile,
        trainingGoal
      );

      // 调用 AI 服务（考试题目较多，需要更长时间）
      const response = await aiServiceManager.callAI(prompt, {
        temperature: 0.7,
        maxTokens: 4000,
      });

      // 解析 JSON 数组响应
      const questions = this.parseQuestionsArrayJSON(response);

      // 验证每个题目
      questions.forEach((question, index) => {
        try {
          // 结构已由 zod schema 校验
          question.type = 'single_choice';
        } catch (error: any) {
          console.error(`验证第 ${index + 1} 题失败:`, error);
          throw new Error(`第 ${index + 1} 题格式错误：${error.message}`);
        }
      });

      // 验证题目数量
      const expectedCount = trainingPlan.finalExam.questionCount;
      if (questions.length < expectedCount * 0.8) {
        throw new Error(`生成的题目数量不足，期望 ${expectedCount} 题，实际 ${questions.length} 题`);
      }

      return questions;
    } catch (error: any) {
      console.error('生成综合考试题目失败:', error);
      throw new Error(`生成综合考试题目失败：${error.message}`);
    }
  }

  /**
   * 生成训练计划
   * @param diagnosticResults 诊断测试结果
   * @param studentProfile 学员档案
   * @param trainingGoal 训练目标
   * @returns 训练计划
   */
  async generateTrainingPlan(
    diagnosticResults: DiagnosticResults,
    studentProfile: { grade: string; materialVersion: string; learningFoundation: string },
    trainingGoal: string
  ): Promise<TrainingPlan> {
    try {
      // 构建 Prompt
      const prompt = aiPromptBuilder.buildTrainingPlanPrompt(
        diagnosticResults,
        studentProfile,
        trainingGoal
      );

      // 调用 AI 服务（训练计划生成需要较长时间）
      const response = await aiServiceManager.callAI(prompt, {
        temperature: 0.7,
        maxTokens: 3000,
      });

      // 解析 JSON 响应（结构与类型已由 zod schema 校验）
      const trainingPlan = this.parseTrainingPlanJSON(response);

      return trainingPlan;
    } catch (error: any) {
      console.error('生成训练计划失败:', error);
      throw new Error(`生成训练计划失败：${error.message}`);
    }
  }

  /**
   * AI 助手对话
   * @param message 学员消息
   * @param context 对话上下文
   * @returns AI 助手回复
   */
  async chatWithAssistant(
    message: string,
    context: ChatContext
  ): Promise<string> {
    try {
      // 检查是否在考试阶段
      if (context.phase === 'FINAL_EXAM') {
        return '抱歉，综合考试期间 AI 助手功能暂时不可用。请独立完成考试，加油！';
      }

      // 构建 Prompt
      const prompt = aiPromptBuilder.buildChatPrompt(context, message);

      // 调用 AI 服务
      const response = await aiServiceManager.callAI(prompt, {
        temperature: 0.8, // 对话可以更灵活
        maxTokens: 1500,
      });

      return response.trim();
    } catch (error: any) {
      console.error('AI 助手对话失败:', error);
      return '抱歉，AI 助手暂时无法回复，请稍后再试。如果问题紧急，可以先尝试自己思考或查阅资料。';
    }
  }

  /**
   * 解析训练计划 JSON（zod 严格校验，防注入结构破坏）
   */
  private parseTrainingPlanJSON(response: string): TrainingPlan {
    const result = parseAIJson(response, TrainingPlanSchema);
    if (!result.ok) {
      console.error('解析训练计划 JSON 失败:', result.error);
      console.error('原始响应:', response);
      throw new Error(`解析训练计划失败：${result.error}`);
    }
    return result.data as unknown as TrainingPlan;
  }

  /**
   * 生成训练报告
   * @param sessionData 训练会话数据
   * @returns 训练报告
   */
  async generateTrainingReport(
    sessionData: TrainingSessionData
  ): Promise<TrainingReport> {
    try {
      // 构建 Prompt
      const prompt = aiPromptBuilder.buildTrainingReportPrompt(sessionData);

      // 调用 AI 服务（报告生成需要较长时间）
      const response = await aiServiceManager.callAI(prompt, {
        temperature: 0.7,
        maxTokens: 3000,
      });

      // 提取 Markdown 内容
      const content = response.trim();

      // 计算积分奖励
      const pointsAwarded = this.calculatePoints(sessionData);

      // 生成报告摘要
      const summary = this.generateReportSummary(sessionData);

      return {
        content,
        pointsAwarded,
        summary,
      };
    } catch (error: any) {
      console.error('生成训练报告失败:', error);
      throw new Error(`生成训练报告失败：${error.message}`);
    }
  }

  /**
   * 计算积分奖励
   * 积分计算规则：
   * - 基础分：综合考试正确率 × 100
   * - 难度加成：根据题目难度分布
   * - 进步加成：诊断测试到综合考试的进步幅度
   */
  private calculatePoints(sessionData: TrainingSessionData): number {
    const { diagnosticTest, finalExam } = sessionData;

    // 基础分：综合考试正确率 × 100
    const basePoints = Math.round(finalExam.accuracy * 100);

    // 难度加成：根据知识点得分情况
    const avgKnowledgePointScore = finalExam.knowledgePointScores.reduce(
      (sum, kp) => sum + kp.score,
      0
    ) / finalExam.knowledgePointScores.length;
    const difficultyBonus = Math.round(avgKnowledgePointScore * 0.2);

    // 进步加成：诊断测试到综合考试的进步幅度
    const improvement = finalExam.accuracy - diagnosticTest.accuracy;
    const improvementBonus = Math.max(0, Math.round(improvement * 50));

    // 总积分
    const totalPoints = basePoints + difficultyBonus + improvementBonus;

    return Math.max(0, totalPoints);
  }

  /**
   * 生成报告摘要
   */
  private generateReportSummary(sessionData: TrainingSessionData): {
    diagnosticAccuracy: number;
    finalExamAccuracy: number;
    improvement: number;
    masteredPoints: string[];
    weakPoints: string[];
  } {
    const { diagnosticTest, finalExam } = sessionData;

    // 计算进步幅度
    const improvement = finalExam.accuracy - diagnosticTest.accuracy;

    // 识别已掌握的知识点（正确率 >= 80%）
    const masteredPoints = finalExam.knowledgePointScores
      .filter(kp => kp.accuracy >= 0.8)
      .map(kp => kp.point);

    // 识别仍需加强的知识点（正确率 < 60%）
    const weakPoints = finalExam.knowledgePointScores
      .filter(kp => kp.accuracy < 0.6)
      .map(kp => kp.point);

    return {
      diagnosticAccuracy: diagnosticTest.accuracy,
      finalExamAccuracy: finalExam.accuracy,
      improvement,
      masteredPoints,
      weakPoints,
    };
  }

  /**
   * 解析题目 JSON（zod 严格校验，防注入结构破坏）
   */
  /**
   * 规整题目，兼容本地推理模型把选项写成 "A: 4" 而 correctAnswer 写成 "A" 的写法：
   * 当 correctAnswer 不在 options 中但其为单个字母时，对齐到对应序号的完整选项串，
   * 使 QuestionSchema 的 refine 通过（不改变通过严格校验的正常输出）。
   */
  private normalizeQuestion(q: any): any {
    if (q && Array.isArray(q.options) && typeof q.correctAnswer === 'string') {
      if (!q.options.includes(q.correctAnswer)) {
        const letter = q.correctAnswer.trim().toUpperCase();
        if (/^[A-Z]$/.test(letter)) {
          const idx = letter.charCodeAt(0) - 65;
          if (idx >= 0 && idx < q.options.length) {
            q.correctAnswer = q.options[idx];
          }
        }
      }
    }
    return q;
  }

  private parseQuestionJSON(response: string): Question {
    const result = parseAIJson(response, QuestionSchema, this.normalizeQuestion.bind(this));
    if (!result.ok) {
      console.error('解析题目 JSON 失败:', result.error);
      console.error('原始响应:', response);
      throw new Error(`解析题目失败：${result.error}`);
    }
    return result.data as unknown as Question;
  }

  /**
   * 解析题目数组 JSON（zod 严格校验，防注入结构破坏）
   */
  private parseQuestionsArrayJSON(response: string): Question[] {
    const result = parseAIJson(
      response,
      QuestionArraySchema,
      (arr) => (Array.isArray(arr) ? arr.map((q) => this.normalizeQuestion(q)) : arr)
    );
    if (!result.ok) {
      console.error('解析题目数组 JSON 失败:', result.error);
      console.error('原始响应:', response);
      throw new Error(`解析题目数组失败：${result.error}`);
    }
    return result.data as unknown as Question[];
  }

  /**
   * 解析答案评估 JSON（zod 严格校验，防注入结构破坏）
   */
  private parseEvaluationJSON(response: string): {
    isCorrect: boolean;
    feedback: string;
    guidance?: string;
  } {
    const result = parseAIJson(response, EvaluationSchema);
    if (!result.ok) {
      console.error('解析评估 JSON 失败:', result.error);
      console.error('原始响应:', response);
      throw new Error(`解析评估结果失败：${result.error}`);
    }
    return result.data as unknown as {
      isCorrect: boolean;
      feedback: string;
      guidance?: string;
    };
  }

  /**
   * 临时兼容方法：生成题目（用于旧的训练服务）
   * 注意：此方法将在任务 4 中被新的训练会话管理服务替代
   * @deprecated 使用 generateDiagnosticQuestion 或 generateTrainingQuestion 代替
   */
  async generateQuestion(
    taskConfig: any,
    studentProfile: any,
    questionNumber: number
  ): Promise<Question> {
    // 临时实现：使用诊断测试题目生成
    const context: DiagnosticContext = {
      studentProfile: {
        grade: studentProfile?.grade || '未知',
        materialVersion: studentProfile?.materialVersion || '未知',
        learningFoundation: studentProfile?.learningFoundation || '未知',
      },
      trainingGoal: taskConfig?.goal || '综合训练',
      questionNumber,
      totalQuestions: taskConfig?.totalQuestions || 10,
    };

    return this.generateDiagnosticQuestion(context, questionNumber);
  }
}

// 导出单例实例
export const aiQuestionGeneratorService = AIQuestionGeneratorService.getInstance();
