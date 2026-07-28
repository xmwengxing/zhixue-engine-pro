import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createFreshAuthCode() {
  try {
    // 删除旧的测试授权码
    await prisma.authCode.deleteMany({
      where: {
        code: {
          startsWith: 'TEST-AUTH-CODE',
        },
      },
    });

    // 创建新的授权码
    const authCode = await prisma.authCode.create({
      data: {
        code: 'TEST-AUTH-CODE-NEW',
        status: 'UNUSED',
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    console.log('✅ 创建新授权码:', authCode.code);
    console.log('状态:', authCode.status);
  } catch (error) {
    console.error('❌ 创建授权码失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createFreshAuthCode();
