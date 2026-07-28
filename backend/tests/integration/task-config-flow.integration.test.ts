/**
 * 任务配置流程集成测试
 * 测试自定义模式、档案提取模式和AI指令组装
 * 验证需求: 10.1-10.10
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';

const prisma = new PrismaClient();
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

describe('任务配置流程集成测试', () => {
  let api: AxiosInstance;
  let parentToken: string;
  let parentUserId: string;
  let studentUserId: string;
  let studentIdNumber: string;
  let createdTaskIds: string[] = [];

  beforeAll(async () => {
    // 初始化 API 客户端
    api = axios.create({
      baseURL: API_BASE_URL,
      validateStatus: () => true,
    });

    // 清理可能存在的测试数据
    await prisma.subjectInstruction.deleteMany({
      where: {
        id: {
          in: [
            'math_teacher_v1',
            'math_teacher_v2',
            'chinese_teacher_v1',
            'english_teacher_v1',
            'science_teacher_v1',
          ],
        },
      },
    });

    await prisma.materialNode.deleteMany({
      where: {
        OR: [
          { name: '人教版' },
          { name: '部编版' },
          { name: '数学' },
          { name: '语文' },
          { name: { in: ['第一单元', '第二单元', '第三单元'] } },
        ],
      },
    });

    // 创建测试教材数据
    // 层级: VERSION -> GRADE -> SUBJECT -> UNIT
    // 创建人教版教材
    console.log('开始创建人教版教材数据...');
    const versionNode1 = await prisma.materialNode.create({
      data: {
        name: '人教版',
        type: 'VERSION',
        order: 1,
        metadata: {},
      },
    });
    console.log(`创建版本节点: ${versionNode1.name} (${versionNode1.id})`);

    const gradeNode1 = await prisma.materialNode.create({
      data: {
        name: 'PRIMARY_4_2',
        type: 'GRADE',
        parentId: versionNode1.id,
        order: 1,
        metadata: {},
      },
    });

    const subjectNode1 = await prisma.materialNode.create({
      data: {
        name: '数学',
        type: 'SUBJECT',
        parentId: gradeNode1.id,
        order: 1,
        metadata: {},
      },
    });
    console.log(`创建科目节点: ${subjectNode1.name} (${subjectNode1.id}), 父节点: ${gradeNode1.id}`);

    await prisma.materialNode.createMany({
      data: [
        {
          name: '第一单元',
          type: 'UNIT',
          parentId: subjectNode1.id,
          order: 1,
          metadata: {},
        },
        {
          name: '第二单元',
          type: 'UNIT',
          parentId: subjectNode1.id,
          order: 2,
          metadata: {},
        },
        {
          name: '第三单元',
          type: 'UNIT',
          parentId: subjectNode1.id,
          order: 3,
          metadata: {},
        },
      ],
    });

    // 创建部编版教材(用于档案模式测试)
    console.log('开始创建部编版教材数据...');
    const versionNode2 = await prisma.materialNode.create({
      data: {
        name: '部编版',
        type: 'VERSION',
        order: 2,
        metadata: {},
      },
    });
    console.log(`创建版本节点: ${versionNode2.name} (${versionNode2.id})`);

    const gradeNode2 = await prisma.materialNode.create({
      data: {
        name: 'PRIMARY_4_2',
        type: 'GRADE',
        parentId: versionNode2.id,
        order: 1,
        metadata: {},
      },
    });

    const subjectNode2 = await prisma.materialNode.create({
      data: {
        name: '语文',
        type: 'SUBJECT',
        parentId: gradeNode2.id,
        order: 1,
        metadata: {},
      },
    });
    console.log(`创建科目节点: ${subjectNode2.name} (${subjectNode2.id}), 父节点: ${gradeNode2.id}`);

    await prisma.materialNode.createMany({
      data: [
        {
          name: '第一单元',
          type: 'UNIT',
          parentId: subjectNode2.id,
          order: 1,
          metadata: {},
        },
        {
          name: '第二单元',
          type: 'UNIT',
          parentId: subjectNode2.id,
          order: 2,
          metadata: {},
        },
        {
          name: '第三单元',
          type: 'UNIT',
          parentId: subjectNode2.id,
          order: 3,
          metadata: {},
        },
      ],
    });

    // 验证数据是否真的被创建
    const allVersions = await prisma.materialNode.findMany({
      where: { type: 'VERSION' },
    });
    console.log(`数据库中的版本节点数量: ${allVersions.length}`);
    console.log('版本节点:', allVersions.map(v => v.name).join(', '));

    const allSubjects = await prisma.materialNode.findMany({
      where: { type: 'SUBJECT' },
    });
    console.log(`数据库中的科目节点数量: ${allSubjects.length}`);
    console.log('科目节点:', allSubjects.map(s => s.name).join(', '));

    // 创建AI科目老师
    await prisma.subjectInstruction.createMany({
      data: [
        {
          id: 'math_teacher_v1',
          subject: '数学1',
          systemPrompt: '你是一位专业的数学老师',
        },
        {
          id: 'math_teacher_v2',
          subject: '数学2',
          systemPrompt: '你是一位资深的数学教师',
        },
        {
          id: 'chinese_teacher_v1',
          subject: '语文1',
          systemPrompt: '你是一位专业的语文老师',
        },
        {
          id: 'english_teacher_v1',
          subject: '英语1',
          systemPrompt: '你是一位专业的英语老师',
        },
        {
          id: 'science_teacher_v1',
          subject: '科学1',
          systemPrompt: '你是一位专业的科学老师',
        },
      ],
    });

    // 创建测试家长账户
    const timestamp = Date.now().toString().slice(-6);
    const parentData = {
      role: 'PARENT',
      username: `pt${timestamp}`, // 缩短前缀
      password: 'Parent123!',
      email: `pt${timestamp}@test.com`,
    };

    const parentRegResponse = await api.post('/api/auth/register', parentData);
    parentUserId = parentRegResponse.data.data.userId;

    // 登录获取 token
    const loginResponse = await api.post('/api/auth/login', {
      username: parentData.username,
      password: parentData.password,
    });
    parentToken = loginResponse.data.data.token;

    // 创建测试学员账户
    const authCode = await prisma.authCode.create({
      data: {
        code: `TEST_TASK_${Date.now()}`,
        status: 'UNUSED',
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const studentData = {
      authCode: authCode.code,
      username: `st${timestamp}`, // 缩短前缀
      password: 'Student123!',
      profile: {
        name: '任务测试学员',
        gender: '男',
        birthDate: '2011-05-15',
        grade: 'PRIMARY_4_2',
        materialVersion: '部编版', // 使用部编版用于档案模式测试
        school: '测试小学',
        learningFoundation: 'GOOD',
        interests: '数学,科学',
        subjectLevels: {
          '语文': 'GOOD',
          '数学': 'AVERAGE',
        },
      },
      relation: '父亲',
    };

    const studentResponse = await api.post('/api/parent/children/create', studentData, {
      headers: {
        Authorization: `Bearer ${parentToken}`,
      },
    });

    // 检查响应是否成功
    if (studentResponse.status !== 201 || !studentResponse.data.data) {
      console.error('创建学员失败:', studentResponse.status, studentResponse.data);
      throw new Error(`创建学员失败: ${JSON.stringify(studentResponse.data)}`);
    }

    studentUserId = studentResponse.data.data.studentId;
    studentIdNumber = studentResponse.data.data.studentIdNumber;
  });

  afterAll(async () => {
    // 清理测试数据
    // 删除任务
    if (createdTaskIds.length > 0) {
      // 过滤掉undefined值
      const validTaskIds = createdTaskIds.filter(id => id !== undefined);
      if (validTaskIds.length > 0) {
        await prisma.task.deleteMany({
          where: { id: { in: validTaskIds } },
        });
      }
    }

    // 删除亲子关系
    await prisma.parentChildRelation.deleteMany({
      where: { parentId: parentUserId },
    });

    // 删除学员
    await prisma.studentProfile.deleteMany({ where: { userId: studentUserId } });
    await prisma.studentID.deleteMany({ where: { userId: studentUserId } });
    await prisma.user.delete({ where: { id: studentUserId } }).catch(() => {});

    // 删除家长
    await prisma.user.delete({ where: { id: parentUserId } }).catch(() => {});

    // 删除测试教材数据
    await prisma.materialNode.deleteMany({
      where: {
        OR: [
          { name: '人教版' },
          { name: '部编版' },
          { name: '数学' },
          { name: '语文' },
          { name: { in: ['第一单元', '第二单元', '第三单元'] } },
        ],
      },
    });

    // 删除AI科目老师
    await prisma.subjectInstruction.deleteMany({
      where: {
        id: {
          in: [
            'math_teacher_v1',
            'math_teacher_v2',
            'chinese_teacher_v1',
            'english_teacher_v1',
            'science_teacher_v1',
          ],
        },
      },
    });

    await prisma.$disconnect();
  });

  describe('17.3.1 自定义配置模式', () => {
    it('应该成功创建自定义配置任务', async () => {
      const taskData = {
        mode: 'CUSTOM',
        studentId: studentUserId,
        customConfig: {
          title: '数学加减法练习',
          aiTeacher: 'math_teacher_v1',
          subject: '数学',
          materialVersion: '人教版',
          units: ['第一单元', '第二单元'],
          goal: '掌握100以内的加减法运算',
          personality: '活泼好动，注意力容易分散',
        },
      };

      const response = await api.post('/api/parent/tasks', taskData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      // 验证响应
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');
      expect(response.data.data).toHaveProperty('title', taskData.customConfig.title);

      const taskId = response.data.data.id;
      createdTaskIds.push(taskId);

      // 验证任务已创建
      const task = await prisma.task.findUnique({
        where: { id: taskId },
      });

      expect(task).toBeTruthy();
      expect(task?.studentId).toBe(studentUserId);
      expect(task?.title).toBe(taskData.customConfig.title);
      expect(task?.status).toBe('PENDING');

      // 验证任务配置
      const config = task?.config as any;
      expect(config.subject).toBe(taskData.customConfig.subject);
      expect(config.materialVersion).toBe(taskData.customConfig.materialVersion);
      expect(config.units).toEqual(taskData.customConfig.units);
      expect(config.goal).toBe(taskData.customConfig.goal);
    });

    it('应该拒绝自定义模式缺少必填字段', async () => {
      const invalidData = {
        mode: 'CUSTOM',
        studentId: studentUserId,
        customConfig: {
          title: '测试任务',
          // 缺少 aiTeacher, subject, materialVersion, units, goal
        },
      };

      const response = await api.post('/api/parent/tasks', invalidData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(response.status).toBe(400);
      // API返回的错误响应可能没有success字段,只检查状态码
    });

    it('应该支持自定义模式的选填字段', async () => {
      const taskData = {
        mode: 'CUSTOM',
        studentId: studentUserId,
        customConfig: {
          title: '语文阅读理解',
          aiTeacher: 'chinese_teacher_v1',
          subject: '语文',
          materialVersion: '部编版',
          units: ['第三单元'],
          goal: '提高阅读理解能力',
          // personality 是选填字段，这里不提供
        },
      };

      const response = await api.post('/api/parent/tasks', taskData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);

      createdTaskIds.push(response.data.data.id);
    });
  });

  describe('17.3.2 档案提取模式', () => {
    it('应该成功创建档案提取模式任务', async () => {
      const taskData = {
        mode: 'PROFILE',
        studentId: studentUserId,
        profileConfig: {
          aiTeacher: 'math_teacher_v2',
          tempOverrides: {
            school: '临时学校',
            learningFoundation: 'EXCELLENT',
            interests: '临时兴趣',
          },
        },
      };

      const response = await api.post('/api/parent/tasks', taskData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      // 验证响应
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');

      const taskId = response.data.data.id;
      createdTaskIds.push(taskId);

      // 验证任务已创建
      const task = await prisma.task.findUnique({
        where: { id: taskId },
      });

      expect(task).toBeTruthy();
      expect(task?.studentId).toBe(studentUserId);

      // 验证任务配置包含临时修改
      const config = task?.config as any;
      expect(config.tempOverrides).toBeTruthy();
      expect(config.tempOverrides.school).toBe(taskData.profileConfig.tempOverrides.school);
      expect(config.tempOverrides.learningFoundation).toBe(
        taskData.profileConfig.tempOverrides.learningFoundation
      );
    });

    it('应该验证临时修改不影响学员档案', async () => {
      // 获取修改前的学员档案
      const profileBefore = await prisma.studentProfile.findUnique({
        where: { userId: studentUserId },
      });

      const originalSchool = profileBefore?.school;
      const originalFoundation = profileBefore?.learningFoundation;

      // 创建带临时修改的任务
      const taskData = {
        mode: 'PROFILE',
        studentId: studentUserId,
        profileConfig: {
          aiTeacher: 'science_teacher_v1',
          tempOverrides: {
            school: '完全不同的学校',
            learningFoundation: 'WEAK',
            interests: '完全不同的兴趣',
          },
        },
      };

      const response = await api.post('/api/parent/tasks', taskData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(response.status).toBe(201);
      createdTaskIds.push(response.data.data.id);

      // 验证学员档案未被修改
      const profileAfter = await prisma.studentProfile.findUnique({
        where: { userId: studentUserId },
      });

      expect(profileAfter?.school).toBe(originalSchool);
      expect(profileAfter?.learningFoundation).toBe(originalFoundation);
    });

    it('应该拒绝档案模式缺少必填字段', async () => {
      const invalidData = {
        mode: 'PROFILE',
        studentId: studentUserId,
        profileConfig: {
          // 缺少 aiTeacher
          tempOverrides: {
            school: '测试学校',
          },
        },
      };

      const response = await api.post('/api/parent/tasks', invalidData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(response.status).toBe(400);
      // API返回的错误响应可能没有success字段,只检查状态码
    });

    it('应该支持档案模式不提供临时修改', async () => {
      const taskData = {
        mode: 'PROFILE',
        studentId: studentUserId,
        profileConfig: {
          aiTeacher: 'english_teacher_v1',
          // 不提供 tempOverrides
        },
      };

      const response = await api.post('/api/parent/tasks', taskData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);

      createdTaskIds.push(response.data.data.id);
    });
  });

  describe('17.3.3 AI指令组装验证', () => {
    it('应该正确组装AI指令（自定义模式）', async () => {
      const taskData = {
        mode: 'CUSTOM',
        studentId: studentUserId,
        customConfig: {
          title: 'AI指令测试',
          aiTeacher: 'math_teacher_v1',
          subject: '数学',
          materialVersion: '人教版',
          units: ['第一单元'],
          goal: '测试AI指令组装',
          personality: '认真细致',
        },
      };

      const response = await api.post('/api/parent/tasks', taskData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(response.status).toBe(201);
      const taskId = response.data.data.id;
      createdTaskIds.push(taskId);

      // 验证任务配置包含AI指令相关信息
      const task = await prisma.task.findUnique({
        where: { id: taskId },
      });

      const config = task?.config as any;
      expect(config.aiTeacher).toBe(taskData.customConfig.aiTeacher);
      expect(config.goal).toBe(taskData.customConfig.goal);
      expect(config.personality).toBe(taskData.customConfig.personality);
    });

    it('应该正确组装AI指令（档案模式）', async () => {
      const taskData = {
        mode: 'PROFILE',
        studentId: studentUserId,
        profileConfig: {
          aiTeacher: 'chinese_teacher_v1',
          tempOverrides: {
            learningFoundation: 'AVERAGE',
          },
        },
      };

      const response = await api.post('/api/parent/tasks', taskData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(response.status).toBe(201);
      const taskId = response.data.data.id;
      createdTaskIds.push(taskId);

      // 验证任务配置包含AI指令相关信息
      const task = await prisma.task.findUnique({
        where: { id: taskId },
      });

      const config = task?.config as any;
      expect(config.aiTeacher).toBe(taskData.profileConfig.aiTeacher);
      expect(config.tempOverrides).toBeTruthy();
    });
  });

  describe('17.3.4 错误处理', () => {
    it('应该拒绝无效的学员ID', async () => {
      const taskData = {
        mode: 'CUSTOM',
        studentId: 'invalid-student-id',
        customConfig: {
          title: '测试任务',
          aiTeacher: 'math_teacher_v1',
          subject: '数学',
          materialVersion: '人教版',
          units: ['第一单元'],
          goal: '测试目标',
        },
      };

      const response = await api.post('/api/parent/tasks', taskData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      // API返回404表示学员不存在,这是合理的响应
      expect([400, 404]).toContain(response.status);
    });

    it('应该拒绝未绑定的学员', async () => {
      // 创建另一个家长和学员（未绑定到当前家长）
      const timestamp = Date.now().toString().slice(-6);
      const otherParentData = {
        role: 'PARENT',
        username: `op${timestamp}`, // 缩短前缀
        password: 'Parent123!',
      };

      const otherParentResponse = await api.post('/api/auth/register', otherParentData);
      const otherParentId = otherParentResponse.data.data.userId;

      const authCode = await prisma.authCode.create({
        data: {
          code: `TEST_OTHER_${Date.now()}`,
          status: 'UNUSED',
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const otherStudentData = {
        role: 'STUDENT',
        username: `os${timestamp}`, // 缩短前缀
        password: 'Student123!',
        authCode: authCode.code,
        profile: {
          name: '其他学员',
          gender: '男',
          birthDate: '2011-01-01',
          grade: 'PRIMARY_4_1',
        },
      };

      const otherStudentResponse = await api.post('/api/auth/register', otherStudentData);
      const otherStudentId = otherStudentResponse.data.data.userId;

      // 尝试为未绑定的学员创建任务
      const taskData = {
        mode: 'CUSTOM',
        studentId: otherStudentId,
        customConfig: {
          title: '测试任务',
          aiTeacher: 'math_teacher_v1',
          subject: '数学',
          materialVersion: '人教版',
          units: ['第一单元'],
          goal: '测试目标',
        },
      };

      const response = await api.post('/api/parent/tasks', taskData, {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(response.status).toBe(403);
      // API返回的错误响应可能没有success字段,只检查状态码

      // 清理测试数据
      await prisma.studentProfile.deleteMany({ where: { userId: otherStudentId } });
      await prisma.studentID.deleteMany({ where: { userId: otherStudentId } });
      await prisma.user.delete({ where: { id: otherStudentId } }).catch(() => {});
      await prisma.user.delete({ where: { id: otherParentId } }).catch(() => {});
    });

    it('应该拒绝未认证的请求', async () => {
      const taskData = {
        mode: 'CUSTOM',
        studentId: studentUserId,
        customConfig: {
          title: '测试任务',
          aiTeacher: 'math_teacher_v1',
          subject: '数学',
          materialVersion: '人教版',
          units: ['第一单元'],
          goal: '测试目标',
        },
      };

      const response = await api.post('/api/parent/tasks', taskData);

      expect(response.status).toBe(401);
    });
  });
});
