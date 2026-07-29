# 智学引擎 Pro（zhixue-engine-pro）

> 中小学智能提分训练引擎 —— 面向管理员 / 家长 / 学员三端的 AI 驱动个性化学习训练平台

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 📖 项目简介

智学引擎 Pro 是一个基于大语言模型的中小学智能训练平台。系统围绕「学情诊断 → 智能选题 → 训练舱对话辅导 → 报告生成 → 学情档案沉淀」的完整闭环，为学员提供个性化提分训练，为家长提供任务配置与学情监督工具，为管理员提供教材体系、题库与 AI 平台的全面管理能力。

### 核心功能

**学员端**
- 🚀 **AI 训练舱**：苏格拉底式对话辅导，基于 L1-L6 分层上下文（智能体文档 / 学情摘要 / 学生记忆 / 会话历史等）动态装配提示词
- ✍️ **电子答题专区**：在线作答、公式作答支持（LaTeX 等价性校验）
- 📊 **学情总览**：知识点掌握度、薄弱点 TOP5、能力趋势（IRT 能力值）
- 🏆 **积分商城**：训练获得积分并兑换奖励
- 📝 **错题本**：错题自动归集与再训练

**家长端**
- 🎯 **任务配置中心**：支持三种任务模式 —— 学情档案驱动（PROFILE）、自定义（CUSTOM）、真题试卷（EXAM_PAPER）
- 📈 **任务报告中心**：学科主线 / 专项训练双区报告，按学科筛选
- 👀 **孩子学情与记忆查看**：只读查看 AI 为孩子沉淀的学习记忆与学情档案

**管理员端**
- 📚 **教材体系管理**：学科 / 教材版本 / 年级 / 单元 / 知识点树维护
- 🗂️ **题库管理**：题目录入、批量导入（Word/PDF 解析）、AI 难度分级
- 🤖 **智能体平台配置**：智能体文档（Prompt 文档）版本化管理、启停控制
- 🔌 **AI 服务商管理**：多服务商配置（OpenAI 协议兼容 / Claude），支持优先级与故障切换，兼容推理模型（reasoning model）
- 👥 **用户与学号管理**：账户、亲子关系维护

## 🏗️ 技术架构

```
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│   前端 (React)   │────▶│   后端 API (Express)  │────▶│  PostgreSQL 15   │
│  Vite + TS      │     │  Node.js + Prisma    │     ├──────────────────┤
│  Tailwind CSS   │     │  JWT 认证 / RBAC      │     │  Redis 7 (可选)   │
└─────────────────┘     └──────┬───────────────┘     └──────────────────┘
                               │
                ┌──────────────┼──────────────────┐
                ▼              ▼                  ▼
        ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐
        │ 大模型服务商   │ │ 公式校验微服务 │ │  BullMQ 任务队列     │
        │ (OpenAI 协议  │ │ Python+sympy │ │  (报告生成等异步任务) │
        │  / Claude)   │ │ FastAPI:8001 │ └────────────────────┘
        └──────────────┘ └──────────────┘
```

### 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · TypeScript · Vite · Tailwind CSS · Zustand · React Router 7 · Recharts · Axios |
| 后端 | Node.js 22 · Express 4 · TypeScript · Prisma ORM · Zod · Winston · BullMQ |
| 数据库 | PostgreSQL 15（主库）· Redis 7（缓存/队列，可选） |
| AI 接入 | OpenAI 协议兼容服务商 / Anthropic Claude，配置存储于数据库 `AIProvider` 表，支持多服务商优先级与推理模型兜底 |
| 公式校验 | Python 3.13 · FastAPI · sympy（LaTeX 代数/数值等价判断） |
| 测试 | Vitest · Supertest · Testing Library · fast-check |
| 部署 | Docker Compose · Nginx |

## 📁 目录结构

```
zhixue-engine-pro/
├── backend/                 # 后端服务
│   ├── prisma/              # Prisma schema 与数据库迁移
│   ├── src/
│   │   ├── controllers/     # 路由控制器（admin / parent / student）
│   │   ├── services/        # 业务服务（选题、训练、报告、记忆、上下文装配等）
│   │   ├── routes/          # Express 路由
│   │   └── scripts/         # 种子数据等内置脚本
│   ├── scripts/             # 运维/回归脚本（冒烟测试、数据迁移、AI 配置）
│   └── .env.example         # 环境变量模板
├── frontend/                # 前端应用
│   └── src/
│       ├── pages/           # 页面（admin / parent / student 三端）
│       ├── components/      # 通用组件
│       ├── services/        # API 封装
│       └── utils/           # 请求拦截器等工具
├── services/
│   └── formula-verify/      # 公式等价校验微服务（Python + sympy）
├── nginx/                   # Nginx 反向代理配置
├── docs/                    # 项目文档（部署指南、操作手册、开发方案等）
├── docker-compose.yml       # 开发/演示环境编排
└── docker-compose.prod.yml  # 生产环境编排
```

## 🚀 快速开始（本地开发）

### 环境要求

- Node.js ≥ 20（推荐 22）
- PostgreSQL ≥ 14（推荐 15）
- Redis ≥ 6（可选，用于缓存与异步队列）
- Python ≥ 3.11（可选，仅公式校验微服务需要）

