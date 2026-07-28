import { useState, useEffect } from 'react';
import { GRADE_OPTIONS } from '../../constants/grades';
import { LEARNING_FOUNDATION_OPTIONS } from '../../constants/learningFoundation';
import { usePreventDoubleSubmit } from '../../hooks/useDebounce';

interface User {
  id: string;
  username: string;
  role: 'ADMIN' | 'PARENT' | 'STUDENT';
  email?: string;
  phone?: string;
  realName?: string;
  gender?: string;
  address?: string;
  industry?: string;
  status: string;
  studentIdNumber?: string; // 学号
}

interface EditUserModalProps {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * 编辑用户弹窗组件
 */
export default function EditUserModal({ user, onClose, onSuccess }: EditUserModalProps) {
  const [error, setError] = useState('');

  // 基础字段
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 家长特有字段
  const [realName, setRealName] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [industry, setIndustry] = useState('');

  // 学员档案字段
  const [studentRealName, setStudentRealName] = useState(''); // 学员真实姓名
  const [studentGender, setStudentGender] = useState(''); // 学员性别
  const [birthDate, setBirthDate] = useState(''); // 出生日期
  const [grade, setGrade] = useState('');
  const [school, setSchool] = useState('');
  const [learningFoundation, setLearningFoundation] = useState('');
  const [interests, setInterests] = useState('');
  const [materialVersion, setMaterialVersion] = useState(''); // 教材版本

  // 使用防重复提交Hook
  const { execute: submitForm, loading } = usePreventDoubleSubmit(async () => {
    const requestData: any = {};

    // 管理员角色仅可修改密码
    if (user.role === 'ADMIN') {
      requestData.password = password;
    } else {
      // 其他角色可以修改更多字段
      if (email !== user.email) requestData.email = email;
      if (phone !== user.phone) requestData.phone = phone;
      if (status !== user.status) requestData.status = status;
      if (password) requestData.password = password;

      // 家长特有字段
      if (user.role === 'PARENT') {
        if (realName !== user.realName) requestData.realName = realName;
        if (gender !== user.gender) requestData.gender = gender;
        if (address !== user.address) requestData.address = address;
        if (industry !== user.industry) requestData.industry = industry;
      }

      // 学员档案字段
      if (user.role === 'STUDENT') {
        requestData.studentProfile = {
          realName: studentRealName,
          gender: studentGender,
          birthDate: birthDate,
          grade: grade,
          school: school,
          learningFoundation: learningFoundation,
          interests: interests,
          materialVersion: materialVersion,
        };
      }
    }

    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(requestData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || '更新用户失败');
    }

    onSuccess();
    onClose();
  });

  // 加载学员档案数据
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    // 初始化表单数据
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setStatus(user.status || 'ACTIVE');
    setRealName(user.realName || '');
    setGender(user.gender || '');
    setAddress(user.address || '');
    setIndustry(user.industry || '');

