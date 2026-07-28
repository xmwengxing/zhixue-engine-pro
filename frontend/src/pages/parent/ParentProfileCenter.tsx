import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import Modal from '../../components/shared/Modal';
import { useToast } from '../../hooks/useToast';
import request from '../../utils/request';

/**
 * 家长个人信息接口
 */
interface ParentProfile {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  realName: string | null;
  gender: string | null;
  address: string | null;
  industry: string | null;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/**
 * 家长个人中心页面
 */
export default function ParentProfileCenter() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<ParentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  // 编辑表单数据
  const [editForm, setEditForm] = useState({
    email: '',
    phone: '',
    realName: '',
    gender: '',
    address: '',
    industry: '',
  });

  // 密码修改表单数据
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // 加载个人信息
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const response = await request.get('/parent/profile');
      
      setProfile(response.data);
      setEditForm({
        email: response.data.email || '',
        phone: response.data.phone || '',
        realName: response.data.realName || '',
        gender: response.data.gender || '',
        address: response.data.address || '',
        industry: response.data.industry || '',
      });
    } catch (error) {
      console.error('加载个人信息失败:', error);
      showToast('加载个人信息失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 保存个人信息
  const handleSaveProfile = async () => {
    try {
      // 验证邮箱格式
      if (editForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) {
        showToast('邮箱格式不正确', 'error');
        return;
      }

      const response = await request.put('/parent/profile', editForm);
      
      setProfile(response.data);
      setEditMode(false);
      showToast('个人信息更新成功', 'success');
    } catch (error: any) {
      console.error('更新个人信息失败:', error);
      showToast(error.message || '更新个人信息失败', 'error');
    }
  };

  // 修改密码
  const handleChangePassword = async () => {
    try {
      // 验证表单
      if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
        showToast('请填写所有密码字段', 'error');
        return;
      }

      if (passwordForm.newPassword.length < 6) {
        showToast('新密码长度至少为6位', 'error');
        return;
      }

      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        showToast('两次输入的新密码不一致', 'error');
        return;
      }

      await request.put('/parent/password', {
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });

      showToast('密码修改成功，请重新登录', 'success');
      setPasswordModalOpen(false);
      
      // 清除令牌并跳转到登录页
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 1500);
    } catch (error: any) {
      console.error('修改密码失败:', error);
      showToast(error.message || '修改密码失败', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400">无法加载个人信息</p>
          <Button onClick={loadProfile} className="mt-4">重试</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">个人中心</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">管理您的个人信息和账户设置</p>
      </div>

      {/* 基本信息卡片 */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">基本信息</h2>
          {!editMode ? (
            <Button onClick={() => setEditMode(true)} variant="outline" size="sm">
              <span className="material-symbols-outlined text-[18px] mr-1">edit</span>
              编辑
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button onClick={() => setEditMode(false)} variant="outline" size="sm">
                取消
              </Button>
              <Button onClick={handleSaveProfile} size="sm">
                保存
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 账户名（只读） */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              账户名
            </label>
            <Input
              value={profile.username}
              disabled
              className="bg-slate-100 dark:bg-slate-700"
            />
          </div>

          {/* 邮箱 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              邮箱
            </label>
            <Input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              disabled={!editMode}
              placeholder="请输入邮箱"
            />
          </div>

          {/* 姓名 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              姓名
            </label>
            <Input
              value={editForm.realName}
              onChange={(e) => setEditForm({ ...editForm, realName: e.target.value })}
              disabled={!editMode}
              placeholder="请输入姓名"
            />
          </div>

          {/* 性别 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              性别
            </label>
            <select
              value={editForm.gender}
              onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
              disabled={!editMode}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-100 dark:disabled:bg-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">请选择</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </div>

          {/* 联系方式 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              联系方式
            </label>
            <Input
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              disabled={!editMode}
              placeholder="请输入联系方式"
            />
          </div>

          {/* 从事行业 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              从事行业
            </label>
            <Input
              value={editForm.industry}
              onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
              disabled={!editMode}
              placeholder="请输入从事行业"
            />
          </div>

          {/* 家庭住址 */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              家庭住址
            </label>
            <Input
              value={editForm.address}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              disabled={!editMode}
              placeholder="请输入家庭住址"
            />
          </div>
        </div>
      </Card>

      {/* 账户安全卡片 */}
      <Card>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">账户安全</h2>
        
        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div>
            <h3 className="font-medium text-slate-900 dark:text-white">登录密码</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              定期修改密码可以提高账户安全性
            </p>
          </div>
          <Button onClick={() => setPasswordModalOpen(true)} variant="outline">
            修改密码
          </Button>
        </div>

        <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-slate-400 text-[20px] mt-0.5">info</span>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              <p className="font-medium mb-1">账户信息</p>
              <p>注册时间: {new Date(profile.createdAt).toLocaleString('zh-CN')}</p>
              {profile.lastLoginAt && (
                <p>最后登录: {new Date(profile.lastLoginAt).toLocaleString('zh-CN')}</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* 修改密码弹窗 */}
      <Modal
        isOpen={passwordModalOpen}
        onClose={() => {
          setPasswordModalOpen(false);
          setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
        }}
        title="修改密码"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              原密码 <span className="text-red-500">*</span>
            </label>
            <Input
              type="password"
              value={passwordForm.oldPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
              placeholder="请输入原密码"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              新密码 <span className="text-red-500">*</span>
            </label>
            <Input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              placeholder="请输入新密码（至少6位）"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              确认新密码 <span className="text-red-500">*</span>
            </label>
            <Input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              placeholder="请再次输入新密码"
            />
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-yellow-600 dark:text-yellow-500 text-[20px] mt-0.5">warning</span>
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                修改密码后需要重新登录
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button
              onClick={() => {
                setPasswordModalOpen(false);
                setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
              }}
              variant="outline"
            >
              取消
            </Button>
            <Button onClick={handleChangePassword}>
              确认修改
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