### 1. 克隆仓库

```bash
git clone https://github.com/xmwengxing/zhixue-engine-pro.git
cd zhixue-engine-pro
```

### 2. 启动后端

```bash
cd backend
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，至少修改 DATABASE_URL 为你的 PostgreSQL 连接串

# 初始化数据库（生成客户端 + 执行迁移）
npm run db:generate
npm run db:migrate

# 灌入测试种子数据（测试账户、示例教材等）
npm run db:seed
# 可选：灌入教材与真题试卷数据
node scripts/seed-textbooks-papers.mjs
# 可选：灌入智能体文档（训练舱 Prompt 文档）
npx tsx scripts/seed-agent-docs.ts

# 启动开发服务（默认 http://localhost:3000）
npm run dev
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
# 默认 http://localhost:5173
```

### 4. 启动公式校验微服务（可选）

仅在需要「电子答题专区」公式批改能力时启动：

```bash
cd services/formula-verify
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001
```

### 5. 配置 AI 服务商

平台的大模型配置存储在数据库 `AIProvider` 表中（而非 .env），有两种配置方式：

- **管理后台（推荐）**：以管理员身份登录 → 「AI 服务商管理」→ 新增服务商（支持 OpenAI 协议兼容端点与 Claude），保存后可在线验证连通性。
- **脚本方式**（本地回归测试用）：

```bash
cd backend
TEST_AI_API_KEY=sk-xxx TEST_AI_ENDPOINT=https://your-endpoint/v1 TEST_AI_MODEL=your-model \
  npx tsx scripts/configure-test-ai-provider.ts
```

> 💡 平台已适配推理模型（reasoning model）：当返回的 `content` 为空时自动兜底读取 `reasoning` 字段，并进行单次放大 max_tokens 重试。

### 测试账户

种子数据内置以下账户（详见 `docs/2.测试账户信息.md`）：

| 角色 | 用户名 | 密码 |
|---|---|---|
| 管理员 | admin | password123 |
| 家长 | parent1 | password123 |
| 学员 | student1 | password123 |

## 🐳 Docker 部署

项目提供开箱即用的 Docker Compose 编排（PostgreSQL + Redis + 后端 + 前端 + 可选 Nginx）：

```bash
# 在项目根目录，按需设置环境变量（生产环境务必修改 JWT 密钥）
export JWT_SECRET=$(openssl rand -base64 32)
export JWT_REFRESH_SECRET=$(openssl rand -base64 32)

# 构建并启动全部服务
docker compose up -d --build

# 查看服务状态
docker compose ps
```

启动后访问：

| 服务 | 地址 |
|---|---|
| 前端应用 | http://localhost |
| 后端 API | http://localhost:3000 |
| Nginx 统一入口（可选 profile） | http://localhost:8080 |

启用 Nginx 反向代理：

```bash
docker compose --profile with-nginx up -d
```

生产环境部署请使用 `docker-compose.prod.yml`，并参考：

- `docs/4.Docker 部署指南.md`
- `docs/5.生成环境部署指南.md`
- `docs/智能训练平台部署检查清单.md`
- `docs/6.CICD 配置指南.md`

## 🧪 测试与质量

```bash
# 后端
cd backend
npm run test              # 单元 + 集成测试
npm run test:coverage     # 覆盖率报告
npm run type-check        # TypeScript 类型检查
npm run lint              # ESLint

# 前端
cd frontend
npm run test
npm run type-check
npm run lint
```

回归冒烟脚本（位于 `backend/scripts/`，需后端服务运行中）：

```bash
npx tsx scripts/smoke-p6-http.ts    # HTTP 级：智能体文档 CRUD + 家长只读记忆
npx tsx scripts/smoke-p6-llm.ts     # 真实 LLM 链路：记忆归纳 + 分层上下文对话
node scripts/smoke-answer-zone.mjs  # 电子答题专区
node scripts/smoke-exam-paper.mjs   # 真题试卷任务
```

## 📚 文档索引

`docs/` 目录包含完整的项目文档，重点包括：

| 文档 | 说明 |
|---|---|
| `1.项目初始化说明.md` | 项目背景与初始化步骤 |
| `3.开发环境部署指南.md` | 本地开发环境搭建细节 |
| `4.Docker 部署指南.md` / `5.生成环境部署指南.md` | 容器化与生产部署 |
| `7.管理员操作手册.md` / `8.家长使用指南.md` / `9.学员使用指南.md` | 三端用户手册 |
| `API文档.md` | 后端接口文档 |
| `AI服务商配置指南.md` | 大模型服务商接入说明 |
| `任务体系与训练舱智能体平台改造方案.md` | 智能体平台架构设计 |
| `题库与电子答题专区实施计划.md` | 题库与答题专区方案 |

## 🔐 安全说明

- 密码使用 bcrypt 加密存储；认证采用 JWT（Access + Refresh 双令牌）
- 大模型 API Key 仅存储于数据库 `AIProvider` 表，请勿硬编码到代码或提交到仓库
- 生产环境务必更换 `.env` / 环境变量中的所有默认密钥（`JWT_SECRET`、`SESSION_SECRET`、数据库密码等）

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。
