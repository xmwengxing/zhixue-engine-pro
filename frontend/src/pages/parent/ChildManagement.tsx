import { useState, useEffect, useCallback, useMemo } from 'react';
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

/** 年级枚举 → 中文 */
const GRADE_LABEL: Record<string, string> = {
  PRIMARY_1_1: '一年级上',
  PRIMARY_1_2: '一年级下',
  PRIMARY_2_1: '二年级上',
  PRIMARY_2_2: '二年级下',
  PRIMARY_3_1: '三年级上',
  PRIMARY_3_2: '三年级下',
  PRIMARY_4_1: '四年级上',
  PRIMARY_4_2: '四年级下',
  PRIMARY_5_1: '五年级上',
  PRIMARY_5_2: '五年级下',
  PRIMARY_6_1: '六年级上',
  PRIMARY_6_2: '六年级下',
  MIDDLE_1_1: '初一上',
  MIDDLE_1_2: '初一下',
  MIDDLE_2_1: '初二上',
  MIDDLE_2_2: '初二下',
  MIDDLE_3_1: '初三上',
  MIDDLE_3_2: '初三下',
  HIGH_1_1: '高一上',
  HIGH_1_2: '高一下',
  HIGH_2_1: '高二上',
  HIGH_2_2: '高二下',
  HIGH_3_1: '高三上',
  HIGH_3_2: '高三下',
};

const gradeLabel = (grade?: string | null) => (grade ? GRADE_LABEL[grade] || grade : '未设置年级');

/**
 * 家长端 - 亲子关系管理
 * 布局外壳由 ParentDashboard 提供（本页不再自带顶部导航）
 */
