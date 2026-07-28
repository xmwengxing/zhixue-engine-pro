import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import request from '../../utils/request';
import AbilityRadarChart from '../../components/parent/AbilityRadarChart';
import ErrorRingChart from '../../components/parent/ErrorRingChart';

// 学员信息接口
interface StudentProfile {
  realName: string;
  grade: string;
  materialVersion: string;
  subjectLevels: Record<string, string>;
  completeness: number;
}

interface Student {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  studentIdNumber: string | null;
  profile: StudentProfile | null;
}

interface Child {
  relationId: string;
  relation: string;
  bindedAt: string;
  student: Student;
}

// 学情概览数据接口
interface OverviewData {
  abilityRadar: {
    subjects: string[];
    scores: number[];
  };
  errorStats: {
    unmastered: number;
    mastering: number;
    mastered: number;
  };
  learningStreak: {
    days: number;
    weeklyHours: number;
  };
}

/**
 * 家长端 - 学情概览看板
 */
export default function StudentOverview() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  // 获取子女列表
  // 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
  const fetchChildren = useCallback(async () => {
    try {
      setLoading(true);
      const response = await request.get('/parent/children');
      
      const childrenData = response.data.children;
      setChildren(childrenData);

      // 如果没有选中学员且有子女，默认选中第一个
      if (!selectedStudentId && childrenData.length > 0) {
        setSelectedStudentId(childrenData[0].student.id);
      }
    } catch (error: unknown) {
      console.error('获取子女列表失败:', error);
      const apiError = error as { response?: { status?: number } };
      if (apiError.response?.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate, selectedStudentId]);

  const fetchOverviewData = useCallback(async (studentId: string) => {
    try {
      const response = await request.get(`/parent/overview/${studentId}`);
      setOverviewData(response.data);
    } catch (error: unknown) {
      console.error('获取学情概览失败:', error);
      const apiError = error as { response?: { status?: number } };
      if (apiError.response?.status === 401) {
        navigate('/login');
      }
    }
  }, [navigate]);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  // 当选中的学员改变时，获取学情数据
  useEffect(() => {
    if (selectedStudentId) {
      fetchOverviewData(selectedStudentId);
    }
  }, [selectedStudentId, fetchOverviewData]);

  // 从 URL 参数获取学员 ID
  useEffect(() => {
    const studentId = searchParams.get('studentId');
    if (studentId) {
      setSelectedStudentId(studentId);
    }
  }, [searchParams]);

  const handleStudentChange = (studentId: string) => {
    setSelectedStudentId(studentId);
    setSearchParams({ studentId });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-slate-400 text-3xl">person_off</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">暂无绑定学员</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">请先在亲子关系管理中绑定学员</p>
          <button
            onClick={() => navigate('/parent/children')}
            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors"
          >
            前往绑定
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* 顶部导航栏 */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-10 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-blue-600">
            <div className="w-8 h-8 flex items-center justify-center bg-blue-100 dark:bg-blue-900 rounded-lg">
              <span className="material-symbols-outlined text-blue-600">family_restroom</span>
            </div>
            <h2 className="text-slate-900 dark:text-white text-lg font-bold">智能学习成长平台</h2>
          </div>
          <div className="flex items-center gap-8">
            <nav className="flex items-center gap-9">
              <a
                href="/parent/overview"
                className="text-blue-600 text-sm font-bold border-b-2 border-blue-600 pb-1"
              >
                学习报表
              </a>
              <a
                href="/parent/tasks"
                className="text-slate-600 dark:text-slate-300 text-sm font-medium hover:text-blue-600 transition-colors"
              >
                任务中心
              </a>
              <a
                href="/parent/children"
                className="text-slate-600 dark:text-slate-300 text-sm font-medium hover:text-blue-600 transition-colors"
              >
                亲子关系
              </a>
              <a
                href="/parent/profile"
                className="text-slate-600 dark:text-slate-300 text-sm font-medium hover:text-blue-600 transition-colors"
              >
                个人中心
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 flex justify-center py-10 px-4">
        <div className="max-w-[1200px] w-full">
          {/* 标题区域 */}
          <div className="flex flex-col md:flex-row md:items-end justify-between px-4 pb-6">
            <div>
              <h1 className="text-slate-900 dark:text-white text-3xl font-bold">学情概览看板</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
                实时掌握孩子学习动态，全方位了解学习进展和薄弱环节
              </p>
            </div>
          </div>

          {/* 学员切换器 */}
          <div className="pb-8 px-4">
            <div className="flex border-b border-slate-200 dark:border-slate-700 gap-8 overflow-x-auto">
              {children.map((child) => (
                <button
                  key={child.relationId}
                  onClick={() => handleStudentChange(child.student.id)}
                  className={`flex flex-col items-center justify-center border-b-[3px] pb-3 pt-4 transition-all whitespace-nowrap ${
                    selectedStudentId === child.student.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-blue-600'
                  }`}
                >
                  <p className="text-sm font-bold">
                    {child.student.profile?.realName || child.student.username}
                  </p>
                  <p className="text-xs mt-1">{child.student.profile?.grade || '未设置年级'}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 数据卡片区域 */}
          {overviewData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-4">
              {/* 能力雷达图卡片 */}
              <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">能力雷达图</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      各科目掌握程度分析
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-blue-600">radar</span>
                  </div>
                </div>
                <AbilityRadarChart
                  subjects={overviewData.abilityRadar.subjects}
                  scores={overviewData.abilityRadar.scores}
                />
              </div>

              {/* 错题攻克环形图卡片 */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">错题攻克</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      错题掌握度统计
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-red-600">error</span>
                  </div>
                </div>
                <ErrorRingChart
                  unmastered={overviewData.errorStats.unmastered}
                  mastering={overviewData.errorStats.mastering}
                  mastered={overviewData.errorStats.mastered}
                />
              </div>

              {/* 连续学习统计卡片 */}
              <div className="lg:col-span-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-sm p-6 text-white">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold">学习连续性</h3>
                    <p className="text-sm text-blue-100 mt-1">坚持学习，持续进步</p>
                  </div>
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined">local_fire_department</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white/10 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-2xl">calendar_today</span>
                      </div>
                      <div>
                        <p className="text-3xl font-bold">{overviewData.learningStreak.days}</p>
                        <p className="text-sm text-blue-100">连续学习天数</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-2xl">schedule</span>
                      </div>
                      <div>
                        <p className="text-3xl font-bold">{overviewData.learningStreak.weeklyHours}</p>
                        <p className="text-sm text-blue-100">本周学习时长（小时）</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 快速操作区域 */}
          <div className="mt-8 px-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">快速操作</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-600 border-2 border-transparent transition-all">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-blue-600">assignment</span>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-slate-900 dark:text-white">发布任务</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">创建新的学习任务</p>
                  </div>
                </button>
                <button className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-600 border-2 border-transparent transition-all">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-green-600">description</span>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-slate-900 dark:text-white">查看报告</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">查看学习分析报告</p>
                  </div>
                </button>
                <button className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-600 border-2 border-transparent transition-all">
                  <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/20 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-amber-600">star</span>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-slate-900 dark:text-white">愿望审批</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">审批孩子的愿望</p>
                  </div>
                </button>
                <button className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-600 border-2 border-transparent transition-all">
                  <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-purple-600">error</span>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-slate-900 dark:text-white">错题本</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">查看错题详情</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
