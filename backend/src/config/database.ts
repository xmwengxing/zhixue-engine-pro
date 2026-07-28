import { PrismaClient } from '@prisma/client';
import { logger } from '../middlewares/logger';

// 创建 Prisma 客户端实例
const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

// 监听查询事件（开发环境）
if (process.env.NODE_ENV !== 'production') {
  prisma.$on('query' as never, (e: any) => {
    logger.debug({
      type: 'database_query',
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
    });
  });
}

// 监听错误事件
prisma.$on('error' as never, (e: any) => {
  logger.error({
    type: 'database_error',
    message: e.message,
    target: e.target,
  });
});

// 监听警告事件
prisma.$on('warn' as never, (e: any) => {
  logger.warn({
    type: 'database_warning',
    message: e.message,
  });
});

// 测试数据库连接
export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('✅ 数据库连接成功');
  } catch (error) {
    logger.error('❌ 数据库连接失败:', error);
    throw error;
  }
};

// 断开数据库连接
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('数据库连接已断开');
  } catch (error) {
    logger.error('断开数据库连接时出错:', error);
    throw error;
  }
};

export default prisma;
