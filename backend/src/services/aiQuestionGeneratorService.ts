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
      const prompt = aiPromptBuilder.buildDiagnosticQuestionPrompt({
        ...context,
        questionNumber,
      });

      // 调用 AI 服务
      const response = await aiServiceManager.callAI(prompt, {
        temperature: 0.7,
        maxTokens: 1000,
        timeout: 10000, // 10 秒超时
      });

      // 解析 JSON 响应
      const question = this.parseQuestionJSON(response);

      // 验证题目结构
      this.validateQuestion(question);

      // 设置题目类型为单选题
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
        maxTokens: 500,
        timeout: 5000, // 5 秒超时
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
        maxTokens: 1000,
        timeout: 10000, // 10 秒超时
      });

      // 解析 JSON 响应
      const question = this.parseQuestionJSON(response);

      // 验证题目结构
      this.validateQuestion(question);

      // 设置题目类型为单选题
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
        timeout: 30000, // 30 秒超时
      });

      // 解析 JSON 数组响应
      const questions = this.parseQuestionsArrayJSON(response);

      // 验证每个题目
      questions.forEach((question, index) => {
        try {
          this.validateQuestion(question);
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
        timeout: 30000, // 30 秒超时
      });

      // 解析 JSON 响应
      const trainingPlan = this.parseTrainingPlanJSON(response);

      // 验证训练计划结构
      this.validateTrainingPlan(trainingPlan);

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
        maxTokens: 500,
        timeout: 5000, // 5 秒超时
      });

      return response.trim();
    } catch (error: any) {
      console.error('AI 助手对话失败:', error);
      return '抱歉，AI 助手暂时无法回复，请稍后再试。如果问题紧急，可以先尝试自己思考或查阅资料。';
    }
  }

  /**
   * 解析训练计划 JSON
   */
  private parseTrainingPlanJSON(response: string): TrainingPlan {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('响应中未找到 JSON 格式的训练计划');
      }

      const trainingPlan = JSON.parse(jsonMatch[0]);
      return trainingPlan;
    } catch (error: any) {
      console.error('解析训练计划 JSON 失败:', error);
      console.error('原始响应:', response);
      throw new Error(`解析训练计划失败：${error.message}`);
    }
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
        timeout: 30000, // 30 秒超时
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
   * 验证训练计划结构
   */
  private validateTrainingPlan(plan: any): void {
    // 验证学习目标
    if (!plan.learningGoals || !plan.learningGoals.main || !Array.isArray(plan.learningGoals.subGoals)) {
      throw new Error('训练计划缺少学习目标');
    }

    // 验证子目标数量（3-5个）
    if (plan.learningGoals.subGoals.length < 3 || plan.learningGoals.subGoals.length > 5) {
      throw new Error(`子目标数量应为 3-5 个，实际为 ${plan.learningGoals.subGoals.length} 个`);
    }

    // 验证知识点清单
    if (!Array.isArray(plan.knowledgePoints)) {
      throw new Error('训练计划缺少知识点清单');
    }

    // 验证知识点数量（5-10个）
    if (plan.knowledgePoints.length < 5 || plan.knowledgePoints.length > 10) {
      throw new Error(`知识点数量应为 5-10 个，实际为 ${plan.knowledgePoints.length} 个`);
    }

    // 验证知识点结构
    plan.knowledgePoints.forEach((kp: any, index: number) => {
      if (!kp.point || !kp.masteryLevel || typeof kp.priority !== 'number') {
        throw new Error(`第 ${index + 1} 个知识点结构不完整`);
      }
      if (!['weak', 'medium', 'strong'].includes(kp.masteryLevel)) {
        throw new Error(`第 ${index + 1} 个知识点的掌握程度值无效：${kp.masteryLevel}`);
      }
    });

    // 验证训练阶段
    if (!plan.stages || !plan.stages.foundation || !plan.stages.improvement || !plan.stages.application) {
      throw new Error('训练计划缺少训练阶段');
    }

    // 验证每个阶段的结构
    const stages = ['foundation', 'improvement', 'application'];
    const stageNames = { foundation: '基础巩固', improvement: '能力提升', application: '综合应用' };
    
    stages.forEach((stageName) => {
      const stage = plan.stages[stageName];
      
      if (!stage.name || !stage.goal || !Array.isArray(stage.focus) || 
          typeof stage.questionCount !== 'number' || typeof stage.estimatedTime !== 'number' ||
          !Array.isArray(stage.criteria)) {
        throw new Error(`${stageNames[stageName as keyof typeof stageNames]}阶段结构不完整`);
      }

      // 验证题目数量范围
      const ranges = {
        foundation: { min: 10, max: 20 },
        improvement: { min: 15, max: 25 },
        application: { min: 10, max: 15 },
      };
      
      const range = ranges[stageName as keyof typeof ranges];
      if (stage.questionCount < range.min || stage.questionCount > range.max) {
        throw new Error(
          `${stageNames[stageName as keyof typeof stageNames]}阶段题目数量应为 ${range.min}-${range.max}，实际为 ${stage.questionCount}`
        );
      }
    });

    // 验证综合考试规划
    if (!plan.finalExam) {
      throw new Error('训练计划缺少综合考试规划');
    }

    const exam = plan.finalExam;
    if (typeof exam.questionCount !== 'number' || typeof exam.timeLimit !== 'number' ||
        typeof exam.passingScore !== 'number' || !exam.difficultyDistribution) {
      throw new Error('综合考试规划结构不完整');
    }

    // 验证考试题目数量（20-50）
    if (exam.questionCount < 20 || exam.questionCount > 50) {
      throw new Error(`综合考试题目数量应为 20-50，实际为 ${exam.questionCount}`);
    }

    // 验证难度分布
    const dist = exam.difficultyDistribution;
    if (typeof dist.easy !== 'number' || typeof dist.medium !== 'number' || typeof dist.hard !== 'number') {
      throw new Error('综合考试难度分布格式错误');
    }

    // 验证难度分布总和为 100（允许 ±5% 误差）
    const total = dist.easy + dist.medium + dist.hard;
    if (Math.abs(total - 100) > 5) {
      throw new Error(`综合考试难度分布总和应为 100%，实际为 ${total}%`);
    }

    // 验证预计总用时
    if (typeof plan.estimatedDuration !== 'number' || plan.estimatedDuration <= 0) {
      throw new Error('训练计划缺少有效的预计总用时');
    }
  }

  /**
   * 解析题目 JSON
   */
  private parseQuestionJSON(response: string): Question {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('响应中未找到 JSON 格式的题目');
      }

      const question = JSON.parse(jsonMatch[0]);
      return question;
    } catch (error: any) {
      console.error('解析题目 JSON 失败:', error);
      console.error('原始响应:', response);
      throw new Error(`解析题目失败：${error.message}`);
    }
  }

  /**
   * 解析题目数组 JSON
   */
  private parseQuestionsArrayJSON(response: string): Question[] {
    try {
      // 尝试提取 JSON 数组
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('响应中未找到 JSON 数组格式的题目');
      }

      const questions = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(questions)) {
        throw new Error('解析结果不是数组');
      }

      return questions;
    } catch (error: any) {
      console.error('解析题目数组 JSON 失败:', error);
      console.error('原始响应:', response);
      throw new Error(`解析题目数组失败：${error.message}`);
    }
  }

  /**
   * 解析答案评估 JSON
   */
  private parseEvaluationJSON(response: string): { isCorrect: boolean; feedback: string; guidance?: string } {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('响应中未找到 JSON 格式的评估结果');
      }

      const evaluation = JSON.parse(jsonMatch[0]);
      return evaluation;
    } catch (error: any) {
      console.error('解析评估 JSON 失败:', error);
      console.error('原始响应:', response);
      throw new Error(`解析评估结果失败：${error.message}`);
    }
  }

  /**
   * 验证题目结构
   */
  private validateQuestion(question: any): void {
    const requiredFields = ['stem', 'options', 'correctAnswer', 'knowledgePoint', 'difficulty', 'explanation'];
    
    for (const field of requiredFields) {
      if (!question[field]) {
        throw new Error(`题目缺少必需字段：${field}`);
      }
    }

    // 验证选项
    if (!Array.isArray(question.options) || question.options.length < 2) {
      throw new Error('题目选项格式错误或数量不足');
    }

    // 验证难度
    if (!['easy', 'medium', 'hard'].includes(question.difficulty)) {
      throw new Error(`题目难度值无效：${question.difficulty}`);
    }
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
