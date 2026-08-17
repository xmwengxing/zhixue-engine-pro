// 训练舱主页面 - 档案提取模式
// 支持四阶段训练流程：诊断测试 → 训练计划 → 引导式训练 → 综合考试
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TrainingLeftPanel from '../../components/student/TrainingLeftPanel';
import TrainingCenterPanel from '../../components/student/TrainingCenterPanel';
import TrainingRightPanel from '../../components/student/TrainingRightPanel';
import DailyCalendarBar from '../../components/student/DailyCalendarBar';
import { getErrorMessage } from '../../types/error';

// 训练阶段类型
export type TrainingPhase = 
  | 'DIAGNOSTIC_TEST'    // 诊断测试
  | 'PLANNING'           // 生成训练计划
  | 'GUIDED_TRAINING'    // 引导式训练
  | 'FINAL_EXAM'         // 综合考试
  | 'COMPLETED';         // 已完成

// 训练会话接口
export interface TrainingSession {
  id: string;
  taskId: string;
  studentId: string;
  phase: TrainingPhase;
  
  // 诊断测试数据
  diagnosticTestData?: {
    totalQuestions: number;
    currentQuestion: number;
    answers: AnswerRecord[];
    results?: DiagnosticResults;
  };
  
  // 训练计划
  trainingPlanData?: TrainingPlan;
  
  // 训练阶段进度
  trainingProgress?: {
    currentStage: 'foundation' | 'improvement' | 'application';
    stages: {
      foundation: StageProgress;
      improvement: StageProgress;
      application: StageProgress;
    };
  };
  
  // 综合考试数据
  finalExamData?: {
    questions: Question[];
    answers: Record<string, string>;
    results?: ExamResults;
  };
  
  // 训练报告
  trainingReport?: string;
  
  // 任务信息
  task?: {
    id: string;
    title: string;
    category?: 'SUBJECT_MAIN' | 'SPECIAL';
    config: {
      trainingGoal?: string;
      diagnosticQuestionCount?: number;
      parentEncouragement?: string;
    };
  };
  
  createdAt: string;
  updatedAt: string;
}

// 题目接口
export interface Question {
  id: string;
  stem: string;
  type: 'single_choice' | 'multiple_choice' | 'fill_blank' | 'short_answer';
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  knowledgePoint: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

// 答题记录接口
export interface AnswerRecord {
  questionId: string;
  questionNumber: number;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  timeSpent: number;
  feedback: string;
  explanation: string;
  knowledgePoint: string;
  answeredAt: string;
}

// 训练计划接口
export interface TrainingPlan {
  id: string;
  sessionId: string;
  learningGoals: {
    main: string;
    subGoals: string[];
  };
  knowledgePoints: {
    point: string;
    masteryLevel: 'weak' | 'medium' | 'strong';
    priority: number;
  }[];
  stages: {
    foundation: TrainingStageConfig;
    improvement: TrainingStageConfig;
    application: TrainingStageConfig;
  };
  finalExam: {
    questionCount: number;
    timeLimit: number;
    passingScore: number;
    difficultyDistribution: {
      easy: number;
      medium: number;
      hard: number;
    };
  };
  estimatedDuration: number;
  generatedAt: string;
}

// 训练阶段配置接口
export interface TrainingStageConfig {
  name: string;
  goal: string;
  focus: string[];
  questionCount: number;
  estimatedTime: number;
  criteria: string[];
}

// 阶段进度接口
export interface StageProgress {
  totalQuestions: number;
  completedQuestions: number;
  correctCount: number;
  answers: AnswerRecord[];
  completed: boolean;
}

// 诊断结果接口
export interface DiagnosticResults {
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  knowledgePointAnalysis: {
    point: string;
    totalQuestions: number;
    correctCount: number;
    accuracy: number;
  }[];
  weakPoints: string[];
}

// 考试逐题评估（交卷后由后端返回，用于 AI 逐题精讲）
export interface ExamEvaluation {
  questionIndex: number;
  question: Question;
  studentAnswer: string;
  correctAnswer?: string;
  isCorrect: boolean;
  score?: number;
  feedback?: string;
}

// 考试结果接口
export interface ExamResults {
  totalScore: number;
  maxScore?: number;
  accuracy: number;
  correctCount?: number;
  totalQuestions?: number;
  knowledgePointScores: {
    point: string;
    score: number;
    accuracy: number;
  }[];
  evaluations?: ExamEvaluation[];
}

const TrainingCabin: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  // 状态管理
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 移动端单栏切换：题目 / 进度 / AI 助手
  const [mobileTab, setMobileTab] = useState<'question' | 'progress' | 'ai'>('question');

