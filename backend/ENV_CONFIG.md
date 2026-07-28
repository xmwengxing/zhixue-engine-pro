# 环境变量配置指南

本文档详细说明了智能提分训练平台后端服务所需的所有环境变量配置。

## 快速开始

1. 复制示例配置文件：
```bash
cp .env.example .env
```

2. 根据您的环境修改 `.env` 文件中的配置

3. 启动服务器（会自动验证环境变量）：
```bash
npm run dev
```

## 必需的环境变量

以下环境变量是系统运行所必需的，缺少任何一个都会导致服务器启动失败。

### 服务器配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `PORT` | 服务器监听端口 | `3000` | - |
| `NODE_ENV` | 运行环境 | `development` / `staging` / `production` | - |
| `CORS_ORIGIN` | 允许的跨域来源 | `http://localhost:5173` | - |

### 数据库配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://user:pass@localhost:5432/db` | - |
| `DB_POOL_MIN` | 数据库连接池最小连接数 | `2` | `2` |
| `DB_POOL_MAX` | 数据库连接池最大连接数 | `10` | `10` |

**数据库连接字符串格式：**
```
postgresql://用户名:密码@主机:端口/数据库名?schema=public
```

### Redis 配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `REDIS_HOST` | Redis 主机地址 | `localhost` | - |
| `REDIS_PORT` | Redis 端口 | `6379` | - |
| `REDIS_PASSWORD` | Redis 密码（可选） | `your-password` | - |
| `REDIS_DB` | Redis 数据库编号 | `0` | `0` |
| `REDIS_DEFAULT_TTL` | 默认缓存过期时间（秒） | `3600` | `3600` |

### JWT 配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `JWT_SECRET` | JWT 签名密钥（至少 32 字符） | `your-secret-key-min-32-chars` | - |
| `JWT_EXPIRES_IN` | JWT 过期时间 | `7d` | - |
| `JWT_REFRESH_SECRET` | JWT 刷新令牌密钥（至少 32 字符） | `your-refresh-secret-min-32-chars` | - |
| `JWT_REFRESH_EXPIRES_IN` | JWT 刷新令牌过期时间 | `30d` | - |

**生成强密钥的方法：**
```bash
# 使用 OpenSSL 生成 32 字节的 Base64 编码密钥
openssl rand -base64 32
```

**⚠️ 安全警告：** 生产环境必须使用强密钥，不能使用示例中的默认值！

## 可选的环境变量

以下环境变量是可选的，但建议在生产环境中配置。

### AI 服务配置

#### OpenAI 配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `OPENAI_API_KEY` | OpenAI API 密钥 | `sk-...` | - |
| `OPENAI_API_BASE_URL` | OpenAI API 基础 URL | `https://api.openai.com/v1` | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | 使用的模型 | `gpt-4` | `gpt-4` |
| `OPENAI_MAX_TOKENS` | 最大生成 Token 数 | `2000` | `2000` |
| `OPENAI_TEMPERATURE` | 生成温度（0-2） | `0.7` | `0.7` |

#### Claude 配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `CLAUDE_API_KEY` | Claude API 密钥 | `sk-ant-...` | - |
| `CLAUDE_API_BASE_URL` | Claude API 基础 URL | `https://api.anthropic.com` | `https://api.anthropic.com` |
| `CLAUDE_MODEL` | 使用的模型 | `claude-3-sonnet-20240229` | `claude-3-sonnet-20240229` |
| `CLAUDE_MAX_TOKENS` | 最大生成 Token 数 | `2000` | `2000` |

#### AI 服务通用配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `AI_REQUEST_TIMEOUT` | AI 请求超时时间（毫秒） | `30000` | `30000` |
| `AI_MAX_RETRIES` | AI 请求最大重试次数 | `3` | `3` |
| `AI_RATE_LIMIT_PER_MINUTE` | 每分钟最大 AI 请求数 | `60` | `60` |

**注意：** 至少需要配置一个 AI 服务（OpenAI 或 Claude），否则 AI 功能将不可用。

### 文件上传配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `UPLOAD_MAX_FILE_SIZE` | 最大文件大小（字节） | `10485760` (10MB) | `10485760` |
| `UPLOAD_ALLOWED_TYPES` | 允许的文件类型 | `image/jpeg,image/png,image/gif` | `image/jpeg,image/png,image/gif,application/pdf` |
| `UPLOAD_DEST` | 文件上传目录 | `./uploads` | `./uploads` |

### 日志配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `LOG_LEVEL` | 日志级别 | `info` / `debug` / `warn` / `error` | `info` |
| `LOG_FILE_PATH` | 日志文件路径 | `./logs` | `./logs` |
| `LOG_MAX_FILES` | 日志文件保留天数 | `14` | `14` |
| `LOG_MAX_SIZE` | 单个日志文件最大大小 | `20m` | `20m` |

### 安全配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `BCRYPT_ROUNDS` | 密码加密轮次（10-15） | `10` | `10` |
| `SESSION_SECRET` | 会话密钥 | `your-session-secret` | - |
| `RATE_LIMIT_WINDOW_MS` | 限流时间窗口（毫秒） | `900000` (15分钟) | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | 时间窗口内最大请求数 | `100` | `100` |

**注意：** `SESSION_SECRET` 在生产环境中是必需的。

### 邮件配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `SMTP_HOST` | SMTP 服务器地址 | `smtp.example.com` | - |
| `SMTP_PORT` | SMTP 端口 | `587` | - |
| `SMTP_SECURE` | 是否使用 SSL/TLS | `false` | `false` |
| `SMTP_USER` | SMTP 用户名 | `your-email@example.com` | - |
| `SMTP_PASSWORD` | SMTP 密码 | `your-password` | - |
| `SMTP_FROM` | 发件人地址 | `noreply@example.com` | - |

