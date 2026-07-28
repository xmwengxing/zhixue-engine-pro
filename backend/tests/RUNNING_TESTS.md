# 运行集成测试指南

## 快速开始

### 1. 准备测试环境

在运行集成测试之前，需要确保以下服务正在运行：

```bash
# 启动 PostgreSQL 和 Redis（使用 Docker Compose）
docker-compose up -d postgres redis
```

### 2. 创建测试数据库

```bash
# 创建测试数据库
createdb training_platform_test

# 或使用 psql
psql -U postgres -c "CREATE DATABASE training_platform_test;"
```

### 3. 运行数据库迁移

```bash
cd backend

# 使用测试环境变量
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/training_platform_test"

# 运行迁移
npx prisma migrate deploy
```

### 4. 启动后端服务

```bash
# 在一个终端窗口中启动后端服务
cd backend
npm run dev
```

### 5. 运行集成测试

```bash
# 在另一个终端窗口中运行测试
cd backend
npm run test
```

## 详细步骤

### 环境变量配置

创建或更新 `backend/.env.test` 文件：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/training_platform_test"
API_BASE_URL="http://localhost:3000"
JWT_SECRET="test_jwt_secret_key"
```

### 运行特定测试套件

```bash
# 只运行认证测试
npm run test tests/integration/auth.integration.test.ts

# 只运行任务流程测试
npm run test tests/integration/task-flow.integration.test.ts

# 只运行愿望流程测试
npm run test tests/integration/wish-flow.integration.test.ts

# 只运行错题流程测试
npm run test tests/integration/error-book-flow.integration.test.ts
```

### 调试模式

```bash
# 使用详细输出运行测试
npm run test -- --reporter=verbose

# 只运行失败的测试
npm run test -- --reporter=verbose --bail
```

## 常见问题

### 问题 1: 数据库连接失败

**错误信息:**
```
Error: Can't reach database server at `localhost:5432`
```

**解决方案:**
1. 确保 PostgreSQL 正在运行
2. 检查数据库连接字符串是否正确
3. 验证数据库用户权限

```bash
# 检查 PostgreSQL 状态
docker ps | grep postgres

# 或
pg_isready -h localhost -p 5432
```

### 问题 2: 后端服务未启动

**错误信息:**
```
Error: connect ECONNREFUSED 127.0.0.1:3000
```

**解决方案:**
1. 确保后端服务正在运行
2. 检查端口 3000 是否被占用

```bash
# 检查端口占用
netstat -ano | findstr :3000

# 或启动后端服务
cd backend
npm run dev
```

### 问题 3: 测试数据未清理

**症状:** 测试失败，提示数据已存在

**解决方案:**
手动清理测试数据库：

```bash
# 连接到测试数据库
psql -U postgres -d training_platform_test

# 清理所有表
TRUNCATE TABLE "User", "AuthCode", "StudentProfile", "Task", "TrainingSession" CASCADE;
```

### 问题 4: JWT 密钥不匹配

**错误信息:**
```
Error: invalid signature
```

**解决方案:**
确保测试环境和后端服务使用相同的 JWT_SECRET：

```bash
# 在 .env 和 .env.test 中使用相同的密钥
JWT_SECRET="test_jwt_secret_key"
```

## 测试覆盖率

查看测试覆盖率报告：

```bash
# 运行测试并生成覆盖率报告
npm run test -- --coverage

# 查看 HTML 报告
# 报告位于: backend/coverage/index.html
```

## CI/CD 集成

在 CI/CD 环境中运行测试：

```yaml
# GitHub Actions 示例
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: training_platform_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd backend
          npm ci
      
      - name: Run migrations
        run: |
          cd backend
          npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/training_platform_test
      
      - name: Start backend server
        run: |
          cd backend
          npm run dev &
          sleep 10
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/training_platform_test
          JWT_SECRET: test_jwt_secret_key
      
      - name: Run integration tests
        run: |
          cd backend
          npm run test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/training_platform_test
          API_BASE_URL: http://localhost:3000
          JWT_SECRET: test_jwt_secret_key
```

## 最佳实践

### 1. 测试隔离

每个测试套件应该：
- 创建自己的测试数据
- 在测试结束后清理数据
- 不依赖其他测试的状态

### 2. 使用唯一标识符

使用时间戳或 UUID 确保测试数据不冲突：

```typescript
const testUsername = `test_user_${Date.now()}`;
```

### 3. 合理的超时设置

集成测试可能需要更长的超时时间：

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    testTimeout: 30000, // 30 秒
    hookTimeout: 30000,
  },
});
```

### 4. 错误处理

使用 `validateStatus: () => true` 避免 axios 自动抛出错误：

```typescript
const api = axios.create({
  baseURL: API_BASE_URL,
  validateStatus: () => true, // 不自动抛出错误
});
```

### 5. 断言清晰

使用清晰的断言消息：

```typescript
expect(response.status).toBe(200); // 清晰
expect(response.data.user.role).toBe('student'); // 具体
```

## 性能优化

### 并行运行测试

```bash
# 使用多个工作进程
npm run test -- --threads
```

### 跳过慢速测试

```typescript
it.skip('这是一个慢速测试', async () => {
  // 测试代码
});
```

### 使用测试数据库快照

```bash
# 创建快照
pg_dump training_platform_test > test_snapshot.sql

# 恢复快照
psql training_platform_test < test_snapshot.sql
```

## 维护建议

1. **定期更新测试**: 当 API 变更时，及时更新集成测试
2. **监控测试时间**: 如果测试变慢，考虑优化或拆分
3. **保持测试简洁**: 每个测试应该只验证一个业务流程
4. **文档化测试**: 添加清晰的注释说明测试目的

## 相关资源

- [Vitest 文档](https://vitest.dev/)
- [Prisma 测试指南](https://www.prisma.io/docs/guides/testing)
- [Axios 文档](https://axios-http.com/docs/intro)
