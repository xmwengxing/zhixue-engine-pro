/**
 * AI 异步生成任务的类型定义
 */

export type AIJobKind = 'exam' | 'report';

export interface AIJobData {
  kind: AIJobKind;
  sessionId: string;
  studentId: string;
  taskId?: string;
}

export interface ExamJobResult {
  success: boolean;
  questions: unknown[];
  totalQuestions: number;
  timeLimit: number;
}
