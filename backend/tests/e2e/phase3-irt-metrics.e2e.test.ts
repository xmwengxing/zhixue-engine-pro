/**
 * Phase 3.1 + Phase 3.2 端到端测试（service 层，可独立运行）
 *
 * 说明：本仓库 e2e 目录下原有测试依赖 ../../src/app（该模块当前不存在），无法在
 * 进程中加载。因此本测试采用与 tests/integration/intelligent-training-flow.test.ts
 * 一致的 service 层写法：直接调用服务 + vi.spyOn 隔离真实 AI，仅需可达的测试数据库。
 *
 * A. IRT 自适应难度（Phase 3.2）
 *    - 诊断后进入引导训练，IRT 状态初始化且 theta ∈ [-3, 3]
 *    - 连续答对后 abilityTheta 上升、nextDifficulty 趋于困难
 *    - 连续答错后 abilityTheta 下降
 *    - IRT 状态持久化且 ensureState 可从损坏数据重建
 *
 * B. AI Token 消耗与性能监控（Phase 3.1）
 *    - getAPIMetrics 返回新增汇总字段（estimatedCost / p95ResponseTime /
 *      lastHourErrors / todayCalls / yesterdayCalls 等）
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { studentTrainingService } from '../../src/services/studentTrainingService';
import { adminAIService } from '../../src/services/adminAIService';
import { aiQuestionGeneratorService } from '../../src/services/aiQuestionGeneratorService';
import * as mockAI from '../mocks/mockAIService';

const prisma = new PrismaClient();

describe('Phase 3.2 IRT 自适应难度端到端测试', () => {
  let parentId: string;
  let studentId: string;
  let taskId: string;
  let sessionId: string;

  beforeAll(async () => {
    // 隔离 AI 题目生成
    vi.spyOn(aiQuestionGeneratorService, 'generateDiagnosticQuestion').mockImplementation(
      async (ctx: any, qn: number) => mockAI.mockGenerateDiagnosticQuestion(qn, ctx) as any
    );
    vi.spyOn(aiQuestionGeneratorService, 'evaluateAnswer').mockImplementation(
      async (q: any, a: string) => mockAI.mockEvaluateAnswer(q, a)
    );
    vi.spyOn(aiQuestionGeneratorService, 'generateTrainingPlan').mockImplementation(
      async (d: any, p: any, g: string) => mockAI.mockGenerateTrainingPlan(d, p, g) as any
    );
    vi.spyOn(aiQuestionGeneratorService, 'generateTrainingQuestion').mockImplementation(
      async (stage: any, ctx: any, qn: number) => mockAI.mockGenerateTrainingQuestion(stage, qn, ctx) as any
    );
    vi.spyOn(aiQuestionGeneratorService, 'generateExamQuestions').mockImplementation(
      async (plan: any, hist: any) => mockAI.mockGenerateExamQuestions(plan, hist) as any
    );
    vi.spyOn(aiQuestionGeneratorService, 'generateTrainingReport').mockImplementation(
      async (sd: any) => mockAI.mockGenerateTrainingReport(sd)
    );
    vi.spyOn(aiQuestionGeneratorService, 'chatWithAssistant').mockImplementation(
      async (m: string, c: any) => mockAI.mockChatWithAssistant(m, c)
    );

    const ts = Date.now();
    const parent = await prisma.user.create({
      data: { username: `irt_pa_${ts}`, passwordHash: 'x', role: 'PARENT', realName: '测试家长' },
    });
    parentId = parent.id;
    const student = await prisma.user.create({
      data: { username: `irt_stu_${ts}`, passwordHash: 'x', role: 'STUDENT', realName: '测试学员' },
    });
    studentId = student.id;
    await prisma.studentProfile.create({
      data: {
        userId: studentId,
        realName: '测试学员',
        gender: 'MALE',
        grade: '五年级',
        materialVersion: '人教版',
        learningFoundation: 'medium',
        subjectLevels: {},
      },
    });
    const task = await prisma.task.create({
      data: {
        createdBy: parentId,
        studentId,
        title: 'IRT 自适应难度测试',
        mode: 'PROFILE',
        config: { profileBased: true, diagnosticQuestionCount: 6, trainingGoal: '提升数学运算能力' },
        status: 'PENDING',
      },
    });
    taskId = task.id;
  });

  afterAll(async () => {
    await prisma.trainingSession.deleteMany({ where: { id: sessionId } }).catch(() => {});
    await prisma.task.deleteMany({ where: { id: taskId } }).catch(() => {});
    await prisma.studentProfile.deleteMany({ where: { userId: studentId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: studentId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: parentId } }).catch(() => {});
    await prisma.$disconnect();
    vi.restoreAllMocks();
  });

  it('诊断后进入引导训练，IRT 状态初始化且 theta ∈ [-3, 3]', async () => {
    const session = await studentTrainingService.startTraining(taskId, studentId);
    sessionId = session.id;
    expect(session.phase).toBe('DIAGNOSTIC_TEST');

    // 6 道诊断题：前 3 对、后 3 错（约 50% 正确率）
    for (let i = 0; i < 6; i++) {
      const q = await studentTrainingService.getNextQuestion(sessionId, studentId);
      const answer = i < 3 ? q.correctAnswer : 'wrong-answer';
      await studentTrainingService.submitAnswer(sessionId, studentId, q, answer, 30);
    }

    await studentTrainingService.generateTrainingPlan(sessionId, studentId);
    await studentTrainingService.confirmTrainingPlan(sessionId, studentId);

    // 取第一道训练题以触发 IRT 初始化
    const q1 = await studentTrainingService.getNextQuestion(sessionId, studentId);
    expect(q1).toBeDefined();

    const sess = await prisma.trainingSession.findUnique({ where: { id: sessionId } });
    const irt = (sess!.trainingProgress as any).irt;
    expect(irt).toBeDefined();
    expect(irt.theta).toBeGreaterThanOrEqual(-3);
    expect(irt.theta).toBeLessThanOrEqual(3);
    expect(['easy', 'medium', 'hard']).toContain(irt.lastRecommended);
    expect(irt.attempts).toBeGreaterThanOrEqual(1);
  });

  it('连续答对后 abilityTheta 上升、nextDifficulty 趋于困难', async () => {
    const before = await prisma.trainingSession.findUnique({ where: { id: sessionId } });
    const thetaBefore = (before!.trainingProgress as any).irt.theta;

    const diffs = ['easy', 'medium', 'hard', 'hard', 'hard'];
    let lastDifficulty: string = 'easy';
    for (const d of diffs) {
      const q = {
        id: 'irtq',
        stem: '题',
        type: 'single_choice',
        options: ['A', 'B'],
        correctAnswer: 'A',
        explanation: 'e',
        knowledgePoint: 'kp',
        difficulty: d,
      };
      const res = await studentTrainingService.submitAnswer(sessionId, studentId, q, 'A', 30);
      lastDifficulty = res.nextDifficulty;
      expect(res.abilityTheta).toBeGreaterThanOrEqual(-3);
      expect(res.abilityTheta).toBeLessThanOrEqual(3);
    }

    const after = await prisma.trainingSession.findUnique({ where: { id: sessionId } });
    const thetaAfter = (after!.trainingProgress as any).irt.theta;
    expect(thetaAfter).toBeGreaterThan(thetaBefore);
    expect(['medium', 'hard']).toContain(lastDifficulty);
  });

  it('连续答错后 abilityTheta 下降', async () => {
    const before = await prisma.trainingSession.findUnique({ where: { id: sessionId } });
    const thetaBefore = (before!.trainingProgress as any).irt.theta;

    const diffs = ['hard', 'hard', 'medium', 'easy'];
    for (const d of diffs) {
      const q = {
        id: 'irtq2',
        stem: '题',
        type: 'single_choice',
        options: ['A', 'B'],
        correctAnswer: 'A',
        explanation: 'e',
        knowledgePoint: 'kp',
        difficulty: d,
      };
      await studentTrainingService.submitAnswer(sessionId, studentId, q, 'WRONG', 60);
    }

    const after = await prisma.trainingSession.findUnique({ where: { id: sessionId } });
    const thetaAfter = (after!.trainingProgress as any).irt.theta;
    expect(thetaAfter).toBeLessThan(thetaBefore);
  });

  it('IRT 状态持久化且 ensureState 可从损坏数据重建', async () => {
    const sess = await prisma.trainingSession.findUnique({ where: { id: sessionId } });
    const irt = (sess!.trainingProgress as any).irt;
    expect(Array.isArray(irt.history)).toBe(true);
    expect(irt.history.length).toBeGreaterThan(0);

    const { irtService } = await import('../../src/services/irtService');
    const recovered = irtService.ensureState({ broken: true } as any, 0.5);
    expect(recovered.theta).toBeGreaterThanOrEqual(-3);
    expect(recovered.theta).toBeLessThanOrEqual(3);
    expect(recovered.attempts).toBe(0);
  });
});

describe('Phase 3.1 AI Token 消耗与性能监控端到端测试', () => {
  let adminId: string;
  let providerId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const admin = await prisma.user.create({
      data: { username: `adm_${ts}`, passwordHash: 'x', role: 'ADMIN', realName: '管理员' },
    });
    adminId = admin.id;

    const provider = await prisma.aIProvider.create({
      data: {
        name: '测试供应商',
        type: 'OPENAI',
        apiKey: 'encrypted-x',
        endpoint: 'https://api.openai.com',
        model: 'gpt-4o',
      },
    });
    providerId = provider.id;

    const now = new Date();
    // 今日：2 成功 + 1 错误
    await prisma.aPILog.createMany({
      data: [
        { providerId, endpoint: '/chat', requestTokens: 100, responseTokens: 50, responseTime: 200, status: 'SUCCESS', createdAt: now },
        { providerId, endpoint: '/chat', requestTokens: 120, responseTokens: 60, responseTime: 300, status: 'SUCCESS', createdAt: now },
        { providerId, endpoint: '/chat', requestTokens: 80, responseTokens: 40, responseTime: 900, status: 'ERROR', errorMessage: 'timeout', createdAt: now },
      ],
    });
    // 昨日同期：1 成功
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await prisma.aPILog.create({
      data: { providerId, endpoint: '/chat', requestTokens: 50, responseTokens: 25, responseTime: 150, status: 'SUCCESS', createdAt: yesterday },
    });
  });

  afterAll(async () => {
    await prisma.aPILog.deleteMany({ where: { providerId } }).catch(() => {});
    await prisma.aIProvider.deleteMany({ where: { id: providerId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('getAPIMetrics 返回 Phase 3.1 新增汇总字段', async () => {
    const metrics = await adminAIService.getAPIMetrics();
    const s = metrics.summary;

    expect(s.estimatedCost).toBeGreaterThan(0);
    expect(s.p95ResponseTime).toBeGreaterThanOrEqual(0);
    expect(typeof s.lastHourErrors).toBe('number');
    expect(s.lastHourErrors).toBeGreaterThanOrEqual(1); // 今天的错误日志在最近 1 小时内
    expect(s.todayCalls).toBeGreaterThanOrEqual(3);
    expect(s.yesterdayCalls).toBeGreaterThanOrEqual(1);
    // 总计 4 条日志，1 条错误 → 错误率 25%
    expect(s.errorRate).toBeCloseTo(25, 1);

    expect(Array.isArray(metrics.providerStats)).toBe(true);
    expect(metrics.providerStats.length).toBeGreaterThanOrEqual(1);
    expect(metrics.providerStats[0].estimatedCost).toBeGreaterThanOrEqual(0);
  });
});
