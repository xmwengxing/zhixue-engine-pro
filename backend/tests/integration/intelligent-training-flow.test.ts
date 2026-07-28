/**
 * 智能训练平台完整流程集成测试
 * 测试：创建任务 → 启动会话 → 诊断测试 → 生成计划 → 引导训练 → 综合考试 → 生成报告
 * 使用 Mock AI 服务
 * 验证所有状态转换
 * 验证需求：所有需求
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { studentTrainingService } from '../../src/services/studentTrainingService';
import { aiQuestionGeneratorService } from '../../src/services/aiQuestionGeneratorService';
import * as mockAI from '../mocks/mockAIService';

const prisma = new PrismaClient();

describe('智能训练平台完整流程集成测试', () => {
  let parentUserId: string;
  let studentUserId: string;
  let taskId: string;
  let sessionId: string;

  beforeAll(async () => {
    // Mock AI 服务方法
    vi.spyOn(aiQuestionGeneratorService, 'generateDiagnosticQuestion').mockImplementation(
      async (context: any, questionNumber: number) => {
        return mockAI.mockGenerateDiagnosticQuestion(questionNumber, context) as any;
      }
    );

    vi.spyOn(aiQuestionGeneratorService, 'evaluateAnswer').mockImplementation(
      async (question: any, studentAnswer: string, _context: any) => {
        return mockAI.mockEvaluateAnswer(question, studentAnswer);
      }
    );

    vi.spyOn(aiQuestionGeneratorService, 'generateTrainingPlan').mockImplementation(
      async (diagnosticResults: any, studentProfile: any, trainingGoal: string) => {
        return mockAI.mockGenerateTrainingPlan(diagnosticResults, studentProfile, trainingGoal) as any;
      }
    );

    vi.spyOn(aiQuestionGeneratorService, 'generateTrainingQuestion').mockImplementation(
      async (stage: any, context: any, questionNumber: number) => {
        return mockAI.mockGenerateTrainingQuestion(stage, questionNumber, context) as any;
      }
    );

    vi.spyOn(aiQuestionGeneratorService, 'generateExamQuestions').mockImplementation(
      async (trainingPlan: any, trainingHistory: any) => {
        return mockAI.mockGenerateExamQuestions(trainingPlan, trainingHistory) as any;
      }
    );

    vi.spyOn(aiQuestionGeneratorService, 'generateTrainingReport').mockImplementation(
      async (sessionData: any) => {
        return mockAI.mockGenerateTrainingReport(sessionData);
      }
    );

    vi.spyOn(aiQuestionGeneratorService, 'chatWithAssistant').mockImplementation(
      async (message: string, context: any) => {
        return mockAI.mockChatWithAssistant(message, context);
      }
    );

    // 创建测试用户
    const hashedPassword = await bcrypt.hash('Test123456', 10);
    
    // 创建家长用户
    const parent = await prisma.user.create({
      data: {
        username: `parent_${Date.now()}`,
        passwordHash: hashedPassword,
        role: 'PARENT',
        realName: '测试家长',
      },
    });
    parentUserId = parent.id;

    // 创建学员用户
    const student = await prisma.user.create({
      data: {
        username: `student_${Date.now()}`,
        passwordHash: hashedPassword,
        role: 'STUDENT',
        realName: '测试学员',
      },
    });
    studentUserId = student.id;

    // 创建学员档案
    await prisma.studentProfile.create({
      data: {
        userId: studentUserId,
        realName: '测试学员',
        gender: 'MALE',
        grade: '五年级',
        materialVersion: '人教版',
        learningFoundation: 'medium',
        subjectLevels: {},
      },
    });

    // 创建训练任务（档案提取模式）
    const task = await prisma.task.create({
      data: {
        createdBy: parentUserId,
        studentId: studentUserId,
        title: '数学智能训练',
        mode: 'PROFILE',
        config: {
          profileBased: true,
          diagnosticQuestionCount: 10,
          trainingGoal: '提高数学运算能力，掌握基础运算规则',
        },
        status: 'PENDING',
      },
    });
    taskId = task.id;
  });

  afterAll(async () => {
    // 清理测试数据（按照外键依赖顺序）
    if (sessionId) {
      await prisma.trainingSession.deleteMany({
        where: { id: sessionId },
      });
    }
    if (taskId) {
      await prisma.task.deleteMany({
        where: { id: taskId },
      });
    }
    if (studentUserId) {
      // 先删除积分交易记录
      await prisma.pointsTransaction.deleteMany({
        where: { studentId: studentUserId },
      });
      // 再删除学员档案
      await prisma.studentProfile.deleteMany({
        where: { userId: studentUserId },
      });
      // 最后删除学员用户
      await prisma.user.deleteMany({
        where: { id: studentUserId },
      });
    }
    if (parentUserId) {
      await prisma.user.deleteMany({
        where: { id: parentUserId },
      });
    }

    await prisma.$disconnect();
    vi.restoreAllMocks();
  });

  it('完整训练流程测试', async () => {
    // 1. 创建训练会话
    console.log('步骤 1: 创建训练会话...');
    const session = await studentTrainingService.startTraining(taskId, studentUserId);
    sessionId = session.id;

    expect(session).toBeDefined();
    expect(session.phase).toBe('DIAGNOSTIC_TEST');
    expect(session.taskId).toBe(taskId);
    expect(session.studentId).toBe(studentUserId);
    console.log('✓ 训练会话创建成功');

    // 2. 诊断测试阶段 - 完成 10 道题目
    console.log('\n步骤 2: 诊断测试阶段...');
    for (let i = 0; i < 10; i++) {
      // 获取下一道题目
      const question = await studentTrainingService.getNextQuestion(sessionId, studentUserId);
      expect(question).toBeDefined();
      expect(question.stem).toContain('题目');

      // 提交答案（前 5 题答对，后 5 题答错，模拟 50% 正确率）
      const answer = i < 5 ? question.correctAnswer : '错误答案';
      const result = await studentTrainingService.submitAnswer(
        sessionId,
        studentUserId,
        question,
        answer,
        30 // 模拟用时 30 秒
      );
      
      expect(result).toBeDefined();
      expect(result.correct).toBe(i < 5);
      console.log(`  题目 ${i + 1}/10: ${result.correct ? '✓ 正确' : '✗ 错误'}`);
    }

    // 验证诊断测试完成后状态转换到 PLANNING
    const sessionAfterDiagnostic = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
    });
    expect(sessionAfterDiagnostic?.phase).toBe('PLANNING');
    console.log('✓ 诊断测试完成，进入规划阶段');

    // 3. 生成训练计划
    console.log('\n步骤 3: 生成训练计划...');
    const trainingPlan = await studentTrainingService.generateTrainingPlan(sessionId, studentUserId);
    expect(trainingPlan).toBeDefined();
    expect(trainingPlan.learningGoals).toBeDefined();
    expect(trainingPlan.stages).toBeDefined();
    expect(trainingPlan.stages.foundation).toBeDefined();
    expect(trainingPlan.stages.improvement).toBeDefined();
    expect(trainingPlan.stages.application).toBeDefined();
    console.log('✓ 训练计划生成成功');
    console.log(`  - 基础巩固: ${trainingPlan.stages.foundation.questionCount} 题`);
    console.log(`  - 能力提升: ${trainingPlan.stages.improvement.questionCount} 题`);
    console.log(`  - 综合应用: ${trainingPlan.stages.application.questionCount} 题`);

    // 确认训练计划
    await studentTrainingService.confirmTrainingPlan(sessionId, studentUserId);
    const sessionAfterConfirm = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
    });
    expect(sessionAfterConfirm?.phase).toBe('GUIDED_TRAINING');
    console.log('✓ 训练计划已确认，进入引导式训练阶段');

    // 4. 引导式训练阶段
    console.log('\n步骤 4: 引导式训练阶段...');
    
    // 4.1 基础巩固阶段
    console.log('  4.1 基础巩固阶段 (15 题)...');
    for (let i = 0; i < 15; i++) {
      const question = await studentTrainingService.getNextQuestion(sessionId, studentUserId);
      expect(question).toBeDefined();
      
      // 模拟答题（80% 正确率）
      const answer = i % 5 === 0 ? '错误答案' : question.correctAnswer;
      await studentTrainingService.submitAnswer(
        sessionId,
        studentUserId,
        question,
        answer,
        25
      );
    }
    await studentTrainingService.completeStage(sessionId, studentUserId);
    console.log('  ✓ 基础巩固阶段完成');

    // 4.2 能力提升阶段
    console.log('  4.2 能力提升阶段 (20 题)...');
    for (let i = 0; i < 20; i++) {
      const question = await studentTrainingService.getNextQuestion(sessionId, studentUserId);
      expect(question).toBeDefined();
      
      // 模拟答题（75% 正确率）
      const answer = i % 4 === 0 ? '错误答案' : question.correctAnswer;
      await studentTrainingService.submitAnswer(
        sessionId,
        studentUserId,
        question,
        answer,
        30
      );
    }
    await studentTrainingService.completeStage(sessionId, studentUserId);
    console.log('  ✓ 能力提升阶段完成');

    // 4.3 综合应用阶段
    console.log('  4.3 综合应用阶段 (12 题)...');
    for (let i = 0; i < 12; i++) {
      const question = await studentTrainingService.getNextQuestion(sessionId, studentUserId);
      expect(question).toBeDefined();
      
      // 模拟答题（70% 正确率）
      const answer = i % 3 === 0 ? '错误答案' : question.correctAnswer;
      await studentTrainingService.submitAnswer(
        sessionId,
        studentUserId,
        question,
        answer,
        35
      );
    }
    await studentTrainingService.completeStage(sessionId, studentUserId);
    console.log('  ✓ 综合应用阶段完成');
    console.log('✓ 引导式训练阶段全部完成');

    // 5. 综合考试阶段
    console.log('\n步骤 5: 综合考试阶段...');
    await studentTrainingService.startFinalExam(sessionId, studentUserId);
    
    const sessionBeforeExam = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
    });
    expect(sessionBeforeExam?.phase).toBe('FINAL_EXAM');
    console.log('✓ 综合考试已开始');

    // 获取考试题目
    const sessionWithExam = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
    });
    const examData = sessionWithExam?.finalExamData as any;
    const examQuestions = examData?.questions || [];
    expect(examQuestions.length).toBe(30);
    console.log(`  考试题目数量: ${examQuestions.length} 题`);

    // 提交考试答案（模拟 75% 正确率）
    const examAnswers: Record<number, string> = {};
    examQuestions.forEach((q: any, index: number) => {
      examAnswers[index] = index % 4 === 0 ? '错误答案' : q.correctAnswer;
    });

    await studentTrainingService.submitFinalExam(sessionId, studentUserId, examAnswers);

    // 验证考试完成后状态转换到 COMPLETED
    const sessionAfterExam = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
    });
    expect(sessionAfterExam?.phase).toBe('COMPLETED');
    console.log('✓ 综合考试已完成，训练状态转为 COMPLETED');

    // 6. 生成训练报告
    console.log('\n步骤 6: 生成训练报告...');
    const report = await studentTrainingService.getTrainingReport(sessionId, studentUserId);
    
    expect(report).toBeDefined();
    expect(report.content).toContain('智能训练报告');
    expect(report.content).toContain('诊断测试分析');
    expect(report.content).toContain('训练过程回顾');
    expect(report.content).toContain('综合考试成绩');
    expect(report.content).toContain('进步情况对比');
    expect(report.pointsAwarded).toBeGreaterThan(0);
    console.log('✓ 训练报告生成成功');
    console.log(`  获得积分: ${report.pointsAwarded} 分`);

    // 验证任务状态更新为 COMPLETED
    const taskAfterReport = await prisma.task.findUnique({
      where: { id: taskId },
    });
    expect(taskAfterReport?.status).toBe('COMPLETED');
    console.log('✓ 任务状态已更新为 COMPLETED');

    console.log('\n========================================');
    console.log('✓✓✓ 完整训练流程测试通过！✓✓✓');
    console.log('========================================');
  }, 120000); // 增加超时时间到 120 秒
});
