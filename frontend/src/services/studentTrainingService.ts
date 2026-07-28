// 学员训练服务
import request from '../utils/request';

/**
 * 训练会话相关类型定义
 */
export interface Task {
  id: string;
  studentId: string;
  createdBy: string;
  title: string;
  mode: 'PROFILE' | 'CUSTOM';
  config: {
    materialNodeIds: string[];
    questionCount: number;
    difficulty: number;
  };
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  creator?: {
    id: string;
    username: string;
  };
}

export interface Question {
  id: string;
  materialNodeId: string;
  type: 'CHOICE' | 'FILL' | 'ESSAY';
  content: {
    text: string;
    options?: Array<{ key: string; text: string } | string>;
    [key: string]: unknown;
  }; // JSON 格式
  answer: string;
  difficulty: number;
  knowledgePoints: string[];
  createdAt: string;
}

export interface TrainingSession {
  id: string;
  taskId: string;
  studentId: string;
  phase: 'PRE_TEST' | 'TRAINING' | 'FINAL_EXAM';
  currentStep: number;
  totalSteps: number;
  progress: number;
  questions: string[];
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  startedAt: string;
  completedAt?: string;
  task?: Task;
  currentQuestion?: Question;
  answers?: Array<{
    questionId: string;
    answer: string;
    correct: boolean;
    timeSpent: number;
  }>;
  aiConversations?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

export interface SubmitAnswerResponse {
  success: boolean;
  correct: boolean;
  feedback: string;
  nextQuestion: Question | null;
  progress: number;
  phase: 'PRE_TEST' | 'TRAINING' | 'FINAL_EXAM';
}

export interface CompleteSessionResponse {
  success: boolean;
  points: number;
  sessionId: string;
}

/**
 * 获取当前任务
 */
export const getCurrentTask = async (): Promise<Task | null> => {
  const response = await request.get('/student/tasks/current');
  // 修复：直接返回 response.task，而不是 response.data.task
  return response.task || null;
};

/**
 * 开始训练会话
 */
export const startTraining = async (taskId: string): Promise<TrainingSession> => {
  const response = await request.post(`/student/training/start/${taskId}`);
  // 修复：直接返回 response.session，而不是 response.data.session
  return response.session;
};

/**
 * 获取训练会话详情
 */
export const getSession = async (sessionId: string): Promise<TrainingSession> => {
  const response = await request.get(`/student/training/session/${sessionId}`);
  // 修复：直接返回 response.session，而不是 response.data.session
  return response.session;
};

/**
 * 提交答案
 */
export const submitAnswer = async (
  sessionId: string,
  questionId: string,
  answer: string,
  timeSpent: number
): Promise<SubmitAnswerResponse> => {
  const response = await request.post('/student/training/answer', {
    sessionId,
    questionId,
    answer,
    timeSpent,
  });
  // 修复：直接返回 response，而不是 response.data
  return response;
};

/**
 * 完成训练会话
 */
export const completeSession = async (sessionId: string): Promise<CompleteSessionResponse> => {
  const response = await request.post(`/student/training/complete/${sessionId}`);
  // 修复：直接返回 response，而不是 response.data
  return response;
};

/**
 * AI 对话
 */
export const sendAIMessage = async (
  sessionId: string,
  message: string,
  context?: {
    questionId?: string;
    answer?: string;
    isCorrect?: boolean;
  }
): Promise<string> => {
  const response = await request.post('/student/ai/chat', {
    sessionId,
    message,
    context,
  });
  // 修复：直接返回 response.reply，而不是 response.data.reply
  return response.reply;
};
