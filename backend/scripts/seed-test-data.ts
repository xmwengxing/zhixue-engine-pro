import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * 创建测试数据
 */
async function seedTestData() {
  try {
    console.log('开始创建测试数据...');

    // 1. 创建测试用户
    const passwordHash = await bcrypt.hash('password123', 10);

    const adminUser = await prisma.user.upsert({
      where: { username: 'admin' },
      update: {},
      create: {
        username: 'admin',
        passwordHash,
        role: 'ADMIN',
        email: 'admin@example.com',
        status: 'ACTIVE',
      },
    });
    console.log('✅ 创建管理员用户:', adminUser.username);

    const parentUser = await prisma.user.upsert({
      where: { username: 'parent1' },
      update: {},
      create: {
        username: 'parent1',
        passwordHash,
        role: 'PARENT',
        email: 'parent1@example.com',
        status: 'ACTIVE',
      },
    });
    console.log('✅ 创建家长用户:', parentUser.username);

    const studentUser = await prisma.user.upsert({
      where: { username: 'student1' },
      update: {},
      create: {
        username: 'student1',
        passwordHash,
        role: 'STUDENT',
        email: 'student1@example.com',
        status: 'ACTIVE',
      },
    });
    console.log('✅ 创建学员用户:', studentUser.username);

    // 2. 创建测试授权码
    const authCode1 = await prisma.authCode.upsert({
      where: { code: 'TEST-AUTH-CODE-001' },
      update: {},
      create: {
        code: 'TEST-AUTH-CODE-001',
        status: 'UNUSED',
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 天后过期
      },
    });
    console.log('✅ 创建授权码:', authCode1.code);

    const authCode2 = await prisma.authCode.upsert({
      where: { code: 'TEST-AUTH-CODE-002' },
      update: {},
      create: {
        code: 'TEST-AUTH-CODE-002',
        status: 'UNUSED',
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    console.log('✅ 创建授权码:', authCode2.code);

    console.log('\n✅ 测试数据创建完成！');
    console.log('\n测试账户信息:');
    console.log('管理员: admin / password123');
    console.log('家长: parent1 / password123');
    console.log('学员: student1 / password123');
    console.log('\n可用授权码:');
    console.log('- TEST-AUTH-CODE-001');
    console.log('- TEST-AUTH-CODE-002');
  } catch (error) {
    console.error('❌ 创建测试数据失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedTestData();
