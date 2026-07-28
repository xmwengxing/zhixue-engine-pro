/**
 * 环境变量验证工具
 * 用于验证必需的环境变量是否已配置
 */

interface EnvConfig {
  // 服务器配置
  PORT: number;
  NODE_ENV: 'development' | 'staging' | 'production';
  CORS_ORIGIN: string;

  // 数据库配置
  DATABASE_URL: string;
  DB_POOL_MIN?: number;
  DB_POOL_MAX?: number;

  // Redis 配置
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_DB?: number;
  REDIS_DEFAULT_TTL?: number;

  // JWT 配置
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRES_IN: string;

  // AI 服务配置
  OPENAI_API_KEY?: string;
  OPENAI_API_BASE_URL?: string;
  OPENAI_MODEL?: string;
  OPENAI_MAX_TOKENS?: number;
  OPENAI_TEMPERATURE?: number;

  CLAUDE_API_KEY?: string;
  CLAUDE_API_BASE_URL?: string;
  CLAUDE_MODEL?: string;
  CLAUDE_MAX_TOKENS?: number;

  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_API_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;

  QWEN_API_KEY?: string;
  QWEN_API_BASE_URL?: string;
  QWEN_MODEL?: string;

  GEMINI_API_KEY?: string;
  GEMINI_API_BASE_URL?: string;
  GEMINI_MODEL?: string;

  ZHIPU_API_KEY?: string;
  ZHIPU_API_BASE_URL?: string;
  ZHIPU_MODEL?: string;

  DOUBAO_API_KEY?: string;
  DOUBAO_API_BASE_URL?: string;
  DOUBAO_MODEL?: string;

  WENXIN_API_KEY?: string;
  WENXIN_API_BASE_URL?: string;
  WENXIN_MODEL?: string;

  AI_REQUEST_TIMEOUT?: number;
  AI_MAX_RETRIES?: number;
  AI_RATE_LIMIT_PER_MINUTE?: number;

  // 文件上传配置
  UPLOAD_MAX_FILE_SIZE?: number;
  UPLOAD_ALLOWED_TYPES?: string;
  UPLOAD_DEST?: string;

  // 日志配置
  LOG_LEVEL?: string;
  LOG_FILE_PATH?: string;
  LOG_MAX_FILES?: number;
  LOG_MAX_SIZE?: string;

  // 安全配置
  BCRYPT_ROUNDS?: number;
  SESSION_SECRET?: string;
  RATE_LIMIT_WINDOW_MS?: number;
  RATE_LIMIT_MAX_REQUESTS?: number;

  // 邮件配置
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_SECURE?: boolean;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;

  // 通知配置
  NOTIFICATION_ENABLED?: boolean;
  NOTIFICATION_WEBHOOK_URL?: string;

  // 监控配置
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;

  // 其他配置
  APP_BASE_URL?: string;
  FRONTEND_URL?: string;
  API_VERSION?: string;
}

/**
 * 必需的环境变量列表
 */
const REQUIRED_ENV_VARS = [
  'PORT',
  'NODE_ENV',
  'CORS_ORIGIN',
  'DATABASE_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'JWT_REFRESH_SECRET',
  'JWT_REFRESH_EXPIRES_IN',
];

/**
 * 生产环境额外必需的环境变量
 */
const PRODUCTION_REQUIRED_ENV_VARS = [
  'SESSION_SECRET',
  'SENTRY_DSN',
];

/**
 * 环境变量验证规则
 */
const ENV_VALIDATION_RULES: Record<string, (value: string) => boolean> = {
  PORT: (value) => {
    const port = parseInt(value, 10);
    return !isNaN(port) && port > 0 && port < 65536;
  },
  NODE_ENV: (value) => ['development', 'staging', 'production'].includes(value),
  DATABASE_URL: (value) => {
    return typeof value === 'string' && value.startsWith('postgresql://');
  },
  REDIS_PORT: (value) => {
    const port = parseInt(value, 10);
    return !isNaN(port) && port > 0 && port < 65536;
  },
  JWT_SECRET: (value) => {
    // JWT 密钥至少 32 个字符
    return typeof value === 'string' && value.length >= 32;
  },
  JWT_REFRESH_SECRET: (value) => {
    // JWT 刷新密钥至少 32 个字符
    return typeof value === 'string' && value.length >= 32;
  },
  BCRYPT_ROUNDS: (value) => {
    const rounds = parseInt(value, 10);
    return !isNaN(rounds) && rounds >= 10 && rounds <= 15;
  },
  UPLOAD_MAX_FILE_SIZE: (value) => {
    const size = parseInt(value, 10);
    return !isNaN(size) && size > 0;
  },
  AI_REQUEST_TIMEOUT: (value) => {
    const timeout = parseInt(value, 10);
    return !isNaN(timeout) && timeout > 0;
  },
  AI_MAX_RETRIES: (value) => {
    const retries = parseInt(value, 10);
    return !isNaN(retries) && retries >= 0;
  },
  AI_RATE_LIMIT_PER_MINUTE: (value) => {
    const limit = parseInt(value, 10);
    return !isNaN(limit) && limit > 0;
  },
};

