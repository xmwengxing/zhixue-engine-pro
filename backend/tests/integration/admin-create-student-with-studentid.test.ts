// 管理员创建学员并自动生成学号测试
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { adminUserService } from '../../src/services/adminUserService';

const prisma = new PrismaClient();

describe('管理员创建学员并自动生成学号测试', () => {
  const testUsername = `admin_student_${Date.now()}`;
  let userId: string;
  let authCode: string;

  beforeAll(async () => {
    // 清理测试数据
    await prisma.studentProfile.deleteMany({
      where: {
        user: {
          username: {
            startsWith: 'admin_student_',
          },
        },
      },
    });

    await prisma.studentID.deleteMany({
      where: {
        user: {
          username: {
            startsWith: 'admin_student_',
          },
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        username: {
          startsWith: 'admin_student_',
        },
      },
    });

    // 创建测试授权码
    const authCodeRecord = await prisma.authCode.create({
      data: {
        code: `TEST-${Date.now()}`,
        status: 'UNUSED',
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后过期
      },
    });
    authCode = authCodeRecord.code;

    console.log('✓ 测试数据准备完成');
    console.log(`  授权码: ${authCode}`);
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.studentProfile.deleteMany({
      where: { userId },
    });

    await prisma.studentID.deleteMany({
      where: { userId },
    });

    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: userId },
          {
            username: {
              startsWith: 'admin_student_',
            },
          },
        ],
      },
    });

    await prisma.authCode.deleteMany({
      where: { code: authCode },
    });

    await prisma.$disconnect();
    console.log('✓ 测试数据清理完成');
  });

  it('管理员创建学员应该自动生成学号', async () => {
    console.log('\n=== 管理员创建学员 ===');
    console.log(`用户名: ${testUsername}`);
    console.log(`授权码: ${authCode}`);

    const result = await adminUserService.createUser({
      username: testUsername,
      password: 'test123456',
      role: 'STUDENT',
      authCode,
      studentName: '测试学员',
      studentGender: '男',
      birthDate: '2010-01-01',
      grade: '初一',
      school: '测试中学',
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.username).toBe(testUsername);
    expect(result.role).toBe('STUDENT');

    userId = result.id;

    console.log(`✓ 学员创建成功`);
    console.log(`  用户ID: ${userId}`);

    // 检查是否有学号
    if ('studentIdNumber' in result) {
      console.log(`  学号: ${result.studentIdNumber}`);
      expect(result.studentIdNumber).toBeDefined();
      expect(result.studentIdNumber).toMatch(/^STU\d{8}$/);
    }
  });

  it('数据库中应该有学号记录', async () => {
    const studentId = await prisma.studentID.findUnique({
      where: { userId },
    });

    expect(studentId).toBeDefined();
    expect(studentId?.studentIdNumber).toBeDefined();
    expect(studentId?.studentIdNumber).toMatch(/^STU\d{8}$/);
    expect(studentId?.status).toBe('ASSIGNED');
    expect(studentId?.userId).toBe(userId);

    console.log(`✓ 学号记录验证通过`);
    console.log(`  学号: ${studentId?.studentIdNumber}`);
    console.log(`  状态: ${studentId?.status}`);
  });

  it('学员档案应该已创建', async () => {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId },
    });

    expect(profile).toBeDefined();
    expect(profile?.realName).toBe('测试学员');
    expect(profile?.gender).toBe('男');
    expect(profile?.grade).toBe('初一');

    console.log(`✓ 学员档案验证通过`);
    console.log(`  姓名: ${profile?.realName}`);
    console.log(`  年级: ${profile?.grade}`);
  });

  it('授权码应该已被标记为已使用', async () => {
    const authCodeRecord = await prisma.authCode.findUnique({
      where: { code: authCode },
    });

    expect(authCodeRecord).toBeDefined();
    expect(authCodeRecord?.status).toBe('USED');
    expect(authCodeRecord?.usedBy).toBe(userId);
    expect(authCodeRecord?.usedAt).toBeDefined();

    console.log(`✓ 授权码状态验证通过`);
    console.log(`  状态: ${authCodeRecord?.status}`);
  });

  it('获取学员档案时应该包含学号', async () => {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            studentId: {
              select: {
                studentIdNumber: true,
              },
            },
          },
        },
      },
    });

    expect(profile).toBeDefined();
    expect(profile?.user).toBeDefined();
    expect(profile?.user?.studentId).toBeDefined();
    expect(profile?.user?.studentId?.studentIdNumber).toBeDefined();
    expect(profile?.user?.studentId?.studentIdNumber).toMatch(/^STU\d{8}$/);

    console.log(`✓ 档案查询验证通过`);
    console.log(`  学号: ${profile?.user?.studentId?.studentIdNumber}`);
  });
});
