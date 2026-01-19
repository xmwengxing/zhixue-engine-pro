# 智能提分训练平台 - 后端服务

基于 Node.js + Express + TypeScript 的后端 API 服务。

## 技术栈

- **框架**: Express.js
- **语言**: TypeScript
- **数据库**: PostgreSQL (通过 Prisma ORM)
- **缓存**: Redis
- **认证**: JWT
- **日志**: Winston
- **测试**: Vitest + fast-check

## 项目结构

```
backend/
├── src/
│   ├── index.ts              # 应用入口
│   ├── config/               # 配置文件
│   ├── middlewares/          # 中间件
│   ├── routes/               # 路由
│   ├── controllers/          # 控制器
│   ├── services/             # 业务逻辑
│   ├── models/               # 数据模型
│   ├── utils/                # 工具函数
│   └── types/                # TypeScript 类型定义
├── prisma/
│   └── schema.prisma         # Prisma 数据库模型
├── tests/                    # 测试文件
└── package.json
```

## 开发指南

### 安装依赖

```bash
npm install
```

### 环境配置

复制 `.env.example` 为 `.env` 并配置环境变量：

```bash
cp .env.example .env
```

### 数据库迁移

```bash
# 生成 Prisma Client
npx prisma generate

# 运行数据库迁移
npx prisma migrate dev
```

### 启动开发服务器

```bash
npm run dev
```

### 代码检查和格式化

```bash
# ESLint 检查
npm run lint

# Prettier 格式化
npm run format
```

### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch
```

## API 文档

API 文档将在后续通过 Swagger 生成。

## 许可证

MIT
