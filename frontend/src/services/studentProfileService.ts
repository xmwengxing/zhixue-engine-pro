// 学员档案服务
import request from '../utils/request';

/**
 * 学员档案数据类型
 */
export interface StudentProfile {
  id: string;
  userId: string;
  realName: string;
  gender: string;
  birthDate?: string;
  grade: string;
  school?: string;
  materialVersion: string;
  learningFoundation?: string;
  interests?: string;
  subjectLevels: Record<string, 'weak' | 'average' | 'good' | 'excellent'>;
  completeness: number;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    username: string;
    email?: string;
    phone?: string;
    studentId?: {
      studentIdNumber: string;
    };
  };
}

/**
 * 档案更新数据类型
 */
export interface ProfileUpdateData {
  grade?: string;
  school?: string;
  learningFoundation?: string;
  interests?: string;
  materialVersion?: string;
}

/**
 * 密码修改数据类型
 */
export interface PasswordUpdateData {
  oldPassword: string;
  newPassword: string;
}

/**
 * 自评数据类型
 */
export interface SelfAssessmentData {
  subject: string;
  level: 'weak' | 'average' | 'good' | 'excellent';
}

/**
 * 档案历史记录类型
 */
export interface ProfileHistory {
  timestamp: string;
  action: string;
}

/**
 * 学员档案服务类
 */
class StudentProfileService {
  /**
   * 获取学员档案
   */
  async getProfile(): Promise<StudentProfile> {
    const response = await request.get<{ success: boolean; profile: StudentProfile }>(
      '/student/profile'
    );
    return response.profile;
  }

  /**
   * 更新学员档案
   */
  async updateProfile(data: ProfileUpdateData): Promise<StudentProfile> {
    const response = await request.put<{
      success: boolean;
      message: string;
      data: StudentProfile;
    }>('/student/profile', data);
    // 修复：直接返回 response.data（这里的 data 是业务数据字段名）
    return response.data;
  }

  /**
   * 修改密码
   */
  async updatePassword(data: PasswordUpdateData): Promise<void> {
    await request.put<{
      success: boolean;
      message: string;
    }>('/student/password', data);
  }

  /**
   * 学习基础自评
   */
  async selfAssessment(data: SelfAssessmentData): Promise<StudentProfile> {
    const response = await request.post<{
      success: boolean;
      message: string;
      profile: StudentProfile;
    }>('/student/profile/self-assessment', data);
    return response.profile;
  }

  /**
   * 获取档案更新历史
   */
  async getProfileHistory(limit: number = 10): Promise<ProfileHistory[]> {
    const response = await request.get<{
      success: boolean;
      history: ProfileHistory[];
    }>(`/student/profile/history?limit=${limit}`);
    return response.history;
  }
}

export const studentProfileService = new StudentProfileService();

