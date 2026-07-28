import { useState } from 'react';
import { GRADE_OPTIONS } from '../../constants/grades';
import { LEARNING_FOUNDATION_OPTIONS } from '../../constants/learningFoundation';
import { usePreventDoubleSubmit } from '../../hooks/useDebounce';

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Role = 'ADMIN' | 'PARENT' | 'STUDENT';

/**
 * 创建用户弹窗组件
 */
export default function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
  const [role, setRole] = useState<Role>('PARENT');
  const [error, setError] = useState('');

  // 基础字段
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // 家长特有字段
  const [realName, setRealName] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [industry, setIndustry] = useState('');

  // 学员特有字段
  const [authCode, setAuthCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentGender, setStudentGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [grade, setGrade] = useState('');
  const [school, setSchool] = useState('');
  const [learningFoundation, setLearningFoundation] = useState('');
  const [interests, setInterests] = useState('');

  // 使用防重复提交Hook
  const { execute: submitForm, loading } = usePreventDoubleSubmit(async () => {
    const requestData: any = {
      username,
      password,
      role,
      email: email || undefined,
      phone: phone || undefined,
    };

    // 家长特有字段
    if (role === 'PARENT') {
      if (realName) requestData.realName = realName;
      if (gender) requestData.gender = gender;
      if (address) requestData.address = address;
      if (industry) requestData.industry = industry;
    }

    // 学员特有字段
    if (role === 'STUDENT') {
      requestData.authCode = authCode;
      requestData.studentName = studentName;
      requestData.studentGender = studentGender;
      requestData.birthDate = birthDate;
      requestData.grade = grade;
      if (school) requestData.school = school;
      if (learningFoundation) requestData.learningFoundation = learningFoundation;
      if (interests) requestData.interests = interests;
    }

    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(requestData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || '创建用户失败');
    }

    onSuccess();
    onClose();
  });

  // 表单验证
  const validateForm = () => {
    if (!username || username.length < 3 || username.length > 20) {
      setError('用户名长度必须在 3-20 个字符之间');
      return false;
    }

    if (!password || password.length < 6) {
      setError('密码长度至少为 6 个字符');
      return false;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return false;
    }

    // 家长角色验证
    if (role === 'PARENT') {
      if (!email) {
        setError('家长注册需要邮箱');
        return false;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError('邮箱格式不正确');
        return false;
      }
    }

    // 学员角色验证
    if (role === 'STUDENT') {
      if (!studentName || !studentGender || !birthDate || !grade) {
        setError('学员注册需要姓名、性别、出生年月和年级');
        return false;
      }
      if (!authCode) {
        setError('学员注册需要授权码');
        return false;
      }
    }

    // 手机号验证
    if (phone) {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(phone)) {
        setError('手机号格式不正确');
        return false;
      }
    }

    return true;
  };

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    try {
      await submitForm();
    } catch (err: any) {
      setError(err.message || '创建用户失败');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-[#1a2436] border border-[#324467] shadow-xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-[#324467] px-6 py-4">
          <h2 className="text-xl font-bold text-white">新增用户</h2>
          <button
            onClick={onClose}
            className="text-[#92a4c9] hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 错误提示 */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* 角色选择 */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              用户角色 <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['ADMIN', 'PARENT', 'STUDENT'] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`px-4 py-3 rounded-lg border transition-colors ${
                    role === r
                      ? 'bg-primary border-primary text-white'
                      : 'bg-[#232f48] border-[#324467] text-[#92a4c9] hover:border-primary'
                  }`}
                >
                  {r === 'ADMIN' ? '管理员' : r === 'PARENT' ? '家长' : '学员'}
                </button>
              ))}
            </div>
          </div>

          {/* 基础信息 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                用户名 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                placeholder="3-20个字符"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                密码 <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                placeholder="至少6个字符"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                确认密码 <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                placeholder="再次输入密码"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                邮箱 {role === 'PARENT' && <span className="text-red-400">*</span>}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                placeholder="example@email.com"
                required={role === 'PARENT'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                手机号
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                placeholder="11位手机号"
              />
            </div>
          </div>

          {/* 家长特有字段 */}
          {role === 'PARENT' && (
            <div className="space-y-4 border-t border-[#324467] pt-4">
              <h3 className="text-sm font-medium text-white">家长信息（选填）</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#92a4c9] mb-2">
                    姓名
                  </label>
                  <input
                    type="text"
                    value={realName}
                    onChange={(e) => setRealName(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                    placeholder="真实姓名"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#92a4c9] mb-2">
                    性别
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white focus:outline-none focus:border-primary transition-colors"
                  >
                    <option value="">请选择</option>
                    <option value="男">男</option>
                    <option value="女">女</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#92a4c9] mb-2">
                    家庭住址
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                    placeholder="详细地址"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#92a4c9] mb-2">
                    从事行业
                  </label>
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                    placeholder="职业或行业"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 学员特有字段 */}
          {role === 'STUDENT' && (
            <div className="space-y-4 border-t border-[#324467] pt-4">
              <h3 className="text-sm font-medium text-white">学员信息</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    授权码 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                    placeholder="输入授权码"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    姓名 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                    placeholder="学员姓名"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    性别 <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={studentGender}
                    onChange={(e) => setStudentGender(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white focus:outline-none focus:border-primary transition-colors"
                    required
                  >
                    <option value="">请选择</option>
                    <option value="男">男</option>
                    <option value="女">女</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    出生年月 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white focus:outline-none focus:border-primary transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    年级 <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white focus:outline-none focus:border-primary transition-colors"
                    required
                  >
                    <option value="">请选择年级</option>
                    {GRADE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#92a4c9] mb-2">
                    就读院校
                  </label>
                  <input
                    type="text"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                    placeholder="学校名称"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#92a4c9] mb-2">
                    学习基础
                  </label>
                  <select
                    value={learningFoundation}
                    onChange={(e) => setLearningFoundation(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white focus:outline-none focus:border-primary transition-colors"
                  >
                    <option value="">请选择</option>
                    {LEARNING_FOUNDATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-[#92a4c9] mb-2">
                    兴趣爱好
                  </label>
                  <textarea
                    value={interests}
                    onChange={(e) => setInterests(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors resize-none"
                    placeholder="学员的兴趣爱好"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 按钮组 */}
          <div className="flex justify-end gap-3 border-t border-[#324467] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 rounded-lg bg-[#232f48] hover:bg-[#324467] text-white transition-colors"
              disabled={loading}
            >
              取消
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-lg bg-primary hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? '创建中...' : '创建用户'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