### 通知配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `NOTIFICATION_ENABLED` | 是否启用通知 | `true` / `false` | `true` |
| `NOTIFICATION_WEBHOOK_URL` | 通知 Webhook URL | `https://hooks.example.com/...` | - |

### 监控配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `SENTRY_DSN` | Sentry DSN | `https://...@sentry.io/...` | - |
| `SENTRY_ENVIRONMENT` | Sentry 环境标识 | `production` | `NODE_ENV` 的值 |

**注意：** `SENTRY_DSN` 在生产环境中强烈建议配置，用于错误追踪。

### 其他配置

| 变量名 | 说明 | 示例值 | 默认值 |
|--------|------|--------|--------|
| `APP_BASE_URL` | 应用基础 URL | `http://localhost:3000` | `http://localhost:3000` |
| `FRONTEND_URL` | 前端应用 URL | `http://localhost:5173` | `http://localhost:5173` |
| `API_VERSION` | API 版本 | `v1` | `v1` |

## 环境特定配置

### 开发环境（development）

开发环境配置示例：

```env
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173

DATABASE_URL="postgresql://postgres:password@localhost:5432/training_platform?schema=public"

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_SECRET=dev-secret-key-at-least-32-characters-long
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=dev-refresh-secret-key-at-least-32-characters
JWT_REFRESH_EXPIRES_IN=30d

LOG_LEVEL=debug
```

### 生产环境（production）

生产环境额外要求：

1. **必须配置的环境变量：**
   - `SESSION_SECRET`
   - `SENTRY_DSN`（强烈建议）

2. **安全要求：**
   - JWT 密钥必须使用强密钥（至少 32 字符）
   - 不能使用包含 "your-secret-key" 的默认值
   - 建议配置 HTTPS
   - 建议启用 Sentry 错误追踪

3. **性能优化：**
   - 配置 Redis 缓存
   - 调整数据库连接池大小
   - 配置 CDN（如果需要）

生产环境配置示例：

```env
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://your-domain.com

DATABASE_URL="postgresql://user:strong-password@db-host:5432/training_platform?schema=public"
DB_POOL_MIN=5
DB_POOL_MAX=20

REDIS_HOST=redis-host
REDIS_PORT=6379
REDIS_PASSWORD=redis-strong-password

JWT_SECRET=<使用 openssl rand -base64 32 生成>
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=<使用 openssl rand -base64 32 生成>
JWT_REFRESH_EXPIRES_IN=30d

SESSION_SECRET=<使用 openssl rand -base64 32 生成>

OPENAI_API_KEY=sk-your-real-openai-key
CLAUDE_API_KEY=sk-ant-your-real-claude-key

SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=production

LOG_LEVEL=info
BCRYPT_ROUNDS=12
```

## 环境变量验证

服务器启动时会自动验证环境变量：

1. **检查必需变量：** 确保所有必需的环境变量都已配置
2. **验证格式：** 验证环境变量的值是否符合预期格式
3. **安全检查：** 在生产环境检查是否使用了默认密钥
4. **输出警告：** 对于可选但建议配置的变量，输出警告信息

如果验证失败，服务器将拒绝启动并输出详细的错误信息。

## 故障排查

### 常见错误

1. **缺少必需的环境变量**
   ```
   ❌ 环境变量验证失败:
     - 缺少必需的环境变量: JWT_SECRET
   ```
   **解决方法：** 在 `.env` 文件中添加缺失的环境变量

2. **环境变量值无效**
   ```
   ❌ 环境变量验证失败:
     - 环境变量 PORT 的值无效: abc
   ```
   **解决方法：** 检查环境变量的值是否符合要求（如端口号必须是数字）

3. **生产环境使用默认密钥**
   ```
   ❌ 环境变量验证失败:
     - 生产环境不能使用默认的 JWT 密钥，请更换为强密钥
   ```
   **解决方法：** 使用 `openssl rand -base64 32` 生成强密钥

4. **数据库连接失败**
   ```
   ❌ 环境变量验证失败:
     - 环境变量 DATABASE_URL 的值无效
   ```
   **解决方法：** 检查数据库连接字符串格式是否正确

### 调试技巧

1. **查看环境配置信息：**
   服务器启动时会输出环境配置信息（敏感信息已隐藏）

2. **启用调试日志：**
   ```env
   LOG_LEVEL=debug
   ```

3. **测试数据库连接：**
   ```bash
   npm run test:db
   ```

4. **测试 Redis 连接：**
   ```bash
   npm run test:redis
   ```

## 最佳实践

1. **不要提交 `.env` 文件到版本控制**
   - `.env` 文件包含敏感信息，应该添加到 `.gitignore`
   - 只提交 `.env.example` 作为配置模板

2. **使用强密钥**
   - 所有密钥至少 32 字符
   - 使用随机生成的密钥，不要使用可预测的字符串

3. **定期轮换密钥**
   - 定期更换 JWT 密钥和其他敏感密钥
   - 更换密钥后需要重新登录所有用户

4. **环境隔离**
   - 开发、测试、生产环境使用不同的配置
   - 不要在开发环境使用生产数据库

5. **使用环境变量管理工具**
   - 考虑使用 AWS Secrets Manager、HashiCorp Vault 等工具管理敏感配置
   - 在 CI/CD 流程中使用环境变量注入

## 参考资源

- [dotenv 文档](https://github.com/motdotla/dotenv)
- [PostgreSQL 连接字符串](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING)
- [JWT 最佳实践](https://tools.ietf.org/html/rfc8725)
- [OpenAI API 文档](https://platform.openai.com/docs/api-reference)
- [Claude API 文档](https://docs.anthropic.com/claude/reference)
