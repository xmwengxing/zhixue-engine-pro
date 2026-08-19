// 训练舱中间栏 - 题目区域
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TrainingPlanDisplay from './TrainingPlanDisplay';
import TrainingReportDisplay from './TrainingReportDisplay';
import ReportGeneratingProgress from './ReportGeneratingProgress';
import type { TrainingSession, Question } from '../../pages/student/TrainingCabin';
import { startFinalExam, getSession, resumeTraining } from '../../services/studentTrainingService';
import { subscribeExamProgress } from '../../services/aiStreamService';

interface TrainingCenterPanelProps {
  session: TrainingSession;
  currentQuestion: Question | null;
  onSessionUpdate: (session: Partial<TrainingSession>) => void;
  onQuestionUpdate: (question: Question | null) => void;
}

// 家长激励寄语卡片
const ParentEncouragementCard: React.FC<{ message: string }> = ({ message }) => (
  <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-5 mb-6 flex items-start space-x-3 w-full max-w-2xl">
    <div className="text-2xl leading-none flex-shrink-0">💌</div>
    <div className="flex-1">
      <p className="text-sm font-semibold text-rose-300 mb-1">爸爸妈妈想对你说</p>
      <p className="text-[#e2e8f5] leading-relaxed whitespace-pre-wrap">{message}</p>
    </div>
  </div>
);

