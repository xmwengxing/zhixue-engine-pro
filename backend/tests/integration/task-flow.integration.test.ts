/**
 * 任务创建和完成流程集成测试
 * 测试家长创建任务 → 学员完成训练 → 生成报告流程
 * 验证需求: 7.4, 11.2, 18.1
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

describe('任务创建和完成流程集成测试', () => {
  let api: AxiosInstance;
  let parentToken: string;
  let studentToken: string;
  let parentUserId: string;
  let studentUserId: string;
  let taskId: string;
  let sessionId: string;
  let materialNodeId: string;
  let aiTeacherId: string; // 添加AI科目老师ID

  beforeAll(async () => {
    api = axios.create({
      baseURL: API_BASE_URL,
      validateStatus: () => true,
    });

    // 清理可能存在的旧测试数据
    await prisma.materialNode.deleteMany({
      where: {
        name: { in: ['人教版', '数学', '测试单元'] },
      },
    });

    // 生成时间戳（确保用户名不超过 20 个字符）
    const timestamp = Date.now().toString().slice(-6);

    // 创建测试家长账户
    const parentPassword = await bcrypt.hash('Parent123!', 10);
    const parent = await prisma.user.create({
      data: {
        username: `pt${timestamp}`, // 缩短前缀
        passwordHash: parentPassword,
        role: 'PARENT',
        status: 'ACTIVE',
      },
    });
    parentUserId = parent.id;

    // 创建测试学员账户
    const studentPassword = await bcrypt.hash('Student123!', 10);
    const student = await prisma.user.create({
      data: {
        username: `st${timestamp}`, // 缩短前缀
        passwordHash: studentPassword,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    });
    studentUserId = student.id;

    // 创建学员档案
    await prisma.studentProfile.create({
      data: {
        userId: studentUserId,
        realName: '测试学员',
        gender: '男', // 添加必填字段
        grade: '初一',
        materialVersion: '人教版',
        subjectLevels: {
          数学: 'good',
          语文: 'average',
        },
        completeness: 80,
      },
    });

    // 建立亲子关系
    await prisma.parentChildRelation.create({
      data: {
        parentId: parentUserId,
        studentId: studentUserId,
        relation: '父亲',
        status: 'ACTIVE',
      },
    });

    // 创建测试教材层级结构 (正确顺序: VERSION -> SUBJECT -> UNIT)
    // 1. 创建版本节点
    const versionNode = await prisma.materialNode.create({
      data: {
        name: '人教版',
        type: 'VERSION',
        order: 1,
        metadata: {},
      },
    });

    // 2. 创建科目节点
    const subjectNode = await prisma.materialNode.create({
      data: {
        name: '数学',
        type: 'SUBJECT',
        parentId: versionNode.id,
        order: 1,
        metadata: {},
      },
    });

    // 3. 创建单元节点
    const materialNode = await prisma.materialNode.create({
      data: {
        name: '测试单元',
        type: 'UNIT',
        parentId: subjectNode.id,
        order: 1,
        metadata: {},
      },
    });
    materialNodeId = materialNode.id;

    // 创建或查找AI科目老师(SubjectInstruction)
    let subjectInstruction = await prisma.subjectInstruction.findUnique({
      where: { subject: '数学' },
    });
    
    if (!subjectInstruction) {
      subjectInstruction = await prisma.subjectInstruction.create({
        data: {
          subject: '数学',
          systemPrompt: '你是一位数学老师,擅长引导学生理解数学概念',
          examples: [],
        },
      });
    }
    
    aiTeacherId = subjectInstruction.id;

    // 创建测试题目 (必须在materialNode创建之后)
    await prisma.question.create({
      data: {
        materialNodeId: materialNodeId,
        type: 'CHOICE',
        content: JSON.stringify({
          question: '1 + 1 = ?',
          options: ['1', '2', '3', '4'],
        }),
        answer: '2',
        difficulty: 3, // 匹配默认难度范围(2-4)
        knowledgePoints: ['加法'],
      },
    });

    // 登录获取 token
    const parentLoginRes = await api.post('/api/auth/login', {
      username: parent.username,
      password: 'Parent123!',
    });
    parentToken = parentLoginRes.data.data.token;

    const studentLoginRes = await api.post('/api/auth/login', {
      username: student.username,
      password: 'Student123!',
    });
    studentToken = studentLoginRes.data.data.token;
  });

  afterAll(async () => {
    // 清理测试数据（按依赖顺序）
    if (studentUserId) {
      await prisma.report.deleteMany({ where: { session: { studentId: studentUserId } } });
      await prisma.answer.deleteMany({ where: { session: { studentId: studentUserId } } });
      await prisma.trainingSession.deleteMany({ where: { studentId: studentUserId } });
      await prisma.task.deleteMany({ where: { studentId: studentUserId } });
      // 删除积分交易记录
      await prisma.pointsTransaction.deleteMany({ where: { studentId: studentUserId } });
    }
    if (materialNodeId) {
      await prisma.question.deleteMany({ where: { materialNodeId } });
      // 删除单元节点
      const unitNode = await prisma.materialNode.findUnique({
        where: { id: materialNodeId },
        include: { parent: { include: { parent: true } } },
      });
      
      if (unitNode) {
        // 删除单元节点
        await prisma.materialNode.delete({ where: { id: unitNode.id } });
        
        // 删除科目节点
        if (unitNode.parent) {
          await prisma.materialNode.delete({ where: { id: unitNode.parent.id } });
          
          // 删除版本节点
          if (unitNode.parent.parent) {
            await prisma.materialNode.delete({ where: { id: unitNode.parent.parent.id } });
          }
        }
      }
    }
    if (parentUserId && studentUserId) {
      await prisma.parentChildRelation.deleteMany({ where: { parentId: parentUserId } });
    }
    if (studentUserId) {
      await prisma.studentProfile.deleteMany({ where: { userId: studentUserId } });
    }
    if (parentUserId || studentUserId) {
      const userIds = [parentUserId, studentUserId].filter(Boolean);
      if (userIds.length > 0) {
        await prisma.user.deleteMany({
          where: {
            id: { in: userIds },
          },
        });
      }
    }
    await prisma.$disconnect();
  });

  it('应该允许家长创建任务', async () => {
    // 步骤 1: 家长创建任务
    const createTaskResponse = await api.post(
      '/api/parent/tasks',
      {
        mode: 'CUSTOM',
        studentId: studentUserId,
        customConfig: {
          title: '数学练习任务',
          aiTeacher: aiTeacherId,
          subject: '数学',
          materialVersion: '人教版',
          units: ['测试单元'],
          goal: '练习基础数学题目',
        },
      },
      {
        headers: { Authorization: `Bearer ${parentToken}` },
      }
    );

    expect(createTaskResponse.status).toBe(201);
    expect(createTaskResponse.data.success).toBe(true);
    expect(createTaskResponse.data.data).toHaveProperty('id');
    expect(createTaskResponse.data.data.status).toBe('PENDING');

    taskId = createTaskResponse.data.data.id;

    // 验证任务已保存到数据库
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });
    expect(task).not.toBeNull();
    expect(task?.studentId).toBe(studentUserId);
    expect(task?.createdBy).toBe(parentUserId);
  });

  it('应该允许学员开始训练', async () => {
    // 步骤 2: 学员开始训练
    const startTrainingResponse = await api.post(
      `/api/student/training/start/${taskId}`,
      {},
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );

    expect(startTrainingResponse.status).toBe(200);
    expect(startTrainingResponse.data).toHaveProperty('session');
    expect(startTrainingResponse.data.session.phase).toBe('PRE_TEST');

    sessionId = startTrainingResponse.data.session.id;

    // 验证训练会话已创建
    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
    });
    expect(session).not.toBeNull();
    expect(session?.status).toBe('ACTIVE');
  });

  it('应该允许学员提交答案', async () => {
    // 步骤 3: 学员提交答案
    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        questions: true,
      },
    });

    if (session && session.questions && session.questions.length > 0) {
      // questions 是 String[] 类型，直接使用第一个 ID
      const questionId = session.questions[0];

      const answerResponse = await api.post(
        '/api/student/training/answer',
        {
          sessionId: sessionId,
          questionId: questionId,
          answer: '2',
        },
        {
          headers: { Authorization: `Bearer ${studentToken}` },
        }
      );

      expect(answerResponse.status).toBe(200);
      expect(answerResponse.data).toHaveProperty('correct');

      // 验证答题记录已保存
      const answer = await prisma.answer.findFirst({
        where: {
          sessionId: sessionId,
          questionId: questionId,
        },
      });
      expect(answer).not.toBeNull();
    }
  });

  it('应该在任务完成后自动生成报告', async () => {
    // 步骤 4: 完成训练
    const completeResponse = await api.post(
      `/api/student/training/complete/${sessionId}`,
      {},
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );

    expect(completeResponse.status).toBe(200);
    expect(completeResponse.data).toHaveProperty('report');
    expect(completeResponse.data).toHaveProperty('points');

    // 等待报告异步生成（最多等待 5 秒）
    let report = null;
    for (let i = 0; i < 10; i++) {
      report = await prisma.report.findUnique({
        where: { sessionId: sessionId },
      });
      if (report) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 验证报告已生成
    expect(report).not.toBeNull();
    expect(report?.content).toHaveProperty('summary');

    // 验证任务状态已更新
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });
    expect(task?.status).toBe('COMPLETED');
  });

  it('应该允许家长查看报告', async () => {
    // 步骤 5: 家长查看报告
    const reportsResponse = await api.get('/api/parent/reports', {
      params: { studentId: studentUserId },
      headers: { Authorization: `Bearer ${parentToken}` },
    });

    expect(reportsResponse.status).toBe(200);
    expect(reportsResponse.data).toHaveProperty('reports');
    expect(reportsResponse.data.reports.length).toBeGreaterThan(0);
  });
});
