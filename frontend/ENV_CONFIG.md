# 前端环境变量配置指南

本文档详细说明了智能提分训练平台前端应用所需的所有环境变量配置。

## 快速开始

1. 复制示例配置文件：
```bash
cp .env.example .env
```

2. 根据您的环境修改 `.env` 文件中的配置

3. 启动开发服务器：
```bash
npm run dev
```

## 环境变量说明

### API 配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `VITE_API_BASE_URL` | 后端 API 基础 URL | `http://localhost:3000/api` | - |

**注意：** Vite 要求所有环境变量必须以 `VITE_` 开头才能在客户端代码中访问。

### 应用配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `VITE_APP_ENV` | 应用环境 | `development` / `staging` / `production` | `development` |
| `VITE_APP_TITLE` | 应用标题 | `智能提分训练平台` | `智能提分训练平台` |
| `VITE_APP_VERSION` | 应用版本 | `1.0.0` | `1.0.0` |

### 功能开关

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `VITE_ENABLE_DEBUG` | 启用调试模式 | `true` / `false` | `false` |
| `VITE_ENABLE_PERFORMANCE_MONITOR` | 启用性能监控 | `true` / `false` | `false` |
| `VITE_ENABLE_ERROR_TRACKING` | 启用错误追踪 | `true` / `false` | `false` |

### 第三方服务配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `VITE_SENTRY_DSN` | Sentry DSN（错误追踪） | `https://...@sentry.io/...` | - |
| `VITE_GA_ID` | Google Analytics ID | `G-XXXXXXXXXX` | - |

### 上传配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `VITE_MAX_FILE_SIZE` | 最大文件上传大小（字节） | `10485760` (10MB) | `10485760` |
| `VITE_ALLOWED_FILE_TYPES` | 允许的文件类型 | `image/jpeg,image/png,image/gif` | `image/jpeg,image/png,image/gif` |

### UI 配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `VITE_DEFAULT_LOCALE` | 默认语言 | `zh-CN` | `zh-CN` |
| `VITE_PRIMARY_COLOR` | 主题色 | `#1890ff` | `#1890ff` |

### 缓存配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `VITE_STORAGE_PREFIX` | 本地存储前缀 | `training_platform_` | `training_platform_` |
| `VITE_CACHE_EXPIRY` | 缓存过期时间（毫秒） | `3600000` (1小时) | `3600000` |

## 环境特定配置

### 开发环境（development）

开发环境配置示例（`.env.development`）：

```env
# API 配置
VITE_API_BASE_URL=http://localhost:3000/api

# 应用配置
VITE_APP_ENV=development
VITE_APP_TITLE=智能提分训练平台（开发）
VITE_APP_VERSION=1.0.0-dev

# 功能开关
VITE_ENABLE_DEBUG=true
VITE_ENABLE_PERFORMANCE_MONITOR=true
VITE_ENABLE_ERROR_TRACKING=false

# UI 配置
VITE_DEFAULT_LOCALE=zh-CN
VITE_PRIMARY_COLOR=#1890ff

# 缓存配置
VITE_STORAGE_PREFIX=training_platform_dev_
VITE_CACHE_EXPIRY=3600000
```

### 生产环境（production）

生产环境配置示例（`.env.production`）：

```env
# API 配置
VITE_API_BASE_URL=https://api.your-domain.com/api

# 应用配置
VITE_APP_ENV=production
VITE_APP_TITLE=智能提分训练平台
VITE_APP_VERSION=1.0.0

# 功能开关
VITE_ENABLE_DEBUG=false
VITE_ENABLE_PERFORMANCE_MONITOR=false
VITE_ENABLE_ERROR_TRACKING=true

# 第三方服务
VITE_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
VITE_GA_ID=G-XXXXXXXXXX

# 上传配置
VITE_MAX_FILE_SIZE=10485760
VITE_ALLOWED_FILE_TYPES=image/jpeg,image/png,image/gif

# UI 配置
VITE_DEFAULT_LOCALE=zh-CN
VITE_PRIMARY_COLOR=#1890ff

# 缓存配置
VITE_STORAGE_PREFIX=training_platform_
VITE_CACHE_EXPIRY=3600000
```