export default function ChildManagement() {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchChildren = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response: any = await request.get('/parent/children');
      setChildren(response?.data?.children || []);
    } catch (err: unknown) {
      console.error('获取子女列表失败:', err);
      const apiError = err as { response?: { status?: number } };
      if (apiError.response?.status === 401) navigate('/login');
      else setError(getErrorMessage(err, '获取子女列表失败'));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  const handleUnbind = async (relationId: string, studentName: string) => {
    if (!confirm(`确定要解绑学员 ${studentName} 吗？解绑后历史数据将被保留。`)) return;

    try {
      await request.delete(`/parent/children/${relationId}/unbind`);
      await fetchChildren();
      setSelectedChild(null);
    } catch (err: unknown) {
      console.error('解绑失败:', err);
      alert(getErrorMessage(err, '解绑失败'));
    }
  };

  /** 科目等级标签（兼容大小写枚举） */
  const getSubjectBadges = (subjectLevels: Record<string, string>) => {
    if (!subjectLevels) return [];

    const levelMap: Record<string, string> = {
      weak: 'L1',
      average: 'L3',
      good: 'L5',
      excellent: 'L6',
    };

    return Object.entries(subjectLevels)
      .slice(0, 3)
      .map(([subject, level]) => ({
        subject,
        level: levelMap[String(level).toLowerCase()] || 'L3',
      }));
  };

  const visibleChildren = useMemo(
    () =>
      selectedChild ? children.filter((c) => c.student.id === selectedChild) : children,
    [children, selectedChild]
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#111722]">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="mt-4 text-[#92a4c9]">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#111722] p-6 lg:p-8">
      <div className="mx-auto max-w-[1100px]">
        {/* 标题 */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white lg:text-3xl">亲子管理</h1>
            <p className="mt-2 text-sm text-[#92a4c9]">
              管理已绑定的学员，可创建新学员或通过授权码/学号绑定已有账号
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 self-start rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-600"
          >
            <span className="material-symbols-outlined text-[20px]">person_add</span>
            添加学员
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* 学员筛选 */}
        {children.length > 0 && (
          <div className="mb-6 flex gap-6 overflow-x-auto border-b border-[#324467]">
            <button
              onClick={() => setSelectedChild(null)}
              className={`whitespace-nowrap border-b-[3px] pb-3 pt-2 text-sm font-bold transition-all ${
                selectedChild === null
                  ? 'border-primary text-primary'
                  : 'border-transparent text-[#92a4c9] hover:text-white'
              }`}
            >
              全部学员（{children.length}）
            </button>
            {children.map((child) => (
              <button
                key={child.relationId}
                onClick={() => setSelectedChild(child.student.id)}
                className={`whitespace-nowrap border-b-[3px] pb-3 pt-2 text-sm font-medium transition-all ${
                  selectedChild === child.student.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-[#92a4c9] hover:text-white'
                }`}
              >
                {child.student.profile?.realName || child.student.username}
              </button>
            ))}
          </div>
        )}

        {/* 学员卡片 */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visibleChildren.map((child) => {
            const name = child.student.profile?.realName || child.student.username;
            const badges = getSubjectBadges(child.student.profile?.subjectLevels || {});
            const completeness = child.student.profile?.completeness ?? 0;

            return (
              <div
                key={child.relationId}
                className="relative flex flex-col gap-4 rounded-xl border border-[#324467] bg-[#232f48] p-6"
              >
                <button
                  onClick={() => handleUnbind(child.relationId, name)}
                  className="absolute right-4 top-4 text-[#5b6b8c] transition-colors hover:text-red-400"
                  title="解除绑定"
                >
                  <span className="material-symbols-outlined text-[20px]">link_off</span>
                </button>

                <div className="flex flex-col items-center gap-3">
                  <div className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-2xl font-bold text-white">
                    {name.charAt(0)}
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-white">{name}</p>
                    <p className="mt-1 text-sm text-[#92a4c9]">
                      {gradeLabel(child.student.profile?.grade)} · {child.relation}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  {badges.length > 0 ? (
                    badges.map((badge) => (
                      <span
                        key={badge.subject}
                        className="rounded bg-blue-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-300"
                      >
                        {badge.subject} {badge.level}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-[#5b6b8c]">尚未设置学科水平</span>
                  )}
                </div>

                <div className="space-y-1.5 border-t border-[#324467] pt-3 text-xs text-[#5b6b8c]">
                  <div className="flex justify-between">
                    <span>学号</span>
                    <span className="text-[#92a4c9]">
                      {child.student.studentIdNumber || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>账号状态</span>
                    <span
                      className={
                        child.student.status === 'ACTIVE' ? 'text-emerald-300' : 'text-amber-300'
                      }
                    >
                      {child.student.status === 'ACTIVE' ? '正常' : child.student.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>档案完整度</span>
                    <span className="text-[#92a4c9]">{completeness}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>绑定时间</span>
                    <span className="text-[#92a4c9]">
                      {new Date(child.bindedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => navigate(`/parent/overview?studentId=${child.student.id}`)}
                    className="rounded-lg bg-[#1a2332] py-2 text-xs font-medium text-[#92a4c9] transition-colors hover:text-white"
                  >
                    学情概览
                  </button>
                  <button
                    onClick={() => navigate(`/parent/learning-state?studentId=${child.student.id}`)}
                    className="rounded-lg bg-[#1a2332] py-2 text-xs font-medium text-[#92a4c9] transition-colors hover:text-white"
                  >
                    学科档案
                  </button>
                </div>
              </div>
            );
          })}

          {/* 添加新学员卡片 */}
          <button
            onClick={() => setShowAddModal(true)}
            className="group flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-[#324467] p-6 transition-all hover:border-primary"
          >
            <div className="flex size-16 items-center justify-center rounded-full bg-[#1a2332] text-[#5b6b8c] transition-all group-hover:bg-primary group-hover:text-white">
              <span className="material-symbols-outlined text-3xl">add</span>
            </div>
            <div className="text-center">
              <p className="font-bold text-[#92a4c9] group-hover:text-white">添加新学员</p>
              <p className="mt-1 text-xs text-[#5b6b8c]">创建新账号或绑定已有学员</p>
            </div>
          </button>
        </div>

        {/* 指导说明 */}
        <div className="mt-10 flex flex-col items-start gap-4 rounded-xl border border-[#324467] bg-[#232f48] p-6 md:flex-row md:items-center">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
            <span className="material-symbols-outlined">help</span>
          </div>
          <div>
            <h4 className="font-bold text-white">多学员管理说明</h4>
            <p className="mt-1 text-sm text-[#92a4c9]">
              绑定后可在「学情概览」「任务管理」「学习报告」中按学员切换查看。解绑仅断开亲子关系，
              学员账号与历史学习数据均会保留。
            </p>
          </div>
        </div>
      </div>

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

// ============ 添加学员弹窗 ============

interface AddChildModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const inputClass =
  'w-full rounded-lg border border-[#324467] bg-[#1a2332] px-4 py-3 text-white placeholder:text-[#5b6b8c] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const labelClass = 'mb-2 block text-sm font-bold text-[#92a4c9]';

function AddChildModal({ onClose, onSuccess }: AddChildModalProps) {
  const [addMethod, setAddMethod] = useState<'create' | 'bind'>('create');

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

  const [bindForm, setBindForm] = useState({
    bindMethod: 'authCode' as 'authCode' | 'studentId',
    authCode: '',
    studentIdNumber: '',
    relation: '父亲',
  });

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!createForm.authCode.trim()) return setFormError('请输入授权码');
    if (!createForm.username.trim()) return setFormError('请输入用户名');
    if (!createForm.password.trim()) return setFormError('请输入密码');
    if (createForm.password !== createForm.confirmPassword)
      return setFormError('两次输入的密码不一致');
    if (!createForm.name.trim()) return setFormError('请输入学员姓名');
    if (!createForm.birthDate) return setFormError('请选择出生年月');
    if (!createForm.grade) return setFormError('请选择年级');

    try {
      setLoading(true);
      await request.post('/parent/children/create', {
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
      });
      onSuccess();
    } catch (err: unknown) {
      console.error('创建学员失败:', err);
      setFormError(getErrorMessage(err, '创建学员失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleBindSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (bindForm.bindMethod === 'authCode' && !bindForm.authCode.trim())
      return setFormError('请输入授权码');
    if (bindForm.bindMethod === 'studentId' && !bindForm.studentIdNumber.trim())
      return setFormError('请输入学号');

    try {
      setLoading(true);
      await request.post('/parent/children/bind', {
        authCode: bindForm.bindMethod === 'authCode' ? bindForm.authCode : undefined,
        studentIdNumber:
          bindForm.bindMethod === 'studentId' ? bindForm.studentIdNumber : undefined,
        relation: bindForm.relation,
      });
      onSuccess();
    } catch (err: unknown) {
      console.error('绑定失败:', err);
      setFormError(getErrorMessage(err, '绑定失败'));
    } finally {
      setLoading(false);
    }
  };

  const tabClass = (active: boolean) =>
    `flex-1 rounded-lg border-2 px-4 py-3 font-medium transition-colors ${
      active
        ? 'border-primary bg-primary/15 text-primary'
        : 'border-[#324467] text-[#92a4c9] hover:border-primary hover:text-white'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl border border-[#324467] bg-[#232f48] p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">添加学员</h2>
          <button onClick={onClose} className="text-[#92a4c9] hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="mb-6 flex gap-4">
          <button
            type="button"
            onClick={() => {
              setAddMethod('create');
              setFormError('');
            }}
            className={tabClass(addMethod === 'create')}
          >
            创建新学员
          </button>
          <button
            type="button"
            onClick={() => {
              setAddMethod('bind');
              setFormError('');
            }}
            className={tabClass(addMethod === 'bind')}
          >
            绑定已有学员
          </button>
        </div>

        {formError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {formError}
          </div>
        )}

        {addMethod === 'create' && (
          <form
            onSubmit={handleCreateSubmit}
            className="max-h-[60vh] space-y-4 overflow-y-auto pr-2"
          >
            <div>
              <label className={labelClass}>
                授权码 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={createForm.authCode}
                onChange={(e) => setCreateForm({ ...createForm, authCode: e.target.value })}
                className={inputClass}
                placeholder="请输入授权码"
              />
            </div>

            <div>
              <label className={labelClass}>
                用户名 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                className={inputClass}
                placeholder="请输入用户名"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  密码 <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className={inputClass}
                  placeholder="请输入密码"
                />
              </div>
              <div>
                <label className={labelClass}>
                  确认密码 <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={createForm.confirmPassword}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, confirmPassword: e.target.value })
                  }
                  className={inputClass}
                  placeholder="请再次输入密码"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  姓名 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className={inputClass}
                  placeholder="请输入姓名"
                />
              </div>
              <div>
                <label className={labelClass}>
                  性别 <span className="text-red-400">*</span>
                </label>
                <select
                  value={createForm.gender}
                  onChange={(e) => setCreateForm({ ...createForm, gender: e.target.value })}
                  className={inputClass}
                >
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  出生年月 <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={createForm.birthDate}
                  onChange={(e) => setCreateForm({ ...createForm, birthDate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  年级 <span className="text-red-400">*</span>
                </label>
                <select
                  value={createForm.grade}
                  onChange={(e) => setCreateForm({ ...createForm, grade: e.target.value })}
                  className={inputClass}
                >
                  <option value="">请选择年级</option>
                  <optgroup label="小学">
                    {Object.entries(GRADE_LABEL)
                      .filter(([k]) => k.startsWith('PRIMARY'))
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="初中">
                    {Object.entries(GRADE_LABEL)
                      .filter(([k]) => k.startsWith('MIDDLE'))
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="高中">
                    {Object.entries(GRADE_LABEL)
                      .filter(([k]) => k.startsWith('HIGH'))
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>就读院校</label>
              <input
                type="text"
                value={createForm.school}
                onChange={(e) => setCreateForm({ ...createForm, school: e.target.value })}
                className={inputClass}
                placeholder="请输入就读院校（选填）"
              />
            </div>

            <div>
              <label className={labelClass}>学习基础</label>
              <select
                value={createForm.learningFoundation}
                onChange={(e) =>
                  setCreateForm({ ...createForm, learningFoundation: e.target.value })
                }
                className={inputClass}
              >
                <option value="">请选择学习基础（选填）</option>
                <option value="WEAK">薄弱</option>
                <option value="AVERAGE">一般</option>
                <option value="GOOD">良好</option>
                <option value="EXCELLENT">优秀</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>兴趣爱好</label>
              <textarea
                value={createForm.interests}
                onChange={(e) => setCreateForm({ ...createForm, interests: e.target.value })}
                className={inputClass}
                placeholder="请输入兴趣爱好（选填）"
                rows={3}
              />
            </div>

            <div>
              <label className={labelClass}>
                关系 <span className="text-red-400">*</span>
              </label>
              <select
                value={createForm.relation}
                onChange={(e) => setCreateForm({ ...createForm, relation: e.target.value })}
                className={inputClass}
              >
                <option value="父亲">父亲</option>
                <option value="母亲">母亲</option>
                <option value="监护人">监护人</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-lg bg-primary py-3 font-bold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '创建中...' : '创建并绑定'}
            </button>
          </form>
        )}

        {addMethod === 'bind' && (
          <form onSubmit={handleBindSubmit} className="space-y-6">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setBindForm({ ...bindForm, bindMethod: 'authCode' })}
                className={tabClass(bindForm.bindMethod === 'authCode')}
              >
                授权码绑定
              </button>
              <button
                type="button"
                onClick={() => setBindForm({ ...bindForm, bindMethod: 'studentId' })}
                className={tabClass(bindForm.bindMethod === 'studentId')}
              >
                学号绑定
              </button>
            </div>

            {bindForm.bindMethod === 'authCode' ? (
              <div>
                <label className={labelClass}>授权码</label>
                <input
                  type="text"
                  value={bindForm.authCode}
                  onChange={(e) => setBindForm({ ...bindForm, authCode: e.target.value })}
                  className={inputClass}
                  placeholder="请输入授权码"
                />
              </div>
            ) : (
              <div>
                <label className={labelClass}>学号</label>
                <input
                  type="text"
                  value={bindForm.studentIdNumber}
                  onChange={(e) => setBindForm({ ...bindForm, studentIdNumber: e.target.value })}
                  className={inputClass}
                  placeholder="请输入学号"
                />
              </div>
            )}

            <div>
              <label className={labelClass}>关系</label>
              <select
                value={bindForm.relation}
                onChange={(e) => setBindForm({ ...bindForm, relation: e.target.value })}
                className={inputClass}
              >
                <option value="父亲">父亲</option>
                <option value="母亲">母亲</option>
                <option value="监护人">监护人</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-3 font-bold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '绑定中...' : '确认绑定'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
