# 智学引擎 Pro（zhixue-engine-pro）

> 中小学智能提分训练引擎 —— 面向管理员 / 家长 / 学员三端的 AI 驱动个性化学习训练平台

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 📖 项目简介

基于大语言模型的中小学智能训练平台，围绕「学情诊断 → 智能选题 → 训练舱对话辅导 → 报告生成 → 学情档案沉淀」的完整闭环，为学员提供个性化提分训练，为家长提供任务配置与学情监督，为管理员提供教材体系、题库与 AI 平台的全面管理能力。

### 核心功能

**学员端**
- 🚀 **AI 训练舱**：苏格拉底式对话辅导，基于分层上下文（智能体文档 / 学情摘要 / 学生记忆 / 会话历史）动态装配提示词
- 🗣️ **单词训练**：先背后练（打字机背词 + 发音 + 短语），支持默写 / 听写 / 选择三种模式
- ✍️ **电子答题专区**：在线作答、公式作答（LaTeX 等价性校验）
- 📊 **学情总览**：知识点掌握度、薄弱点 TOP5、能力趋势（IRT）
- 🏆 **积分商城**：训练获得积分并兑换奖励 · 📝 **错题本**：错题自动归集与再训练

**家长端**
- 🎯 **任务配置中心**：学情档案驱动（PROFILE）/ 自定义（CUSTOM）/ 真题试卷（EXAM_PAPER）三种任务模式
- 📈 **任务报告中心**：学科主线 / 专项训练双区报告 · 👀 **孩子学情与记忆查看**

**管理员端**
- 📚 **教材体系管理**：学科 / 教材版本 / 年级 / 单元 / 知识点树
- 🗂️ **题库管理**：题目录入、批量导入（Word/PDF 解析）、试卷目录与分类、词库管理（初中/CET4 增删改）
- 🤖 **智能体平台配置**：Prompt 文档版本化管理 · 🔌 **AI 服务商管理**：多服务商优先级与故障切换
- 👥 **用户与学号管理**：账户、亲子关系维护

## 🏗️ 技术架构

```
┌─────────────┐    ┌─────────────────────┐    ┌───────────────┐
│ 前端 (React)│───▶│ 后端 API (Express)   │───▶│ PostgreSQL 15 │
│ Vite + TS   │    │ Node.js + Prisma    │    ├───────────────┤
│ Tailwind    │    │ JWT 认证 / RBAC      │    │ Redis 7 (可选)│
└─────────────┘    └──────┬──────────────┘    └───────────────┘
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
┌──────────────┐ ┌──────────────┐ ┌────────────────────┐
│ 大模型服务商   │ │ 公式校验微服务 │ │ 任务队列 BullMQ      │
│ (OpenAI 协议/  │ │ Python+sympy │ │ (报告生成等异步任务)  │
│  Claude)     │ │ FastAPI:8001 │ └────────────────────┘
└──────────────┘ └──────────────┘
```

### 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React · TypeScript · Vite · Tailwind CSS · Zustand · React Router · Recharts |
| 后端 | Node.js · Express · TypeScript · Prisma ORM · Zod · Winston · BullMQ |
| 数据库 | PostgreSQL 15（主库）· Redis 7（缓存/队列，可选） |
| AI 接入 | OpenAI 协议兼容服务商 / Anthropic Claude，多服务商优先级与推理模型兜底 |
| 语音 | edge-tts 微服务 + 离线音频数据包（本地优先零延迟） |
| 测试 | Vitest · Supertest · Testing Library |
| 部署 | Docker Compose · Nginx · 一键脚本 `deploy.sh` |

## 📁 目录结构

```
zhixue-engine-pro/
├── backend/                 # 后端服务
│   ├── prisma/              # Schema 与数据库迁移
│   ├── src/                 # 控制器 / 服务 / 路由
│   ├── scripts/             # 种子、冒烟回归、TTS 生成、音标补全等工程脚本
│   ├── seed-data/           # 词库等种子数据（权威源）
│   └── .env.example         # 环境变量模板
├── frontend/                # 前端应用（admin / parent / student 三端）
├── services/
│   ├── formula-verify/      # 公式等价校验微服务（Python + sympy）
│   └── word-tts/            # 单词发音微服务（Python + edge-tts）
├── docs/                    # 文档（部署指南、操作手册、API 文档等，见「文档索引」）
├── nginx/                   # Nginx 反向代理配置
├── deploy.sh                # 生产一键部署脚本（start / stop / restart / status / logs）
├── docker-compose.yml       # 开发/演示环境编排
└── docker-compose.prod.yml  # 生产环境编排
```

