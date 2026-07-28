import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { logger, requestLogger } from './middlewares/logger';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { connectDatabase, disconnectDatabase } from './config/database';
import { initializeCache } from './utils/cache';
import { validateEnv, printEnvInfo } from './utils/envValidator';

// 加载环境变量
dotenv.config();

// 验证环境变量
try {
  const envConfig = validateEnv();
  console.log('✅ 环境变量验证通过');
  printEnvInfo(envConfig);
} catch (error) {
  console.error('❌ 环境变量验证失败，服务器无法启动');
  process.exit(1);
}

const app: Application = express();
const PORT = process.env.PORT || 3000;

// ============ 安全中间件 ============
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ============ CORS 配置 ============
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// ============ 请求解析中间件 ============
app.use(express.json({ limit: '10mb' })); // JSON 解析，限制 10MB
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // URL 编码解析

// ============ 请求日志中间件 ============
app.use(requestLogger);

// ============ 健康检查端点 ============
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ============ 根路由 ============
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: '智能提分训练平台 API',
    version: '1.0.0',
    docs: '/api-docs',
    health: '/health',
  });
});

// ============ API 路由（后续添加） ============
import testRoutes from './routes/test';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import parentRoutes from './routes/parent';
import studentRoutes from './routes/student';

app.use('/api/test', testRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/student', studentRoutes);

// ============ 404 处理 ============
app.use(notFoundHandler);

// ============ 全局错误处理 ============
app.use(errorHandler);

// ============ 启动服务器 ============
const startServer = async () => {
  try {
    // 连接数据库
    await connectDatabase();
    
    // 初始化 Redis 缓存（可选，如果 Redis 不可用不影响主功能）
    try {
      const cacheManager = initializeCache({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        defaultTTL: parseInt(process.env.REDIS_DEFAULT_TTL || '3600'),
      });
      
      // 等待 Redis 连接建立（最多等待 2 秒）
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 2000);
        const checkInterval = setInterval(() => {
          if (cacheManager.isReady()) {
            clearTimeout(timeout);
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
      
      if (cacheManager.isReady()) {
        logger.info('✅ Redis 缓存已连接');
      } else {
        logger.warn('⚠️  Redis 缓存连接失败，系统将在无缓存模式下运行');
      }
    } catch (error) {
      logger.warn('⚠️  Redis 初始化失败，系统将在无缓存模式下运行:', error);
    }

    // 启动 AI 生成队列 Worker（Redis 不可用时自动降级为同步执行）
    try {
      const { startAIWorker } = await import('./queue/aiQueue');
      startAIWorker(4);
    } catch (error) {
      logger.warn(
        '⚠️  AI 队列 Worker 启动失败，长耗时生成将降级为同步执行:',
        error
      );
    }

    // 启动 HTTP 服务器
    const server = app.listen(PORT, () => {
      logger.info(`🚀 服务器运行在 http://localhost:${PORT}`);
      logger.info(`📝 环境: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔒 CORS 允许来源: ${corsOptions.origin}`);
    });

    // ============ 优雅关闭 ============
    const gracefulShutdown = async (signal: string) => {
      logger.info(`收到 ${signal} 信号，开始优雅关闭...`);
      
      server.close(async () => {
        logger.info('HTTP 服务器已关闭');
        
        try {
          await disconnectDatabase();
          logger.info('数据库连接已断开');
          
          // 断开 Redis 连接
          try {
            const { getCache } = await import('./utils/cache');
            const cache = getCache();
            await cache.disconnect();
            logger.info('Redis 连接已断开');
          } catch (error) {
            // Redis 可能未初始化，忽略错误
          }

          // 关闭 AI 生成队列
          try {
            const { closeAIQueue } = await import('./queue/aiQueue');
            await closeAIQueue();
            logger.info('AI 生成队列已关闭');
          } catch (error) {
            // 忽略关闭错误
          }
          
          process.exit(0);
        } catch (error) {
          logger.error('关闭连接时出错:', error);
          process.exit(1);
        }
      });

      // 如果 10 秒后还没关闭，强制退出
      setTimeout(() => {
        logger.error('无法优雅关闭，强制退出');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    logger.error('启动服务器失败:', error);
    process.exit(1);
  }
};

// 启动应用
startServer();

export default app;


