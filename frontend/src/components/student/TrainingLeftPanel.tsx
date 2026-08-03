// 训练舱左侧栏 - 任务信息和进度
import React from 'react';
import type { TrainingSession } from '../../pages/student/TrainingCabin';

interface TrainingLeftPanelProps {
  session: TrainingSession;
  onSessionUpdate: (session: Partial<TrainingSession>) => void;
}

const TrainingLeftPanel: React.FC<TrainingLeftPanelProps> = ({ session }) => {
  // 计算当前进度
  const calculateProgress = (): { current: number; total: number; percentage: number } => {
    const { phase, diagnosticTestData, trainingProgress, finalExamData } = session;

    if (phase === 'DIAGNOSTIC_TEST' && diagnosticTestData) {
      return {
        current: diagnosticTestData.currentQuestion,
        total: diagnosticTestData.totalQuestions,
        percentage: Math.round((diagnosticTestData.currentQuestion / diagnosticTestData.totalQuestions) * 100),
      };
    }

    if (phase === 'GUIDED_TRAINING' && trainingProgress) {
      const { currentStage, stages } = trainingProgress;
      const currentStageData = stages[currentStage];
      
      if (currentStageData) {
        return {
          current: currentStageData.completedQuestions,
          total: currentStageData.totalQuestions,
          percentage: Math.round((currentStageData.completedQuestions / currentStageData.totalQuestions) * 100),
        };
      }
    }

    if (phase === 'FINAL_EXAM' && finalExamData) {
      const answeredCount = Object.keys(finalExamData.answers || {}).length;
      const totalCount = finalExamData.questions.length;
      return {
        current: answeredCount,
        total: totalCount,
        percentage: Math.round((answeredCount / totalCount) * 100),
      };
    }

    return { current: 0, total: 0, percentage: 0 };
  };

  // 获取阶段名称
  const getPhaseName = (phase: string): string => {
    const phaseNames: Record<string, string> = {
      DIAGNOSTIC_TEST: '诊断测试',
      PLANNING: '生成训练计划',
      GUIDED_TRAINING: '引导式训练',
      FINAL_EXAM: '综合考试',
      COMPLETED: '训练完成',
    };
    return phaseNames[phase] || phase;
  };

  // 获取训练阶段名称
  const getStageName = (stage: string): string => {
    const stageNames: Record<string, string> = {
      foundation: '基础巩固',
      improvement: '能力提升',
      application: '综合应用',
    };
    return stageNames[stage] || stage;
  };

  const progress = calculateProgress();
  const trainingPlan = session.trainingPlanData;

  return (
    <div className="h-full flex flex-col p-4 space-y-6">
      {/* 任务信息 */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-[#e2e8f5]">任务信息</h2>
        <div className="bg-blue-500/10 rounded-lg p-4 space-y-2">
          <div className="flex items-start space-x-2">
            <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{session.task?.title || '训练任务'}</p>
            </div>
          </div>
          
          {session.task?.config?.trainingGoal && (
            <div className="flex items-start space-x-2 mt-3">
              <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#92a4c9] mb-1">训练目标</p>
                <p className="text-sm text-[#e2e8f5]">{session.task.config.trainingGoal}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 当前阶段 */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-[#e2e8f5]">当前阶段</h2>
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse"></div>
            <p className="text-sm font-medium text-white">{getPhaseName(session.phase)}</p>
          </div>
          
          {session.phase === 'GUIDED_TRAINING' && session.trainingProgress && (
            <p className="text-xs text-[#92a4c9] mt-2">
              {getStageName(session.trainingProgress.currentStage)}
            </p>
          )}
        </div>
      </div>

      {/* 进度条 */}
      {progress.total > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-[#e2e8f5]">训练进度</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#92a4c9]">已完成</span>
              <span className="font-medium text-white">
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full bg-[#324467] rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <p className="text-xs text-[#5b6b8c] text-right">{progress.percentage}%</p>
          </div>
        </div>
      )}

      {/* 训练计划概览 */}
      {trainingPlan && session.phase !== 'DIAGNOSTIC_TEST' && session.phase !== 'PLANNING' && (
        <div className="space-y-3 flex-1 overflow-y-auto">
          <h2 className="text-lg font-semibold text-[#e2e8f5]">训练计划</h2>
          <div className="space-y-2">
            {/* 学习目标 */}
            <div className="bg-[#232f48] rounded-lg p-3 border border-[#324467]">
              <p className="text-xs font-medium text-[#5b6b8c] mb-2">学习目标</p>
              <p className="text-sm text-[#e2e8f5]">{trainingPlan.learningGoals.main}</p>
            </div>

            {/* 训练阶段 */}
            <div className="space-y-2">
              {Object.entries(trainingPlan.stages).map(([stageKey, stageConfig]) => {
                const isCurrentStage = session.trainingProgress?.currentStage === stageKey;
                const stageProgress = session.trainingProgress?.stages[stageKey as keyof typeof session.trainingProgress.stages];
                const isCompleted = stageProgress?.completed || false;

                return (
                  <div
                    key={stageKey}
                    className={`rounded-lg p-3 border transition-all ${
                      isCurrentStage
                        ? 'bg-blue-500/10 border-blue-500/40 shadow-sm'
                        : isCompleted
                        ? 'bg-green-500/10 border-green-500/40'
                        : 'bg-[#1a2332] border-[#324467]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-sm font-medium ${
                        isCurrentStage ? 'text-blue-300' : isCompleted ? 'text-green-300' : 'text-[#c3cfe6]'
                      }`}>
                        {getStageName(stageKey)}
                      </p>
                      {isCompleted && (
                        <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                      {isCurrentStage && !isCompleted && (
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                      )}
                    </div>
                    <p className="text-xs text-[#92a4c9]">{stageConfig.goal}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-[#5b6b8c]">
                      <span>{stageConfig.questionCount} 道题</span>
                      <span>约 {stageConfig.estimatedTime} 分钟</span>
                    </div>
                    
                    {/* 阶段进度 */}
                    {stageProgress && !isCompleted && (
                      <div className="mt-2">
                        <div className="w-full bg-[#324467] rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-full rounded-full transition-all"
                            style={{
                              width: `${(stageProgress.completedQuestions / stageProgress.totalQuestions) * 100}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 综合考试 */}
            {trainingPlan.finalExam && (
              <div
                className={`rounded-lg p-3 border transition-all ${
                  session.phase === 'FINAL_EXAM'
                    ? 'bg-purple-500/10 border-purple-500/40 shadow-sm'
                    : session.phase === 'COMPLETED'
                    ? 'bg-green-500/10 border-green-500/40'
                    : 'bg-[#1a2332] border-[#324467]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-sm font-medium ${
                    session.phase === 'FINAL_EXAM' ? 'text-purple-300' : session.phase === 'COMPLETED' ? 'text-green-300' : 'text-[#c3cfe6]'
                  }`}>
                    综合考试
                  </p>
                  {session.phase === 'COMPLETED' && (
                    <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                  {session.phase === 'FINAL_EXAM' && (
                    <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse"></div>
                  )}
                </div>
                <p className="text-xs text-[#92a4c9]">全面检验学习成果</p>
                <div className="flex items-center justify-between mt-2 text-xs text-[#5b6b8c]">
                  <span>{trainingPlan.finalExam.questionCount} 道题</span>
                  <span>约 {trainingPlan.finalExam.timeLimit} 分钟</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 预计剩余时间 */}
      {trainingPlan && session.phase !== 'COMPLETED' && (
        <div className="bg-[#1a2332] rounded-lg p-3 border border-[#324467]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-[#92a4c9]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-[#92a4c9]">预计总用时</span>
            </div>
            <span className="text-sm font-medium text-white">
              约 {trainingPlan.estimatedDuration} 分钟
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingLeftPanel;
