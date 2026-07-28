// AI 返回结构的 zod 校验 schema
// 精确复刻既有 validateQuestion / validateTrainingPlan 的业务规则，
// 并额外加固类型（防止 Prompt Injection 注入畸形/超大结构）。

import { z } from 'zod';

export const DIFFICULTY = ['easy', 'medium', 'hard'] as const;
export const MASTERY = ['weak', 'medium', 'strong'] as const;
export const QUESTION_TYPE = [
  'single_choice',
  'multiple_choice',
  'fill_blank',
  'short_answer',
] as const;

// 训练阶段配置
const StageSchema = z.object({
  name: z.string().min(1),
  goal: z.string().min(1),
  focus: z.array(z.string()),
  questionCount: z.number().int(),
  estimatedTime: z.number(),
  criteria: z.array(z.string()),
});

// 综合考试规划
const FinalExamSchema = z
  .object({
    questionCount: z.number().int().min(20).max(50),
    timeLimit: z.number(),
    passingScore: z.number(),
    difficultyDistribution: z.object({
      easy: z.number(),
      medium: z.number(),
      hard: z.number(),
    }),
  })
  .refine(
    (e) =>
      Math.abs(
        e.difficultyDistribution.easy +
          e.difficultyDistribution.medium +
          e.difficultyDistribution.hard -
          100
      ) <= 5,
    { message: '综合考试难度分布总和应为 100%（允许 ±5%）' }
  );

/**
 * 单题 schema（对应 Question 接口）
 * AI 生成的是单选题，type 由调用方后置为 single_choice，故此处可选。
 */
export const QuestionSchema = z
  .object({
    stem: z.string().min(1, '题干不能为空'),
    type: z.enum(QUESTION_TYPE).optional(),
    options: z.array(z.string()).min(2, '选项至少 2 个').optional(),
    correctAnswer: z.string().min(1, '正确答案不能为空'),
    explanation: z.string().min(1, '解析不能为空'),
    knowledgePoint: z.string().min(1, '知识点不能为空'),
    difficulty: z.enum(DIFFICULTY),
    guidance: z.string().optional(),
  })
  .refine(
    (q) =>
      !q.options ||
      !q.correctAnswer ||
      q.options.includes(q.correctAnswer),
    { message: 'correctAnswer 必须存在于 options 中' }
  );

/** 题目数组（限制最大数量，防超大数组注入） */
export const QuestionArraySchema = z.array(QuestionSchema).min(1).max(100);

/** 训练计划 schema（复刻 validateTrainingPlan 全部规则） */
export const TrainingPlanSchema = z.object({
  learningGoals: z.object({
    main: z.string().min(1, '学习目标主目标不能为空'),
    subGoals: z.array(z.string()).min(3).max(5),
  }),
  knowledgePoints: z
    .array(
      z.object({
        point: z.string().min(1),
        masteryLevel: z.enum(MASTERY),
        priority: z.number(),
      })
    )
    .min(5)
    .max(10),
  stages: z
    .object({
      foundation: StageSchema,
      improvement: StageSchema,
      application: StageSchema,
    })
    .refine(
      (s) => {
        const ranges = {
          foundation: [10, 20],
          improvement: [15, 25],
          application: [10, 15],
        } as const;
        return (Object.keys(ranges) as Array<keyof typeof ranges>).every(
          (k) => {
            const [min, max] = ranges[k];
            return s[k].questionCount >= min && s[k].questionCount <= max;
          }
        );
      },
      { message: '训练阶段题目数量超出允许范围' }
    ),
  finalExam: FinalExamSchema,
  estimatedDuration: z.number().positive('预计总用时必须为正数'),
});

/** 答案评估 schema（对应 parseEvaluationJSON 实际返回的 3 字段） */
export const EvaluationSchema = z.object({
  isCorrect: z.boolean(),
  feedback: z.string().min(1, '反馈不能为空'),
  guidance: z.string().optional(),
});

/** 训练报告内容 schema（对应 reportGenerationService.parseAIResponse） */
export const ReportContentSchema = z.object({
  summary: z.string(),
  abilityAnalysis: z.record(z.string(), z.number()),
  errorAnalysis: z.array(
    z.object({
      questionId: z.string().optional(),
      reason: z.string().optional(),
      suggestion: z.string().optional(),
    })
  ),
  learningAdvice: z.string(),
});

export type QuestionData = z.infer<typeof QuestionSchema>;
export type TrainingPlanData = z.infer<typeof TrainingPlanSchema>;
export type EvaluationData = z.infer<typeof EvaluationSchema>;
export type ReportContentData = z.infer<typeof ReportContentSchema>;
