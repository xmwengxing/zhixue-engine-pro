import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { getErrorMessage } from '../types/error';
import { GRADE_OPTIONS } from '../constants/grades';
import { LEARNING_FOUNDATION_OPTIONS } from '../constants/learningFoundation';

/**
 * 用户角色类型
 */
type UserRole = 'PARENT' | 'STUDENT';

/**
 * 注册表单数据接口
 */
interface RegisterFormData {
  role: UserRole;
  username: string;
  password: string;
  confirmPassword: string;
  email: string;
  authCode: string;
  
  // 家长特有字段
  parentName: string;
  parentGender: string;
  parentPhone: string;
  parentAddress: string;
  parentIndustry: string;
  
  // 学员特有字段
  studentName: string;
  studentGender: string;
  birthDate: string;
  grade: string;
  school: string;
  learningFoundation: string;
  interests: string;
}

/**
 * 注册页面
 * 支持家长和学员两种角色的差异化注册
 */
export const Register = () => {
  const navigate = useNavigate();

  // 表单状态
  const [formData, setFormData] = useState<RegisterFormData>({
    role: 'STUDENT',
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    authCode: '',
    
    // 家长字段
    parentName: '',
    parentGender: '',
    parentPhone: '',
    parentAddress: '',
    parentIndustry: '',
    
    // 学员字段
    studentName: '',
    studentGender: '',
    birthDate: '',
    grade: '',
    school: '',
    learningFoundation: '',
    interests: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  // 更新表单字段
  const updateField = (field: keyof RegisterFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // 清除该字段的错误
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // 邮箱格式验证
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // 表单验证
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // 基础字段验证
    if (!formData.username.trim()) {
      errors.username = '请输入用户名';
    } else if (formData.username.length < 3 || formData.username.length > 20) {
      errors.username = '用户名长度应在 3-20 个字符之间';
    }

    if (!formData.password) {
      errors.password = '请输入密码';
    } else if (formData.password.length < 6) {
      errors.password = '密码至少 6 个字符';
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = '两次输入的密码不一致';
    }

    // 家长注册验证
    if (formData.role === 'PARENT') {
      if (formData.email && !validateEmail(formData.email)) {
        errors.email = '邮箱格式不正确';
      }
    }

    // 学员注册验证
    if (formData.role === 'STUDENT') {
      if (!formData.authCode.trim()) {
        errors.authCode = '请输入授权码';
      }
      if (!formData.studentName.trim()) {
        errors.studentName = '请输入姓名';
      }
      if (!formData.studentGender) {
        errors.studentGender = '请选择性别';
      }
      if (!formData.birthDate) {
        errors.birthDate = '请选择出生年月';
      }
      if (!formData.grade) {
        errors.grade = '请选择年级';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 处理注册提交
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // 验证表单
    if (!validateForm()) {
      setError('请检查表单填写是否正确');
      return;
    }

    setLoading(true);

    try {
      // 构建注册数据
      const registerData: any = {
        role: formData.role,
        username: formData.username,
        password: formData.password,
        email: formData.email || undefined,
        authCode: formData.role === 'STUDENT' ? formData.authCode : undefined,
        profile: {},
      };

      // 根据角色添加特定字段
      if (formData.role === 'PARENT') {
        registerData.profile = {
          name: formData.parentName || undefined,
          gender: formData.parentGender || undefined,
          phone: formData.parentPhone || undefined,
          address: formData.parentAddress || undefined,
          industry: formData.parentIndustry || undefined,
        };
      } else {
        registerData.profile = {
          name: formData.studentName,
          gender: formData.studentGender,
          birthDate: formData.birthDate,
          grade: formData.grade,
          school: formData.school || undefined,
          learningFoundation: formData.learningFoundation || undefined,
          interests: formData.interests || undefined,
        };
      }

      // 调用注册 API
      await authService.register(registerData);

      // 注册成功
      setSuccess(true);

      // 3 秒后跳转到登录页
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: unknown) {
      console.error('注册失败:', err);
      setError(getErrorMessage(err, '注册失败，请检查信息是否正确'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 py-8">
      <div className="max-w-2xl w-full mx-4">
        {/* 注册卡片 */}
        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* 标题 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              智能提分训练平台
            </h1>
            <p className="text-gray-600">创建您的账户</p>
          </div>

          {/* 注册表单 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 错误提示 */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* 成功提示 */}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
                <p className="text-sm">注册成功！即将跳转到登录页...</p>
              </div>
            )}

            {/* 角色选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                选择角色 <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => updateField('role', 'PARENT')}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    formData.role === 'PARENT'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  disabled={loading || success}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">👨‍👩‍👧‍👦</div>
                    <div className="font-medium">家长</div>
                    <div className="text-xs text-gray-500 mt-1">管理子女学习</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => updateField('role', 'STUDENT')}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    formData.role === 'STUDENT'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  disabled={loading || success}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">🎓</div>
                    <div className="font-medium">学员</div>
                    <div className="text-xs text-gray-500 mt-1">开始学习之旅</div>
                  </div>
                </button>
              </div>
            </div>

            {/* 基础信息 */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 border-b pb-2">基础信息</h3>
              
              {/* 用户名 */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  用户名 <span className="text-red-500">*</span>
                </label>
                <input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => updateField('username', e.target.value)}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                    fieldErrors.username ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="请输入用户名（3-20 个字符）"
                  disabled={loading || success}
                />
                {fieldErrors.username && (
                  <p className="mt-1 text-sm text-red-600">{fieldErrors.username}</p>
                )}
              </div>

              {/* 密码 */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  密码 <span className="text-red-500">*</span>
                </label>
                <input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                    fieldErrors.password ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="请输入密码（至少 6 个字符）"
                  disabled={loading || success}
                />
                {fieldErrors.password && (
                  <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>
                )}
              </div>

              {/* 确认密码 */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  确认密码 <span className="text-red-500">*</span>
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => updateField('confirmPassword', e.target.value)}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                    fieldErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="请再次输入密码"
                  disabled={loading || success}
                />
                {fieldErrors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">{fieldErrors.confirmPassword}</p>
                )}
              </div>
            </div>

            {/* 家长特有字段 */}
            {formData.role === 'PARENT' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 border-b pb-2">家长信息</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 邮箱 */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      邮箱
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        fieldErrors.email ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="请输入邮箱"
                      disabled={loading || success}
                    />
                    {fieldErrors.email && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>
                    )}
                  </div>

                  {/* 姓名 */}
                  <div>
                    <label htmlFor="parentName" className="block text-sm font-medium text-gray-700 mb-2">
                      姓名
                    </label>
                    <input
                      id="parentName"
                      type="text"
                      value={formData.parentName}
                      onChange={(e) => updateField('parentName', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="请输入姓名"
                      disabled={loading || success}
                    />
                  </div>

                  {/* 性别 */}
                  <div>
                    <label htmlFor="parentGender" className="block text-sm font-medium text-gray-700 mb-2">
                      性别
                    </label>
                    <select
                      id="parentGender"
                      value={formData.parentGender}
                      onChange={(e) => updateField('parentGender', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      disabled={loading || success}
                    >
                      <option value="">请选择</option>
                      <option value="男">男</option>
                      <option value="女">女</option>
                    </select>
                  </div>

                  {/* 联系方式 */}
                  <div>
                    <label htmlFor="parentPhone" className="block text-sm font-medium text-gray-700 mb-2">
                      联系方式
                    </label>
                    <input
                      id="parentPhone"
                      type="tel"
                      value={formData.parentPhone}
                      onChange={(e) => updateField('parentPhone', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="请输入联系方式"
                      disabled={loading || success}
                    />
                  </div>

                  {/* 家庭住址 */}
                  <div className="md:col-span-2">
                    <label htmlFor="parentAddress" className="block text-sm font-medium text-gray-700 mb-2">
                      家庭住址
                    </label>
                    <input
                      id="parentAddress"
                      type="text"
                      value={formData.parentAddress}
                      onChange={(e) => updateField('parentAddress', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="请输入家庭住址"
                      disabled={loading || success}
                    />
                  </div>

                  {/* 从事行业 */}
                  <div className="md:col-span-2">
                    <label htmlFor="parentIndustry" className="block text-sm font-medium text-gray-700 mb-2">
                      从事行业
                    </label>
                    <input
                      id="parentIndustry"
                      type="text"
                      value={formData.parentIndustry}
                      onChange={(e) => updateField('parentIndustry', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="请输入从事行业"
                      disabled={loading || success}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 学员特有字段 */}
            {formData.role === 'STUDENT' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 border-b pb-2">学员信息</h3>
                
                {/* 授权码 */}
                <div>
                  <label htmlFor="authCode" className="block text-sm font-medium text-gray-700 mb-2">
                    授权码 <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="authCode"
                    type="text"
                    value={formData.authCode}
                    onChange={(e) => updateField('authCode', e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      fieldErrors.authCode ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="请输入授权码"
                    disabled={loading || success}
                  />
                  {fieldErrors.authCode && (
                    <p className="mt-1 text-sm text-red-600">{fieldErrors.authCode}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-500">请联系管理员获取授权码</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 姓名 */}
                  <div>
                    <label htmlFor="studentName" className="block text-sm font-medium text-gray-700 mb-2">
                      姓名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="studentName"
                      type="text"
                      value={formData.studentName}
                      onChange={(e) => updateField('studentName', e.target.value)}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        fieldErrors.studentName ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="请输入姓名"
                      disabled={loading || success}
                    />
                    {fieldErrors.studentName && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.studentName}</p>
                    )}
                  </div>

                  {/* 性别 */}
                  <div>
                    <label htmlFor="studentGender" className="block text-sm font-medium text-gray-700 mb-2">
                      性别 <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="studentGender"
                      value={formData.studentGender}
                      onChange={(e) => updateField('studentGender', e.target.value)}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        fieldErrors.studentGender ? 'border-red-500' : 'border-gray-300'
                      }`}
                      disabled={loading || success}
                    >
                      <option value="">请选择</option>
                      <option value="男">男</option>
                      <option value="女">女</option>
                    </select>
                    {fieldErrors.studentGender && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.studentGender}</p>
                    )}
                  </div>

                  {/* 出生年月 */}
                  <div>
                    <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-2">
                      出生年月 <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="birthDate"
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => updateField('birthDate', e.target.value)}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        fieldErrors.birthDate ? 'border-red-500' : 'border-gray-300'
                      }`}
                      disabled={loading || success}
                    />
                    {fieldErrors.birthDate && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.birthDate}</p>
                    )}
                  </div>

                  {/* 年级 */}
                  <div>
                    <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-2">
                      年级 <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="grade"
                      value={formData.grade}
                      onChange={(e) => updateField('grade', e.target.value)}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        fieldErrors.grade ? 'border-red-500' : 'border-gray-300'
                      }`}
                      disabled={loading || success}
                    >
                      <option value="">请选择年级</option>
                      <optgroup label="小学">
                        {GRADE_OPTIONS.filter(g => g.category === 'PRIMARY').map(grade => (
                          <option key={grade.value} value={grade.value}>{grade.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="初中">
                        {GRADE_OPTIONS.filter(g => g.category === 'MIDDLE').map(grade => (
                          <option key={grade.value} value={grade.value}>{grade.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="高中">
                        {GRADE_OPTIONS.filter(g => g.category === 'HIGH').map(grade => (
                          <option key={grade.value} value={grade.value}>{grade.label}</option>
                        ))}
                      </optgroup>
                    </select>
                    {fieldErrors.grade && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.grade}</p>
                    )}
                  </div>

                  {/* 就读院校 */}
                  <div>
                    <label htmlFor="school" className="block text-sm font-medium text-gray-700 mb-2">
                      就读院校
                    </label>
                    <input
                      id="school"
                      type="text"
                      value={formData.school}
                      onChange={(e) => updateField('school', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="请输入就读院校"
                      disabled={loading || success}
                    />
                  </div>

                  {/* 学习基础 */}
                  <div>
                    <label htmlFor="learningFoundation" className="block text-sm font-medium text-gray-700 mb-2">
                      学习基础
                    </label>
                    <select
                      id="learningFoundation"
                      value={formData.learningFoundation}
                      onChange={(e) => updateField('learningFoundation', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      disabled={loading || success}
                    >
                      <option value="">请选择学习基础</option>
                      {LEARNING_FOUNDATION_OPTIONS.map(lf => (
                        <option key={lf.value} value={lf.value}>{lf.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* 兴趣爱好 */}
                  <div className="md:col-span-2">
                    <label htmlFor="interests" className="block text-sm font-medium text-gray-700 mb-2">
                      兴趣爱好
                    </label>
                    <textarea
                      id="interests"
                      value={formData.interests}
                      onChange={(e) => updateField('interests', e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="请输入兴趣爱好"
                      disabled={loading || success}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 注册按钮 */}
            <button
              type="submit"
              disabled={loading || success}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
            >
              {loading ? '注册中...' : success ? '注册成功' : '注册'}
            </button>

            {/* 登录链接 */}
            <div className="text-center">
              <p className="text-sm text-gray-600">
                已有账户？
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-blue-600 hover:text-blue-700 font-medium ml-1"
                  disabled={loading || success}
                >
                  立即登录
                </button>
              </p>
            </div>
          </form>

          {/* 测试授权码提示（开发环境） */}
          {import.meta.env.DEV && formData.role === 'STUDENT' && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-600 font-medium mb-2">
                测试授权码：
              </p>
              <div className="text-xs text-gray-500">
                <p>TEST-AUTH-CODE-NEW</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
