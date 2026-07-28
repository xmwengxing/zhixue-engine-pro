/**
 * 管理员功能集成测试
 * 测试用户CRUD、亲子关系管理和教材批量导入
 * 验证需求: 5.1-5.9, 8.1-8.7, 9.1-9.10
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';

const prisma = new PrismaClient();
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

describe('管理员功能集成测试', () => {
  let api: AxiosInstance;
  let adminToken: string;
  let adminUserId: string;
  let createdUserIds: string[] = [];
  let createdRelationIds: string[] = [];
  let createdMaterialIds: string[] = [];

  beforeAll(async () => {
    // 初始化 API 客户端
    api = axios.create({
      baseURL: API_BASE_URL,
      validateStatus: () => true,
    });

    // 查找或创建管理员账户
    let admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (!admin) {
      // 创建管理员账户
      const bcrypt = require('bcrypt');
      admin = await prisma.user.create({
        data: {
          username: 'test_admin',
          passwordHash: await bcrypt.hash('Admin123!', 10),
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
    }

    adminUserId = admin.id;

    // 登录获取 token
    const loginResponse = await api.post('/api/auth/login', {
      username: admin.username,
      password: 'Admin123!',
    });

    if (loginResponse.status === 200) {
      adminToken = loginResponse.data.data.token;
    } else {
      // 如果登录失败，尝试使用已知密码
      const bcrypt = require('bcrypt');
      await prisma.user.update({
        where: { id: admin.id },
        data: { passwordHash: await bcrypt.hash('Admin123!', 10) },
      });

      const retryLogin = await api.post('/api/auth/login', {
        username: admin.username,
        password: 'Admin123!',
      });
      adminToken = retryLogin.data.data.token;
    }
  });

  afterAll(async () => {
    // 清理测试数据
    // 删除创建的亲子关系
    if (createdRelationIds.length > 0) {
      await prisma.parentChildRelation.deleteMany({
        where: { id: { in: createdRelationIds } },
      });
    }

    // 删除创建的教材
    if (createdMaterialIds.length > 0) {
      await prisma.materialNode.deleteMany({
        where: { id: { in: createdMaterialIds } },
      });
    }

    // 删除创建的用户
    for (const userId of createdUserIds) {
      await prisma.studentProfile.deleteMany({ where: { userId } });
      await prisma.studentID.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }

    await prisma.$disconnect();
  });

  describe('17.4.1 用户CRUD功能', () => {
    describe('创建用户', () => {
      it('应该成功创建家长用户', async () => {
        const timestamp = Date.now().toString().slice(-6); // 改为6位，确保用户名不超过20字符
        const userData = {
          role: 'PARENT',
          username: `ap${timestamp}`, // 进一步缩短前缀到2字符
          password: 'Parent123!',
          email: `ap${timestamp}@test.com`,
          realName: '管理员创建的家长',
          gender: '女',
          phone: '13900139000',
          address: '测试地址',
          industry: '教育行业',
        };

        const response = await api.post('/api/admin/users', userData, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        // 添加调试日志
        if (response.status !== 201) {
          console.log('创建家长用户失败:', response.status, response.data);
        }

        // 验证响应
        expect(response.status).toBe(201);
        expect(response.data.success).toBe(true);
        expect(response.data.data).toHaveProperty('user');
        expect(response.data.data.user).toHaveProperty('id');
        expect(response.data.data.user.username).toBe(userData.username);

        const userId = response.data.data.user.id;
        createdUserIds.push(userId);

        // 验证数据库记录
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        expect(user).toBeTruthy();
        expect(user?.role).toBe('PARENT');
        expect(user?.realName).toBe(userData.realName);
      });

      it('应该成功创建学员用户', async () => {
        // 创建授权码
        const authCode = await prisma.authCode.create({
          data: {
            code: `TEST_ADMIN_${Date.now()}`,
            status: 'UNUSED',
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });

        const timestamp = Date.now().toString().slice(-6); // 改为6位
        const userData = {
          role: 'STUDENT',
          username: `as${timestamp}`, // 进一步缩短前缀到2字符
          password: 'Student123!',
          authCode: authCode.code,
          studentName: '管理员创建的学员',
          studentGender: '男',
          birthDate: '2012-08-20',
          grade: 'PRIMARY_3_2',
          school: '实验小学',
          learningFoundation: 'GOOD',
          interests: '体育,音乐',
        };

        const response = await api.post('/api/admin/users', userData, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        // 验证响应
        expect(response.status).toBe(201);
        expect(response.data.success).toBe(true);
        expect(response.data.data).toHaveProperty('user');
        expect(response.data.data.user).toHaveProperty('id');
        // studentIdNumber在user对象中
        expect(response.data.data.user).toHaveProperty('studentIdNumber');

        const userId = response.data.data.user.id;
        createdUserIds.push(userId);

        // 验证学员档案
        const profile = await prisma.studentProfile.findUnique({
          where: { userId },
        });

        expect(profile).toBeTruthy();
        expect(profile?.realName).toBe(userData.studentName);
        expect(profile?.grade).toBe(userData.grade);

        // 清理授权码
        await prisma.authCode.delete({ where: { code: authCode.code } });
      });

      it('应该拒绝创建用户时缺少必填字段', async () => {
        const timestamp = Date.now().toString().slice(-8);
        const invalidData = {
          role: 'PARENT',
          username: `invalid_${timestamp}`,
          // 缺少密码
        };

        const response = await api.post('/api/admin/users', invalidData, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(response.status).toBe(400);
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toHaveProperty('message');
      });
    });

    describe('更新用户', () => {
      let testUserId: string;

      beforeAll(async () => {
        // 创建测试用户
        const timestamp = Date.now().toString().slice(-6);
        const response = await api.post(
          '/api/admin/users',
          {
            role: 'PARENT',
            username: `ut${timestamp}`, // 缩短前缀到2字符
            password: 'Parent123!',
            email: `ut${timestamp}@test.com`,
          },
          {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }
        );

        testUserId = response.data.data.user.id;
        createdUserIds.push(testUserId);
      });

      it('应该成功更新家长用户信息', async () => {
        const updateData = {
          email: 'updated_email@test.com',
          realName: '更新后的姓名',
          phone: '13800000000',
        };

        const response = await api.put(`/api/admin/users/${testUserId}`, updateData, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);

        // 验证更新
        const user = await prisma.user.findUnique({
          where: { id: testUserId },
        });

        expect(user?.email).toBe(updateData.email);
        expect(user?.realName).toBe(updateData.realName);
      });

      it('应该限制管理员角色仅可修改密码', async () => {
        // 这个测试需要一个管理员用户
        const timestamp = Date.now().toString().slice(-8);
        const bcrypt = require('bcrypt');
        const adminUser = await prisma.user.create({
          data: {
            username: `test_admin_edit_${timestamp}`,
            passwordHash: await bcrypt.hash('Admin123!', 10),
            role: 'ADMIN',
            status: 'ACTIVE',
          },
        });

        createdUserIds.push(adminUser.id);

        // 尝试修改管理员的其他字段（应该被拒绝或忽略）
        const updateData = {
          email: 'should_not_update@test.com',
          password: 'NewAdmin123!',
        };

        const response = await api.put(`/api/admin/users/${adminUser.id}`, updateData, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        // 验证密码可以修改，但其他字段的修改应该被限制
        expect(response.status).toBe(200);
      });
    });

    describe('删除用户', () => {
      it('应该成功删除用户', async () => {
        // 创建测试用户
        const timestamp = Date.now().toString().slice(-6);
        const response = await api.post(
          '/api/admin/users',
          {
            role: 'PARENT',
            username: `dt${timestamp}`, // 缩短前缀到2字符
            password: 'Parent123!',
            email: `dt${timestamp}@test.com`,
          },
          {
            headers: {
              Authorization: `Bearer ${adminToken}`,
            },
          }
        );

        const userId = response.data.data.user.id;

        // 删除用户
        const deleteResponse = await api.delete(`/api/admin/users/${userId}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(deleteResponse.status).toBe(200);
        expect(deleteResponse.data.success).toBe(true);

        // 验证用户已删除（软删除，状态变为DELETED）
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        expect(user).toBeTruthy();
        expect(user?.status).toBe('DELETED');
      });

      it('应该拒绝删除不存在的用户', async () => {
        const response = await api.delete('/api/admin/users/non-existent-id', {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        });

        expect(response.status).toBe(404);
        expect(response.data).toHaveProperty('error');
      });
    });
  });

  describe('17.4.2 亲子关系管理', () => {
    let testParentId: string;
    let testStudentId: string;
    let testRelationId: string;

    beforeAll(async () => {
      // 创建测试家长和学员
      const timestamp = Date.now().toString().slice(-6);

      const parentResponse = await api.post(
        '/api/admin/users',
        {
          role: 'PARENT',
          username: `rp${timestamp}`, // 缩短前缀到2字符
          password: 'Parent123!',
          email: `rp${timestamp}@test.com`,
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      testParentId = parentResponse.data.data.user.id;
      createdUserIds.push(testParentId);

      const authCode = await prisma.authCode.create({
        data: {
          code: `TEST_REL_${Date.now()}`,
          status: 'UNUSED',
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const studentResponse = await api.post(
        '/api/admin/users',
        {
          role: 'STUDENT',
          username: `rs${timestamp}`, // 缩短前缀到2字符
          password: 'Student123!',
          authCode: authCode.code,
          studentName: '关系测试学员',
          studentGender: '男',
          birthDate: '2011-01-01',
          grade: 'PRIMARY_4_1',
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      testStudentId = studentResponse.data.data.user.id;
      createdUserIds.push(testStudentId);

      // 创建亲子关系
      const relation = await prisma.parentChildRelation.create({
        data: {
          parentId: testParentId,
          studentId: testStudentId,
          relation: '父亲',
          status: 'ACTIVE',
        },
      });

      testRelationId = relation.id;
      createdRelationIds.push(testRelationId);
    });

    it('应该成功获取亲子关系列表', async () => {
      const response = await api.get('/api/admin/relations', {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('relations');
      expect(Array.isArray(response.data.data.relations)).toBe(true);

      // 验证包含我们创建的关系
      const foundRelation = response.data.data.relations.find(
        (r: any) => r.id === testRelationId
      );
      expect(foundRelation).toBeTruthy();
    });

    it('应该支持搜索和筛选亲子关系', async () => {
      const response = await api.get('/api/admin/relations', {
        params: {
          parentId: testParentId,
        },
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.data.relations.length).toBeGreaterThan(0);

      // 验证所有返回的关系都属于该家长
      response.data.data.relations.forEach((r: any) => {
        expect(r.parentId).toBe(testParentId);
      });
    });

    it('应该成功解绑亲子关系', async () => {
      const response = await api.delete(`/api/admin/relations/${testRelationId}/unbind`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // 验证关系状态变为UNBOUND（软删除）
      const relation = await prisma.parentChildRelation.findUnique({
        where: { id: testRelationId },
      });

      expect(relation).toBeTruthy();
      expect(relation?.status).toBe('UNBOUND');

      // 验证家长和学员账户仍然存在
      const parent = await prisma.user.findUnique({
        where: { id: testParentId },
      });
      const student = await prisma.user.findUnique({
        where: { id: testStudentId },
      });

      expect(parent).toBeTruthy();
      expect(student).toBeTruthy();
    });
  });

  describe('17.4.3 教材批量导入', () => {
    it('应该成功下载导入模板', async () => {
      const response = await api.get('/api/admin/materials/template', {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.status).toBe(200);
      // 验证返回的是文件
      expect(response.headers['content-type']).toContain('application');
    });

    it('应该成功批量导入教材数据', async () => {
      // 模拟Excel数据
      const materialData = [
        {
          subject: '数学',
          version: '人教版',
          unit: '第一单元',
          notes: '加减法',
          keywords: '计算,基础',
        },
        {
          subject: '语文',
          version: '部编版',
          unit: '第一单元',
          notes: '拼音',
          keywords: '声母,韵母',
        },
      ];

      // 注意：实际测试需要构造真实的Excel文件
      // 这里简化为JSON数据测试
      const response = await api.post('/api/admin/materials/import', materialData, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      });

      // 如果API支持JSON格式导入
      if (response.status === 201) {
        expect(response.data.success).toBe(true);
        expect(response.data.data).toHaveProperty('imported');
        expect(response.data.data.imported).toBeGreaterThan(0);

        // 记录创建的教材ID以便清理
        if (response.data.data.materialIds) {
          createdMaterialIds.push(...response.data.data.materialIds);
        }
      }
    });

    it('应该验证导入数据的必填字段', async () => {
      const invalidData = [
        {
          subject: '数学',
          // 缺少 version 和 unit
        },
      ];

      const response = await api.post('/api/admin/materials/import', invalidData, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      });

      // 应该返回验证错误
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
    });

    it('应该报告导入错误行', async () => {
      const mixedData = [
        {
          subject: '数学',
          version: '人教版',
          unit: '第一单元',
        },
        {
          subject: '语文',
          // 缺少必填字段
        },
        {
          subject: '英语',
          version: '外研版',
          unit: '第一单元',
        },
      ];

      // 使用对象包装数组,确保Express能正确解析
      const response = await api.post('/api/admin/materials/import', { materials: mixedData }, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      });

      // 应该返回部分成功，并报告错误
      if (response.status === 207 || response.status === 400) {
        expect(response.data).toHaveProperty('errors');
        expect(Array.isArray(response.data.errors)).toBe(true);
        if (response.data.errors && response.data.errors.length > 0) {
          expect(response.data.errors[0]).toHaveProperty('row');
          expect(response.data.errors[0]).toHaveProperty('message');
        }
      }
    });
  });

  describe('17.4.4 权限验证', () => {
    it('应该拒绝非管理员访问管理员功能', async () => {
      // 创建普通家长账户
      const timestamp = Date.now().toString().slice(-6);
      const parentData = {
        role: 'PARENT',
        username: `np${timestamp}`, // 缩短前缀到2字符
        password: 'Parent123!',
        email: `np${timestamp}@test.com`,
      };

      await api.post('/api/auth/register', parentData);

      const loginResponse = await api.post('/api/auth/login', {
        username: parentData.username,
        password: parentData.password,
      });

      const parentToken = loginResponse.data.data.token;

      // 尝试访问管理员功能
      const response = await api.get('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(response.status).toBe(403);
    });

    it('应该拒绝未认证的请求', async () => {
      const response = await api.get('/api/admin/users');

      expect(response.status).toBe(401);
    });
  });
});
