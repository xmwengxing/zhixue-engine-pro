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
 * 试卷列表项（家长端选卷用）
 */
interface ExamPaperItem {
  id: string;
  title: string;
  subject: string;
  grade?: string | null;
  status: string;
  _count?: { items: number };
  createdAt: string;
  updatedAt: string;
}

/**
 * 题库概况（某科目各题型可用题目数量）
 */
interface BankSummary {
  subject: string;
  total: number;
  byType: Record<string, number>;
}

/**
 * P3 双轨：教材（含单元）— 专项攻克·单元目标选择用
 */
interface TextbookWithUnits {
  id: string;
  name: string;
  subject: string;
  version?: string;
  grade?: string;
  term?: string;
  unitCount: number;
  units: Array<{ id: string; seq?: number; name: string }>;
}

/**
 * P3 双轨：薄弱知识点（知识点专项候选）
 */
interface WeakPoint {
  point: string;
  errorCount: number;
}

/**
 * P3 双轨：子女错题（错题本专项多选用）
 */
interface ChildError {
  id: string;
  subject: string;
  mastery?: string;
  stem: string;
  type?: string;
  difficulty?: number;
  knowledgePoints?: string[];
}

/**
 * P3 双轨：专项类型选项
 */
const SPECIAL_TYPE_OPTIONS = [
  { value: 'UNIT', label: '按单元攻克', desc: '选择教材单元，从题库抽取对应单元题目' },
  { value: 'KNOWLEDGE_POINT', label: '按知识点攻克', desc: '针对薄弱知识点做专项练习' },
  { value: 'ERROR_BOOK', label: '按错题本攻克', desc: '从孩子错题本挑选题目重新练习' },
] as const;

/**
 * 题型中文标签（与题库admin页保持一致）
 */
const EXAM_TYPE_LABELS: Record<string, string> = {
  CHOICE: '单选题',
  MULTIPLE_CHOICE: '多选题',
  JUDGE: '判断题',
  FILL: '填空题',
  ESSAY: '解答题',
  FORMULA: '公式题',
  GEOMETRY: '几何题',
  GRAPHING: '函数作图',
  PROOF: '证明题',
  SORTING: '排序题',
  MATCHING: '连线题',
};

/**
 * 任务配置中心页面
 * 家长可以为学员创建学习任务
 * 支持两种模式: 自定义配置模式和档案提取模式
 */
