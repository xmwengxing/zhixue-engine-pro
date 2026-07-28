// 训练计划展示组件
import React, { useState } from 'react';
import type { TrainingPlan } from '../../pages/student/TrainingCabin';

interface TrainingPlanDisplayProps {
  trainingPlan: TrainingPlan;
  onConfirm: () => void;
}

const TrainingPlanDisplay: React.FC<TrainingPlanDisplayProps> = ({
  trainingPlan,
  onConfirm,
}) => {
  // 控制各阶段的折叠/展开状态
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({
    foundation: true,
    improvement: false,
    application: false,
  });

  // 切换阶段展开状态
  const toggleStage = (stageKey: string) => {
    setExpandedStages(prev => ({
      ...prev,
      [stageKey]: !prev[stageKey],
    }));
  };

  // 获取阶段名称
  const getStageName = (stageKey: string): string => {
    const stageNames: Record<string, string> = {
      foundation: '基础巩固',
      improvement: '能力提升',
      application: '综合应用',
    };
    return stageNames[stageKey] || stageKey;
  };

  // 获取阶段图标
  const getStageIcon = (stageKey: string): React.ReactNode => {
    const icons: Record<string, React.ReactNode> = {
      foundation: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      improvement: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
      application: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    };
    return icons[stageKey] || icons.foundation;
  };

  // 获取掌握程度标签
  const getMasteryLabel = (level: string): { text: string; color: string } => {
    const labels: Record<string, { text: string; color: string }> = {
      weak: { text: '薄弱', color: 'bg-red-100 text-red-800' },
      medium: { text: '一般', color: 'bg-yellow-100 text-yellow-800' },
      strong: { text: '良好', color: 'bg-green-100 text-green-800' },
    };
    return labels[level] || labels.medium;
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* 头部 */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">个性化训练计划</h1>
        <p className="text-gray-600">
          AI 已根据你的诊断测试结果，为你量身定制了以下训练计划
        </p>
      </div>

      {/* 学习目标 */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
          <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          学习目标
        </h2>
        <p className="text-gray-800 mb-4">{trainingPlan.learningGoals.main}</p>
        
        {trainingPlan.learningGoals.subGoals.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">具体目标：</p>
            <ul className="space-y-2">
              {trainingPlan.learningGoals.subGoals.map((goal, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mt-0.5">
                    {index + 1}
                  </span>
                  <span className="text-gray-700">{goal}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 知识点清单 */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <svg className="w-5 h-5 mr-2 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          知识点清单
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {trainingPlan.knowledgePoints
            .sort((a, b) => a.priority - b.priority)
            .map((kp, index) => {
              const masteryLabel = getMasteryLabel(kp.masteryLevel);
              return (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-gray-700">{kp.point}</span>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${masteryLabel.color}`}>
                    {masteryLabel.text}
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* 训练阶段 */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <svg className="w-5 h-5 mr-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          训练阶段
        </h2>

        {Object.entries(trainingPlan.stages).map(([stageKey, stageConfig], index) => {
          const isExpanded = expandedStages[stageKey];
          
          return (
            <div
              key={stageKey}
              className="bg-white rounded-lg border-2 border-gray-200 overflow-hidden transition-all hover:border-gray-300"
            >
              {/* 阶段头部 */}
              <button
                onClick={() => toggleStage(stageKey)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center text-white">
                    {getStageIcon(stageKey)}
                  </div>
                  <div className="text-left">
                    <h3 className="text-base font-semibold text-gray-900">
                      阶段 {index + 1}：{getStageName(stageKey)}
                    </h3>
                    <p className="text-sm text-gray-600">{stageConfig.goal}</p>
                  </div>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    isExpanded ? 'transform rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* 阶段详情 */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-200">
                  {/* 学习重点 */}
                  <div className="pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">学习重点：</p>
                    <ul className="space-y-1">
                      {stageConfig.focus.map((item, idx) => (
                        <li key={idx} className="flex items-start space-x-2 text-sm text-gray-600">
                          <span className="text-blue-500 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 练习信息 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">练习题数</p>
                      <p className="text-lg font-semibold text-blue-900">{stageConfig.questionCount} 道</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">预计用时</p>
                      <p className="text-lg font-semibold text-purple-900">{stageConfig.estimatedTime} 分钟</p>
                    </div>
                  </div>

                  {/* 验收标准 */}
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">验收标准：</p>
                    <ul className="space-y-1">
                      {stageConfig.criteria.map((criterion, idx) => (
                        <li key={idx} className="flex items-start space-x-2 text-sm text-gray-600">
                          <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span>{criterion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 综合考试规划 */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <svg className="w-5 h-5 mr-2 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          综合考试
        </h2>
        <p className="text-gray-700 mb-4">
          完成所有训练阶段后，将进行综合考试，全面检验你的学习成果
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-3 border border-purple-200">
            <p className="text-xs text-gray-600 mb-1">题目数量</p>
            <p className="text-lg font-semibold text-purple-900">{trainingPlan.finalExam.questionCount} 道</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-purple-200">
            <p className="text-xs text-gray-600 mb-1">考试时长</p>
            <p className="text-lg font-semibold text-purple-900">{trainingPlan.finalExam.timeLimit} 分钟</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-purple-200">
            <p className="text-xs text-gray-600 mb-1">及格分数</p>
            <p className="text-lg font-semibold text-purple-900">{trainingPlan.finalExam.passingScore} 分</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-purple-200">
            <p className="text-xs text-gray-600 mb-1">难度分布</p>
            <div className="flex items-center space-x-1 mt-1">
              <span className="text-xs text-green-600">{trainingPlan.finalExam.difficultyDistribution.easy}%</span>
              <span className="text-xs text-gray-400">/</span>
              <span className="text-xs text-yellow-600">{trainingPlan.finalExam.difficultyDistribution.medium}%</span>
              <span className="text-xs text-gray-400">/</span>
              <span className="text-xs text-red-600">{trainingPlan.finalExam.difficultyDistribution.hard}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 预计总用时 */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-gray-700 font-medium">预计总用时</span>
          </div>
          <span className="text-xl font-bold text-gray-900">约 {trainingPlan.estimatedDuration} 分钟</span>
        </div>
      </div>

      {/* 确认按钮 */}
      <div className="sticky bottom-0 bg-white pt-4 pb-2 border-t border-gray-200">
        <button
          onClick={onConfirm}
          className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all shadow-lg hover:shadow-xl"
        >
          确认计划，开始训练
        </button>
        <p className="text-xs text-gray-500 text-center mt-2">
          确认后将按照此计划进行系统化训练
        </p>
      </div>
    </div>
  );
};

export default TrainingPlanDisplay;
