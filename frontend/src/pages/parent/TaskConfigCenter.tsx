import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../types/error';
import { GRADE_OPTIONS } from '../../constants/grades';
import { LEARNING_FOUNDATION_OPTIONS } from '../../constants/learningFoundation';
import request from '../../utils/request';

/**
 * 学员信息接口
 */
interface Student {
  id: string;
  username: string;
  studentIdNumber: string | null;
  profile: {
    realName: string;
    grade: string;
    school?: string;
    learningFoundation?: string;
    interests?: string;
  } | null;
}

/**
 * AI 科目老师接口
 */
interface AITeacher {
  id: string;
  subject: string;
  systemPrompt: string;
}

/**
 * 任务配置中心页面
 * 家长可以为学员创建学习任务
 * 支持两种模式: 自定义配置模式和档案提取模式
 */
export default function TaskConfigCenter() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'CUSTOM' | 'PROFILE'>('CUSTOM');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 学员列表和 AI 老师列表
  const [students, setStudents] = useState<Student[]>([]);
  const [aiTeachers, setAITeachers] = useState<AITeacher[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // 自定义模式表单数据
  const [customForm, setCustomForm] = useState({
    studentId: '',
    title: '',
    aiTeacher: '',
    subject: '',
    materialVersion: '',
    units: [] as string[],
    goal: '',
    personality: '',
  });

  // 档案模式表单数据
  const [profileForm, setProfileForm] = useState({
    studentId: '',
    aiTeacher: '',
    trainingGoal: '', // 训练目标
    diagnosticQuestionCount: 10, // 诊断题目数量，默认 10
    tempSchool: '',
    tempLearningFoundation: '',
    tempInterests: '',
  });

  // 选中的学员(用于档案模式显示)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // 家长激励寄语（两种模式共用）
  const [encouragement, setEncouragement] = useState('');
  const [generatingEncouragement, setGeneratingEncouragement] = useState(false);

  /**
   * AI 生成激励寄语草稿
   */
  const handleGenerateEncouragement = async () => {
    const studentId = mode === 'CUSTOM' ? customForm.studentId : profileForm.studentId;
    const goal = mode === 'CUSTOM' ? customForm.goal : profileForm.trainingGoal;

    if (!studentId) {
      alert('请先选择学员');
      return;
    }

    setGeneratingEncouragement(true);
    try {
      const response = await request.post('/parent/encouragement/ai', {
        studentId,
        goal: goal || undefined,
      });
      if (response.data?.suggestion) {
        setEncouragement(response.data.suggestion.slice(0, 200));
      }
    } catch (err: unknown) {
      console.error('AI 生成激励寄语失败:', err);
      alert(getErrorMessage(err, 'AI 生成失败，请稍后重试或手动填写'));
    } finally {
      setGeneratingEncouragement(false);
    }
  };

  /**
   * 加载学员列表和 AI 老师列表
   */
  useEffect(() => {
    const loadData = async () => {
      try {
        // 加载学员列表
        const studentsRes = await request.get('/parent/children');
        console.log('API 返回的原始数据:', studentsRes);
        // 后端返回格式: { success: true, data: { children: [...] } }
        // 每个 children 元素包含 student 对象，需要提取出来
        const childrenData = studentsRes.data?.children || [];
        console.log('children 数据:', childrenData);
        const studentsData = childrenData.map((child: any) => ({
          id: child.student.id,
          username: child.student.username,
          studentIdNumber: child.student.studentIdNumber,
          profile: child.student.profile,
        }));
        console.log('转换后的学员数据:', studentsData);
        setStudents(studentsData);

        // 加载 AI 老师列表(从科目指令表)
        const aiTeachersRes = await request.get('/parent/tasks/ai-teachers');
        setAITeachers(aiTeachersRes.data || []);
      } catch (err: unknown) {
        console.error('加载数据失败:', err);
        setError(getErrorMessage(err, '加载数据失败'));
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

  /**
   * 处理学员选择(档案模式)
   */
  const handleStudentSelect = (studentId: string) => {
    console.log('选择学员 ID:', studentId);
    console.log('当前学员列表:', students);
    const student = students.find((s) => s.id === studentId);
    console.log('找到的学员:', student);
    console.log('学员档案详情:', student?.profile);
    setSelectedStudent(student || null);
    setProfileForm({ ...profileForm, studentId });
  };

  /**
   * 处理表单提交
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('未登录');
      }

      let requestBody: any = {
        mode,
        parentEncouragement: encouragement.trim() || undefined,
      };

      if (mode === 'CUSTOM') {
        // 自定义模式
        if (!customForm.studentId || !customForm.title || !customForm.aiTeacher || 
            !customForm.subject || !customForm.materialVersion || customForm.units.length === 0 || 
            !customForm.goal) {
          throw new Error('请填写所有必填字段');
        }

        requestBody.studentId = customForm.studentId;
        requestBody.customConfig = {
          title: customForm.title,
          aiTeacher: customForm.aiTeacher,
          subject: customForm.subject,
          materialVersion: customForm.materialVersion,
          units: customForm.units,
          goal: customForm.goal,
          personality: customForm.personality || undefined,
        };
      } else {
        // 档案模式
        if (!profileForm.studentId || !profileForm.aiTeacher || !profileForm.trainingGoal) {
          throw new Error('请选择学员、AI 科目老师并填写训练目标');
        }

        // 验证训练目标长度（10-500字符）
        if (profileForm.trainingGoal.length < 10 || profileForm.trainingGoal.length > 500) {
          throw new Error('训练目标长度必须在 10-500 字符之间');
        }

        // 验证诊断题目数量（5-20）
        if (profileForm.diagnosticQuestionCount < 5 || profileForm.diagnosticQuestionCount > 20) {
          throw new Error('诊断题目数量必须在 5-20 之间');
        }

        requestBody.studentId = profileForm.studentId;
        requestBody.profileConfig = {
          aiTeacher: profileForm.aiTeacher,
          trainingGoal: profileForm.trainingGoal,
          diagnosticQuestionCount: profileForm.diagnosticQuestionCount,
          tempOverrides: {
            school: profileForm.tempSchool || undefined,
            learningFoundation: profileForm.tempLearningFoundation || undefined,
            interests: profileForm.tempInterests || undefined,
          },
        };
      }

      const response = await request.post('/parent/tasks', requestBody);

      // request.post 已经返回解析后的数据，不需要再调用 .json()
      if (!response.success) {
        throw new Error(response.error?.message || response.message || '创建任务失败');
      }

      alert(`任务创建成功！任务 ID: ${response.data.id}`);
      navigate('/parent/dashboard');
    } catch (err: unknown) {
      setError(getErrorMessage(err, '创建任务失败'));
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 flex items-center justify-center">
        <div className="text-gray-600">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">任务配置中心</h1>
          <p className="mt-2 text-gray-600">为学员创建个性化学习任务</p>
        </div>

        {/* Tab 切换 */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                type="button"
                onClick={() => setMode('CUSTOM')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  mode === 'CUSTOM'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                自定义配置模式
              </button>
              <button
                type="button"
                onClick={() => setMode('PROFILE')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  mode === 'PROFILE'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                档案提取模式
              </button>
            </nav>
          </div>

          {/* 模式说明 */}
          <div className="p-6 bg-blue-50 border-b border-gray-200">
            {mode === 'CUSTOM' ? (
              <p className="text-sm text-blue-700">
                自定义配置模式: 自由选择教材内容、题目数量和难度，完全自定义学习任务
              </p>
            ) : (
              <p className="text-sm text-blue-700">
                档案提取模式: 基于学员档案自动生成推荐任务，智能匹配学习内容。可临时修改部分信息，不影响学员档案
              </p>
            )}
          </div>
        </div>

        {/* 任务配置表单 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">任务配置</h2>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 自定义模式表单 */}
            {mode === 'CUSTOM' && (
              <>
                {/* 学员选择 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    选择学员 <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={customForm.studentId}
                    onChange={(e) => setCustomForm({ ...customForm, studentId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">请选择学员</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.profile?.realName || student.username} 
                        {student.studentIdNumber && ` (${student.studentIdNumber})`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 任务标题 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    任务标题 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customForm.title}
                    onChange={(e) => setCustomForm({ ...customForm, title: e.target.value })}
                    placeholder="例如：数学第一单元练习"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* AI 科目老师 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    AI 科目老师 <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={customForm.aiTeacher}
                    onChange={(e) => setCustomForm({ ...customForm, aiTeacher: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">请选择 AI 科目老师</option>
                    {aiTeachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.subject}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 科目 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    科目 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customForm.subject}
                    onChange={(e) => setCustomForm({ ...customForm, subject: e.target.value })}
                    placeholder="例如：数学"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* 教材版本 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    教材版本 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customForm.materialVersion}
                    onChange={(e) => setCustomForm({ ...customForm, materialVersion: e.target.value })}
                    placeholder="例如：人教版"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* 单元选择 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    单元 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customForm.units.join(', ')}
                    onChange={(e) =>
                      setCustomForm({
                        ...customForm,
                        units: e.target.value.split(',').map((u) => u.trim()).filter((u) => u),
                      })
                    }
                    placeholder="多个单元用逗号分隔，例如：第一单元, 第二单元"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-sm text-gray-500">支持多选，用逗号分隔</p>
                </div>

                {/* 任务目标 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    任务目标 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    value={customForm.goal}
                    onChange={(e) => setCustomForm({ ...customForm, goal: e.target.value })}
                    placeholder="描述本次任务的学习目标和要求"
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* 性格特征(选填) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    性格特征 (选填)
                  </label>
                  <textarea
                    value={customForm.personality}
                    onChange={(e) => setCustomForm({ ...customForm, personality: e.target.value })}
                    placeholder="描述学员的性格特征，帮助 AI 更好地调整教学方式"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </>
            )}

            {/* 档案模式表单 */}
            {mode === 'PROFILE' && (
              <>
                {/* 学员选择 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    选择学员 <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={profileForm.studentId}
                    onChange={(e) => handleStudentSelect(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">请选择学员</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.profile?.realName || student.username}
                        {student.studentIdNumber && ` (${student.studentIdNumber})`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 学员档案信息展示 */}
                {selectedStudent && selectedStudent.profile && (
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">学员档案信息</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">姓名:</span>
                        <span className="ml-2 text-gray-900">{selectedStudent.profile.realName}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">年级:</span>
                        <span className="ml-2 text-gray-900">
                          {GRADE_OPTIONS.find((g) => g.value === selectedStudent.profile?.grade)?.label || 
                           selectedStudent.profile.grade}
                        </span>
                      </div>
                      {selectedStudent.profile.school && (
                        <div>
                          <span className="text-gray-600">学校:</span>
                          <span className="ml-2 text-gray-900">{selectedStudent.profile.school}</span>
                        </div>
                      )}
                      {selectedStudent.profile.learningFoundation && (
                        <div>
                          <span className="text-gray-600">学习基础:</span>
                          <span className="ml-2 text-gray-900">
                            {LEARNING_FOUNDATION_OPTIONS.find(
                              (lf) => lf.value === selectedStudent.profile?.learningFoundation
                            )?.label || selectedStudent.profile.learningFoundation}
                          </span>
                        </div>
                      )}
                      {selectedStudent.profile.interests && (
                        <div className="col-span-2">
                          <span className="text-gray-600">兴趣爱好:</span>
                          <span className="ml-2 text-gray-900">{selectedStudent.profile.interests}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* AI 科目老师 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    AI 科目老师 <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={profileForm.aiTeacher}
                    onChange={(e) => setProfileForm({ ...profileForm, aiTeacher: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">请选择 AI 科目老师</option>
                    {aiTeachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.subject}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 训练目标 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    训练目标 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    value={profileForm.trainingGoal}
                    onChange={(e) => setProfileForm({ ...profileForm, trainingGoal: e.target.value })}
                    placeholder="描述本次训练的目标，例如：巩固第一单元知识点、提升计算能力等"
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    训练目标长度需在 10-500 字符之间（当前：{profileForm.trainingGoal.length} 字符）
                  </p>
                  {profileForm.trainingGoal.length > 0 && 
                   (profileForm.trainingGoal.length < 10 || profileForm.trainingGoal.length > 500) && (
                    <p className="mt-1 text-sm text-red-600">
                      {profileForm.trainingGoal.length < 10 
                        ? `还需输入 ${10 - profileForm.trainingGoal.length} 个字符` 
                        : `超出 ${profileForm.trainingGoal.length - 500} 个字符`}
                    </p>
                  )}
                </div>

                {/* 诊断题目数量 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    诊断题目数量 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={5}
                    max={20}
                    value={profileForm.diagnosticQuestionCount}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 10;
                      setProfileForm({ ...profileForm, diagnosticQuestionCount: value });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    设置诊断测试的题目数量，范围：5-20 题，默认 10 题
                  </p>
                  {(profileForm.diagnosticQuestionCount < 5 || profileForm.diagnosticQuestionCount > 20) && (
                    <p className="mt-1 text-sm text-red-600">
                      诊断题目数量必须在 5-20 之间
                    </p>
                  )}
                </div>

                {/* 临时修改区域 */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">
                    临时修改 (仅用于本次任务，不影响学员档案)
                  </h3>

                  {/* 临时学校 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      学校 (临时)
                    </label>
                    <input
                      type="text"
                      value={profileForm.tempSchool}
                      onChange={(e) => setProfileForm({ ...profileForm, tempSchool: e.target.value })}
                      placeholder={selectedStudent?.profile?.school || '输入学校名称'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* 临时学习基础 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      学习基础 (临时)
                    </label>
                    <select
                      value={profileForm.tempLearningFoundation}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, tempLearningFoundation: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">使用档案中的值</option>
                      {LEARNING_FOUNDATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 临时兴趣爱好 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      兴趣爱好 (临时)
                    </label>
                    <textarea
                      value={profileForm.tempInterests}
                      onChange={(e) => setProfileForm({ ...profileForm, tempInterests: e.target.value })}
                      placeholder={selectedStudent?.profile?.interests || '输入兴趣爱好'}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </>
            )}

            {/* 家长激励寄语（两种模式共用） */}
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  家长激励寄语 (选填)
                </label>
                <button
                  type="button"
                  onClick={handleGenerateEncouragement}
                  disabled={generatingEncouragement}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingEncouragement ? 'AI 生成中...' : '✨ AI 帮我写'}
                </button>
              </div>
              <textarea
                value={encouragement}
                onChange={(e) => setEncouragement(e.target.value.slice(0, 200))}
                placeholder="写一段激励孩子的话，孩子在训练时会看到。也可以点击「AI 帮我写」生成后再修改"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500">{encouragement.length}/200 字</p>
            </div>

            {/* 提交按钮 */}
            <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => navigate('/parent/dashboard')}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? '创建中...' : '创建任务'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
