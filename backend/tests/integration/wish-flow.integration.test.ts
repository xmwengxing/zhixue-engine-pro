/**
 * 愿望提交和审批流程集成测试
 * 测试学员提交愿望 → 家长审批 → 积分扣除流程
 * 验证需求: 14.3, 9.3
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

describe('愿望提交和审批流程集成测试', () => {
  let api: AxiosInstance;
  let parentToken: string;
  let studentToken: string;
  let parentUserId: string;
  let studentUserId: string;
  let wishId: string;
  const initialPoints = 100;

  beforeAll(async () => {
    api = axios.create({
      baseURL: API_BASE_URL,
      validateStatus: () => true,
    });

    // 生成时间戳（确保用户名不超过 20 个字符）
    const timestamp = Date.now().toString().slice(-6);

    // 创建测试家长账户
    const parentPassword = await bcrypt.hash('Parent123!', 10);
    const parent = await prisma.user.create({
      data: {
        username: `pw${timestamp}`, // 缩短前缀
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
        username: `sw${timestamp}`, // 缩短前缀
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
        gender: '女', // 添加必填字段
        grade: '初一',
        materialVersion: '人教版',
        subjectLevels: {},
        completeness: 50,
      },
    });

    // 建立亲子关系
    await prisma.parentChildRelation.create({
      data: {
        parentId: parentUserId,
        studentId: studentUserId,
        relation: '母亲',
        status: 'ACTIVE',
      },
    });

    // 给学员初始积分
    await prisma.pointsTransaction.create({
      data: {
        studentId: studentUserId,
        amount: initialPoints,
        type: 'TASK_COMPLETE',
        balance: initialPoints,
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
    // 清理测试数据
    if (studentUserId) {
      await prisma.wish.deleteMany({ where: { studentId: studentUserId } });
      await prisma.pointsTransaction.deleteMany({ where: { studentId: studentUserId } });
      await prisma.studentProfile.deleteMany({ where: { userId: studentUserId } });
    }
    if (parentUserId && studentUserId) {
      await prisma.parentChildRelation.deleteMany({ where: { parentId: parentUserId } });
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

  it('应该允许学员提交愿望', async () => {
    // 步骤 1: 学员提交愿望
    const submitWishResponse = await api.post(
      '/api/student/wishes',
      {
        description: '想要一个新的篮球',
        requiredPoints: 50,
        imageUrl: 'https://example.com/basketball.jpg',
      },
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );

    expect(submitWishResponse.status).toBe(201);
    expect(submitWishResponse.data).toHaveProperty('wish');
    expect(submitWishResponse.data.wish.status).toBe('PENDING');

    wishId = submitWishResponse.data.wish.id;

    // 验证愿望已保存到数据库
    const wish = await prisma.wish.findUnique({
      where: { id: wishId },
    });
    expect(wish).not.toBeNull();
    expect(wish?.studentId).toBe(studentUserId);
    expect(wish?.requiredPoints).toBe(50);
  });

  it('应该允许家长查看待审批愿望', async () => {
    // 步骤 2: 家长查看待审批愿望列表
    const wishesResponse = await api.get('/api/parent/wishes', {
      params: { studentId: studentUserId, status: 'PENDING' },
      headers: { Authorization: `Bearer ${parentToken}` },
    });

    expect(wishesResponse.status).toBe(200);
    expect(wishesResponse.data).toHaveProperty('wishes');
    expect(wishesResponse.data.wishes.length).toBeGreaterThan(0);

    interface WishData {
      id: string;
      status: string;
    }
    const pendingWish = wishesResponse.data.wishes.find((w: WishData) => w.id === wishId);
    expect(pendingWish).toBeDefined();
    expect(pendingWish.status).toBe('PENDING');
  });

  it('应该在家长同意愿望时正确扣除积分', async () => {
    // 获取审批前的积分
    const pointsBefore = await prisma.pointsTransaction.findMany({
      where: { studentId: studentUserId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const balanceBefore = pointsBefore[0]?.balance || 0;

    // 步骤 3: 家长同意愿望
    const approveResponse = await api.put(
      `/api/parent/wishes/${wishId}/approve`,
      {
        approved: true,
        reason: '表现很好，同意兑换',
      },
      {
        headers: { Authorization: `Bearer ${parentToken}` },
      }
    );

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.data).toHaveProperty('wish');
    expect(approveResponse.data.wish.status).toBe('APPROVED');

    // 验证愿望状态已更新
    const wish = await prisma.wish.findUnique({
      where: { id: wishId },
    });
    expect(wish?.status).toBe('APPROVED');
    expect(wish?.reviewedBy).toBe(parentUserId);
    expect(wish?.reviewReason).toBe('表现很好，同意兑换');

    // 验证积分已扣除
    const pointsAfter = await prisma.pointsTransaction.findMany({
      where: { studentId: studentUserId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const balanceAfter = pointsAfter[0]?.balance || 0;

    expect(balanceAfter).toBe(balanceBefore - 50);

    // 验证积分交易记录
    const transaction = await prisma.pointsTransaction.findFirst({
      where: {
        studentId: studentUserId,
        type: 'WISH_REDEEM',
        relatedId: wishId,
      },
    });
    expect(transaction).not.toBeNull();
    expect(transaction?.amount).toBe(-50);
  });

  it('应该在家长拒绝愿望时保留积分', async () => {
    // 创建另一个愿望用于测试拒绝流程
    const submitResponse = await api.post(
      '/api/student/wishes',
      {
        description: '想要一个游戏机',
        requiredPoints: 200,
      },
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );
    const rejectedWishId = submitResponse.data.wish.id;

    // 获取拒绝前的积分
    const pointsBefore = await prisma.pointsTransaction.findMany({
      where: { studentId: studentUserId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const balanceBefore = pointsBefore[0]?.balance || 0;

    // 步骤 4: 家长拒绝愿望
    const rejectResponse = await api.put(
      `/api/parent/wishes/${rejectedWishId}/approve`,
      {
        approved: false,
        reason: '积分不够，继续努力',
      },
      {
        headers: { Authorization: `Bearer ${parentToken}` },
      }
    );

    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.data.wish.status).toBe('REJECTED');

    // 验证积分未被扣除
    const pointsAfter = await prisma.pointsTransaction.findMany({
      where: { studentId: studentUserId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const balanceAfter = pointsAfter[0]?.balance || 0;

    expect(balanceAfter).toBe(balanceBefore);

    // 验证没有创建扣除积分的交易记录
    const transaction = await prisma.pointsTransaction.findFirst({
      where: {
        studentId: studentUserId,
        type: 'WISH_REDEEM',
        relatedId: rejectedWishId,
      },
    });
    expect(transaction).toBeNull();
  });

  it('应该记录审批操作的审计信息', async () => {
    // 验证审批操作的审计信息
    const wish = await prisma.wish.findUnique({
      where: { id: wishId },
    });

    expect(wish?.reviewedBy).toBe(parentUserId);
    expect(wish?.reviewedAt).not.toBeNull();
    expect(wish?.reviewReason).toBeTruthy();
  });
});