const TrainingCenterPanel: React.FC<TrainingCenterPanelProps> = ({
  session,
  currentQuestion,
  onSessionUpdate,
  onQuestionUpdate,
}) => {
  const [answer, setAnswer] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    message: string;
    explanation?: string;
  } | null>(null);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // 题目加载错误（可关闭的内联错误态，避免 alert 无限循环导致训练舱卡死）
  const [loadError, setLoadError] = useState<string | null>(null);
  const navigate = useNavigate();

  // FINAL_EXAM 阶段：题目来自 startFinalExam 批量生成的 finalExamData，前端逐题管理
  const [finalExamIndex, setFinalExamIndex] = useState<number | null>(null);
  const [finalExamAnswers, setFinalExamAnswers] = useState<Record<number, string>>({});

  // ① 本题是从断点快照恢复的（而非新出的）
  const [resumedNotice, setResumedNotice] = useState(false);
  // ③ 真实等待计时：替代原先的假进度条，明确告诉学员已等多久、慢在哪
  const [loadElapsed, setLoadElapsed] = useState(0);

  // 当题目变化时重置状态
  useEffect(() => {
    setAnswer('');
    setFeedback(null);
    setStartTime(Date.now());
  }, [currentQuestion]);

  // ③ 出题等待计时器
  useEffect(() => {
    if (!isLoading) {
      setLoadElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      setLoadElapsed(Math.round((Date.now() - started) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [isLoading]);

  // 阶段切换时清除历史加载错误，避免残留错误态干扰新阶段
  useEffect(() => {
    setLoadError(null);
  }, [session.phase]);

  // PLANNING 阶段轮询训练计划
  // 后端在诊断结束后异步生成计划（本地 AI 推理可能耗时 1~3 分钟，失败则落规则兜底计划）。
  // 不轮询的话前端会永远停在转圈动画上 —— 这正是此前"训练舱卡死"的终态。
  const [planWaitSec, setPlanWaitSec] = useState(0);
  useEffect(() => {
    if (session.phase !== 'PLANNING') return;
    // 遗留⑤：拿到的可能是「快速版」规则计划（provisional=true），
    // 此时仍需继续轮询，等 AI 优化版落库后自动替换。
    const plan = session.trainingPlanData as unknown as { provisional?: boolean } | undefined;
    if (plan && plan.provisional !== true) return;

    let cancelled = false;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (cancelled) return;
      setPlanWaitSec(Math.round((Date.now() - started) / 1000));
      try {
        const refreshed = (await getSession(session.id)) as unknown as TrainingSession;
        if (cancelled) return;
        const refreshedPlan = refreshed?.trainingPlanData as unknown as
          | { provisional?: boolean }
          | undefined;
        if (refreshedPlan) {
          onSessionUpdate(refreshed);
          // 只有拿到非临时版（AI 版）才停止轮询
          if (refreshedPlan.provisional !== true) {
            clearInterval(timer);
          }
        }
      } catch {
        // 轮询失败静默重试，不打断学员
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session.phase, session.trainingPlanData, session.id]);

  // 自动加载第一道题目（诊断测试或训练阶段）
  // 注意：loadError 必须在依赖中；一旦出错则停止自动重试，避免 alert 无限循环使训练舱卡死
  useEffect(() => {
    const shouldLoadQuestion = 
      !currentQuestion && 
      !isLoading && 
      !loadError &&
      (session.phase === 'DIAGNOSTIC_TEST' || session.phase === 'GUIDED_TRAINING');
    
    if (shouldLoadQuestion) {
      loadNextQuestion();
    }
  }, [session.phase, currentQuestion, isLoading, loadError]);

  // 开始综合考试：触发后台异步生成题目，并通过 SSE 订阅进度
  const handleStartFinalExam = async () => {
    setIsLoading(true);
    try {
      const data = await startFinalExam(session.id);

      const beginExam = async () => {
        try {
          const refreshed = (await getSession(session.id)) as unknown as TrainingSession;
          onSessionUpdate(refreshed);
          const questions = (refreshed.finalExamData as { questions?: Question[] } | undefined)?.questions;
          if (questions && questions.length > 0) {
            setFinalExamIndex(0);
            onQuestionUpdate(questions[0]);
          }
        } catch (err) {
          console.error('刷新综合考试题目失败:', err);
        } finally {
          setIsLoading(false);
        }
      };

      if (data.jobId) {
        // 异步生成：订阅 SSE，完成后进入考试
        subscribeExamProgress(data.jobId, {
          onDone: () => {
            beginExam();
          },
          onError: (message) => {
            console.error('综合考试生成失败:', message);
            alert('综合考试生成失败，请重试');
            setIsLoading(false);
          },
        });
      } else {
        // 同步降级：直接开始
        await beginExam();
      }
    } catch (err) {
      console.error('开始综合考试失败:', err);
      alert('开始综合考试失败，请重试');
      setIsLoading(false);
    }
  };

  // 加载下一道题目
  // ① 断点续答：统一走 /resume —— 后端若还留着「已下发未提交」的题目快照就直接回同一道题，
  //    刷新页面 / 换设备都不会跳题，也不会重复触发一次 20~30s 的 AI 出题。
  const loadNextQuestion = async () => {
    // FINAL_EXAM 阶段：题目来自 startFinalExam 批量生成的 finalExamData，不走 resume
    if (session.phase === 'FINAL_EXAM' && finalExamIndex !== null) {
      const questions = (session.finalExamData as { questions?: Question[] } | undefined)?.questions;
      const next = finalExamIndex + 1;
      if (questions && next < questions.length) {
        setFinalExamIndex(next);
        onQuestionUpdate(questions[next]);
      }
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setResumedNotice(false);
    try {
      const data = await resumeTraining(session.id);
      if (!data?.question) {
        throw new Error(data?.reason || '后端未返回题目数据');
      }
      setResumedNotice(Boolean(data.fromSnapshot));
      onQuestionUpdate(data.question as unknown as Question);
    } catch (error) {
      // 关键修复：用可关闭的内联错误态替代阻塞式 alert，并保留后端真实错误原因，避免无限循环卡死
      console.error('加载题目失败:', error);
      const msg =
        (error as { response?: { data?: { error?: { message?: string }; message?: string } } })
          ?.response?.data?.error?.message ||
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error as Error)?.message ||
        '加载题目失败，请重试';
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // 提交答案
  const handleSubmitAnswer = async () => {
    // FINAL_EXAM 阶段：收集答案，最后一题批量提交
    if (session.phase === 'FINAL_EXAM' && finalExamIndex !== null) {
      await handleFinalExamSubmit();
      return;
    }

    if (!answer.trim() || !currentQuestion) {
      alert('请先作答');
      return;
    }

    setIsSubmitting(true);
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    try {
      // 调用 API 提交答案
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/student/training/submit-answer/${session.id}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          questionData: currentQuestion,
          answer,
          timeSpent,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error?.message || errorData?.message || '提交答案失败'
        );
      }

      // 后端 submit-answer 返回的是「平铺结构」：
      // 诊断阶段 { correct, feedback, explanation, guidance, progress, phase, completed, planGenerating }
      // 引导训练 { correct, feedback, explanation, guidance, stageCompleted, currentStage, ... }
      // 原代码读 data.evaluation.isCorrect 会直接抛 TypeError，导致每次提交都弹「提交答案失败」。
      const data = await response.json();

      setFeedback({
        isCorrect: Boolean(data.correct),
        message: data.feedback || (data.correct ? '回答正确！' : '回答错误'),
        explanation: data.explanation || data.guidance || undefined,
      });

      // 进度 / 阶段推进
      const nextPhase: string | undefined =
        data.completed && data.phase ? data.phase : undefined;
      if (typeof data.progress === 'number') {
        onSessionUpdate({ progress: data.progress } as Partial<TrainingSession>);
      }

      // 延迟后加载下一题或进入下一阶段
      setTimeout(async () => {
        setFeedback(null);
        if (nextPhase) {
          // 诊断做完 → PLANNING；用整份会话刷新，确保 trainingPlanData 轮询能启动
          try {
            const refreshed = (await getSession(session.id)) as unknown as TrainingSession;
            onSessionUpdate(refreshed);
          } catch {
            onSessionUpdate({ phase: nextPhase } as Partial<TrainingSession>);
          }
          onQuestionUpdate(null);
        } else if (data.stageCompleted) {
          // 引导训练某个子阶段完成 → 拉最新会话，由 completeStage / 后端推进阶段
          try {
            const refreshed = (await getSession(session.id)) as unknown as TrainingSession;
            onSessionUpdate(refreshed);
          } catch {
            /* 忽略，下面照常取下一题 */
          }
          onQuestionUpdate(null);
        } else {
          onQuestionUpdate(null); // 触发自动加载 effect 拉下一题
        }
      }, 3000);
    } catch (error) {
      console.error('提交答案失败:', error);
      alert((error as Error)?.message || '提交答案失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 综合考试提交：逐题收集答案，最后一题批量提交后端评估
  const handleFinalExamSubmit = async () => {
    if (!answer.trim()) {
      alert('请先作答');
      return;
    }

    setIsSubmitting(true);
    try {
      const idx = finalExamIndex as number;
      const updatedAnswers = { ...finalExamAnswers, [idx]: answer };
      setFinalExamAnswers(updatedAnswers);

      const questions = (session.finalExamData as { questions?: Question[] } | undefined)?.questions;
      if (questions && idx < questions.length - 1) {
        // 还有下一题
        const next = idx + 1;
        setFinalExamIndex(next);
        onQuestionUpdate(questions[next]);
        return;
      }

      // 最后一题：批量提交
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/student/training/submit-exam/${session.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answers: updatedAnswers }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '提交综合考试失败');
      }

      // 后端已将 phase 置为 COMPLETED，刷新会话以进入报告生成阶段
      const refreshed = (await getSession(session.id)) as unknown as TrainingSession;
      onSessionUpdate(refreshed);
    } catch (error) {
      console.error('提交综合考试失败:', error);
      alert('提交综合考试失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 确认训练计划
  const handleConfirmPlan = async () => {
    try {
      // 调用 API 确认训练计划
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/student/training/confirm-plan/${session.id}`, { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '确认训练计划失败');
      }
      
      await response.json().catch(() => null);
      
      // 更新会话状态
      onSessionUpdate({ phase: 'GUIDED_TRAINING' });
      
      // 加载第一道训练题目
      loadNextQuestion();
    } catch (error) {
      console.error('确认训练计划失败:', error);
      alert('确认训练计划失败，请重试');
    }
  };

  // 渲染题目加载失败（可关闭，带重试/返回，不会无限弹窗）
  const renderLoadError = () => (
    <div className="flex flex-col items-center justify-center h-full space-y-4 px-6">
      <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center">
        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-[#c3cfe6] text-center max-w-md leading-relaxed">{loadError}</p>
      <div className="flex space-x-3">
        <button
          onClick={() => loadNextQuestion()}
          className="px-6 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          重试
        </button>
        <button
          onClick={() => navigate('/student/tasks')}
          className="px-6 py-2 bg-[#1a2332] text-[#92a4c9] border border-[#324467] rounded-lg hover:border-[#3b82f6] transition-colors"
        >
          返回任务中心
        </button>
      </div>
    </div>
  );

  // ③ 真实出题等待态（替代假进度条）：3s 内基本是题库直出，超过 3s 才是 AI 在生成
  const renderQuestionLoading = (accent: string) => {
    const aiPhase = loadElapsed >= 3;
    // 本地推理经验值约 30s，用它作为进度参考上限；到顶后保持 95% 不再欺骗性满格
    const pct = aiPhase ? Math.min(95, Math.round(((loadElapsed - 3) / 30) * 95)) : null;
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4 px-6">
        <div className={`animate-spin rounded-full h-12 w-12 border-b-2 ${accent}`} />
        <p className="text-[#92a4c9]">
          {aiPhase ? 'AI 正在为你生成题目…' : '正在从题库为你选题…'}
        </p>
        {pct !== null && (
          <div className="w-full max-w-sm">
            <div className="h-1.5 w-full bg-[#1a2332] rounded-full overflow-hidden border border-[#324467]">
              <div
                className="h-full bg-[#3b82f6] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[#5b6b8c] text-center">
              已等待 {loadElapsed}s · 题库无覆盖时才调用 AI 出题，通常 20~35s
            </p>
          </div>
        )}
      </div>
    );
  };

  // 渲染诊断测试阶段
  const renderDiagnosticTest = () => {
    if (isLoading) {
      return renderQuestionLoading('border-[#3b82f6]');
    }

    if (loadError) return renderLoadError();

    if (!currentQuestion) {
      const encouragement = session.task?.config?.parentEncouragement;
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4 px-6">
          {encouragement && <ParentEncouragementCard message={encouragement} />}
          <svg className="w-16 h-16 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-[#92a4c9]">准备开始诊断测试</p>
          <button
            onClick={loadNextQuestion}
            className="px-6 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            开始测试
          </button>
        </div>
      );
    }

    return renderQuestion();
  };

  // 渲染训练计划阶段
  const renderPlanning = () => {
    if (!session.trainingPlanData) {
      const stalled = planWaitSec >= 180; // 3 分钟仍未拿到 → 给出手动出口
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4 px-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500" />
          <p className="text-[#92a4c9]">AI 正在分析你的诊断结果...</p>
          <p className="text-sm text-[#5b6b8c]">
            正在生成个性化训练计划{planWaitSec > 0 ? `（已用时 ${planWaitSec}s）` : ''}
          </p>
          <p className="text-xs text-[#5b6b8c] max-w-md">
            本地 AI 推理较慢，通常需要 1~3 分钟，页面会自动刷新，请勿关闭。
          </p>
          {stalled && (
            <button
              onClick={async () => {
                try {
                  const refreshed = (await getSession(session.id)) as unknown as TrainingSession;
                  onSessionUpdate(refreshed);
                } catch {
                  alert('刷新失败，请检查网络后重试');
                }
              }}
              className="mt-2 px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors"
            >
              手动刷新
            </button>
          )}
        </div>
      );
    }

    // 遗留⑤：先落规则「快速版」计划让学员秒进，AI 优化版后台生成完成后自动替换
    const isProvisional =
      (session.trainingPlanData as unknown as { provisional?: boolean })?.provisional === true;

    return (
      <div className="h-full overflow-y-auto">
        {isProvisional && (
          <div className="mx-6 mt-6 flex items-start gap-3 rounded-lg bg-violet-500/10 border border-violet-500/30 px-4 py-3">
            <div className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin rounded-full border-b-2 border-violet-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-violet-200">
                这是根据诊断结果即时生成的快速版计划
              </p>
              <p className="text-xs text-violet-300/80 mt-1">
                AI 正在后台打磨更贴合你的版本
                {planWaitSec > 0 ? `（已用时 ${planWaitSec}s）` : ''}
                ，完成后会自动更新。你也可以直接确认，按当前计划先练起来。
              </p>
            </div>
          </div>
        )}
        <TrainingPlanDisplay
          trainingPlan={session.trainingPlanData}
          onConfirm={handleConfirmPlan}
        />
      </div>
    );
  };

  // 渲染引导式训练阶段
  const renderGuidedTraining = () => {
    if (isLoading) {
      return renderQuestionLoading('border-emerald-500');
    }

    if (loadError) return renderLoadError();

    if (!currentQuestion) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <svg className="w-16 h-16 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[#92a4c9]">准备开始训练</p>
          <button
            onClick={loadNextQuestion}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
          >
            开始训练
          </button>
        </div>
      );
    }

    return renderQuestion();
  };

  // 渲染综合考试阶段
  const renderFinalExam = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500" />
          <p className="text-[#92a4c9]">AI 正在生成考试题目...</p>
        </div>
      );
    }

    if (!currentQuestion) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <svg className="w-16 h-16 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-[#92a4c9]">准备开始综合考试</p>
          <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-4 max-w-md text-left space-y-2">
            <p className="text-sm font-semibold text-amber-200">📝 即将进入考试模式</p>
            <ul className="text-sm text-amber-100/90 space-y-1 list-disc list-inside">
              <li>考试期间 AI 助教暂停服务，请独立完成</li>
              <li>题目一次性生成，可逐题作答，最后统一交卷</li>
              <li>
                <strong>交卷后 AI 会立刻解锁</strong>，为你逐题精讲错因
              </li>
            </ul>
          </div>
          <button
            onClick={handleStartFinalExam}
            className="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors"
          >
            开始考试
          </button>
        </div>
      );
    }

    return renderQuestion();
  };

  // 渲染训练完成阶段
  const renderCompleted = () => {
    if (!session.trainingReport) {
      return (
        <ReportGeneratingProgress
          sessionId={session.id}
          onComplete={(report) => onSessionUpdate({ trainingReport: report })}
          onError={(message) => console.error('报告生成失败:', message)}
        />
      );
    }

    return (
      <div className="h-full overflow-y-auto">
        {session.task?.config?.parentEncouragement && (
          <div className="px-6 pt-6">
            <ParentEncouragementCard message={session.task.config.parentEncouragement} />
          </div>
        )}
        <TrainingReportDisplay report={session.trainingReport} />
      </div>
    );
  };

  // 渲染题目
  const renderQuestion = () => {
    if (!currentQuestion) return null;

    // 是否为选择题：以「有选项」为准，避免后端题型字段不一致导致既没有选项也没有输入框
    const hasOptions = Array.isArray(currentQuestion.options) && currentQuestion.options.length > 0;
    const needsTextInput = !hasOptions;

    const examQuestions =
      (session.finalExamData as { questions?: Question[] } | undefined)?.questions ?? [];
    const isExamMode = session.phase === 'FINAL_EXAM' && finalExamIndex !== null;
    const isLastExamQuestion = isExamMode && finalExamIndex === examQuestions.length - 1;

    return (
      <div className="h-full flex flex-col p-6 space-y-6">
        {/* ② 考试模式常驻提示卡：解释 AI 为什么变灰，并承诺交卷后解锁 */}
        {isExamMode && (
          <div className="flex items-start space-x-3 bg-amber-500/10 border border-amber-500/40 rounded-lg px-4 py-3">
            <span className="text-lg leading-none">📝</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-200">
                考试模式进行中 · 第 {(finalExamIndex ?? 0) + 1} / {examQuestions.length} 题
              </p>
              <p className="text-xs text-amber-100/80 mt-0.5">
                AI 助教已暂停（考试需独立完成）；交卷后自动解锁，会为你逐题精讲。
              </p>
            </div>
          </div>
        )}

        {/* ① 断点续答提示：这道题是上次没答完留下的 */}
        {resumedNotice && !isExamMode && (
          <div className="flex items-start space-x-3 bg-[#3b82f6]/10 border border-[#3b82f6]/40 rounded-lg px-4 py-3">
            <span className="text-lg leading-none">⏱️</span>
            <p className="text-sm text-[#9fc4ff]">
              已为你恢复到上次未完成的这道题，继续作答即可。
            </p>
          </div>
        )}

        {/* 题目头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="px-3 py-1 bg-[#3b82f6]/15 text-[#7ab0ff] text-sm font-medium rounded-full border border-[#3b82f6]/30">
              {currentQuestion.knowledgePoint}
            </span>
            <span className={`px-3 py-1 text-sm font-medium rounded-full border ${
              currentQuestion.difficulty === 'easy' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
              currentQuestion.difficulty === 'medium' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
              'bg-red-500/15 text-red-300 border-red-500/30'
            }`}>
              {currentQuestion.difficulty === 'easy' ? '简单' :
               currentQuestion.difficulty === 'medium' ? '中等' : '困难'}
            </span>
          </div>
          {session.diagnosticTestData && (
            <span className="text-sm text-[#92a4c9]">
              第 {session.diagnosticTestData.currentQuestion + 1} / {session.diagnosticTestData.totalQuestions} 题
            </span>
          )}
        </div>

        {/* 题目内容 */}
        <div className="flex-1 bg-[#232f48] rounded-xl p-6 border border-[#324467]">
          <h3 className="text-lg font-medium text-white mb-4">题目</h3>
          <p className="text-base text-[#e2e8f5] leading-relaxed whitespace-pre-wrap">
            {currentQuestion.stem}
          </p>

          {/* 题目图片（几何/函数图形题；content.image → /uploads/questions/...） */}
          {currentQuestion.image && (
            <img
              src={currentQuestion.image}
              alt="题目图"
              className="mt-4 max-w-full rounded-lg border border-[#324467]"
              style={{ maxHeight: '320px', objectFit: 'contain' }}
              onClick={(e) => e.currentTarget.requestFullscreen?.()}
            />
          )}

          {/* 选项（单选/多选） */}
          {hasOptions && (
            <div className="mt-6 space-y-3">
              {currentQuestion.options!.map((option, index) => (
                <label
                  key={index}
                  className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    answer === option
                      ? 'border-[#3b82f6] bg-[#3b82f6]/10'
                      : 'border-[#324467] bg-[#1a2332] hover:border-[#3b82f6]/60'
                  } ${feedback ? 'pointer-events-none opacity-90' : ''}`}
                >
                  <input
                    type="radio"
                    name="answer"
                    value={option}
                    checked={answer === option}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={!!feedback}
                    className="mt-1 mr-3 accent-[#3b82f6]"
                  />
                  <span className="text-[#e2e8f5]">{option}</span>
                </label>
              ))}
            </div>
          )}

          {/* 填空题 / 简答题输入框（无选项时一律给输入框，避免无法作答） */}
          {needsTextInput && (
            <div className="mt-6">
              <label className="block text-sm text-[#92a4c9] mb-2">
                {currentQuestion.type === 'short_answer' ? '解答（可分步骤书写）' : '你的答案'}
              </label>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={!!feedback}
                placeholder="请输入你的答案..."
                className="w-full px-4 py-3 bg-[#1a2332] border border-[#324467] text-white placeholder-[#5b6b8c] rounded-lg focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent resize-none disabled:opacity-60"
                rows={currentQuestion.type === 'short_answer' ? 6 : 3}
              />
              <p className="mt-2 text-xs text-[#5b6b8c]">
                提交后 AI 会读取你的作答内容进行批改与讲解
              </p>
            </div>
          )}

          {/* 反馈信息 */}
          {feedback && (
            <div className={`mt-6 p-4 rounded-lg border ${
              feedback.isCorrect
                ? 'bg-emerald-500/10 border-emerald-500/40'
                : 'bg-red-500/10 border-red-500/40'
            }`}>
              <div className="flex items-start space-x-3">
                {feedback.isCorrect ? (
                  <svg className="w-6 h-6 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                <div className="flex-1">
                  <p className={`font-medium ${feedback.isCorrect ? 'text-emerald-300' : 'text-red-300'}`}>
                    {feedback.message}
                  </p>
                  {feedback.explanation && (
                    <p className="mt-2 text-sm text-[#c3cfe6] leading-relaxed whitespace-pre-wrap">
                      {feedback.explanation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 提交按钮 */}
        {!feedback ? (
          <button
            onClick={handleSubmitAnswer}
            disabled={!answer.trim() || isSubmitting}
            className="w-full py-3 bg-[#3b82f6] text-white font-medium rounded-lg hover:bg-blue-600 disabled:bg-[#324467] disabled:text-[#5b6b8c] disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting
              ? '提交中...'
              : isLastExamQuestion
                ? '交卷并查看讲解'
                : isExamMode
                  ? '下一题'
                  : '提交答案'}
          </button>
        ) : (
          <div className="text-center text-sm text-[#92a4c9] py-3">
            正在进入下一题…
          </div>
        )}
      </div>
    );
  };

  // 根据阶段渲染不同内容
  switch (session.phase) {
    case 'DIAGNOSTIC_TEST':
      return renderDiagnosticTest();
    case 'PLANNING':
      return renderPlanning();
    case 'GUIDED_TRAINING':
      return renderGuidedTraining();
    case 'FINAL_EXAM':
      return renderFinalExam();
    case 'COMPLETED':
      return renderCompleted();
    default:
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-[#92a4c9]">未知阶段</p>
        </div>
      );
  }
};

export default TrainingCenterPanel;