/**
 * 验证环境变量
 */
export function validateEnv(): EnvConfig {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查必需的环境变量
  const requiredVars = [...REQUIRED_ENV_VARS];
  if (process.env.NODE_ENV === 'production') {
    requiredVars.push(...PRODUCTION_REQUIRED_ENV_VARS);
  }

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`缺少必需的环境变量: ${varName}`);
    }
  }

  // 验证环境变量格式
  for (const [varName, validator] of Object.entries(ENV_VALIDATION_RULES)) {
    const value = process.env[varName];
    if (value && !validator(value)) {
      errors.push(`环境变量 ${varName} 的值无效: ${value}`);
    }
  }

  // 检查生产环境的安全配置
  if (process.env.NODE_ENV === 'production') {
    // 检查 JWT 密钥是否使用默认值
    if (
      process.env.JWT_SECRET?.includes('your-secret-key') ||
      process.env.JWT_REFRESH_SECRET?.includes('your-refresh-secret-key')
    ) {
      errors.push('生产环境不能使用默认的 JWT 密钥，请更换为强密钥');
    }

    // 检查是否配置了至少一个 AI 服务
    const aiServices = [
      'OPENAI_API_KEY',
      'CLAUDE_API_KEY',
      'DEEPSEEK_API_KEY',
      'QWEN_API_KEY',
      'GEMINI_API_KEY',
      'ZHIPU_API_KEY',
      'DOUBAO_API_KEY',
      'WENXIN_API_KEY',
    ];
    const hasAnyAI = aiServices.some((key) => process.env[key]);
    if (!hasAnyAI) {
      warnings.push('未配置任何 AI 服务，AI 功能将不可用');
    }

    // 检查是否启用了错误追踪
    if (!process.env.SENTRY_DSN) {
      warnings.push('未配置 Sentry，错误追踪功能将不可用');
    }
  }

  // 如果有错误，抛出异常
  if (errors.length > 0) {
    console.error('❌ 环境变量验证失败:');
    errors.forEach((error) => console.error(`  - ${error}`));
    throw new Error('环境变量验证失败，请检查配置');
  }

  // 如果有警告，输出警告信息
  if (warnings.length > 0) {
    console.warn('⚠️  环境变量警告:');
    warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  // 返回类型安全的环境配置
  return {
    // 服务器配置
    PORT: parseInt(process.env.PORT!, 10),
    NODE_ENV: process.env.NODE_ENV as 'development' | 'staging' | 'production',
    CORS_ORIGIN: process.env.CORS_ORIGIN!,

    // 数据库配置
    DATABASE_URL: process.env.DATABASE_URL!,
    DB_POOL_MIN: process.env.DB_POOL_MIN
      ? parseInt(process.env.DB_POOL_MIN, 10)
      : 2,
    DB_POOL_MAX: process.env.DB_POOL_MAX
      ? parseInt(process.env.DB_POOL_MAX, 10)
      : 10,

    // Redis 配置
    REDIS_HOST: process.env.REDIS_HOST!,
    REDIS_PORT: parseInt(process.env.REDIS_PORT!, 10),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
    REDIS_DB: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0,
    REDIS_DEFAULT_TTL: process.env.REDIS_DEFAULT_TTL
      ? parseInt(process.env.REDIS_DEFAULT_TTL, 10)
      : 3600,

    // JWT 配置
    JWT_SECRET: process.env.JWT_SECRET!,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN!,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN!,

    // AI 服务配置
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_API_BASE_URL:
      process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1',
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4',
    OPENAI_MAX_TOKENS: process.env.OPENAI_MAX_TOKENS
      ? parseInt(process.env.OPENAI_MAX_TOKENS, 10)
      : 2000,
    OPENAI_TEMPERATURE: process.env.OPENAI_TEMPERATURE
      ? parseFloat(process.env.OPENAI_TEMPERATURE)
      : 0.7,

    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
    CLAUDE_API_BASE_URL:
      process.env.CLAUDE_API_BASE_URL || 'https://api.anthropic.com',
    CLAUDE_MODEL:
      process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',
    CLAUDE_MAX_TOKENS: process.env.CLAUDE_MAX_TOKENS
      ? parseInt(process.env.CLAUDE_MAX_TOKENS, 10)
      : 2000,

    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_API_BASE_URL:
      process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com',
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',

    QWEN_API_KEY: process.env.QWEN_API_KEY,
    QWEN_API_BASE_URL:
      process.env.QWEN_API_BASE_URL || 'https://dashscope.aliyuncs.com/api/v1',
    QWEN_MODEL: process.env.QWEN_MODEL || 'qwen-turbo',

    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_API_BASE_URL:
      process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com',
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-pro',

    ZHIPU_API_KEY: process.env.ZHIPU_API_KEY,
    ZHIPU_API_BASE_URL:
      process.env.ZHIPU_API_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
    ZHIPU_MODEL: process.env.ZHIPU_MODEL || 'glm-4',

    DOUBAO_API_KEY: process.env.DOUBAO_API_KEY,
    DOUBAO_API_BASE_URL:
      process.env.DOUBAO_API_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    DOUBAO_MODEL: process.env.DOUBAO_MODEL || 'doubao-pro',

    WENXIN_API_KEY: process.env.WENXIN_API_KEY,
    WENXIN_API_BASE_URL:
      process.env.WENXIN_API_BASE_URL || 'https://aip.baidubce.com',
    WENXIN_MODEL: process.env.WENXIN_MODEL || 'ernie-bot-turbo',

    AI_REQUEST_TIMEOUT: process.env.AI_REQUEST_TIMEOUT
      ? parseInt(process.env.AI_REQUEST_TIMEOUT, 10)
      : 30000,
    AI_MAX_RETRIES: process.env.AI_MAX_RETRIES
      ? parseInt(process.env.AI_MAX_RETRIES, 10)
      : 3,
    AI_RATE_LIMIT_PER_MINUTE: process.env.AI_RATE_LIMIT_PER_MINUTE
      ? parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE, 10)
      : 60,

    // 文件上传配置
    UPLOAD_MAX_FILE_SIZE: process.env.UPLOAD_MAX_FILE_SIZE
      ? parseInt(process.env.UPLOAD_MAX_FILE_SIZE, 10)
      : 10485760,
    UPLOAD_ALLOWED_TYPES:
      process.env.UPLOAD_ALLOWED_TYPES ||
      'image/jpeg,image/png,image/gif,application/pdf',
    UPLOAD_DEST: process.env.UPLOAD_DEST || './uploads',

    // 日志配置
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_FILE_PATH: process.env.LOG_FILE_PATH || './logs',
    LOG_MAX_FILES: process.env.LOG_MAX_FILES
      ? parseInt(process.env.LOG_MAX_FILES, 10)
      : 14,
    LOG_MAX_SIZE: process.env.LOG_MAX_SIZE || '20m',

    // 安全配置
    BCRYPT_ROUNDS: process.env.BCRYPT_ROUNDS
      ? parseInt(process.env.BCRYPT_ROUNDS, 10)
      : 10,
    SESSION_SECRET: process.env.SESSION_SECRET,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS
      ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
      : 900000,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS
      ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10)
      : 100,

    // 邮件配置
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT
      ? parseInt(process.env.SMTP_PORT, 10)
      : undefined,
    SMTP_SECURE: process.env.SMTP_SECURE === 'true',
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SMTP_FROM: process.env.SMTP_FROM,

    // 通知配置
    NOTIFICATION_ENABLED: process.env.NOTIFICATION_ENABLED !== 'false',
    NOTIFICATION_WEBHOOK_URL: process.env.NOTIFICATION_WEBHOOK_URL,

    // 监控配置
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,

    // 其他配置
    APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:3000',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    API_VERSION: process.env.API_VERSION || 'v1',
  };
}