export default function TaskConfigCenter() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'CUSTOM' | 'PROFILE' | 'EXAM_PAPER'>('CUSTOM');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // P3 双轨：任务大类（学科总任务 / 专项攻克任务）
  const [taskCategory, setTaskCategory] = useState<'SUBJECT_MAIN' | 'SPECIAL'>('SUBJECT_MAIN');

  // P3 双轨：专项攻克表单
  const [specialForm, setSpecialForm] = useState({
    studentId: '',
    subject: '',
    specialType: 'UNIT' as 'UNIT' | 'KNOWLEDGE_POINT' | 'ERROR_BOOK',
    textbookId: '',
    unitIds: [] as string[],
    knowledgePoints: [] as string[],
    errorQuestionIds: [] as string[],
    questionCount: 10,
    title: '',
  });
  const [specialTextbooks, setSpecialTextbooks] = useState<TextbookWithUnits[]>([]);
  const [weakPoints, setWeakPoints] = useState<WeakPoint[]>([]);
  const [childErrors, setChildErrors] = useState<ChildError[]>([]);
  const [loadingSpecialData, setLoadingSpecialData] = useState(false);
  const [customKpInput, setCustomKpInput] = useState('');

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

  // P2 题库化初测：初始测试题来源（档案模式）
  const [initialTestSource, setInitialTestSource] = useState<'AI' | 'PAPER'>('AI');
  const [initialTestPaperId, setInitialTestPaperId] = useState('');
  const [profilePapers, setProfilePapers] = useState<ExamPaperItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    questions: Array<{
      id: string;
      stem: string;
      type: string;
      difficulty: number;
      knowledgePoints: string[];
    }>;
    meta: { reason?: string; shortage?: Record<string, number> };
  } | null>(null);

  // 选中的学员(用于档案模式显示)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // 家长激励寄语（两种模式共用）
  const [encouragement, setEncouragement] = useState('');
  const [generatingEncouragement, setGeneratingEncouragement] = useState(false);

  // 组卷模式表单数据
  const [examForm, setExamForm] = useState({
    studentId: '',
    source: 'PAPER' as 'PAPER' | 'RANDOM',
    paperId: '',
    subject: '',
    questionCount: 10,
    types: [] as string[],
    difficultyMin: 1,
    difficultyMax: 5,
    knowledgePoints: [] as string[],
    title: '',
  });

  // 组卷模式支撑数据
  const [papers, setPapers] = useState<ExamPaperItem[]>([]);
  const [bankSummary, setBankSummary] = useState<BankSummary | null>(null);
  const [examSubjects, setExamSubjects] = useState<string[]>([]); // 随机组卷可选科目（取自科目老师）
  const [loadingExamData, setLoadingExamData] = useState(false);

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
   * 加载组卷模式支撑数据：已发布试卷 + 随机组卷可选科目
   */
  useEffect(() => {
    if (mode !== 'EXAM_PAPER') return;
    const loadExamData = async () => {
      setLoadingExamData(true);
      try {
        // 已发布试卷
        const papersRes = await request.get('/parent/question-bank/papers');
        setPapers(papersRes.data?.papers || []);
        // 可选科目：取自科目老师配置（与题库 materialNode SUBJECT 名称一致）
        const subs = Array.from(new Set(aiTeachers.map((t) => t.subject))).filter(Boolean);
        setExamSubjects(subs);
      } catch (err) {
        console.error('加载组卷数据失败:', err);
        setError(getErrorMessage(err, '加载题库数据失败'));
      } finally {
        setLoadingExamData(false);
      }
    };
    loadExamData();
  }, [mode, aiTeachers]);

  /**
   * P2 题库化初测：档案模式选卷时加载已发布试卷
   */
  useEffect(() => {
    if (mode !== 'PROFILE' || initialTestSource !== 'PAPER' || profilePapers.length > 0) return;
    (async () => {
      try {
        const papersRes = await request.get('/parent/question-bank/papers');
        setProfilePapers(papersRes.data?.papers || []);
      } catch (err) {
        console.error('加载试卷列表失败:', err);
      }
    })();
  }, [mode, initialTestSource, profilePapers.length]);

  /**
   * P2 题库化初测：预览将抽到的初测题目
   */
  const handlePreviewInitialTest = async () => {
    const teacher = aiTeachers.find((t) => t.id === profileForm.aiTeacher);
    if (initialTestSource === 'AI' && (!profileForm.studentId || !teacher)) {
      alert('请先选择学员和 AI 科目老师');
      return;
    }
    if (initialTestSource === 'PAPER' && !initialTestPaperId) {
      alert('请先选择试卷');
      return;
    }
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const body =
        initialTestSource === 'PAPER'
          ? { source: 'PAPER', paperId: initialTestPaperId }
          : {
              source: 'AI',
              studentId: profileForm.studentId,
              subject: teacher!.subject,
              count: profileForm.diagnosticQuestionCount,
            };
      const res = await request.post('/parent/tasks/initial-test/preview', body);
      if (res.success) {
        setPreviewData(res.data);
      } else {
        throw new Error(res.error?.message || '预览失败');
      }
    } catch (err) {
      setError(getErrorMessage(err, '初测预览失败'));
    } finally {
      setPreviewLoading(false);
    }
  };

  /**
   * 随机组卷：选择科目后加载题库概况（各题型可用数量）
   */
  useEffect(() => {
    if (mode !== 'EXAM_PAPER' || examForm.source !== 'RANDOM' || !examForm.subject) {
      setBankSummary(null);
      return;
    }
    const loadSummary = async () => {
      try {
        const res = await request.get(
          `/parent/question-bank/summary?subject=${encodeURIComponent(examForm.subject)}`
        );
        setBankSummary(res.data || null);
      } catch (err) {
        console.error('加载题库概况失败:', err);
        setBankSummary(null);
      }
    };
    loadSummary();
  }, [mode, examForm.source, examForm.subject]);

  /**
   * P3 双轨·专项：按科目加载教材列表（含单元，单元专项用）
   */
  useEffect(() => {
    if (taskCategory !== 'SPECIAL' || specialForm.specialType !== 'UNIT' || !specialForm.subject) {
      return;
    }
    (async () => {
      setLoadingSpecialData(true);
      try {
        const res = await request.get(
          `/parent/question-bank/textbooks?subject=${encodeURIComponent(specialForm.subject)}`
        );
        setSpecialTextbooks(res.data || []);
      } catch (err) {
        console.error('加载教材列表失败:', err);
        setSpecialTextbooks([]);
      } finally {
        setLoadingSpecialData(false);
      }
    })();
  }, [taskCategory, specialForm.specialType, specialForm.subject]);

  /**
   * P3 双轨·专项：加载子女薄弱知识点（知识点专项候选）
   */
  useEffect(() => {
    if (
      taskCategory !== 'SPECIAL' ||
      specialForm.specialType !== 'KNOWLEDGE_POINT' ||
      !specialForm.studentId
    ) {
      return;
    }
    (async () => {
      setLoadingSpecialData(true);
      try {
        const q = specialForm.subject ? `?subject=${encodeURIComponent(specialForm.subject)}` : '';
        const res = await request.get(`/parent/children/${specialForm.studentId}/weak-points${q}`);
        setWeakPoints(res.data || []);
      } catch (err) {
        console.error('加载薄弱知识点失败:', err);
        setWeakPoints([]);
      } finally {
        setLoadingSpecialData(false);
      }
    })();
  }, [taskCategory, specialForm.specialType, specialForm.studentId, specialForm.subject]);

  /**
   * P3 双轨·专项：加载子女错题列表（错题本专项多选）
   */
  useEffect(() => {
    if (
      taskCategory !== 'SPECIAL' ||
      specialForm.specialType !== 'ERROR_BOOK' ||
      !specialForm.studentId
    ) {
      return;
    }
    (async () => {
      setLoadingSpecialData(true);
      try {
        const q = specialForm.subject ? `?subject=${encodeURIComponent(specialForm.subject)}` : '';
        const res = await request.get(`/parent/children/${specialForm.studentId}/errors${q}`);
        setChildErrors(res.data || []);
      } catch (err) {
        console.error('加载错题列表失败:', err);
        setChildErrors([]);
      } finally {
        setLoadingSpecialData(false);
      }
    })();
  }, [taskCategory, specialForm.specialType, specialForm.studentId, specialForm.subject]);

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

      // P3 双轨：专项攻克任务走独立通道 POST /parent/tasks/special
      if (taskCategory === 'SPECIAL') {
        if (!specialForm.studentId) throw new Error('请选择学员');
        if (!specialForm.subject) throw new Error('请选择科目');
        if (specialForm.specialType === 'UNIT' && specialForm.unitIds.length === 0) {
          throw new Error('请选择至少一个单元');
        }
        if (
          specialForm.specialType === 'KNOWLEDGE_POINT' &&
          specialForm.knowledgePoints.length === 0
        ) {
          throw new Error('请选择或输入至少一个知识点');
        }
        if (specialForm.questionCount < 1 || specialForm.questionCount > 50) {
          throw new Error('题量必须在 1-50 之间');
        }

        const specialBody: any = {
          studentId: specialForm.studentId,
          subject: specialForm.subject,
          specialType: specialForm.specialType,
          questionCount: specialForm.questionCount,
          title: specialForm.title.trim() || undefined,
        };
        if (specialForm.specialType === 'UNIT') specialBody.unitIds = specialForm.unitIds;
        if (specialForm.specialType === 'KNOWLEDGE_POINT') {
          specialBody.knowledgePoints = specialForm.knowledgePoints;
        }
        if (
          specialForm.specialType === 'ERROR_BOOK' &&
          specialForm.errorQuestionIds.length > 0
        ) {
          specialBody.errorQuestionIds = specialForm.errorQuestionIds;
        }

        const specialResp = await request.post('/parent/tasks/special', specialBody);
        if (!specialResp.success) {
          throw new Error(specialResp.error?.message || '创建专项攻克任务失败');
        }
        alert(`专项攻克任务创建成功！任务：${specialResp.data.title || specialResp.data.id}`);
        navigate('/parent/tasks');
        return;
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
      } else if (mode === 'EXAM_PAPER') {
        // 组卷模式
        if (!examForm.studentId) {
          throw new Error('请选择学员');
        }
        if (examForm.source === 'PAPER') {
          if (!examForm.paperId) {
            throw new Error('请选择要发布的试卷');
          }
        } else {
          if (!examForm.subject) {
            throw new Error('请选择科目');
          }
          if (examForm.questionCount < 1 || examForm.questionCount > 50) {
            throw new Error('抽题数量必须在 1-50 之间');
          }
        }

        const examConfig: any = {
          source: examForm.source,
          title: examForm.title.trim() || undefined,
        };
        if (examForm.source === 'PAPER') {
          examConfig.paperId = examForm.paperId;
        } else {
          examConfig.subject = examForm.subject;
          examConfig.questionCount = examForm.questionCount;
          if (examForm.types.length > 0) examConfig.types = examForm.types;
          if (examForm.difficultyMin != null) examConfig.difficultyMin = examForm.difficultyMin;
          if (examForm.difficultyMax != null) examConfig.difficultyMax = examForm.difficultyMax;
          if (examForm.knowledgePoints.length > 0) examConfig.knowledgePoints = examForm.knowledgePoints;
        }
        requestBody.examConfig = examConfig;
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

        // P2 题库化初测：初始测试题来源
        if (initialTestSource === 'PAPER') {
          if (!initialTestPaperId) {
            throw new Error('请选择初测试卷');
          }
          requestBody.initialTest = { source: 'PAPER', paperId: initialTestPaperId };
        } else {
          requestBody.initialTest = { source: 'AI' };
        }
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

        {/* P3 双轨：任务大类选择 */}
        <div className="bg-white rounded-lg shadow-sm mb-6 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            任务大类 <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setTaskCategory('SUBJECT_MAIN')}
              className={`px-5 py-4 rounded-lg border-2 text-left transition-colors ${
                taskCategory === 'SUBJECT_MAIN'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className={`text-base font-semibold ${taskCategory === 'SUBJECT_MAIN' ? 'text-blue-700' : 'text-gray-900'}`}>
                学科总任务
              </div>
              <div className="text-xs mt-1 text-gray-500">
                长期主线任务，纳入学科学情分析与学习报告；同一学科同时仅允许 1 个进行中
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTaskCategory('SPECIAL')}
              className={`px-5 py-4 rounded-lg border-2 text-left transition-colors ${
                taskCategory === 'SPECIAL'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className={`text-base font-semibold ${taskCategory === 'SPECIAL' ? 'text-purple-700' : 'text-gray-900'}`}>
                专项攻克任务
              </div>
              <div className="text-xs mt-1 text-gray-500">
                针对单元 / 知识点 / 错题本的短期专项练习，独立报告区，不与总任务混合
              </div>
            </button>
          </div>
        </div>

        {/* Tab 切换（仅学科总任务需要选择出题方式） */}
        {taskCategory === 'SUBJECT_MAIN' && (
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
              <button
                type="button"
                onClick={() => setMode('EXAM_PAPER')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  mode === 'EXAM_PAPER'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                题库组卷模式
              </button>
            </nav>
          </div>

          {/* 模式说明 */}
          <div className="p-6 bg-blue-50 border-b border-gray-200">
            {mode === 'CUSTOM' ? (
              <p className="text-sm text-blue-700">
                自定义配置模式: 自由选择教材内容、题目数量和难度，完全自定义学习任务
              </p>
            ) : mode === 'EXAM_PAPER' ? (
              <p className="text-sm text-blue-700">
                题库组卷模式: 从管理员导入的标准化题库直接布置任务——可整卷发布，或按科目/题型/难度随机抽题自动组卷，学员在电子答题专区作答
              </p>
            ) : (
              <p className="text-sm text-blue-700">
                档案提取模式: 基于学员档案自动生成推荐任务，智能匹配学习内容。可临时修改部分信息，不影响学员档案
              </p>
            )}
          </div>
        </div>
        )}

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
            {taskCategory === 'SUBJECT_MAIN' && mode === 'CUSTOM' && (
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
            {taskCategory === 'SUBJECT_MAIN' && mode === 'PROFILE' && (
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

                {/* 初始测试题来源（P2 题库化初测） */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    初始测试题来源 <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setInitialTestSource('AI');
                        setPreviewData(null);
                      }}
                      className={`px-4 py-3 rounded-lg border text-left transition-colors ${
                        initialTestSource === 'AI'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-sm font-semibold">AI 智能筛题（推荐）</div>
                      <div className="text-xs mt-1 opacity-80">
                        AI 根据学员学情从题库自动选题，难度分布合理
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInitialTestSource('PAPER');
                        setPreviewData(null);
                      }}
                      className={`px-4 py-3 rounded-lg border text-left transition-colors ${
                        initialTestSource === 'PAPER'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-sm font-semibold">选用已发布试卷</div>
                      <div className="text-xs mt-1 opacity-80">
                        手动指定一份题库试卷作为初始测试
                      </div>
                    </button>
                  </div>

                  {initialTestSource === 'PAPER' && (
                    <select
                      value={initialTestPaperId}
                      onChange={(e) => {
                        setInitialTestPaperId(e.target.value);
                        setPreviewData(null);
                      }}
                      className="mt-3 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">请选择试卷</option>
                      {profilePapers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.subject} · {p.title}（{p._count?.items ?? 0} 题）
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handlePreviewInitialTest()}
                      disabled={previewLoading}
                      className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
                    >
                      {previewLoading ? '正在抽题预览…' : '预览初测题目'}
                    </button>
                    <span className="text-xs text-gray-500">
                      发布前可预览将抽到的题目（预览不入库）
                    </span>
                  </div>

                  {previewData && (
                    <div className="mt-3 border border-gray-200 rounded-lg p-4 bg-gray-50 max-h-72 overflow-y-auto">
                      {previewData.meta?.reason && (
                        <p className="text-xs text-blue-700 bg-blue-50 rounded px-3 py-2 mb-3">
                          AI 选题思路：{previewData.meta.reason}
                        </p>
                      )}
                      {previewData.meta?.shortage &&
                        Object.keys(previewData.meta.shortage).length > 0 && (
                          <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 mb-3">
                            部分难度题库存量不足（发布时将按平台设置自动 AI 补题）：
                            {Object.entries(previewData.meta.shortage)
                              .map(([lv, n]) => `难度${lv}缺${n}题`)
                              .join('、')}
                          </p>
                        )}
                      <ol className="space-y-2">
                        {previewData.questions.map((q, i) => (
                          <li key={q.id} className="text-sm text-gray-700 flex gap-2">
                            <span className="text-gray-400 shrink-0">{i + 1}.</span>
                            <div>
                              <span className="line-clamp-2">{q.stem}</span>
                              <span className="text-xs text-gray-500">
                                难度 {q.difficulty}/5
                                {q.knowledgePoints?.length > 0 &&
                                  ` · ${q.knowledgePoints.slice(0, 2).join('、')}`}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
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

            {/* 组卷模式表单 */}
            {taskCategory === 'SUBJECT_MAIN' && mode === 'EXAM_PAPER' && (
              <>
                {loadingExamData && (
                  <div className="text-sm text-gray-500">题库数据加载中...</div>
                )}

                {/* 学员选择 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    选择学员 <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={examForm.studentId}
                    onChange={(e) => setExamForm({ ...examForm, studentId: e.target.value })}
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

                {/* 组卷方式 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    组卷方式 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => setExamForm({ ...examForm, source: 'PAPER' })}
                      className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        examForm.source === 'PAPER'
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      整卷发布
                    </button>
                    <button
                      type="button"
                      onClick={() => setExamForm({ ...examForm, source: 'RANDOM' })}
                      className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        examForm.source === 'RANDOM'
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      随机抽题组卷
                    </button>
                  </div>
                </div>

                {/* 整卷模式：选择试卷 */}
                {examForm.source === 'PAPER' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      选择试卷 <span className="text-red-500">*</span>
                    </label>
                    {papers.length === 0 ? (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                        题库中暂无已发布的试卷。请先到「管理端 › 题库」导入试卷并发布后，再来此处布置任务。
                      </div>
                    ) : (
                      <>
                        <select
                          required
                          value={examForm.paperId}
                          onChange={(e) => setExamForm({ ...examForm, paperId: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">请选择已发布的试卷</option>
                          {papers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}（{p.subject} · {p._count?.items ?? 0} 题）
                            </option>
                          ))}
                        </select>
                        {examForm.paperId && (
                          <p className="mt-1 text-sm text-gray-500">
                            将按原卷顺序与分值布置，共{' '}
                            {papers.find((p) => p.id === examForm.paperId)?._count?.items ?? 0} 道题目
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* 随机组卷模式 */}
                {examForm.source === 'RANDOM' && (
                  <>
                    {/* 科目 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        科目 <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={examForm.subject}
                        onChange={(e) => setExamForm({ ...examForm, subject: e.target.value, types: [] })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">请选择科目</option>
                        {examSubjects.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 题库概况 */}
                    {examForm.subject && (
                      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">题库概况</h3>
                        {bankSummary ? (
                          bankSummary.total === 0 ? (
                            <p className="text-sm text-amber-700">
                              该科目题库暂无题目，请先到「管理端 › 题库」导入题目。
                            </p>
                          ) : (
                            <>
                              <p className="text-sm text-gray-600 mb-2">
                                共 <span className="font-semibold text-gray-900">{bankSummary.total}</span> 道可用题目：
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(bankSummary.byType).map(([type, count]) => (
                                  <span
                                    key={type}
                                    className="px-2 py-1 text-xs rounded bg-blue-50 text-blue-700"
                                  >
                                    {EXAM_TYPE_LABELS[type] || type}: {count}
                                  </span>
                                ))}
                              </div>
                            </>
                          )
                        ) : (
                          <p className="text-sm text-gray-500">加载中...</p>
                        )}
                      </div>
                    )}

                    {/* 抽题数量 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        抽题数量 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        max={50}
                        value={examForm.questionCount}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 1;
                          setExamForm({ ...examForm, questionCount: value });
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <p className="mt-1 text-sm text-gray-500">从题库中随机抽取的题目数量，范围 1-50</p>
                    </div>

                    {/* 题型筛选 */}
                    {bankSummary && bankSummary.total > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          题型（不选则不限）
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {Object.keys(bankSummary.byType).map((type) => {
                            const checked = examForm.types.includes(type);
                            return (
                              <button
                                type="button"
                                key={type}
                                onClick={() =>
                                  setExamForm({
                                    ...examForm,
                                    types: checked
                                      ? examForm.types.filter((t) => t !== type)
                                      : [...examForm.types, type],
                                  })
                                }
                                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                                  checked
                                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                {EXAM_TYPE_LABELS[type] || type}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 难度范围 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          难度下限
                        </label>
                        <select
                          value={examForm.difficultyMin}
                          onChange={(e) =>
                            setExamForm({ ...examForm, difficultyMin: parseInt(e.target.value) })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          {[1, 2, 3, 4, 5].map((d) => (
                            <option key={d} value={d}>
                              {d} 星
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          难度上限
                        </label>
                        <select
                          value={examForm.difficultyMax}
                          onChange={(e) =>
                            setExamForm({ ...examForm, difficultyMax: parseInt(e.target.value) })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          {[1, 2, 3, 4, 5].map((d) => (
                            <option key={d} value={d}>
                              {d} 星
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* 知识点（选填） */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        知识点（选填，逗号分隔）
                      </label>
                      <input
                        type="text"
                        value={examForm.knowledgePoints.join(', ')}
                        onChange={(e) =>
                          setExamForm({
                            ...examForm,
                            knowledgePoints: e.target.value
                              .split(',')
                              .map((k) => k.trim())
                              .filter((k) => k),
                          })
                        }
                        placeholder="如：一元二次方程, 因式分解"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <p className="mt-1 text-sm text-gray-500">仅抽取包含这些知识点的题目（为空则不限）</p>
                    </div>
                  </>
                )}

                {/* 任务标题（选填） */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    任务标题（选填）
                  </label>
                  <input
                    type="text"
                    value={examForm.title}
                    onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
                    placeholder="不填则自动生成（如：数学随机练习卷（10 题））"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </>
            )}

            {/* P3 双轨：专项攻克表单 */}
            {taskCategory === 'SPECIAL' && (
              <>
                {/* 学员选择 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    选择学员 <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={specialForm.studentId}
                    onChange={(e) =>
                      setSpecialForm({
                        ...specialForm,
                        studentId: e.target.value,
                        knowledgePoints: [],
                        errorQuestionIds: [],
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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

                {/* 科目 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    科目 <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={specialForm.subject}
                    onChange={(e) =>
                      setSpecialForm({
                        ...specialForm,
                        subject: e.target.value,
                        textbookId: '',
                        unitIds: [],
                        knowledgePoints: [],
                        errorQuestionIds: [],
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">请选择科目</option>
                    {Array.from(new Set(aiTeachers.map((t) => t.subject)))
                      .filter(Boolean)
                      .map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                  </select>
                </div>

                {/* 专项类型 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    专项类型 <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {SPECIAL_TYPE_OPTIONS.map((opt) => (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() =>
                          setSpecialForm({
                            ...specialForm,
                            specialType: opt.value,
                            textbookId: '',
                            unitIds: [],
                            knowledgePoints: [],
                            errorQuestionIds: [],
                          })
                        }
                        className={`px-4 py-3 rounded-lg border text-left transition-colors ${
                          specialForm.specialType === opt.value
                            ? 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                        }`}
                      >
                        <div className="text-sm font-semibold">{opt.label}</div>
                        <div className="text-xs mt-1 opacity-80">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {loadingSpecialData && (
                  <div className="text-sm text-gray-500">目标数据加载中...</div>
                )}

                {/* 单元专项：教材 + 单元多选 */}
                {specialForm.specialType === 'UNIT' && specialForm.subject && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        选择教材 <span className="text-red-500">*</span>
                      </label>
                      {specialTextbooks.length === 0 && !loadingSpecialData ? (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                          该科目暂无教材，请先到「管理端 › 教材管理」创建教材与单元。
                        </div>
                      ) : (
                        <select
                          value={specialForm.textbookId}
                          onChange={(e) =>
                            setSpecialForm({ ...specialForm, textbookId: e.target.value, unitIds: [] })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                          <option value="">请选择教材</option>
                          {specialTextbooks.map((tb) => (
                            <option key={tb.id} value={tb.id}>
                              {tb.name}（{tb.unitCount} 个单元）
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {specialForm.textbookId && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          选择单元（可多选） <span className="text-red-500">*</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {(specialTextbooks.find((tb) => tb.id === specialForm.textbookId)?.units || []).map(
                            (u) => {
                              const checked = specialForm.unitIds.includes(u.id);
                              return (
                                <button
                                  type="button"
                                  key={u.id}
                                  onClick={() =>
                                    setSpecialForm({
                                      ...specialForm,
                                      unitIds: checked
                                        ? specialForm.unitIds.filter((id) => id !== u.id)
                                        : [...specialForm.unitIds, u.id],
                                    })
                                  }
                                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                                    checked
                                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  {u.name}
                                </button>
                              );
                            }
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          已选 {specialForm.unitIds.length} 个单元，将从题库抽取这些单元下的题目
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* 知识点专项：薄弱知识点候选 + 自定义补充 */}
                {specialForm.specialType === 'KNOWLEDGE_POINT' && specialForm.studentId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      目标知识点（可多选） <span className="text-red-500">*</span>
                    </label>
                    {weakPoints.length > 0 ? (
                      <>
                        <p className="text-xs text-gray-500 mb-2">
                          以下为孩子近期错题中的薄弱知识点（按错题数排序），点击选择：
                        </p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {weakPoints.map((wp) => {
                            const checked = specialForm.knowledgePoints.includes(wp.point);
                            return (
                              <button
                                type="button"
                                key={wp.point}
                                onClick={() =>
                                  setSpecialForm({
                                    ...specialForm,
                                    knowledgePoints: checked
                                      ? specialForm.knowledgePoints.filter((p) => p !== wp.point)
                                      : [...specialForm.knowledgePoints, wp.point],
                                  })
                                }
                                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                                  checked
                                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                {wp.point}
                                <span className="ml-1 text-xs opacity-70">×{wp.errorCount}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      !loadingSpecialData && (
                        <p className="text-xs text-gray-500 mb-2">
                          暂无薄弱知识点记录，可手动输入目标知识点：
                        </p>
                      )
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customKpInput}
                        onChange={(e) => setCustomKpInput(e.target.value)}
                        placeholder="手动补充知识点，多个用逗号分隔，如：一元二次方程, 因式分解"
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const items = customKpInput
                            .split(/[,，]/)
                            .map((k) => k.trim())
                            .filter((k) => k && !specialForm.knowledgePoints.includes(k));
                          if (items.length > 0) {
                            setSpecialForm({
                              ...specialForm,
                              knowledgePoints: [...specialForm.knowledgePoints, ...items],
                            });
                          }
                          setCustomKpInput('');
                        }}
                        className="px-4 py-2 text-sm font-medium text-purple-600 border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors"
                      >
                        添加
                      </button>
                    </div>
                    {specialForm.knowledgePoints.length > 0 && (
                      <p className="mt-2 text-sm text-gray-600">
                        已选：{specialForm.knowledgePoints.join('、')}
                      </p>
                    )}
                  </div>
                )}

                {/* 错题本专项：错题多选 */}
                {specialForm.specialType === 'ERROR_BOOK' && specialForm.studentId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      选择错题（可多选，不选则自动抽取未掌握错题）
                    </label>
                    {childErrors.length === 0 && !loadingSpecialData ? (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                        该学员{specialForm.subject ? `「${specialForm.subject}」学科` : ''}暂无错题记录。
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto divide-y divide-gray-100">
                        {childErrors.map((eq) => {
                          const checked = specialForm.errorQuestionIds.includes(eq.id);
                          return (
                            <label
                              key={eq.id}
                              className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                checked ? 'bg-purple-50' : 'hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setSpecialForm({
                                    ...specialForm,
                                    errorQuestionIds: checked
                                      ? specialForm.errorQuestionIds.filter((id) => id !== eq.id)
                                      : [...specialForm.errorQuestionIds, eq.id],
                                  })
                                }
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-800 line-clamp-2">{eq.stem || '（无题干）'}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {eq.type ? `${EXAM_TYPE_LABELS[eq.type] || eq.type} · ` : ''}
                                  难度 {eq.difficulty ?? '-'}/5
                                  {eq.mastery === 'MASTERED' ? ' · 已掌握' : ' · 未掌握'}
                                  {eq.knowledgePoints && eq.knowledgePoints.length > 0 &&
                                    ` · ${eq.knowledgePoints.slice(0, 2).join('、')}`}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <p className="mt-1 text-sm text-gray-500">
                      已选 {specialForm.errorQuestionIds.length} 道错题
                      {specialForm.errorQuestionIds.length === 0 && '（不选则按题量自动抽取未掌握错题）'}
                    </p>
                  </div>
                )}

                {/* 题量 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    题量 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={50}
                    value={specialForm.questionCount}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setSpecialForm({ ...specialForm, questionCount: value });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    范围 1-50。{specialForm.specialType === 'ERROR_BOOK' && '错题本模式下若已勾选错题，以勾选数量为准'}
                  </p>
                </div>

                {/* 任务标题（选填） */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    任务标题（选填）
                  </label>
                  <input
                    type="text"
                    value={specialForm.title}
                    onChange={(e) => setSpecialForm({ ...specialForm, title: e.target.value })}
                    placeholder="不填则自动生成（如：数学·单元专项攻克）"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-700">
                  专项攻克任务为简化流程：直接从题库抽题、学员在电子答题专区作答、生成独立专项报告，不计入学科总任务学情主线，但错题会汇总到同一错题本。
                </div>
              </>
            )}

            {/* 家长激励寄语（仅学科总任务） */}
            {taskCategory === 'SUBJECT_MAIN' && (
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
            )}

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
                {loading
                  ? '创建中...'
                  : taskCategory === 'SPECIAL'
                  ? '发布专项攻克任务'
                  : '创建任务'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
