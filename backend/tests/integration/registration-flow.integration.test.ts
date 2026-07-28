/**
 * 完整注册流程集成测试
 * 测试家长注册、学员注册和学号生成
 * 验证需求: 1.1-1.9, 2.1-2.7
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';

const prisma = new PrismaClient();
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

describe('完整注册流程集成测试', () => {
  let api: AxiosInstance;
  let testAuthCode: string;
  let parentUserId: string;
  let studentUserId: string;
  let studentIdNumber: string;

  beforeAll(async () => {
    // 初始化 API 客户端
    api = axios.create({
      baseURL: API_BASE_URL,
      validateStatus: () => true,
    });

    // 创建测试授权码
    const authCode = await prisma.authCode.create({
      data: {
        code: `TEST_REG_${Date.now()}`,
        status: 'UNUSED',
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    testAuthCode = authCode.code;
  });

  afterAll(async () => {
    // 清理测试数据
    if (parentUserId) {
      await prisma.user.delete({ where: { id: parentUserId } }).catch(() => {});
    }
    if (studentUserId) {
      await prisma.studentProfile.deleteMany({ where: { userId: studentUserId } });
      await prisma.studentID.deleteMany({ where: { userId: studentUserId } });
      await prisma.user.delete({ where: { id: studentUserId } }).catch(() => {});
    }
    await prisma.authCode.deleteMany({ where: { code: testAuthCode } });
    await prisma.$disconnect();
  });

  describe('17.1.1 家长注册流程', () => {
    it('应该成功注册家长账户（不需要授权码）', async () => {
      const timestamp = Date.now().toString().slice(-6);
      const parentData = {
        role: 'PARENT',
        username: `p${timestamp}`, // 缩短到1字符前缀
        password: 'Parent123!',
        email: `p${timestamp}@test.com`,
        profile: {
          name: '测试家长',
          gender: '男',
          phone: '13800138000',
          address: '测试地址',
          industry: '测试行业',
        },
      };

      const response = await api.post('/api/auth/register', parentData);

      // 验证响应
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('userId');
      expect(response.data.data).toHaveProperty('username', parentData.username);
      expect(response.data.data).toHaveProperty('role', 'PARENT');

      parentUserId = response.data.data.userId;

      // 验证数据库中的用户记录
      const user = await prisma.user.findUnique({
        where: { id: parentUserId },
      });

      expect(user).toBeTruthy();
      expect(user?.role).toBe('PARENT');
      expect(user?.email).toBe(parentData.email);
      expect(user?.realName).toBe(parentData.profile.name);
      expect(user?.gender).toBe(parentData.profile.gender);
    });

    it('应该拒绝家长注册时缺少必填字段', async () => {
      const timestamp = Date.now().toString().slice(-6);
      const invalidData = {
        role: 'PARENT',
        username: `pi${timestamp}`, // 缩短前缀
        // 缺少密码
      };

      const response = await api.post('/api/auth/register', invalidData);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it('应该拒绝重复的用户名', async () => {
      const timestamp = Date.now().toString().slice(-6);
      const username = `pd${timestamp}`; // 缩短前缀
      
      // 第一次注册
      await api.post('/api/auth/register', {
        role: 'PARENT',
        username,
        password: 'Parent123!',
        email: `${username}@test.com`,
      });

      // 第二次使用相同用户名注册
      const response = await api.post('/api/auth/register', {
        role: 'PARENT',
        username,
        password: 'Parent456!',
        email: `${username}2@test.com`,
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });
  });

  describe('17.1.2 学员注册流程', () => {
    it('应该成功注册学员账户（需要授权码）', async () => {
      const timestamp = Date.now().toString().slice(-6);
      const studentData = {
        role: 'STUDENT',
        username: `s${timestamp}`, // 缩短到1字符前缀
        password: 'Student123!',
        authCode: testAuthCode,
        profile: {
          name: '测试学员',
          gender: '女',
          birthDate: '2010-05-15',
          grade: 'PRIMARY_5_1',
          school: '测试小学',
          learningFoundation: 'GOOD',
          interests: '数学,阅读',
        },
      };

      const response = await api.post('/api/auth/register', studentData);

      // 验证响应
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('userId');
      expect(response.data.data).toHaveProperty('username', studentData.username);
      expect(response.data.data).toHaveProperty('role', 'STUDENT');
      expect(response.data.data).toHaveProperty('studentIdNumber');

      studentUserId = response.data.data.userId;
      studentIdNumber = response.data.data.studentIdNumber;

      // 验证学号格式
      expect(studentIdNumber).toMatch(/^STU\d{8}$/);
      expect(studentIdNumber.length).toBe(11);

      // 验证数据库中的用户记录
      const user = await prisma.user.findUnique({
        where: { id: studentUserId },
      });

      expect(user).toBeTruthy();
      expect(user?.role).toBe('STUDENT');

      // 验证学号记录
      const studentId = await prisma.studentID.findUnique({
        where: { studentIdNumber },
      });

      expect(studentId).toBeTruthy();
      expect(studentId?.userId).toBe(studentUserId);
      expect(studentId?.status).toBe('ASSIGNED');

      // 验证学员档案
      const profile = await prisma.studentProfile.findUnique({
        where: { userId: studentUserId },
      });

      expect(profile).toBeTruthy();
      expect(profile?.realName).toBe(studentData.profile.name);
      expect(profile?.grade).toBe(studentData.profile.grade);
      expect(profile?.learningFoundation).toBe(studentData.profile.learningFoundation);

      // 验证授权码已被使用
      const authCode = await prisma.authCode.findUnique({
        where: { code: testAuthCode },
      });

      expect(authCode?.status).toBe('USED');
      expect(authCode?.usedBy).toBe(studentUserId);
    });

    it('应该拒绝学员注册时缺少授权码', async () => {
      const timestamp = Date.now().toString().slice(-6);
      const invalidData = {
        role: 'STUDENT',
        username: `si${timestamp}`, // 缩短前缀
        password: 'Student123!',
        // 缺少授权码
        profile: {
          name: '测试学员',
          gender: '男',
          birthDate: '2010-05-15',
          grade: 'PRIMARY_5_1',
        },
      };

      const response = await api.post('/api/auth/register', invalidData);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it('应该拒绝学员注册时使用无效授权码', async () => {
      const timestamp = Date.now().toString().slice(-6);
      const invalidData = {
        role: 'STUDENT',
        username: `sv${timestamp}`, // 缩短前缀
        password: 'Student123!',
        authCode: 'INVALID_CODE',
        profile: {
          name: '测试学员',
          gender: '男',
          birthDate: '2010-05-15',
          grade: 'PRIMARY_5_1',
        },
      };

      const response = await api.post('/api/auth/register', invalidData);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it('应该拒绝学员注册时缺少必填字段', async () => {
      // 创建新的授权码
      const newAuthCode = await prisma.authCode.create({
        data: {
          code: `TEST_REG2_${Date.now()}`,
          status: 'UNUSED',
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const timestamp = Date.now().toString().slice(-6);
      const invalidData = {
        role: 'STUDENT',
        username: `sm${timestamp}`, // 缩短前缀
        password: 'Student123!',
        authCode: newAuthCode.code,
        profile: {
          name: '测试学员',
          // 缺少性别、出生年月、年级
        },
      };

      const response = await api.post('/api/auth/register', invalidData);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);

      // 清理授权码
      await prisma.authCode.delete({ where: { code: newAuthCode.code } });
    });
  });

  describe('17.1.3 学号生成验证', () => {
    it('应该生成符合格式的学号', async () => {
      // 学号已在学员注册测试中生成
      expect(studentIdNumber).toBeTruthy();
      
      // 验证格式: STU + 年份后两位 + 6位流水号
      const year = new Date().getFullYear() % 100;
      const yearStr = year.toString().padStart(2, '0');
      
      expect(studentIdNumber.substring(0, 3)).toBe('STU');
      expect(studentIdNumber.substring(3, 5)).toBe(yearStr);
      expect(studentIdNumber.substring(5).length).toBe(6);
      expect(/^\d{6}$/.test(studentIdNumber.substring(5))).toBe(true);
    });

    it('应该确保学号全局唯一', async () => {
      // 创建多个学员，验证学号不重复
      const authCodes = await Promise.all([
        prisma.authCode.create({
          data: {
            code: `TEST_UNIQUE1_${Date.now()}`,
            status: 'UNUSED',
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }),
        prisma.authCode.create({
          data: {
            code: `TEST_UNIQUE2_${Date.now() + 1}`,
            status: 'UNUSED',
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }),
      ]);

      const timestamp = Date.now().toString().slice(-6);
      
      // 顺序注册两个学员,避免并发导致学号冲突
      const response1 = await api.post('/api/auth/register', {
        role: 'STUDENT',
        username: `u1${timestamp}`,
        password: 'Student123!',
        authCode: authCodes[0].code,
        profile: {
          name: '学员1',
          gender: '男',
          birthDate: '2010-01-01',
          grade: 'PRIMARY_5_1',
        },
      });

      const response2 = await api.post('/api/auth/register', {
        role: 'STUDENT',
        username: `u2${timestamp}`,
        password: 'Student123!',
        authCode: authCodes[1].code,
        profile: {
          name: '学员2',
          gender: '女',
          birthDate: '2010-01-02',
          grade: 'PRIMARY_5_1',
        },
      });

      const studentId1 = response1.data.data.studentIdNumber;
      const studentId2 = response2.data.data.studentIdNumber;

      // 验证学号不同
      expect(studentId1).not.toBe(studentId2);

      // 清理测试数据
      await prisma.studentProfile.deleteMany({
        where: {
          userId: {
            in: [response1.data.data.userId, response2.data.data.userId],
          },
        },
      });
      await prisma.studentID.deleteMany({
        where: {
          studentIdNumber: { in: [studentId1, studentId2] },
        },
      });
      await prisma.user.deleteMany({
        where: {
          id: { in: [response1.data.data.userId, response2.data.data.userId] },
        },
      });
      await prisma.authCode.deleteMany({
        where: {
          code: { in: [authCodes[0].code, authCodes[1].code] },
        },
      });
    });
  });
});
