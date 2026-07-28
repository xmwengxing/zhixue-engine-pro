// 学习基础自评组件
import { useState, useEffect } from 'react';
import { studentProfileService } from '../../services/studentProfileService';
import type { StudentProfile } from '../../services/studentProfileService';
import { getErrorMessage } from '../../types/error';

/**
 * 学习基础自评组件
 * 参照设计稿：学员端-学习基础自评
 */
const SelfAssessment = () => {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 主要科目列表
  const subjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];

  // 能力等级选项
  const levels = [
    { value: 'weak', label: '薄弱', color: 'bg-red-100 text-red-800 border-red-300' },
    { value: 'average', label: '一般', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    { value: 'good', label: '良好', color: 'bg-blue-100 text-blue-800 border-blue-300' },
    { value: 'excellent', label: '优秀', color: 'bg-green-100 text-green-800 border-green-300' },
  ];

  // 加载档案数据
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await studentProfileService.getProfile();
      setProfile(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '加载档案失败'));
    } finally {
      setLoading(false);
    }
  };

  // 提交自评
  const handleAssessment = async (subject: string, level: string) => {
    try {
      setSubmitting(true);
      setError(null);
      setSuccessMessage(null);

      const updatedProfile = await studentProfileService.selfAssessment({
        subject,
        level: level as 'weak' | 'average' | 'good' | 'excellent',
      });

      setProfile(updatedProfile);
      setSuccessMessage(`${subject}自评提交成功！`);

      // 3秒后清除成功消息
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '提交自评失败'));
    } finally {
      setSubmitting(false);
    }
  };

  // 获取科目当前等级
  const getSubjectLevel = (subject: string): string | null => {
    if (!profile?.subjectLevels) return null;
    return profile.subjectLevels[subject] || null;
  };

  // 获取等级标签
  const getLevelLabel = (value: string): string => {
    const level = levels.find((l) => l.value === value);
    return level?.label || '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
            <p className="text-yellow-800 dark:text-yellow-300">请先完善基本档案信息，然后再进行学习基础自评。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">学习基础自评</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            请根据你的实际学习情况，对各科目进行能力等级评估
          </p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* 成功提示 */}
        {successMessage && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-green-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-800">{successMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* 科目自评列表 */}
        <div className="space-y-4">
          {subjects.map((subject) => {
            const currentLevel = getSubjectLevel(subject);
            
            return (
              <div key={subject} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{subject}</h3>
                  {currentLevel && (
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                      当前: {getLevelLabel(currentLevel)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {levels.map((level) => (
                    <button
                      key={level.value}
                      onClick={() => handleAssessment(subject, level.value)}
                      disabled={submitting || currentLevel === level.value}
                      className={`
                        px-4 py-3 rounded-lg border-2 font-medium transition-all
                        ${
                          currentLevel === level.value
                            ? level.color + ' ring-2 ring-offset-2 ring-blue-500'
                            : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>

                {!currentLevel && (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">请选择你在该科目的能力等级</p>
                )}
              </div>
            );
          })}
        </div>

        {/* 提示信息 */}
        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-blue-800 mb-1">评估说明</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• 薄弱：该科目基础较差，需要重点加强</li>
                <li>• 一般：该科目基础一般，有提升空间</li>
                <li>• 良好：该科目基础较好，可以进一步巩固</li>
                <li>• 优秀：该科目基础扎实，可以挑战更高难度</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelfAssessment;

