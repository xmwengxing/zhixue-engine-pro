/**
 * 错题收集和重做流程集成测试
 * 测试答错题目 → 收集到错题本 → 重做攻克流程
 * 验证需求: 13.1, 13.4
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

describe('错题收集和重做流程集成测试', () => {
  let api: AxiosInstance;
  let studentToken: string;
  let studentUserId: string;
  let taskId: string;
  let sessionId: string;
  let questionId: string;
  let errorQuestionId: string;
  let materialNodeId: string;

  beforeAll(async () => {
    api = axios.create({
      baseURL: API_BASE_URL,
      validateStatus: () => true,
    });

    // 生成时间戳（确保用户名不超过 20 个字符）
    const timestamp = Date.now().toString().slice(-6);

    // 创建测试学员账户
    const studentPassword = await bcrypt.hash('Student123!', 10);
    const student = await prisma.user.create({
      data: {
        username: `se${timestamp}`, // 缩短前缀
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
          数学: 'average',
        },
        completeness: 70,
      },
    });

    // 创建测试教材节点
    const materialNode = await prisma.materialNode.create({
      data: {
        name: '测试数学单元',
        type: 'UNIT',
        order: 1,
        metadata: { subject: '数学' },
      },
    });
    materialNodeId = materialNode.id;

    // 创建测试题目
    const question = await prisma.question.create({
      data: {
        materialNodeId: materialNodeId,
        type: 'CHOICE',
        content: JSON.stringify({
          question: '2 × 3 = ?',
          options: ['4', '5', '6', '7'],
        }),
        answer: '6',
        difficulty: 2,
        knowledgePoints: ['乘法'],
      },
    });
    questionId = question.id;

    // 创建测试任务
    const task = await prisma.task.create({
      data: {
        studentId: studentUserId,
        createdBy: studentUserId,
        title: '数学练习',
        mode: 'CUSTOM',
        config: {
          materialNodeIds: [materialNodeId],
          questionCount: 1,
          difficulty: 2,
        },
        status: 'PENDING',
      },
    });
    taskId = task.id;

    // 创建训练会话
    const session = await prisma.trainingSession.create({
      data: {
        taskId: taskId,
        studentId: studentUserId,
        phase: 'TRAINING',
        currentStep: 1,
        totalSteps: 1,
        progress: 0,
        questions: [questionId],
        status: 'ACTIVE',
      },
    });
    sessionId = session.id;

    // 登录获取 token
    const studentLoginRes = await api.post('/api/auth/login', {
      username: student.username,
      password: 'Student123!',
    });
    studentToken = studentLoginRes.data.data.token;
  });

  afterAll(async () => {
    // 清理测试数据（按依赖顺序）
    await prisma.errorQuestion.deleteMany({ where: { studentId: studentUserId } });
    await prisma.answer.deleteMany({ where: { session: { studentId: studentUserId } } });
    await prisma.trainingSession.deleteMany({ where: { studentId: studentUserId } });
    await prisma.task.deleteMany({ where: { studentId: studentUserId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.materialNode.deleteMany({ where: { id: materialNodeId } });
    await prisma.pointsTransaction.deleteMany({ where: { studentId: studentUserId } }); // 先删除积分交易记录
    await prisma.studentProfile.deleteMany({ where: { userId: studentUserId } });
    await prisma.user.deleteMany({ where: { id: studentUserId } });
    await prisma.$disconnect();
  });

  it('应该在学员答错题目时自动收集到错题本', async () => {
    // 步骤 1: 学员提交错误答案
    const answerResponse = await api.post(
      '/api/student/training/answer',
      {
        sessionId: sessionId,
        questionId: questionId,
        answer: '5', // 错误答案
      },
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );

    expect(answerResponse.status).toBe(200);
    expect(answerResponse.data.correct).toBe(false);

    // 验证答题记录已保存
    const answer = await prisma.answer.findFirst({
      where: {
        sessionId: sessionId,
        questionId: questionId,
      },
    });
    expect(answer).not.toBeNull();
    expect(answer?.isCorrect).toBe(false);

    // 验证错题已自动收集到错题本
    const errorQuestion = await prisma.errorQuestion.findFirst({
      where: {
        studentId: studentUserId,
        questionId: questionId,
      },
    });
    expect(errorQuestion).not.toBeNull();
    expect(errorQuestion?.mastery).toBe('UNMASTERED');
    expect(errorQuestion?.subject).toBe('数学');

    errorQuestionId = errorQuestion!.id;
  });

  it('应该允许学员查看错题本', async () => {
    // 步骤 2: 学员查看错题本
    const errorBookResponse = await api.get('/api/student/errors', {
      params: { subject: '数学', mastery: 'UNMASTERED' },
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    expect(errorBookResponse.status).toBe(200);
    expect(errorBookResponse.data).toHaveProperty('errors');
    expect(errorBookResponse.data.errors.length).toBeGreaterThan(0);

    const errorQuestion = errorBookResponse.data.errors.find(
      (e: { questionId: string }) => e.questionId === questionId
    );
    expect(errorQuestion).toBeDefined();
    expect(errorQuestion.mastery).toBe('UNMASTERED');
  });

  it('应该允许学员重做错题', async () => {
    // 步骤 3: 学员开始重做错题
    const retryResponse = await api.post(
      `/api/student/errors/${errorQuestionId}/retry`,
      {},
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );

    expect(retryResponse.status).toBe(200);
    expect(retryResponse.data).toHaveProperty('session');

    const retrySessionId = retryResponse.data.session.id;

    // 验证重做会话已创建
    const retrySession = await prisma.trainingSession.findUnique({
      where: { id: retrySessionId },
    });
    expect(retrySession).not.toBeNull();
    expect(retrySession?.phase).toBe('TRAINING');
  });

  it('应该在正确完成错题重做时更新掌握度并奖励积分', async () => {
    // 获取重做前的积分
    const pointsBefore = await prisma.pointsTransaction.findMany({
      where: { studentId: studentUserId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const balanceBefore = pointsBefore[0]?.balance || 0;

    // 获取重做前的掌握度
    const errorBefore = await prisma.errorQuestion.findUnique({
      where: { id: errorQuestionId },
    });
    expect(errorBefore?.mastery).toBe('UNMASTERED');

    // 步骤 4: 更新错题掌握度（模拟正确完成重做）
    const updateMasteryResponse = await api.put(
      `/api/student/errors/${errorQuestionId}/mastery`,
      {
        mastery: 'MASTERED',
      },
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );

    expect(updateMasteryResponse.status).toBe(200);
    expect(updateMasteryResponse.data.error.mastery).toBe('MASTERED');

    // 验证掌握度已更新
    const errorAfter = await prisma.errorQuestion.findUnique({
      where: { id: errorQuestionId },
    });
    expect(errorAfter?.mastery).toBe('MASTERED');
    expect(errorAfter?.retryCount).toBeGreaterThan(0);

    // 验证积分已奖励
    const pointsAfter = await prisma.pointsTransaction.findMany({
      where: { studentId: studentUserId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const balanceAfter = pointsAfter[0]?.balance || 0;

    expect(balanceAfter).toBeGreaterThan(balanceBefore);

    // 验证积分交易记录
    const transaction = await prisma.pointsTransaction.findFirst({
      where: {
        studentId: studentUserId,
        type: 'ERROR_RETRY',
      },
    });
    expect(transaction).not.toBeNull();
    expect(transaction?.amount).toBeGreaterThan(0);
  });

  it('应该按掌握度筛选错题', async () => {
    // 步骤 5: 按掌握度筛选错题
    const masteredErrorsResponse = await api.get('/api/student/errors', {
      params: { mastery: 'MASTERED' },
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    expect(masteredErrorsResponse.status).toBe(200);
    expect(masteredErrorsResponse.data.errors.length).toBeGreaterThan(0);

    const masteredError = masteredErrorsResponse.data.errors.find(
      (e: { id: string }) => e.id === errorQuestionId
    );
    expect(masteredError).toBeDefined();
    expect(masteredError.mastery).toBe('MASTERED');

    // 查询未掌握的错题应该不包含已掌握的
    const unmasteredErrorsResponse = await api.get('/api/student/errors', {
      params: { mastery: 'UNMASTERED' },
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    const unmasteredError = unmasteredErrorsResponse.data.errors.find(
      (e: { id: string }) => e.id === errorQuestionId
    );
    expect(unmasteredError).toBeUndefined();
  });
});
