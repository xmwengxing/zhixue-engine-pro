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
  mode: 'PROFILE' | 'CUSTOM' | 'EXAM_PAPER';
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
  // P3 双轨字段
  category?: 'SUBJECT_MAIN' | 'SPECIAL';
  subject?: string | null;
  specialType?: 'UNIT' | 'KNOWLEDGE_POINT' | 'ERROR_BOOK' | null;
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
 * P3 双轨：获取任务列表（学科总任务 / 专项攻克双区）
 */
export const getStudentTasks = async (params?: {
  category?: 'SUBJECT_MAIN' | 'SPECIAL';
  subject?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ tasks: Task[]; total: number; page: number; limit: number }> => {
  const query = new URLSearchParams();
  if (params?.category) query.set('category', params.category);
  if (params?.subject) query.set('subject', params.subject);
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const response = await request.get(`/student/tasks${qs ? `?${qs}` : ''}`);
  return response.data || { tasks: [], total: 0, page: 1, limit: 20 };
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
 * 生成稳定的幂等键（离线/重试防重复提交）
 * 同一 (sessionId, questionId) 在浏览器内复用同一键，避免网络恢复后重复提交。
 */
function getIdempotencyKey(seed: string): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return `${seed}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  }
  const storageKey = `idem:${seed}`;
  let key = window.localStorage.getItem(storageKey);
  if (!key) {
    key = `${seed}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(storageKey, key);
  }
  return key;
}

/**
 * 提交答案
 */
export const submitAnswer = async (
  sessionId: string,
  questionId: string,
  answer: string,
  timeSpent: number
): Promise<SubmitAnswerResponse> => {
  // 修正端点路径以匹配后端 /training/submit-answer/:sessionId，并携带幂等键
  const idempotencyKey = getIdempotencyKey(`answer:${sessionId}:${questionId}`);
  const response = await request.post(
    `/student/training/submit-answer/${sessionId}`,
    { sessionId, questionId, answer, timeSpent },
    { headers: { 'Idempotency-Key': idempotencyKey } }
  );
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

/**
 * 开始综合考试（异步生成题目）
 * 后端入队后台生成，返回 { status:'generating', jobId } 或同步降级结果。
 */
export interface StartFinalExamResponse {
  success?: boolean;
  status: 'generating' | 'started';
  jobId?: string;
  message?: string;
  [key: string]: unknown;
}

export const startFinalExam = async (sessionId: string): Promise<StartFinalExamResponse> => {
  const response = await request.post(`/student/training/start-exam/${sessionId}`);
  return response;
};

/**
 * 获取训练报告
 * 若报告已生成返回内容，否则返回 { status:'generating' } 由前端订阅 SSE。
 */
export const getTrainingReport = async (
  sessionId: string
): Promise<{ status: string; content?: unknown; [key: string]: unknown }> => {
  const response = await request.get(`/student/training/report/${sessionId}`);
  return response;
};
