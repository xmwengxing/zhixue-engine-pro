// 学员端 - 个人档案管理页面
import { useState, useEffect } from 'react';
import { studentProfileService } from '../../services/studentProfileService';
import type { StudentProfile } from '../../services/studentProfileService';
import { getErrorMessage } from '../../types/error';
import { GRADE_OPTIONS_BY_CATEGORY, CATEGORY_LABELS } from '../../constants/grades';
import { LEARNING_FOUNDATION_OPTIONS } from '../../constants/learningFoundation';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';

/**
 * 个人档案管理页面
 * 参照设计稿：学员端-个人档案管理
 */
const ProfileManagement = () => {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // 显示密码修改对话框
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  // 表单数据（仅包含可编辑字段）
  const [formData, setFormData] = useState({
    grade: '',
    school: '',
    materialVersion: '', // 教材版本
    learningFoundation: '',
    interests: '',
  });

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
      setFormData({
        grade: data.grade || '',
        school: data.school || '',
        materialVersion: data.materialVersion || '', // 教材版本
        learningFoundation: data.learningFoundation || '',
        interests: data.interests || '',
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err, '加载档案失败'));
    } finally {
      setLoading(false);
    }
  };

  // 处理表单输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    console.log(`表单字段变化: ${name} = "${value}"`);
    setFormData((prev) => {
      const newData = {
        ...prev,
        [name]: value,
      };
      console.log('更新后的 formData:', newData);
      return newData;
    });
  };

  // 保存档案
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      console.log('准备保存档案，formData:', formData);
      const updatedProfile = await studentProfileService.updateProfile(formData);
      console.log('保存成功，返回的档案数据:', updatedProfile);
      setProfile(updatedProfile);
      setSuccessMessage('档案保存成功！');
      
      // 3秒后清除成功消息
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      console.error('保存档案失败:', err);
      setError(getErrorMessage(err, '保存档案失败'));
    } finally {
      setSaving(false);
    }
  };

  // 处理密码输入变化
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setPasswordError(null);
  };

  // 提交密码修改
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证新密码
    if (passwordData.newPassword.length < 6) {
      setPasswordError('新密码长度至少为6位');
      return;
    }
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }
    
    if (passwordData.oldPassword === passwordData.newPassword) {
      setPasswordError('新密码不能与原密码相同');
      return;
    }
    
    try {
      setChangingPassword(true);
      setPasswordError(null);
      
      await studentProfileService.updatePassword({
        oldPassword: passwordData.oldPassword,
        newPassword: passwordData.newPassword,
      });
      
      // 密码修改成功，提示用户重新登录
      alert('密码修改成功！请重新登录');
      logout();
      navigate('/login');
    } catch (err: unknown) {
      setPasswordError(getErrorMessage(err, '密码修改失败'));
    } finally {
      setChangingPassword(false);
    }
  };

  // 计算完整度颜色
  const getCompletenessColor = (completeness: number) => {
    if (completeness >= 80) return 'text-green-400';
    if (completeness >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#111722]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-[#92a4c9]">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111722] py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">个人档案管理</h1>
          <p className="mt-2 text-[#92a4c9]">完善你的学习档案，获得更个性化的学习体验</p>
        </div>

        {/* 档案完整度进度条 */}
        {profile && (
          <div className="bg-[#232f48] rounded-lg shadow-sm border border-[#324467] p-6 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">档案完整度</h2>
              <span className={`text-2xl font-bold ${getCompletenessColor(profile.completeness)}`}>
                {profile.completeness}%
              </span>
            </div>
            <div className="w-full bg-[#324467] rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  profile.completeness >= 80
                    ? 'bg-green-600'
                    : profile.completeness >= 50
                    ? 'bg-yellow-600'
                    : 'bg-red-600'
                }`}
                style={{ width: `${profile.completeness}%` }}
              ></div>
            </div>
            <p className="mt-2 text-sm text-[#92a4c9]">
              {profile.completeness < 100
                ? '继续完善档案，解锁更多个性化功能'
                : '档案已完善，开始你的学习之旅吧！'}
            </p>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* 成功提示 */}
        {successMessage && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-300">{successMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* 核心信息展示（只读） */}
        {profile && (
          <div className="bg-[#232f48] rounded-lg shadow-sm border border-[#324467] p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">核心信息（不可修改）</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#c3cfe6] mb-1">学号</label>
                <div className="px-4 py-2 bg-[#1a2332] rounded-lg text-white">
                  {profile.user?.studentId?.studentIdNumber || '未分配'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#c3cfe6] mb-1">真实姓名</label>
                <div className="px-4 py-2 bg-[#1a2332] rounded-lg text-white">
                  {profile.realName}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#c3cfe6] mb-1">性别</label>
                <div className="px-4 py-2 bg-[#1a2332] rounded-lg text-white">
                  {profile.gender || '未设置'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#c3cfe6] mb-1">出生年月</label>
                <div className="px-4 py-2 bg-[#1a2332] rounded-lg text-white">
                  {profile.birthDate ? new Date(profile.birthDate).toLocaleDateString('zh-CN') : '未设置'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 可编辑信息表单 */}
        <div className="bg-[#232f48] rounded-lg shadow-sm border border-[#324467] p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-6">可编辑信息</h2>
          
          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* 年级选单 */}
            <div>
              <label htmlFor="grade" className="block text-sm font-medium text-[#c3cfe6] mb-2">
                年级 <span className="text-red-500">*</span>
              </label>
              <select
                id="grade"
                name="grade"
                value={formData.grade}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-[#324467] rounded-lg bg-[#232f48] text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">请选择年级</option>
                {Object.entries(GRADE_OPTIONS_BY_CATEGORY).map(([category, grades]) => (
                  <optgroup key={category} label={CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}>
                    {grades.map((grade) => (
                      <option key={grade.value} value={grade.value}>
                        {grade.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* 就读院校 */}
            <div>
              <label htmlFor="school" className="block text-sm font-medium text-[#c3cfe6] mb-2">
                就读院校
              </label>
              <input
                type="text"
                id="school"
                name="school"
                value={formData.school}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-[#324467] rounded-lg bg-[#232f48] text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="请输入就读院校"
              />
            </div>

            {/* 教材版本 */}
            <div>
              <label htmlFor="materialVersion" className="block text-sm font-medium text-[#c3cfe6] mb-2">
                教材版本 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="materialVersion"
                name="materialVersion"
                value={formData.materialVersion}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-[#324467] rounded-lg bg-[#232f48] text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="例如：人教版、苏教版、北师大版等"
                required
              />
              <p className="mt-1 text-xs text-[#5b6b8c]">
                教材版本用于智能推荐学习内容，请务必填写准确
              </p>
            </div>

            {/* 学习基础选单 */}
            <div>
              <label htmlFor="learningFoundation" className="block text-sm font-medium text-[#c3cfe6] mb-2">
                学习基础
              </label>
              <select
                id="learningFoundation"
                name="learningFoundation"
                value={formData.learningFoundation}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-[#324467] rounded-lg bg-[#232f48] text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">请选择学习基础</option>
                {LEARNING_FOUNDATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.description}
                  </option>
                ))}
              </select>
            </div>

            {/* 兴趣爱好 */}
            <div>
              <label htmlFor="interests" className="block text-sm font-medium text-[#c3cfe6] mb-2">
                兴趣爱好
              </label>
              <textarea
                id="interests"
                name="interests"
                value={formData.interests}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-4 py-2 border border-[#324467] rounded-lg bg-[#232f48] text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="请输入你的兴趣爱好"
              />
            </div>

            {/* 保存按钮 */}
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={loadProfile}
                className="px-6 py-2 border border-[#324467] rounded-lg text-[#c3cfe6] hover:bg-[#1a2332] transition-colors"
                disabled={saving}
              >
                重置
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-[#324467] disabled:text-[#5b6b8c] disabled:cursor-not-allowed"
                disabled={saving}
              >
                {saving ? '保存中...' : '保存档案'}
              </button>
            </div>
          </form>
        </div>

        {/* 账户安全 */}
        <div className="bg-[#232f48] rounded-lg shadow-sm border border-[#324467] p-6">
          <h2 className="text-xl font-semibold text-white mb-4">账户安全</h2>
          
          {/* 用户名显示 */}
          {profile && (
            <div className="mb-4 p-4 bg-[#1a2332] rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-[#c3cfe6] mb-1">
                    登录用户名
                  </label>
                  <p className="text-base font-mono text-white">
                    {profile.user?.username || '未设置'}
                  </p>
                  <p className="text-xs text-[#5b6b8c] mt-1">
                    用户名用于登录，不可修改
                  </p>
                </div>
                <span className="material-symbols-outlined text-[#5b6b8c]">
                  account_circle
                </span>
              </div>
            </div>
          )}
          
          {/* 修改密码按钮 */}
          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="w-full px-6 py-3 bg-[#1a2332] text-[#92a4c9] border border-[#324467] rounded-lg hover:border-[#3b82f6] hover:text-white transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-xl">
              lock_reset
            </span>
            修改密码
          </button>
        </div>

        {/* 学习基础自评提示 */}
        <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-300">
                保存基本信息后，请前往"学习基础自评"页面完成各科目能力评估，以获得更精准的学习推荐。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 密码修改对话框 */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#232f48] rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">修改密码</h3>
            
            {passwordError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-300">{passwordError}</p>
              </div>
            )}
            
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="oldPassword" className="block text-sm font-medium text-[#c3cfe6] mb-2">
                  原密码 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="oldPassword"
                  name="oldPassword"
                  value={passwordData.oldPassword}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-2 border border-[#324467] rounded-lg bg-[#232f48] text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-[#c3cfe6] mb-2">
                  新密码 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-2 border border-[#324467] rounded-lg bg-[#232f48] text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  minLength={6}
                />
                <p className="mt-1 text-xs text-[#5b6b8c]">密码长度至少为6位</p>
              </div>
              
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#c3cfe6] mb-2">
                  确认新密码 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-2 border border-[#324467] rounded-lg bg-[#232f48] text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
                    setPasswordError(null);
                  }}
                  className="px-4 py-2 border border-[#324467] rounded-lg text-[#c3cfe6] hover:bg-[#1a2332] transition-colors"
                  disabled={changingPassword}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-[#324467] disabled:text-[#5b6b8c] disabled:cursor-not-allowed"
                  disabled={changingPassword}
                >
                  {changingPassword ? '修改中...' : '确认修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileManagement;
