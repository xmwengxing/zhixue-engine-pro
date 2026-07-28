// 学员档案学号显示测试
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { studentProfileService } from '../../src/services/studentProfileService';
import { studentIdService } from '../../src/services/studentIdService';

const prisma = new PrismaClient();

describe('学员档案学号显示测试', () => {
  let testUserId: string;
  let testStudentIdNumber: string;

  beforeAll(async () => {
    // 清理测试数据
    await prisma.studentProfile.deleteMany({
      where: {
        user: {
          username: {
            startsWith: 'test_student_profile_',
          },
        },
      },
    });

    await prisma.studentID.deleteMany({
      where: {
        user: {
          username: {
            startsWith: 'test_student_profile_',
          },
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        username: {
          startsWith: 'test_student_profile_',
        },
      },
    });

    // 创建测试学员用户
    const passwordHash = await bcrypt.hash('test123', 10);
    const user = await prisma.user.create({
      data: {
        username: `test_student_profile_${Date.now()}`,
        passwordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    });
    testUserId = user.id;

    // 生成并分配学号
    testStudentIdNumber = await studentIdService.generateStudentId();
    await prisma.studentID.create({
      data: {
        studentIdNumber: testStudentIdNumber,
        userId: testUserId,
        status: 'ASSIGNED',
        assignedAt: new Date(),
      },
    });

    // 创建学员档案
    await prisma.studentProfile.create({
      data: {
        userId: testUserId,
        realName: '测试学员',
        gender: '男',
        birthDate: new Date('2010-01-01'),
        grade: '初一',
        materialVersion: '人教版',
        subjectLevels: {},
        completeness: 0,
      },
    });

    console.log('✓ 测试数据准备完成');
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.studentProfile.deleteMany({
      where: { userId: testUserId },
    });

    await prisma.studentID.deleteMany({
      where: { userId: testUserId },
    });

    await prisma.user.deleteMany({
      where: { id: testUserId },
    });

    await prisma.$disconnect();
    console.log('✓ 测试数据清理完成');
  });

  it('获取学员档案时应该包含学号信息', async () => {
    const profile = await studentProfileService.getProfile(testUserId);

    expect(profile).toBeDefined();
    expect(profile?.user).toBeDefined();
    expect(profile?.user?.studentId).toBeDefined();
    expect(profile?.user?.studentId?.studentIdNumber).toBe(testStudentIdNumber);
    expect(profile?.user?.studentId?.studentIdNumber).toMatch(/^STU\d{8}$/);
  });

  it('更新学员档案后应该仍然包含学号信息', async () => {
    const updatedProfile = await studentProfileService.updateProfile(testUserId, {
      grade: '初二',
      school: '测试中学',
    });

    expect(updatedProfile).toBeDefined();
    expect(updatedProfile.user).toBeDefined();
    expect(updatedProfile.user?.studentId).toBeDefined();
    expect(updatedProfile.user?.studentId?.studentIdNumber).toBe(testStudentIdNumber);
  });

  it('学号格式应该正确（STU+年份后两位+6位流水号）', async () => {
    const profile = await studentProfileService.getProfile(testUserId);
    const studentIdNumber = profile?.user?.studentId?.studentIdNumber;

    expect(studentIdNumber).toBeDefined();
    expect(studentIdNumber).toMatch(/^STU\d{2}\d{6}$/);

    // 验证年份部分
    const currentYear = new Date().getFullYear();
    const yearSuffix = (currentYear % 100).toString().padStart(2, '0');
    expect(studentIdNumber?.startsWith(`STU${yearSuffix}`)).toBe(true);
  });
});