## 在代码中使用环境变量

### 访问环境变量

```typescript
// 访问环境变量
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const appEnv = import.meta.env.VITE_APP_ENV;
const isDebug = import.meta.env.VITE_ENABLE_DEBUG === 'true';

// 检查是否为生产环境
const isProduction = import.meta.env.PROD;
const isDevelopment = import.meta.env.DEV;
```

### 类型安全的环境变量

创建类型定义文件 `src/vite-env.d.ts`：

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_ENV: 'development' | 'staging' | 'production';
  readonly VITE_APP_TITLE: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_ENABLE_DEBUG: string;
  readonly VITE_ENABLE_PERFORMANCE_MONITOR: string;
  readonly VITE_ENABLE_ERROR_TRACKING: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_GA_ID?: string;
  readonly VITE_MAX_FILE_SIZE: string;
  readonly VITE_ALLOWED_FILE_TYPES: string;
  readonly VITE_DEFAULT_LOCALE: string;
  readonly VITE_PRIMARY_COLOR: string;
  readonly VITE_STORAGE_PREFIX: string;
  readonly VITE_CACHE_EXPIRY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### 创建配置工具类

```typescript
// src/utils/config.ts
class Config {
  // API 配置
  get apiBaseUrl(): string {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // 应用配置
  get appEnv(): string {
    return import.meta.env.VITE_APP_ENV;
  }

  get appTitle(): string {
    return import.meta.env.VITE_APP_TITLE;
  }

  get appVersion(): string {
    return import.meta.env.VITE_APP_VERSION;
  }

  // 功能开关
  get isDebugEnabled(): boolean {
    return import.meta.env.VITE_ENABLE_DEBUG === 'true';
  }

  get isPerformanceMonitorEnabled(): boolean {
    return import.meta.env.VITE_ENABLE_PERFORMANCE_MONITOR === 'true';
  }

  get isErrorTrackingEnabled(): boolean {
    return import.meta.env.VITE_ENABLE_ERROR_TRACKING === 'true';
  }

  // 第三方服务
  get sentryDsn(): string | undefined {
    return import.meta.env.VITE_SENTRY_DSN;
  }

  get gaId(): string | undefined {
    return import.meta.env.VITE_GA_ID;
  }

  // 上传配置
  get maxFileSize(): number {
    return parseInt(import.meta.env.VITE_MAX_FILE_SIZE, 10);
  }

  get allowedFileTypes(): string[] {
    return import.meta.env.VITE_ALLOWED_FILE_TYPES.split(',');
  }

  // UI 配置
  get defaultLocale(): string {
    return import.meta.env.VITE_DEFAULT_LOCALE;
  }

  get primaryColor(): string {
    return import.meta.env.VITE_PRIMARY_COLOR;
  }

  // 缓存配置
  get storagePrefix(): string {
    return import.meta.env.VITE_STORAGE_PREFIX;
  }

  get cacheExpiry(): number {
    return parseInt(import.meta.env.VITE_CACHE_EXPIRY, 10);
  }

  // 环境检查
  get isProduction(): boolean {
    return import.meta.env.PROD;
  }

  get isDevelopment(): boolean {
    return import.meta.env.DEV;
  }
}

export const config = new Config();
```

使用示例：

```typescript
import { config } from '@/utils/config';

// 使用配置
const apiUrl = `${config.apiBaseUrl}/users`;
const isDebug = config.isDebugEnabled;
const maxSize = config.maxFileSize;
```

## 构建时环境变量

### 指定环境文件

Vite 支持多个环境文件：

