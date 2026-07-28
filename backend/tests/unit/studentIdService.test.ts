import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { studentIdService } from '../../src/services/studentIdService';

const prisma = new PrismaClient();

describe('学号生成服务测试', () => {
  // 测试前清理数据
  beforeAll(async () => {
    // 删除测试生成的学号（当年的学号）
    const currentYear = new Date().getFullYear();
    const yearSuffix = (currentYear % 100).toString().padStart(2, '0');
    const yearPrefix = `STU${yearSuffix}`;
    
    await prisma.studentID.deleteMany({
      where: {
        studentIdNumber: {
          startsWith: yearPrefix,
        },
      },
    });
  });

  // 测试后清理数据
  afterAll(async () => {
    const currentYear = new Date().getFullYear();
    const yearSuffix = (currentYear % 100).toString().padStart(2, '0');
    const yearPrefix = `STU${yearSuffix}`;
    
    await prisma.studentID.deleteMany({
      where: {
        studentIdNumber: {
          startsWith: yearPrefix,
        },
      },
    });
    
    await prisma.$disconnect();
  });

  it('应该生成正确格式的学号', async () => {
    const studentId = await studentIdService.generateStudentId();
    
    // 验证格式: STU + 年份后两位 + 6位流水号
    expect(studentId).toMatch(/^STU\d{8}$/);
    expect(studentId.length).toBe(11);
    
    // 验证年份部分
    const currentYear = new Date().getFullYear();
    const yearSuffix = (currentYear % 100).toString().padStart(2, '0');
    expect(studentId.substring(0, 5)).toBe(`STU${yearSuffix}`);
    
    // 验证流水号部分（6位数字）
    const sequence = studentId.substring(5);
    expect(sequence).toMatch(/^\d{6}$/);
  });

  it('应该生成递增的流水号', async () => {
    // 生成第一个学号
    const studentId1 = await studentIdService.generateStudentId();
    await prisma.studentID.create({
      data: {
        studentIdNumber: studentId1,
        status: 'AVAILABLE',
      },
    });
    
    // 生成第二个学号
    const studentId2 = await studentIdService.generateStudentId();
    await prisma.studentID.create({
      data: {
        studentIdNumber: studentId2,
        status: 'AVAILABLE',
      },
    });
    
    // 提取流水号并验证递增
    const seq1 = parseInt(studentId1.substring(5));
    const seq2 = parseInt(studentId2.substring(5));
    
    expect(seq2).toBe(seq1 + 1);
  });

  it('应该确保学号唯一性', async () => {
    const studentId = await studentIdService.generateStudentId();
    
    // 创建学号记录
    await prisma.studentID.create({
      data: {
        studentIdNumber: studentId,
        status: 'AVAILABLE',
      },
    });
    
    // 尝试创建重复的学号应该失败
    await expect(
      prisma.studentID.create({
        data: {
          studentIdNumber: studentId,
          status: 'AVAILABLE',
        },
      })
    ).rejects.toThrow();
  });

  it('应该正确创建学号记录', async () => {
    const result = await studentIdService.createStudentId();
    
    expect(result).toBeDefined();
    expect(result.studentIdNumber).toMatch(/^STU\d{8}$/);
    expect(result.status).toBe('AVAILABLE');
    expect(result.userId).toBeNull();
    expect(result.assignedAt).toBeNull();
  });

  it('应该支持创建时直接分配给用户', async () => {
    // 创建一个测试用户
    const testUser = await prisma.user.create({
      data: {
        username: `test_user_${Date.now()}`,
        passwordHash: 'test_hash',
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    });
    
    try {
      const result = await studentIdService.createStudentId(testUser.id);
      
      expect(result.status).toBe('ASSIGNED');
      expect(result.userId).toBe(testUser.id);
      expect(result.assignedAt).toBeDefined();
    } finally {
      // 清理测试用户
      await prisma.studentID.deleteMany({
        where: { userId: testUser.id },
      });
      await prisma.user.delete({
        where: { id: testUser.id },
      });
    }
  });

  it('应该正确获取年度统计信息', async () => {
    const currentYear = new Date().getFullYear();
    const stats = await studentIdService.getYearlyStats(currentYear);
    
    expect(stats).toBeDefined();
    expect(stats.year).toBe(currentYear);
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(stats.assigned).toBeGreaterThanOrEqual(0);
    expect(stats.available).toBeGreaterThanOrEqual(0);
    expect(stats.nextSequence).toBe(stats.total + 1);
  });

  it('应该支持批量生成学号', async () => {
    const count = 5;
    const studentIds = await studentIdService.batchGenerateStudentIds(count);
    
    expect(studentIds).toHaveLength(count);
    
    // 验证所有学号格式正确
    studentIds.forEach(id => {
      expect(id).toMatch(/^STU\d{8}$/);
    });
    
    // 验证学号递增
    for (let i = 1; i < studentIds.length; i++) {
      const seq1 = parseInt(studentIds[i - 1].substring(5));
      const seq2 = parseInt(studentIds[i].substring(5));
      expect(seq2).toBe(seq1 + 1);
    }
  });

  it('批量生成时应该拒绝无效数量', async () => {
    await expect(
      studentIdService.batchGenerateStudentIds(0)
    ).rejects.toThrow('批量生成数量必须在1-1000之间');
    
    await expect(
      studentIdService.batchGenerateStudentIds(1001)
    ).rejects.toThrow('批量生成数量必须在1-1000之间');
  });
});
