# 智能提分训练平台

一个基于 AI 驱动的个性化学习平台，为中小学生提供智能化的学习训练、错题管理和激励系统。

## 技术栈

### 前端
- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand (状态管理)
- React Router
- Axios

### 后端
- Node.js + Express + TypeScript
- PostgreSQL
- Prisma ORM
- JWT 认证
- Redis 缓存

## 项目结构

```
.
├── frontend/          # 前端应用
├── backend/           # 后端应用
├── docker-compose.yml # Docker 配置
└── README.md
```

## 快速开始

### 前置要求

- Node.js >= 18
- Docker & Docker Compose
- pnpm (推荐) 或 npm

### 安装依赖

```bash
# 前端
cd frontend
pnpm install

# 后端
cd backend
pnpm install
```

### 启动开发环境

```bash
# 启动数据库服务
docker-compose up -d

# 启动后端
cd backend
pnpm dev

# 启动前端
cd frontend
pnpm dev
```

## 开发指南

详见各子项目的 README 文件：
- [前端开发指南](./frontend/README.md)
- [后端开发指南](./backend/README.md)

## 许可证

MIT