/**
 * 打印环境配置信息（隐藏敏感信息）
 */
export function printEnvInfo(config: EnvConfig): void {
  console.log('📋 环境配置信息:');
  console.log(`  - 环境: ${config.NODE_ENV}`);
  console.log(`  - 端口: ${config.PORT}`);
  console.log(`  - CORS 源: ${config.CORS_ORIGIN}`);
  console.log(`  - 数据库: ${maskSensitiveInfo(config.DATABASE_URL)}`);
  console.log(`  - Redis: ${config.REDIS_HOST}:${config.REDIS_PORT}`);
  console.log(`  - JWT 过期时间: ${config.JWT_EXPIRES_IN}`);
  
  // AI 服务配置状态
  console.log('  - AI 服务:');
  const aiServices = [
    { name: 'OpenAI', key: config.OPENAI_API_KEY },
    { name: 'Claude', key: config.CLAUDE_API_KEY },
    { name: 'DeepSeek', key: config.DEEPSEEK_API_KEY },
    { name: 'Qwen (通义千问)', key: config.QWEN_API_KEY },
    { name: 'Gemini', key: config.GEMINI_API_KEY },
    { name: 'Zhipu (智谱)', key: config.ZHIPU_API_KEY },
    { name: 'Doubao (豆包)', key: config.DOUBAO_API_KEY },
    { name: 'Wenxin (文心)', key: config.WENXIN_API_KEY },
  ];
  
  const configuredServices = aiServices.filter(s => s.key);
  if (configuredServices.length > 0) {
    configuredServices.forEach(s => {
      console.log(`      ✓ ${s.name}`);
    });
  } else {
    console.log('      ✗ 未配置任何 AI 服务');
  }
  
  console.log(`  - 日志级别: ${config.LOG_LEVEL}`);
  console.log(
    `  - Sentry: ${config.SENTRY_DSN ? '已配置' : '未配置'}`
  );
}

/**
 * 隐藏敏感信息
 */
function maskSensitiveInfo(value: string): string {
  // 隐藏数据库密码
  return value.replace(/:([^@]+)@/, ':****@');
}

/**
 * 导出环境配置单例
 */
let envConfig: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!envConfig) {
    envConfig = validateEnv();
  }
  return envConfig;
}