## 🚀 快速开始（本地开发）

### 环境要求

- Node.js ≥ 20（推荐 22）· PostgreSQL ≥ 14 · Redis ≥ 6（可选）· Python ≥ 3.11（仅公式校验微服务）

### 1. 后端

```bash
cd backend
npm install
cp .env.example .env          # 修改 DATABASE_URL 为你的 PostgreSQL 连接串

npx prisma db push            # 同步数据库结构（建表/枚举，幂等）
node scripts/seed-textbooks-papers.mjs   # 教材体系种子（206 套教材）
node scripts/import-words.mjs seed-data/words-stage-初中.json 初中   # 词库（可选）
node scripts/import-words.mjs seed-data/words-stage-CET4.json CET4

npm run dev                   # http://localhost:3000
```

> ⚠️ 本仓库 schema 演进使用 `prisma db push`（migration 链不完整，勿用 `migrate deploy`）。

### 2. 前端

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

### 3. 公式校验微服务（可选，仅电子答题公式批改需要）

```bash
cd services/formula-verify
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001
```

### 4. 配置 AI 服务商

平台的大模型配置存储于数据库 `AIProvider` 表（非 .env）：

- **管理后台（推荐）**：管理员登录 → 「AI 服务商管理」→ 新增服务商（OpenAI 协议兼容 / Claude），可在线验证连通性
- 平台已适配推理模型（reasoning model）：`content` 为空时自动兜底读取 `reasoning` 字段并放大 max_tokens 重试

### 测试账户

| 角色 | 用户名 | 密码 |
|---|---|---|
| 管理员 | admin | password123 |
| 家长 | parent1 | password123 |
| 学员 | student1 | password123 |

详细测试数据与重建方式见 [`docs/2.测试账户信息.md`](docs/2.测试账户信息.md)。

## 🐳 生产部署

一键脚本（首次部署自动完成数据库初始化与种子导入）：

```bash
./deploy.sh start      # 构建并启动
./deploy.sh stop       # 停止全部服务并释放端口（数据卷保留）
./deploy.sh status     # 服务状态
./deploy.sh logs       # 实时日志
```

首次部署前准备 `.env`（数据库/Redis 强密码等）。完整流程、TTS 音频数据包挂载、常见问题见 [`docs/生产部署指南.md`](docs/生产部署指南.md)。

## 🧪 测试与冒烟

```bash
# 后端单元测试 / 类型检查
cd backend && npm run test && npm run type-check

# 端到端回归（需后端运行中；可用 SMOKE_PORT 指定端口）
cd backend && node scripts/smoke-paper-category.mjs   # 主回归：50+ 项断言（题库/试卷/任务/学期延续）
```

其他工程脚本：`smoke-word-*.mjs`（单词训练）、`diag-ai.mjs`（AI 链路诊断）、`tts-batch-generate.mjs`（TTS 数据包生成）、`fill-missing-phonetics.mjs`（音标补全）。

## 📚 文档索引

| 文档 | 说明 |
|---|---|
| [`docs/生产部署指南.md`](docs/生产部署指南.md) | **生产部署**：一键部署、初始化、TTS 数据包、常见问题 |
| [`docs/3.开发环境部署指南.md`](docs/3.开发环境部署指南.md) | 本地开发环境搭建细节 |
| [`docs/7.管理员操作手册.md`](docs/7.管理员操作手册.md) · [`8.家长使用指南.md`](docs/8.家长使用指南.md) · [`9.学员使用指南.md`](docs/9.学员使用指南.md) | 三端使用手册 |
| [`docs/API文档.md`](docs/API文档.md) | 后端接口文档 |
| [`docs/AI服务商配置指南.md`](docs/AI服务商配置指南.md) | 大模型服务商接入说明 |
| [`docs/6.CICD 配置指南.md`](docs/6.CICD 配置指南.md) | 持续集成/部署配置 |
| [`docs/2.测试账户信息.md`](docs/2.测试账户信息.md) | 测试账户与测试数据 |

## 🔐 安全说明

- 密码 bcrypt 加密存储；认证采用 JWT（Access + Refresh 双令牌）
- AI API Key 仅存于数据库 `AIProvider` 表，请勿硬编码或提交到仓库
- 生产环境务必更换 `.env` 中所有默认密钥（`JWT_SECRET`、数据库/Redis 密码等）

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。
