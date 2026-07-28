// 家长注册登录端到端测试
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import app from '../../src/app';

const prisma = new PrismaClient();

describe('家长注册登录端到端测试', () => {
  const testUsername = `e2e_parent_${Date.now()}`;
  const testPassword = 'test123456';
  const testEmail = 'e2e_test@example.com';
  let userId: string;

  beforeAll(async () => {
    // 清理测试数据
    await prisma.user.deleteMany({
      where: {
        username: {
          startsWith: 'e2e_parent_',
        },
      },
    });

    console.log('✓ 测试数据准备完成');
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: userId },
          {
            username: {
              startsWith: 'e2e_parent_',
            },
          },
        ],
      },
    });

    await prisma.$disconnect();
    console.log('✓ 测试数据清理完成');
  });

  it('家长注册应该成功', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        role: 'PARENT',
        username: testUsername,
        password: testPassword,
        email: testEmail,
        profile: {
          name: '测试家长',
          gender: '男',
          phone: '13800138000',
          address: '测试地址',
          industry: '测试行业',
        },
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('注册成功');
    expect(response.body.data).toBeDefined();
    expect(response.body.data.userId).toBeDefined();
    expect(response.body.data.username).toBe(testUsername);
    expect(response.body.data.role).toBe('PARENT');

    userId = response.body.data.userId;

    console.log('✓ 家长注册成功');
    console.log('  用户ID:', userId);
    console.log('  用户名:', testUsername);
  });

  it('注册后应该能够立即登录', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: testUsername,
        password: testPassword,
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('登录成功');
    expect(response.body.data).toBeDefined();
    expect(response.body.data.token).toBeDefined();
    expect(response.body.data.user).toBeDefined();
    expect(response.body.data.user.username).toBe(testUsername);
    expect(response.body.data.user.role).toBe('PARENT');
    expect(response.body.data.user.email).toBe(testEmail);

    console.log('✓ 家长登录成功');
    console.log('  Token:', response.body.data.token.substring(0, 20) + '...');
  });

  it('使用错误密码应该登录失败', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: testUsername,
        password: 'wrongpassword',
      })
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('用户名或密码错误');
  });

  it('验证数据库中的密码哈希', async () => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        passwordHash: true,
        role: true,
        status: true,
        email: true,
        realName: true,
        gender: true,
        phone: true,
        address: true,
        industry: true,
      },
    });

    expect(user).toBeDefined();
    expect(user?.username).toBe(testUsername);
    expect(user?.passwordHash).toBeDefined();
    expect(user?.passwordHash.length).toBeGreaterThan(0);
    expect(user?.role).toBe('PARENT');
    expect(user?.status).toBe('ACTIVE');
    expect(user?.email).toBe(testEmail);
    expect(user?.realName).toBe('测试家长');
    expect(user?.gender).toBe('男');
    expect(user?.phone).toBe('13800138000');

    console.log('✓ 数据库数据验证通过');
    console.log('  密码哈希长度:', user?.passwordHash.length);
    console.log('  密码哈希前缀:', user?.passwordHash.substring(0, 10));
  });
});
