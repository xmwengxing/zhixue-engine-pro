// 共享的Prisma客户端实例
// 确保整个应用使用同一个数据库连接

import { PrismaClient } from '@prisma/client';

// 全局单例模式
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
