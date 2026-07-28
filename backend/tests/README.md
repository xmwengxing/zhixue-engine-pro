# 集成测试文档

## 概述

本目录包含智能提分训练平台的集成测试套件。集成测试验证多个组件协同工作的正确性，覆盖关键业务流程。

## 测试文件结构

```
tests/
├── integration/
│   ├── auth.integration.test.ts           # 用户认证流程测试
│   ├── task-flow.integration.test.ts      # 任务创建和完成流程测试
│   ├── wish-flow.integration.test.ts      # 愿望提交和审批流程测试
│   └── error-book-flow.integration.test.ts # 错题收集和重做流程测试
├── setup.ts                                # 测试环境设置
└── README.md                               # 本文档
```

## 测试覆盖范围

### 1. 用户认证流程测试 (auth.integration.test.ts)

**验证需求:** 1.2, 1.3

**测试场景:**
- 完整的注册流程（使用授权码）
- 完整的登录流程（获取 JWT token）
- 使用 token 访问受保护资源
- 拒绝无效 token 的访问
- 拒绝重复使用授权码注册
- 拒绝错误的登录凭证

### 2. 任务创建和完成流程测试 (task-flow.integration.test.ts)

**验证需求:** 7.4, 11.2, 18.1

**测试场景:**
- 家长创建学习任务
- 学员开始训练会话
- 学员提交答案
- 任务完成后自动生成报告
- 家长查看学习报告

### 3. 愿望提交和审批流程测试 (wish-flow.integration.test.ts)

**验证需求:** 14.3, 9.3

**测试场景:**
- 学员提交愿望申请
- 家长查看待审批愿望
- 家长同意愿望时正确扣除积分
- 家长拒绝愿望时保留积分
- 记录审批操作的审计信息

### 4. 错题收集和重做流程测试 (error-book-flow.integration.test.ts)

**验证需求:** 13.1, 13.4

**测试场景:**
- 答错题目时自动收集到错题本
- 学员查看错题本
- 学员重做错题
- 正确完成重做时更新掌握度并奖励积分
- 按掌握度筛选错题

## 运行测试

### 前置条件

1. 确保数据库已启动并可访问
2. 确保后端服务已启动（默认端口 3000）
3. 确保环境变量已正确配置

### 运行所有集成测试

```bash
cd backend
npm run test
```

### 运行特定测试文件

```bash
# 运行认证流程测试
npm run test tests/integration/auth.integration.test.ts

# 运行任务流程测试
npm run test tests/integration/task-flow.integration.test.ts

# 运行愿望流程测试
npm run test tests/integration/wish-flow.integration.test.ts

# 运行错题流程测试
npm run test tests/integration/error-book-flow.integration.test.ts
```

### 监听模式运行测试

```bash
npm run test:watch
```

## 环境配置

集成测试需要以下环境变量：

```env
# 数据库连接
DATABASE_URL="postgresql://user:password@localhost:5432/training_platform_test"

# API 基础 URL
API_BASE_URL="http://localhost:3000"

# JWT 密钥
JWT_SECRET="test_secret_key"
```

## 测试数据管理

### 数据隔离

每个测试套件都会：
1. 在 `beforeAll` 中创建测试所需的数据
2. 在 `afterAll` 中清理所有测试数据
3. 使用唯一的时间戳确保数据不冲突

### 数据清理

测试完成后会自动清理以下数据：
- 测试用户账户
- 测试任务和会话
- 测试愿望和积分记录
- 测试错题记录
- 测试教材节点和题目

## 注意事项

### 1. 测试顺序

集成测试中的测试用例有依赖关系，应按顺序执行。例如：
- 必须先注册才能登录
- 必须先登录才能访问受保护资源
- 必须先创建任务才能开始训练

### 2. 异步操作

所有测试用例都使用 `async/await` 处理异步操作，确保操作完成后再进行断言。

### 3. 错误处理

测试使用 `validateStatus: () => true` 配置 axios，不会自动抛出错误，而是通过检查响应状态码来验证结果。

### 4. 数据库事务

某些测试涉及数据库事务（如积分扣除），测试会验证事务的原子性。

## 调试技巧

### 查看详细日志

```bash
DEBUG=* npm run test
```

### 单独运行失败的测试

```bash
npm run test -- --reporter=verbose tests/integration/auth.integration.test.ts
```

### 保留测试数据

如需保留测试数据进行调试，可以注释掉 `afterAll` 中的清理代码。

## 持续集成

这些集成测试应该在 CI/CD 流程中运行：

```yaml
# .github/workflows/test.yml 示例
- name: Run Integration Tests
  run: |
    npm run test
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
    API_BASE_URL: http://localhost:3000
```

## 扩展测试

添加新的集成测试时，请遵循以下规范：

1. 在 `tests/integration/` 目录下创建新文件
2. 文件命名格式：`<feature>-flow.integration.test.ts`
3. 包含详细的测试描述和验证需求注释
4. 确保测试数据在 `afterAll` 中被清理
5. 使用有意义的测试用例名称
6. 添加适当的断言验证业务逻辑

## 相关文档

- [需求文档](../../.kiro/specs/intelligent-training-platform/requirements.md)
- [设计文档](../../.kiro/specs/intelligent-training-platform/design.md)
- [任务列表](../../.kiro/specs/intelligent-training-platform/tasks.md)
