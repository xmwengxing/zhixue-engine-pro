/**
 * 家长添加学员流程集成测试
 * 测试完整流程、亲子绑定和学号生成
 * 验证需求: 7.1-7.7
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';

const prisma = new PrismaClient();
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

describe('家长添加学员流程集成测试', () => {
  let api: AxiosInstance;
  let parentToken: string;
  let parentUserId: string;
  let testAuthCode: string;
  let createdStudentIds: string[] = [];

  beforeAll(async () => {
    // 初始化 API 客户端
    api = axios.create({
      baseURL: API_BASE_URL,
      validateStatus: () => true,
    });

    // 生成时间戳
    const timestamp = Date.now().toString().slice(-6);
    
    // 清理可能存在的测试数据
    await prisma.user.deleteMany({
      where: {
        username: {
          startsWith: 'pa',
        },
        createdAt: {
          lt: new Date(Date.now() - 60 * 60 * 1000), // 删除1小时前的测试数据
        },
      },
    });

    // 创建测试家长账户
    const parentData = {
      role: 'PARENT',
      username: `pa${timestamp}`, // 缩短前缀
      password: 'Parent123!',
      email: `pa${timestamp}@test.com`,
      profile: {
        name: '测试家长',
        gender: '男',
      },
    };

    const registerResponse = await api.post('/api/auth/register', parentData);
    parentUserId = registerResponse.data.data.userId;

    // 登录获取 token
    const loginResponse = await api.post('/api/auth/login', {
      username: parentData.username,
      password: parentData.password,
    });
    parentToken = loginResponse.data.data.token;

    // 创建测试授权码
    const authCode = await prisma.authCode.create({
      data: {
        code: `TEST_ADD_${Date.now()}`,
        status: 'UNUSED',
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    testAuthCode = authCode.code;
  });

  afterAll(async () => {
    // 清理测试数据
    // 删除亲子关系
    await prisma.parentChildRelation.deleteMany({
      where: { parentId: parentUserId },
    });

    // 删除学员档案和学号
    for (const studentId of createdStudentIds) {
      await prisma.studentProfile.deleteMany({ where: { userId: studentId } });
      await prisma.studentID.deleteMany({ where: { userId: studentId } });
      await prisma.user.delete({ where: { id: studentId } }).catch(() => {});
    }

    // 删除家长
    await prisma.user.delete({ where: { id: parentUserId } }).catch(() => {});

    // 删除授权码
    await prisma.authCode.deleteMany({ where: { code: testAuthCode } });

    await prisma.$disconnect();
  });

  describe('17.2.1 完整添加学员流程', () => {
    it('应该成功通过家长添加学员', async () => {
      const timestamp = Date.now().toString().slice(-6);
      const studentData = {
        authCode: testAuthCode,
        username: `c${timestamp}`, // 缩短前缀
        password: 'Student123!',
        profile: {
          name: '测试子女',
          gender: '女',
          birthDate: '2012-03-20',
          grade: 'PRIMARY_3_1',
          school: '实验小学',
          learningFoundation: 'AVERAGE',
          interests: '画画,音乐',
        },
        relation: '父亲',
      };

      const response = await api.post('/api/parent/children/create', studentData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      // 验证响应
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('studentId');
      expect(response.data.data).toHaveProperty('username', studentData.username);
      expect(response.data.data).toHaveProperty('studentIdNumber');
      expect(response.data.data).toHaveProperty('initialPassword');
      expect(response.data.data).toHaveProperty('relationId');

      const studentId = response.data.data.studentId;
      const studentIdNumber = response.data.data.studentIdNumber;
      createdStudentIds.push(studentId);

      // 验证学号格式
      expect(studentIdNumber).toMatch(/^STU\d{8}$/);
      expect(studentIdNumber.length).toBe(11);

      // 验证学员账户已创建
      const student = await prisma.user.findUnique({
        where: { id: studentId },
      });

      expect(student).toBeTruthy();
      expect(student?.role).toBe('STUDENT');
      expect(student?.username).toBe(studentData.username);

      // 验证学号已分配
      const studentIdRecord = await prisma.studentID.findUnique({
        where: { studentIdNumber },
      });

      expect(studentIdRecord).toBeTruthy();
      expect(studentIdRecord?.userId).toBe(studentId);
      expect(studentIdRecord?.status).toBe('ASSIGNED');

      // 验证学员档案已创建
      const profile = await prisma.studentProfile.findUnique({
        where: { userId: studentId },
      });

      expect(profile).toBeTruthy();
      expect(profile?.realName).toBe(studentData.profile.name);
      expect(profile?.grade).toBe(studentData.profile.grade);
      expect(profile?.school).toBe(studentData.profile.school);
      expect(profile?.learningFoundation).toBe(studentData.profile.learningFoundation);

      // 验证授权码已使用
      const authCode = await prisma.authCode.findUnique({
        where: { code: testAuthCode },
      });

      expect(authCode?.status).toBe('USED');
      expect(authCode?.usedBy).toBe(studentId);
    });
  });

  describe('17.2.2 亲子绑定验证', () => {
    it('应该自动建立亲子绑定关系', async () => {
      // 创建新的授权码
      const newAuthCode = await prisma.authCode.create({
        data: {
          code: `TEST_BIND_${Date.now()}`,
          status: 'UNUSED',
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const timestamp = Date.now().toString().slice(-6);
      const studentData = {
        authCode: newAuthCode.code,
        username: `cb${timestamp}`, // 缩短前缀
        password: 'Student123!',
        profile: {
          name: '绑定测试',
          gender: '男',
          birthDate: '2011-06-15',
          grade: 'PRIMARY_4_2',
        },
        relation: '母亲',
      };

      const response = await api.post('/api/parent/children/create', studentData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      const studentId = response.data.data.studentId;
      const relationId = response.data.data.relationId;
      createdStudentIds.push(studentId);

      // 验证亲子关系已建立
      const relation = await prisma.parentChildRelation.findUnique({
        where: { id: relationId },
      });

      expect(relation).toBeTruthy();
      expect(relation?.parentId).toBe(parentUserId);
      expect(relation?.studentId).toBe(studentId);
      expect(relation?.relation).toBe(studentData.relation);
      expect(relation?.status).toBe('ACTIVE');

      // 验证家长可以查询到该学员
      const childrenResponse = await api.get('/api/parent/children', {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(childrenResponse.status).toBe(200);
      const childrenData = childrenResponse.data.data?.children || childrenResponse.data.children || [];
      const foundChild = childrenData.find((c: any) => c.student?.id === studentId || c.id === studentId || c.studentId === studentId);
      expect(foundChild).toBeTruthy();

      // 清理授权码
      await prisma.authCode.delete({ where: { code: newAuthCode.code } });
    });

    it('应该支持一个家长绑定多个学员', async () => {
      // 创建两个授权码
      const authCodes = await Promise.all([
        prisma.authCode.create({
          data: {
            code: `TEST_MULTI1_${Date.now()}`,
            status: 'UNUSED',
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }),
        prisma.authCode.create({
          data: {
            code: `TEST_MULTI2_${Date.now() + 1}`,
            status: 'UNUSED',
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }),
      ]);

      const timestamp = Date.now().toString().slice(-6);

      // 添加第一个学员
      const response1 = await api.post(
        '/api/parent/children/create',
        {
          authCode: authCodes[0].code,
          username: `c1${timestamp}`, // 缩短前缀
          password: 'Student123!',
          profile: {
            name: '大宝',
            gender: '男',
            birthDate: '2010-01-01',
            grade: 'PRIMARY_5_1',
          },
          relation: '父亲',
        },
        {
          headers: {
            Authorization: `Bearer ${parentToken}`,
          },
        }
      );

      // 添加第二个学员
      const response2 = await api.post(
        '/api/parent/children/create',
        {
          authCode: authCodes[1].code,
          username: `c2${timestamp}`, // 缩短前缀
          password: 'Student123!',
          profile: {
            name: '二宝',
            gender: '女',
            birthDate: '2012-05-10',
            grade: 'PRIMARY_3_1',
          },
          relation: '父亲',
        },
        {
          headers: {
            Authorization: `Bearer ${parentToken}`,
          },
        }
      );

      const studentId1 = response1.data.data.studentId;
      const studentId2 = response2.data.data.studentId;
      createdStudentIds.push(studentId1, studentId2);

      // 验证两个绑定关系都存在
      const relations = await prisma.parentChildRelation.findMany({
        where: {
          parentId: parentUserId,
          studentId: { in: [studentId1, studentId2] },
        },
      });

      expect(relations.length).toBe(2);

      // 清理授权码
      await prisma.authCode.deleteMany({
        where: {
          code: { in: [authCodes[0].code, authCodes[1].code] },
        },
      });
    });
  });

  describe('17.2.3 学号生成验证', () => {
    it('应该为添加的学员生成唯一学号', async () => {
      // 创建授权码
      const newAuthCode = await prisma.authCode.create({
        data: {
          code: `TEST_STUID_${Date.now()}`,
          status: 'UNUSED',
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const timestamp = Date.now().toString().slice(-6);
      const response = await api.post(
        '/api/parent/children/create',
        {
          authCode: newAuthCode.code,
          username: `cs${timestamp}`, // 缩短前缀
          password: 'Student123!',
          profile: {
            name: '学号测试',
            gender: '男',
            birthDate: '2011-08-20',
            grade: 'PRIMARY_4_1',
          },
          relation: '父亲',
        },
        {
          headers: {
            Authorization: `Bearer ${parentToken}`,
          },
        }
      );

      const studentIdNumber = response.data.data.studentIdNumber;
      const studentId = response.data.data.studentId;
      createdStudentIds.push(studentId);

      // 验证学号格式
      expect(studentIdNumber).toMatch(/^STU\d{8}$/);
      
      // 验证年份部分
      const year = new Date().getFullYear() % 100;
      const yearStr = year.toString().padStart(2, '0');
      expect(studentIdNumber.substring(3, 5)).toBe(yearStr);

      // 验证流水号部分
      const sequence = studentIdNumber.substring(5);
      expect(sequence.length).toBe(6);
      expect(/^\d{6}$/.test(sequence)).toBe(true);

      // 验证学号在数据库中唯一
      const count = await prisma.studentID.count({
        where: { studentIdNumber },
      });
      expect(count).toBe(1);

      // 清理授权码
      await prisma.authCode.delete({ where: { code: newAuthCode.code } });
    });
  });

  describe('17.2.4 错误处理', () => {
    it('应该拒绝使用无效授权码', async () => {
      const timestamp = Date.now().toString().slice(-6);
      const response = await api.post(
        '/api/parent/children/create',
        {
          authCode: 'INVALID_CODE_123',
          username: `ci${timestamp}`, // 缩短前缀
          password: 'Student123!',
          profile: {
            name: '无效测试',
            gender: '男',
            birthDate: '2011-01-01',
            grade: 'PRIMARY_4_1',
          },
          relation: '父亲',
        },
        {
          headers: {
            Authorization: `Bearer ${parentToken}`,
          },
        }
      );

      expect(response.status).toBe(400);
      expect(response.data.success).not.toBe(true);
    });

    it('应该拒绝缺少必填字段', async () => {
      const newAuthCode = await prisma.authCode.create({
        data: {
          code: `TEST_MISS_${Date.now()}`,
          status: 'UNUSED',
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const timestamp = Date.now().toString().slice(-6);
      const response = await api.post(
        '/api/parent/children/create',
        {
          authCode: newAuthCode.code,
          username: `cm${timestamp}`, // 缩短前缀
          password: 'Student123!',
          profile: {
            name: '缺失测试',
            // 缺少性别、出生年月、年级
          },
          relation: '父亲',
        },
        {
          headers: {
            Authorization: `Bearer ${parentToken}`,
          },
        }
      );

      expect(response.status).toBe(400);
      expect(response.data.success).not.toBe(true);

      // 清理授权码
      await prisma.authCode.delete({ where: { code: newAuthCode.code } });
    });

    it('应该拒绝未认证的请求', async () => {
      const timestamp = Date.now().toString().slice(-6);
      const response = await api.post('/api/parent/children/create', {
        authCode: 'SOME_CODE',
        username: `cu${timestamp}`, // 缩短前缀
        password: 'Student123!',
        profile: {
          name: '未认证测试',
          gender: '男',
          birthDate: '2011-01-01',
          grade: 'PRIMARY_4_1',
        },
        relation: '父亲',
      });

      expect(response.status).toBe(401);
    });
  });
});
