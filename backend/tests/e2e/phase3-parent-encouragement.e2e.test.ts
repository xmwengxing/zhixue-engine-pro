/**
 * Phase 3.2 家长激励增强 — 端到端测试（service 层，可独立运行）
 *
 * 说明：本仓库 e2e 目录下原有测试依赖 ../../src/app（该模块当前不存在、且 app
 * 未从 index.ts 导出），无法在进程中加载。因此本测试采用与
 * tests/integration/intelligent-training-flow.test.ts 一致的 service 层写法：
 * 直接调用服务 + vi.spyOn 隔离真实 AI，仅需可达的测试数据库即可运行。
 *
 * 覆盖：
 *  1. 创建任务携带 parentEncouragement，学生启动训练会话时透传至 task.config
 *  2. setEncouragement：成功更新并落库 / 越权抛错 / 超长校验
 *  3. generateEncouragement：AI 生成寄语建议（mock AI）
 *  4. generateEncouragementDraft：创建前草稿生成（需亲子绑定，mock AI）
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { studentTrainingService } from '../../src/services/studentTrainingService';
import { parentTaskService } from '../../src/services/parentTaskService';
import { aiServiceManager } from '../../src/services/aiServiceManager';

const prisma = new PrismaClient();

describe('Phase 3.2 家长激励增强端到端测试', () => {
  let parentId: string;
  let otherParentId: string;
  let studentId: string;
  let taskId: string;

  const MOCK_ENCOURAGEMENT = '孩子，爸爸妈妈相信你一定可以，加油！';

  beforeAll(async () => {
    // 隔离真实 AI 调用
    vi.spyOn(aiServiceManager, 'callAI').mockImplementation(async () => MOCK_ENCOURAGEMENT);

    const ts = Date.now();

    const parent = await prisma.user.create({
      data: { username: `pe_pa_${ts}`, passwordHash: 'x', role: 'PARENT', realName: '测试家长' },
    });
    parentId = parent.id;

    const other = await prisma.user.create({
      data: { username: `pe_pa2_${ts}`, passwordHash: 'x', role: 'PARENT', realName: '他人家长' },
    });
    otherParentId = other.id;

    const student = await prisma.user.create({
      data: { username: `pe_stu_${ts}`, passwordHash: 'x', role: 'STUDENT', realName: '测试学员' },
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

    // 亲子绑定
    await prisma.parentChildRelation.create({
      data: { parentId, studentId, relation: '父亲', status: 'ACTIVE' },
    });

    // 任务（含 parentEncouragement）
    const task = await prisma.task.create({
      data: {
        createdBy: parentId,
        studentId,
        title: '家长激励测试任务',
        mode: 'PROFILE',
        config: {
          profileBased: true,
          diagnosticQuestionCount: 6,
          trainingGoal: '提升数学成绩',
          parentEncouragement: '爸妈为你骄傲！',
        },
        status: 'PENDING',
      },
    });
    taskId = task.id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { id: taskId } }).catch(() => {});
    await prisma.parentChildRelation.deleteMany({ where: { parentId } }).catch(() => {});
    await prisma.studentProfile.deleteMany({ where: { userId: studentId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: studentId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: parentId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: otherParentId } }).catch(() => {});
    await prisma.$disconnect();
    vi.restoreAllMocks();
  });

  it('创建任务携带 parentEncouragement 时，学生启动训练会话应透传至 task.config', async () => {
    const session = await studentTrainingService.startTraining(taskId, studentId);
    expect(session).toBeDefined();
    const config = (session.task as any).config;
    expect(config).toBeDefined();
    expect(config.parentEncouragement).toBe('爸妈为你骄傲！');
  });

  it('setEncouragement 成功更新寄语并落库', async () => {
    const res = await parentTaskService.setEncouragement(taskId, parentId, MOCK_ENCOURAGEMENT);
    expect(res.parentEncouragement).toBe(MOCK_ENCOURAGEMENT);

    const updated = await prisma.task.findUnique({ where: { id: taskId } });
    const config = (updated!.config as any);
    expect(config.parentEncouragement).toBe(MOCK_ENCOURAGEMENT);
    expect(config.encouragementUpdatedAt).toBeDefined();
  });

  it('setEncouragement 越权家长应抛错', async () => {
    await expect(
      parentTaskService.setEncouragement(taskId, otherParentId, MOCK_ENCOURAGEMENT)
    ).rejects.toThrow('无权操作该任务');
  });

  it('setEncouragement 寄语超过 200 字应抛错', async () => {
    await expect(
      parentTaskService.setEncouragement(taskId, parentId, '字'.repeat(201))
    ).rejects.toThrow('不能超过 200 字');
  });

  it('generateEncouragement 成功生成寄语建议（mock AI）', async () => {
    const res = await parentTaskService.generateEncouragement(taskId, parentId);
    expect(res.taskId).toBe(taskId);
    expect(res.suggestion).toBe(MOCK_ENCOURAGEMENT);
  });

  it('generateEncouragement 越权家长应抛错', async () => {
    await expect(
      parentTaskService.generateEncouragement(taskId, otherParentId)
    ).rejects.toThrow('无权操作该任务');
  });

  it('generateEncouragementDraft 创建前草稿生成需要亲子绑定（mock AI）', async () => {
    const res = await parentTaskService.generateEncouragementDraft(parentId, studentId, '提升数学成绩');
    expect(res.suggestion).toBe(MOCK_ENCOURAGEMENT);
  });

  it('generateEncouragementDraft 无绑定关系应抛错', async () => {
    const stranger = await prisma.user.create({
      data: { username: `pe_stranger_${Date.now()}`, passwordHash: 'x', role: 'STUDENT', realName: '陌生人' },
    });
    await expect(
      parentTaskService.generateEncouragementDraft(parentId, stranger.id, '提升数学成绩')
    ).rejects.toThrow('无权操作该学员');
    await prisma.user.delete({ where: { id: stranger.id } }).catch(() => {});
  });
});
