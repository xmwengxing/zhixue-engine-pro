# 集成测试说明

## 概述

本目录包含系统优化第一阶段的集成测试，用于验证完整的业务流程和功能模块。

## 测试文件

### 1. registration-flow.integration.test.ts
**测试完整注册流程**
- 家长注册流程（不需要授权码）
- 学员注册流程（需要授权码）
- 学号生成验证
- 验证需求: 1.1-1.9, 2.1-2.7

### 2. parent-add-student-flow.integration.test.ts
**测试家长添加学员流程**
- 完整添加学员流程
- 亲子绑定验证
- 学号生成验证
- 验证需求: 7.1-7.7

### 3. task-config-flow.integration.test.ts
**测试任务配置流程**
- 自定义配置模式
- 档案提取模式
- AI指令组装验证
- 验证需求: 10.1-10.10

### 4. admin-functions.integration.test.ts
**测试管理员功能**
- 用户CRUD操作
- 亲子关系管理
- 教材批量导入
- 验证需求: 5.1-5.9, 8.1-8.7, 9.1-9.10

## 运行测试

### 前置条件

1. 确保数据库已启动并配置正确
2. 确保后端服务器正在运行（或测试会自动连接到配置的API地址）
3. 配置环境变量：
   ```bash
   # .env.test 文件
   DATABASE_URL="postgresql://user:password@localhost:5432/test_db"
   API_BASE_URL="http://localhost:3000"
   JWT_SECRET="your-test-secret"
   ```

### 运行所有集成测试

```bash
cd backend
npm test -- --run tests/integration
```

### 运行单个测试文件

```bash
# 注册流程测试
npm test -- --run registration-flow.integration.test.ts

# 家长添加学员测试
npm test -- --run parent-add-student-flow.integration.test.ts

# 任务配置测试
npm test -- --run task-config-flow.integration.test.ts

# 管理员功能测试
npm test -- --run admin-functions.integration.test.ts
```

### 运行特定测试用例

```bash
# 使用 -t 参数指定测试名称
npm test -- --run registration-flow.integration.test.ts -t "家长注册"
```

## 测试数据清理

所有集成测试都会在测试结束后自动清理创建的测试数据，包括：
- 测试用户账户
- 学号记录
- 学员档案
- 亲子关系
- 授权码
- 任务记录
- 教材节点

## 注意事项

1. **数据库隔离**: 建议使用独立的测试数据库，避免影响开发或生产数据
2. **并发测试**: 某些测试可能会创建相同的资源，建议串行运行
3. **测试超时**: 集成测试可能需要较长时间，已配置30秒超时
4. **API可用性**: 确保后端API服务正常运行且可访问
5. **授权码**: 测试会自动创建所需的授权码，无需手动准备

## 故障排查

### 测试失败常见原因

1. **数据库连接失败**
   - 检查 DATABASE_URL 配置
   - 确保数据库服务正在运行
   - 验证数据库用户权限

2. **API连接失败**
   - 检查 API_BASE_URL 配置
   - 确保后端服务器正在运行
   - 检查端口是否被占用

3. **授权失败**
   - 检查 JWT_SECRET 配置
   - 确保管理员账户存在
   - 验证token生成逻辑

4. **数据验证失败**
   - 检查API响应格式是否与测试期望一致
   - 查看详细错误信息
   - 验证数据库schema是否最新

### 查看详细日志

```bash
# 运行测试并显示详细输出
npm test -- --run --reporter=verbose tests/integration
```

## 测试覆盖率

运行测试并生成覆盖率报告：

```bash
npm test -- --run --coverage tests/integration
```

覆盖率报告将生成在 `coverage/` 目录下。

## 持续集成

这些集成测试可以集成到CI/CD流程中：

```yaml
# .github/workflows/test.yml 示例
- name: Run Integration Tests
  run: |
    npm test -- --run tests/integration
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
    API_BASE_URL: http://localhost:3000
```

## 贡献指南

添加新的集成测试时，请遵循以下规范：

1. 使用描述性的测试名称
2. 在 beforeAll 中准备测试数据
3. 在 afterAll 中清理测试数据
4. 使用 describe 组织相关测试
5. 添加详细的注释说明测试目的
6. 引用相关的需求编号

## 相关文档

- [测试运行指南](../RUNNING_TESTS.md)
- [测试设置说明](../setup.ts)
- [需求文档](../../.kiro/specs/system-optimization-phase1/requirements.md)
- [设计文档](../../.kiro/specs/system-optimization-phase1/design.md)