    // 如果是学员，加载档案数据
    if (user.role === 'STUDENT') {
      loadStudentProfile();
    }
  }, [user]);

  // 加载学员档案
  const loadStudentProfile = async () => {
    setProfileLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = await response.json();
      if (data.success && data.data.user.studentProfile) {
        const profile = data.data.user.studentProfile;
        setStudentRealName(profile.realName || '');
        setStudentGender(profile.gender || '');
        setBirthDate(profile.birthDate ? profile.birthDate.split('T')[0] : '');
        setGrade(profile.grade || '');
        setSchool(profile.school || '');
        setLearningFoundation(profile.learningFoundation || '');
        setInterests(profile.interests || '');
        setMaterialVersion(profile.materialVersion || '');
      }
    } catch (err) {
      console.error('加载学员档案失败:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  // 表单验证
  const validateForm = () => {
    // 管理员角色仅可修改密码
    if (user.role === 'ADMIN') {
      if (!password) {
        setError('请输入新密码');
        return false;
      }
      if (password.length < 6) {
        setError('密码长度至少为 6 个字符');
        return false;
      }
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return false;
      }
      return true;
    }

    // 邮箱验证
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError('邮箱格式不正确');
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

    // 密码验证
    if (password) {
      if (password.length < 6) {
        setError('密码长度至少为 6 个字符');
        return false;
      }
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
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
      setError(err.message || '更新用户失败');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-[#1a2436] border border-[#324467] shadow-xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-[#324467] px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-white">编辑用户</h2>
            <p className="text-sm text-[#92a4c9] mt-1">
              {user.username} ({user.role === 'ADMIN' ? '管理员' : user.role === 'PARENT' ? '家长' : '学员'})
            </p>
          </div>
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

          {/* 管理员角色仅可修改密码 */}
          {user.role === 'ADMIN' ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-yellow-400 text-sm">
                管理员角色仅可修改密码
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  新密码 <span className="text-red-400">*</span>
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
            </div>
          ) : (
            <>
              {/* 基础信息 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    邮箱
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                    placeholder="example@email.com"
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

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    状态
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white focus:outline-none focus:border-primary transition-colors"
                  >
                    <option value="ACTIVE">活跃</option>
                    <option value="LOCKED">锁定</option>
                    <option value="DELETED">已删除</option>
                  </select>
                </div>
              </div>

              {/* 密码修改（可选） */}
              <div className="space-y-4 border-t border-[#324467] pt-4">
                <h3 className="text-sm font-medium text-white">修改密码（可选）</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#92a4c9] mb-2">
                      新密码
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                      placeholder="至少6个字符"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#92a4c9] mb-2">
                      确认密码
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                      placeholder="再次输入密码"
                    />
                  </div>
                </div>
              </div>

              {/* 家长特有字段 */}
              {user.role === 'PARENT' && (
                <div className="space-y-4 border-t border-[#324467] pt-4">
                  <h3 className="text-sm font-medium text-white">家长信息</h3>
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

              {/* 学员档案字段 */}
              {user.role === 'STUDENT' && (
                <div className="space-y-4 border-t border-[#324467] pt-4">
                  <h3 className="text-sm font-medium text-white">学员档案</h3>
                  
                  {/* 只读信息：账户名和学号 */}
                  <div className="rounded-lg bg-[#232f48] border border-[#324467] p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[#92a4c9] mb-1">
                          账户名（不可修改）
                        </label>
                        <div className="text-white font-medium">{user.username}</div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#92a4c9] mb-1">
                          学号（不可修改）
                        </label>
                        <div className="text-white font-medium">
                          {user.studentIdNumber || '未分配'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {profileLoading ? (
                    <div className="text-center text-[#92a4c9] py-4">加载中...</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">
                          真实姓名
                        </label>
                        <input
                          type="text"
                          value={studentRealName}
                          onChange={(e) => setStudentRealName(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                          placeholder="学员真实姓名"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white mb-2">
                          性别
                        </label>
                        <select
                          value={studentGender}
                          onChange={(e) => setStudentGender(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white focus:outline-none focus:border-primary transition-colors"
                        >
                          <option value="">请选择</option>
                          <option value="男">男</option>
                          <option value="女">女</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white mb-2">
                          出生日期
                        </label>
                        <input
                          type="date"
                          value={birthDate}
                          onChange={(e) => setBirthDate(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white focus:outline-none focus:border-primary transition-colors"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white mb-2">
                          年级
                        </label>
                        <select
                          value={grade}
                          onChange={(e) => setGrade(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white focus:outline-none focus:border-primary transition-colors"
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
                        <label className="block text-sm font-medium text-white mb-2">
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
                        <label className="block text-sm font-medium text-white mb-2">
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

                      <div>
                        <label className="block text-sm font-medium text-white mb-2">
                          教材版本
                        </label>
                        <input
                          type="text"
                          value={materialVersion}
                          onChange={(e) => setMaterialVersion(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg bg-[#232f48] border border-[#324467] text-white placeholder:text-[#92a4c9] focus:outline-none focus:border-primary transition-colors"
                          placeholder="例如：人教版"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-white mb-2">
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
                  )}
                </div>
              )}
            </>
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
              {loading ? '保存中...' : '保存修改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
