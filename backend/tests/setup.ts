/**
 * 测试环境设置
 * 在运行集成测试前初始化测试环境
 */

import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 全局测试前置操作
beforeAll(async () => {
  // 确保数据库连接正常
  try {
    await prisma.$connect();
    console.log('✓ 数据库连接成功');
  } catch (error) {
    console.error('✗ 数据库连接失败:', error);
    throw error;
  }
});

// 全局测试后置操作
afterAll(async () => {
  // 断开数据库连接
  await prisma.$disconnect();
  console.log('✓ 数据库连接已断开');
});

export { prisma };
