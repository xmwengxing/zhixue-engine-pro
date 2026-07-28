import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

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

/**
 * 家长端 - 亲子关系管理中心
 */
export default function ChildManagement() {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  // 获取子女列表
  // 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
  const fetchChildren = useCallback(async () => {
    try {
      setLoading(true);
      const response = await request.get('/parent/children');
      setChildren(response.data.children);
    } catch (error: unknown) {
      console.error('获取子女列表失败:', error);
      const apiError = error as { response?: { status?: number } };
      if (apiError.response?.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  // 解绑学员
  const handleUnbind = async (relationId: string, studentName: string) => {
    if (!confirm(`确定要解绑学员 ${studentName} 吗？解绑后历史数据将被保留。`)) {
      return;
    }

    try {
      await request.delete(`/parent/children/${relationId}/unbind`);
      
      // 刷新列表
      fetchChildren();
      alert('解绑成功');
    } catch (error: unknown) {
      console.error('解绑失败:', error);
      alert(getErrorMessage(error, '解绑失败'));
    }
  };

  // 获取科目等级标签
  const getSubjectBadges = (subjectLevels: Record<string, string>) => {
    if (!subjectLevels) return [];
    
    const levelMap: Record<string, string> = {
      weak: 'L1',
      average: 'L3',
      good: 'L5',
      excellent: 'L6',
    };

    return Object.entries(subjectLevels)
      .slice(0, 2) // 只显示前两个科目
      .map(([subject, level]) => ({
        subject,
        level: levelMap[level] || 'L3',
      }));
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
              <a href="/parent/overview" className="text-slate-600 dark:text-slate-300 text-sm font-medium hover:text-blue-600 transition-colors">
                学习报表
              </a>
              <a href="/parent/tasks" className="text-slate-600 dark:text-slate-300 text-sm font-medium hover:text-blue-600 transition-colors">
                任务中心
              </a>
              <a href="/parent/children" className="text-blue-600 text-sm font-bold border-b-2 border-blue-600 pb-1">
                亲子关系
              </a>
              <a href="/parent/profile" className="text-slate-600 dark:text-slate-300 text-sm font-medium hover:text-blue-600 transition-colors">
                个人中心
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 flex justify-center py-10 px-4">
        <div className="max-w-[1024px] w-full">
          {/* 标题区域 */}
          <div className="flex flex-col md:flex-row md:items-end justify-between px-4 pb-6">
            <div>
              <h1 className="text-slate-900 dark:text-white text-3xl font-bold">亲子关系管理中心</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
                管理已绑定的学员，实时掌握孩子学习动态，支持快速切换学习看板
              </p>
            </div>
          </div>

          {/* 学员切换标签 */}
          <div className="pb-8 px-4">
            <div className="flex border-b border-slate-200 dark:border-slate-700 gap-8 overflow-x-auto">
              <button
                onClick={() => setSelectedChild(null)}
                className={`flex flex-col items-center justify-center border-b-[3px] pb-3 pt-4 transition-all ${
                  selectedChild === null
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-blue-600'
                }`}
              >
                <p className="text-sm font-bold">全部学员</p>
              </button>
              {children.map((child) => (
                <button
                  key={child.relationId}
                  onClick={() => setSelectedChild(child.student.id)}
                  className={`flex flex-col items-center justify-center border-b-[3px] pb-3 pt-4 transition-all whitespace-nowrap ${
                    selectedChild === child.student.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-blue-600'
                  }`}
                >
                  <p className="text-sm font-medium">{child.student.profile?.realName || child.student.username}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 学员卡片网格 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
            {children.map((child) => {
              const badges = getSubjectBadges(child.student.profile?.subjectLevels || {});
              
              return (
                <div
                  key={child.relationId}
                  className="group relative flex flex-col items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm hover:shadow-md transition-all border border-slate-100 dark:border-slate-700"
                >
                  {/* 解绑按钮 */}
                  <button
                    onClick={() => handleUnbind(child.relationId, child.student.profile?.realName || child.student.username)}
                    className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors"
                    title="解除绑定"
                  >
                    <span className="material-symbols-outlined text-[20px]">link_off</span>
                  </button>

                  {/* 头像 */}
                  <div className="relative">
                    <div className="w-24 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full border-4 border-white dark:border-slate-800 shadow-sm flex items-center justify-center text-white text-2xl font-bold">
                      {(child.student.profile?.realName || child.student.username).charAt(0)}
                    </div>
                    <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-2 border-white dark:border-slate-800 rounded-full" title="在线"></div>
                  </div>

                  {/* 学员信息 */}
                  <div className="text-center">
                    <p className="text-slate-900 dark:text-white text-lg font-bold">
                      {child.student.profile?.realName || child.student.username}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                      {child.student.profile?.grade || '未设置年级'} · <span className="text-blue-600 font-medium">正在训练</span>
                    </p>
                    <div className="mt-4 flex gap-2 justify-center">
                      {badges.map((badge, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 text-[10px] rounded uppercase font-bold tracking-wider"
                        >
                          {badge.subject} {badge.level}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 添加新学员卡片 */}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex flex-col items-center justify-center gap-4 border-2 border-dashed border-slate-300 dark:border-slate-600 p-6 rounded-xl hover:bg-white/50 dark:hover:bg-slate-800/50 hover:border-blue-600 transition-all group min-h-[220px]"
            >
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                <span className="material-symbols-outlined text-3xl">add</span>
              </div>
              <div className="text-center">
                <p className="text-slate-600 dark:text-slate-300 font-bold">添加新学员</p>
                <p className="text-slate-400 text-xs mt-1">最多支持绑定5名学员</p>
              </div>
            </button>
          </div>

          {/* 指导说明 */}
          <div className="mt-12 px-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-6 flex flex-col md:flex-row items-center gap-6">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shrink-0">
                <span className="material-symbols-outlined">help</span>
              </div>
              <div>
                <h4 className="text-slate-900 dark:text-white font-bold">多学生管理指南</h4>
                <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
                  您可以通过顶部导航栏在不同孩子之间快速切换，系统将为您展示每个孩子专属的学习报表与训练计划。如有任何疑问，请联系您的班主任。
                </p>
              </div>
              <a
                href="#"
                className="md:ml-auto px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                查看帮助手册
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* 添加学员弹窗 */}
      {showAddModal && (
        <AddChildModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchChildren();
          }}
        />
      )}
    </div>
  );
}

// 添加学员弹窗组件
interface AddChildModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function AddChildModal({ onClose, onSuccess }: AddChildModalProps) {
  const [addMethod, setAddMethod] = useState<'create' | 'bind'>('create');
  
  // 创建学员表单数据
  const [createForm, setCreateForm] = useState({
    authCode: '',
    username: '',
    password: '',
    confirmPassword: '',
    name: '',
    gender: '男',
    birthDate: '',
    grade: '',
    school: '',
    learningFoundation: '',
    interests: '',
    relation: '父亲',
  });

  // 绑定学员表单数据
  const [bindForm, setBindForm] = useState({
    bindMethod: 'authCode' as 'authCode' | 'studentId',
    authCode: '',
    studentIdNumber: '',
    relation: '父亲',
  });

  const [loading, setLoading] = useState(false);

  // 处理创建学员表单提交
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证必填字段
    if (!createForm.authCode.trim()) {
      alert('请输入授权码');
      return;
    }

    if (!createForm.username.trim()) {
      alert('请输入用户名');
      return;
    }

    if (!createForm.password.trim()) {
      alert('请输入密码');
      return;
    }

    if (createForm.password !== createForm.confirmPassword) {
      alert('两次输入的密码不一致');
      return;
    }

    if (!createForm.name.trim()) {
      alert('请输入学员姓名');
      return;
    }

    if (!createForm.birthDate) {
      alert('请选择出生年月');
      return;
    }

    if (!createForm.grade) {
      alert('请选择年级');
      return;
    }

    try {
      setLoading(true);
      
      await request.post(
        '/parent/children/create',
        {
          authCode: createForm.authCode,
          username: createForm.username,
          password: createForm.password,
          profile: {
            name: createForm.name,
            gender: createForm.gender,
            birthDate: createForm.birthDate,
            grade: createForm.grade,
            school: createForm.school || undefined,
            learningFoundation: createForm.learningFoundation || undefined,
            interests: createForm.interests || undefined,
          },
          relation: createForm.relation,
        }
      );

      alert('学员创建并绑定成功');
      onSuccess();
    } catch (error: unknown) {
      console.error('创建学员失败:', error);
      alert(getErrorMessage(error, '创建学员失败'));
    } finally {
      setLoading(false);
    }
  };

  // 处理绑定学员表单提交
  const handleBindSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (bindForm.bindMethod === 'authCode' && !bindForm.authCode.trim()) {
      alert('请输入授权码');
      return;
    }

    if (bindForm.bindMethod === 'studentId' && !bindForm.studentIdNumber.trim()) {
      alert('请输入学号');
      return;
    }

    try {
      setLoading(true);
      
      await request.post(
        '/parent/children/bind',
        {
          authCode: bindForm.bindMethod === 'authCode' ? bindForm.authCode : undefined,
          studentIdNumber: bindForm.bindMethod === 'studentId' ? bindForm.studentIdNumber : undefined,
          relation: bindForm.relation,
        }
      );

      alert('绑定成功');
      onSuccess();
    } catch (error: unknown) {
      console.error('绑定失败:', error);
      alert(getErrorMessage(error, '绑定失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 my-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">添加学员</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* 添加方式选择 */}
        <div className="flex gap-4 mb-6">
          <button
            type="button"
            onClick={() => setAddMethod('create')}
            className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${
              addMethod === 'create'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-600'
            }`}
          >
            创建新学员
          </button>
          <button
            type="button"
            onClick={() => setAddMethod('bind')}
            className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${
              addMethod === 'bind'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-600'
            }`}
          >
            绑定已有学员
          </button>
        </div>

        {/* 创建学员表单 */}
        {addMethod === 'create' && (
          <form onSubmit={handleCreateSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {/* 授权码 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                授权码 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={createForm.authCode}
                onChange={(e) => setCreateForm({ ...createForm, authCode: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="请输入授权码"
              />
            </div>

            {/* 用户名 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                用户名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="请输入用户名"
              />
            </div>

            {/* 密码 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  密码 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="请输入密码"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  确认密码 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={createForm.confirmPassword}
                  onChange={(e) => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="请再次输入密码"
                />
              </div>
            </div>

            {/* 学员信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="请输入姓名"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  性别 <span className="text-red-500">*</span>
                </label>
                <select
                  value={createForm.gender}
                  onChange={(e) => setCreateForm({ ...createForm, gender: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600"
                >
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  出生年月 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={createForm.birthDate}
                  onChange={(e) => setCreateForm({ ...createForm, birthDate: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  年级 <span className="text-red-500">*</span>
                </label>
                <select
                  value={createForm.grade}
                  onChange={(e) => setCreateForm({ ...createForm, grade: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">请选择年级</option>
                  <optgroup label="小学">
                    <option value="PRIMARY_1_1">一年级上</option>
                    <option value="PRIMARY_1_2">一年级下</option>
                    <option value="PRIMARY_2_1">二年级上</option>
                    <option value="PRIMARY_2_2">二年级下</option>
                    <option value="PRIMARY_3_1">三年级上</option>
                    <option value="PRIMARY_3_2">三年级下</option>
                    <option value="PRIMARY_4_1">四年级上</option>
                    <option value="PRIMARY_4_2">四年级下</option>
                    <option value="PRIMARY_5_1">五年级上</option>
                    <option value="PRIMARY_5_2">五年级下</option>
                    <option value="PRIMARY_6_1">六年级上</option>
                    <option value="PRIMARY_6_2">六年级下</option>
                  </optgroup>
                  <optgroup label="初中">
                    <option value="MIDDLE_1_1">初一上</option>
                    <option value="MIDDLE_1_2">初一下</option>
                    <option value="MIDDLE_2_1">初二上</option>
                    <option value="MIDDLE_2_2">初二下</option>
                    <option value="MIDDLE_3_1">初三上</option>
                    <option value="MIDDLE_3_2">初三下</option>
                  </optgroup>
                  <optgroup label="高中">
                    <option value="HIGH_1_1">高一上</option>
                    <option value="HIGH_1_2">高一下</option>
                    <option value="HIGH_2_1">高二上</option>
                    <option value="HIGH_2_2">高二下</option>
                    <option value="HIGH_3_1">高三上</option>
                    <option value="HIGH_3_2">高三下</option>
                  </optgroup>
                </select>
              </div>
            </div>

            {/* 选填信息 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                就读院校
              </label>
              <input
                type="text"
                value={createForm.school}
                onChange={(e) => setCreateForm({ ...createForm, school: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="请输入就读院校（选填）"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                学习基础
              </label>
              <select
                value={createForm.learningFoundation}
                onChange={(e) => setCreateForm({ ...createForm, learningFoundation: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600"
              >
                <option value="">请选择学习基础（选填）</option>
                <option value="WEAK">薄弱</option>
                <option value="AVERAGE">一般</option>
                <option value="GOOD">良好</option>
                <option value="EXCELLENT">优秀</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                兴趣爱好
              </label>
              <textarea
                value={createForm.interests}
                onChange={(e) => setCreateForm({ ...createForm, interests: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="请输入兴趣爱好（选填）"
                rows={3}
              />
            </div>

            {/* 关系选择 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                关系 <span className="text-red-500">*</span>
              </label>
              <select
                value={createForm.relation}
                onChange={(e) => setCreateForm({ ...createForm, relation: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600"
              >
                <option value="父亲">父亲</option>
                <option value="母亲">母亲</option>
                <option value="监护人">监护人</option>
              </select>
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {loading ? '创建中...' : '创建并绑定'}
            </button>
          </form>
        )}

        {/* 绑定学员表单 */}
        {addMethod === 'bind' && (
          <form onSubmit={handleBindSubmit} className="space-y-6">
            {/* 绑定方式选择 */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setBindForm({ ...bindForm, bindMethod: 'authCode' })}
                className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${
                  bindForm.bindMethod === 'authCode'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-600'
                }`}
              >
                授权码绑定
              </button>
              <button
                type="button"
                onClick={() => setBindForm({ ...bindForm, bindMethod: 'studentId' })}
                className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${
                  bindForm.bindMethod === 'studentId'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-600'
                }`}
              >
                学号绑定
              </button>
            </div>

            {/* 授权码输入 */}
            {bindForm.bindMethod === 'authCode' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  授权码
                </label>
                <input
                  type="text"
                  value={bindForm.authCode}
                  onChange={(e) => setBindForm({ ...bindForm, authCode: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="请输入授权码"
                />
              </div>
            )}

            {/* 学号输入 */}
            {bindForm.bindMethod === 'studentId' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  学号
                </label>
                <input
                  type="text"
                  value={bindForm.studentIdNumber}
                  onChange={(e) => setBindForm({ ...bindForm, studentIdNumber: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="请输入学号"
                />
              </div>
            )}

            {/* 关系选择 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                关系
              </label>
              <select
                value={bindForm.relation}
                onChange={(e) => setBindForm({ ...bindForm, relation: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600"
              >
                <option value="父亲">父亲</option>
                <option value="母亲">母亲</option>
                <option value="监护人">监护人</option>
              </select>
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '绑定中...' : '确认绑定'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