- `.env` - 所有环境都会加载
- `.env.local` - 所有环境都会加载，但会被 git 忽略
- `.env.[mode]` - 只在指定模式下加载
- `.env.[mode].local` - 只在指定模式下加载，但会被 git 忽略

优先级（从高到低）：
1. `.env.[mode].local`
2. `.env.[mode]`
3. `.env.local`
4. `.env`

### 构建命令

```bash
# 开发模式（加载 .env.development）
npm run dev

# 生产构建（加载 .env.production）
npm run build

# 预览生产构建
npm run preview

# 使用自定义模式
vite build --mode staging  # 加载 .env.staging
```

## 安全注意事项

### 1. 不要暴露敏感信息

**❌ 错误示例：**
```env
# 不要在前端环境变量中存储敏感信息！
VITE_API_SECRET_KEY=secret-key-123
VITE_DATABASE_PASSWORD=password123
```

**✅ 正确做法：**
- 敏感信息应该存储在后端环境变量中
- 前端只存储公开的配置信息

### 2. 环境变量会被打包到客户端代码

所有以 `VITE_` 开头的环境变量都会被打包到最终的 JavaScript 文件中，任何人都可以在浏览器中查看。

### 3. 使用 .gitignore

确保 `.env.local` 和 `.env.*.local` 文件被添加到 `.gitignore`：

```gitignore
# 本地环境变量文件
.env.local
.env.*.local
```

### 4. 验证环境变量

在应用启动时验证必需的环境变量：

```typescript
// src/utils/validateEnv.ts
export function validateEnv() {
  const requiredEnvVars = [
    'VITE_API_BASE_URL',
    'VITE_APP_ENV',
  ];

  const missingVars = requiredEnvVars.filter(
    (varName) => !import.meta.env[varName]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `缺少必需的环境变量: ${missingVars.join(', ')}`
    );
  }
}

// 在 main.tsx 中调用
validateEnv();
```

## 故障排查

### 常见问题

1. **环境变量未生效**
   - 确保变量名以 `VITE_` 开头
   - 修改 `.env` 文件后需要重启开发服务器
   - 检查是否在正确的环境文件中配置

2. **环境变量值为 undefined**
   - 检查变量名拼写是否正确
   - 确认变量已在 `.env` 文件中定义
   - 使用 `console.log(import.meta.env)` 查看所有可用的环境变量

3. **生产构建后环境变量不正确**
   - 确保使用了正确的构建命令
   - 检查 `.env.production` 文件是否存在
   - 清除构建缓存后重新构建

### 调试技巧

1. **查看所有环境变量：**
   ```typescript
   console.log('所有环境变量:', import.meta.env);
   ```

2. **检查特定变量：**
   ```typescript
   console.log('API URL:', import.meta.env.VITE_API_BASE_URL);
   console.log('环境:', import.meta.env.MODE);
   console.log('是否生产:', import.meta.env.PROD);
   ```

3. **在构建时输出环境变量：**
   ```typescript
   // vite.config.ts
   export default defineConfig({
     define: {
       __APP_ENV__: JSON.stringify(process.env.VITE_APP_ENV),
     },
   });
   ```

## 最佳实践

1. **使用类型安全的配置类**
   - 创建统一的配置访问接口
   - 提供类型检查和默认值

2. **环境隔离**
   - 为不同环境创建独立的配置文件
   - 不要在开发环境使用生产 API

3. **文档化配置**
   - 在 `.env.example` 中提供所有配置项的示例
   - 为每个配置项添加注释说明

4. **版本控制**
   - 提交 `.env.example` 到版本控制
   - 不要提交包含实际值的 `.env` 文件

5. **CI/CD 集成**
   - 在 CI/CD 流程中注入环境变量
   - 使用密钥管理服务存储敏感配置

## 参考资源

- [Vite 环境变量文档](https://vitejs.dev/guide/env-and-mode.html)
- [TypeScript 环境变量类型](https://vitejs.dev/guide/env-and-mode.html#intellisense-for-typescript)