  // 初始化训练会话
  useEffect(() => {
    const initSession = async () => {
      if (!taskId) {
        setError('任务 ID 缺失');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        // 调用 API 创建训练会话
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/student/training/start/${taskId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || '创建训练会话失败');
        }
        
        const data = await response.json();
        setSession(data.session);
        setError(null);
      } catch (err: unknown) {
        console.error('初始化训练会话失败:', err);
        setError(getErrorMessage(err, '初始化训练会话失败'));
      } finally {
        setIsLoading(false);
      }
    };

    initSession();
  }, [taskId]);

  // 处理会话更新
  const handleSessionUpdate = (updatedSession: Partial<TrainingSession>) => {
    setSession(prev => prev ? { ...prev, ...updatedSession } : null);
  };

  // 处理题目更新
  const handleQuestionUpdate = (question: Question | null) => {
    setCurrentQuestion(question);
  };

  // 加载中状态
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#111722]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3b82f6] mx-auto" />
          <p className="mt-4 text-[#92a4c9]">正在初始化训练舱...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#111722]">
        <div className="text-center max-w-md bg-[#232f48] border border-[#324467] rounded-xl p-8">
          <svg
            className="mx-auto h-12 w-12 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="mt-4 text-red-300">{error}</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              重试
            </button>
            <button
              onClick={() => navigate('/student/tasks')}
              className="px-4 py-2 bg-[#1a2332] text-[#92a4c9] border border-[#324467] rounded-lg hover:border-[#3b82f6] transition-colors"
            >
              返回任务中心
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-[#111722]">
      {/* 顶部导航栏 */}
      <header className="bg-[#232f48] border-b border-[#324467] px-4 lg:px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 lg:space-x-4 min-w-0 flex-1">
            {/* 返回按钮 */}
            <button
              onClick={() => {
                if (window.confirm('确定要退出训练吗？进度将会保存。')) {
                  navigate('/student/tasks');
                }
              }}
              className="text-[#92a4c9] hover:text-white transition-colors flex-shrink-0"
              aria-label="返回"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </button>
            <h1 className="text-lg lg:text-xl font-semibold text-white truncate min-w-0">
              {session.task?.title || '智能训练舱'}
            </h1>
          </div>
          <div className="flex items-center space-x-4 flex-shrink-0">
            <span className="hidden sm:inline-flex text-xs lg:text-sm text-[#92a4c9] font-medium px-3 py-1 rounded-full bg-[#1a2332] border border-[#324467]">
              {session.phase === 'DIAGNOSTIC_TEST' && '诊断测试'}
              {session.phase === 'PLANNING' && '生成训练计划'}
              {session.phase === 'GUIDED_TRAINING' && '引导式训练'}
              {session.phase === 'FINAL_EXAM' && '综合考试'}
              {session.phase === 'COMPLETED' && '训练完成'}
            </span>
          </div>
        </div>
      </header>

      {/* 学科总任务：每日训练日程表（√/×） */}
      {session.task?.category === 'SUBJECT_MAIN' && taskId && <DailyCalendarBar taskId={taskId} />}

      {/* 三栏布局 - 桌面端（lg 以下隐藏，避免与移动端布局重复挂载导致重复请求） */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* 左侧栏：任务信息和进度 (20%) */}
        <aside className="w-1/5 bg-[#232f48] border-r border-[#324467] overflow-y-auto">
          <TrainingLeftPanel
            session={session}
            onSessionUpdate={handleSessionUpdate}
          />
        </aside>

        {/* 中间栏：题目区域 (50%) */}
        <main className="flex-1 bg-[#111722] overflow-y-auto">
          <TrainingCenterPanel
            session={session}
            currentQuestion={currentQuestion}
            onSessionUpdate={handleSessionUpdate}
            onQuestionUpdate={handleQuestionUpdate}
          />
        </main>

        {/* 右侧栏：AI 助手 (30%) */}
        <aside className="w-[30%] bg-[#232f48] border-l border-[#324467] overflow-y-auto">
          <TrainingRightPanel
            session={session}
            currentQuestion={currentQuestion}
          />
        </aside>
      </div>

      {/* 移动端布局 - 单栏，使用标签页切换 */}
      <div className="lg:hidden flex-1 flex flex-col overflow-hidden">
        {/* 移动端内容区域 */}
        <div className="flex-1 overflow-y-auto bg-[#111722]">
          {mobileTab === 'question' && (
            <TrainingCenterPanel
              session={session}
              currentQuestion={currentQuestion}
              onSessionUpdate={handleSessionUpdate}
              onQuestionUpdate={handleQuestionUpdate}
            />
          )}
          {mobileTab === 'progress' && (
            <TrainingLeftPanel session={session} onSessionUpdate={handleSessionUpdate} />
          )}
          {mobileTab === 'ai' && (
            <TrainingRightPanel session={session} currentQuestion={currentQuestion} />
          )}
        </div>

        {/* 移动端底部导航（含 iPhone 底部安全区适配） */}
        <nav className="bg-[#232f48] border-t border-[#324467] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex justify-around">
          {([
            { key: 'question', label: '题目', d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            { key: 'progress', label: '进度', d: 'M13 10V3L4 14h7v7l9-11h-7z' },
            { key: 'ai', label: 'AI助手', d: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setMobileTab(t.key)}
              className={`flex flex-col items-center py-2.5 px-3 min-w-[64px] rounded-lg transition-colors active:bg-[#1a2332] ${
                mobileTab === t.key ? 'text-[#3b82f6]' : 'text-[#92a4c9] hover:text-white'
              }`}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.d} />
              </svg>
              <span className="text-xs mt-1">{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default TrainingCabin;
