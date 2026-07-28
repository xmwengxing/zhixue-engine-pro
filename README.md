# 智能提分训练平台

<div align="center">

一个基于 AI 驱动的个性化学习平台，为中小学生提供智能化的学习训练、错题管理和激励系统。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

</div>

## 📋 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [环境配置](#环境配置)
- [开发指南](#开发指南)
- [部署说明](#部署说明)
- [API 文档](#api-文档)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

## ✨ 功能特性

### 管理员端
- 👥 **用户账户管理**
  - 支持创建家长、学员、管理员三种角色
  - 差异化字段管理（家长/学员特有信息）
  - 用户CRUD操作（创建、编辑、删除、锁定）
- 🎓 **学号与授权码管理**
  - 学号自动生成（格式：STU+年份后两位+6位流水号）
  - 授权码批量生成与导出
  - 学号分配与解绑
- 👨‍👩‍👧 **亲子关系管理**
  - 查看所有亲子绑定关系
  - 支持手动解绑（保留历史数据）
  - 关系搜索与筛选
- 📚 **教材体系管理**
  - 多版本教材树状结构
  - 批量导入教材（Excel模板）
  - 教材节点CRUD操作
- 🤖 **AI 服务配置**
  - 多服务商支持与故障转移
  - 科目教学指令配置
- 📊 **API 监控看板**（实时指标与告警）

### 家长端
- 🔐 **个人中心**
  - 个人信息管理（姓名、性别、联系方式等）
  - 密码修改功能
  - 邮箱验证
- 👨‍👩‍👧 **亲子关系管理**
  - 多学员绑定
  - 直接创建学员账户并自动绑定
  - 学员信息查看与管理
- 📈 **学情概览看板**
  - 能力雷达图（各科目掌握度）
  - 错题统计（未掌握/攻克中/已掌握）
  - 学习连续性追踪
- 📝 **任务配置与发布**
  - 档案提取模式（基于学员档案自动推荐）
  - 自定义配置模式（完全自主配置）
  - AI科目老师选择
  - 临时修改学员信息（仅用于当前任务）
- 📄 **AI 学习报告**
  - 查看详细学习报告
  - 导出PDF报告
  - 报告对比分析
- 🎁 **愿望审批系统**
  - 查看学员愿望申请
  - 审批（同意/拒绝）
  - 愿望兑现管理

### 学员端
- 📋 **个人档案管理**
  - 完整个人信息（姓名、性别、出生年月等）
  - 年级选单（标准化）
  - 学习基础自评（薄弱/一般/良好/优秀）
  - 密码修改功能
  - 核心信息保护（学号、账户名不可修改）
- 🎯 **智能训练舱**（三栏响应式布局）
- 🤖 **AI 启发式教学**（实时对话引导）
- 📖 **错题本管理**（自动收集与重做）
- 🏆 **积分与愿望系统**

## 🛠 技术栈

### 前端
- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **样式**: Tailwind CSS
- **状态管理**: Zustand
- **路由**: React Router v6
- **HTTP 客户端**: Axios
- **图表**: Recharts
- **测试**: Vitest + React Testing Library

### 后端
- **运行时**: Node.js 18+
- **框架**: Express + TypeScript
- **数据库**: PostgreSQL 15
- **ORM**: Prisma
- **缓存**: Redis
- **认证**: JWT
- **AI 集成**: OpenAI SDK, Anthropic SDK
- **测试**: Vitest + fast-check (属性测试)

### 基础设施
- **容器化**: Docker + Docker Compose
- **反向代理**: Nginx
- **CI/CD**: GitHub Actions

## 📁 项目结构

```
.
├── frontend/              # 前端应用
│   ├── src/
│   │   ├── components/   # React 组件
│   │   ├── pages/        # 页面组件
│   │   ├── services/     # API 服务
│   │   ├── stores/       # Zustand 状态管理
│   │   ├── utils/        # 工具函数
│   │   └── types/        # TypeScript 类型定义
│   ├── public/           # 静态资源
│   └── package.json
│
├── backend/              # 后端应用
│   ├── src/
│   │   ├── controllers/  # 路由控制器
│   │   ├── services/     # 业务逻辑层
│   │   ├── middlewares/  # 中间件
│   │   ├── utils/        # 工具函数
│   │   └── config/       # 配置文件
│   ├── prisma/           # 数据库 Schema
│   ├── tests/            # 测试文件
│   └── package.json
│
├── nginx/                # Nginx 配置
├── .github/              # GitHub Actions 工作流
├── docker-compose.yml    # Docker Compose 配置
└── README.md
```

## 🚀 快速开始

### 前置要求

- Node.js >= 18.0.0
- Docker >= 20.10
- Docker Compose >= 2.0
- pnpm >= 8.0 (推荐) 或 npm

### 1. 克隆项目

```bash
git clone <repository-url>
cd intelligent-training-platform
```

### 2. 环境配置

复制环境变量模板并配置：

```bash
# 根目录
cp .env.example .env

# 后端
cp backend/.env.example backend/.env

# 前端
cp frontend/.env.example frontend/.env
```

编辑 `.env` 文件，配置必要的环境变量（详见[环境配置](#环境配置)）。

### 3. 启动数据库服务

```bash
docker-compose up -d postgres redis
```

### 4. 安装依赖

```bash
# 后端
cd backend
pnpm install

# 前端
cd ../frontend
pnpm install
```

### 5. 数据库迁移

```bash
cd backend
pnpm prisma migrate dev
```

### 6. 启动开发服务器

```bash
# 后端 (终端 1)
cd backend
pnpm dev

# 前端 (终端 2)
cd frontend
pnpm dev
```

### 7. 访问应用

- 前端: http://localhost:5173
- 后端 API: http://localhost:3000
- API 文档: 查看 [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

### 8. 注册流程说明

#### 家长注册
1. 访问注册页面
2. 选择"家长"角色
3. 填写必填信息：
   - 账户名（3-20个字符）
   - 密码（至少8个字符）
   - 邮箱
4. 填写选填信息（姓名、性别、联系方式、家庭住址、从事行业）
5. 点击注册（**家长注册不需要授权码**）

#### 学员注册
1. 访问注册页面
2. 选择"学员"角色
3. 填写必填信息：
   - 账户名（3-20个字符）
   - 密码（至少8个字符）
   - 姓名
   - 性别
   - 出生年月
   - 年级（从标准化年级选单中选择）
4. 填写选填信息（就读院校、学习基础、兴趣爱好）
5. **输入有效的授权码**（向管理员获取）
6. 点击注册
7. 系统自动生成学号（格式：STU+年份后两位+6位流水号，如STU26000001）

### 9. 学号规则说明

**学号格式**：`STU` + `年份后两位` + `6位流水号`

**示例**：
- 2026年第1个学员：STU26000001
- 2026年第100个学员：STU26000100
- 2027年第1个学员：STU27000001

**生成规则**：
- 学号在学员注册时自动生成
- 家长添加学员时也会自动生成
- 流水号按年份独立计数，每年从000001开始
- 学号全局唯一，不可修改

## ⚙️ 环境配置

### 后端环境变量 (backend/.env)

```env
# 数据库配置
DATABASE_URL="postgresql://user:password@localhost:5432/training_platform"

# Redis 配置
REDIS_URL="redis://localhost:6379"

# JWT 配置
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"

# AI 服务配置
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."

# 服务器配置
PORT=3000
NODE_ENV="development"
```

### 前端环境变量 (frontend/.env)

```env
# API 地址
VITE_API_BASE_URL="http://localhost:3000/api"

# 应用配置
VITE_APP_TITLE="智能提分训练平台"
```

详细配置说明请参考：
- [后端环境配置文档](./backend/ENV_CONFIG.md)
- [前端环境配置文档](./frontend/ENV_CONFIG.md)

## 💻 开发指南

### 代码规范

项目使用 ESLint 和 Prettier 进行代码规范检查：

```bash
# 检查代码规范
pnpm lint

# 自动修复
pnpm lint:fix

# 格式化代码
pnpm format
```

### 运行测试

```bash
# 后端测试
cd backend
pnpm test              # 运行所有测试
pnpm test:unit         # 运行单元测试
pnpm test:integration  # 运行集成测试

# 前端测试
cd frontend
pnpm test              # 运行所有测试
pnpm test:ui           # 运行 UI 测试
```

### 数据库操作

```bash
cd backend

# 创建迁移
pnpm prisma migrate dev --name migration_name

# 重置数据库
pnpm prisma migrate reset

# 打开 Prisma Studio
pnpm prisma studio

# 生成 Prisma Client
pnpm prisma generate
```

### Git 提交规范

使用 Conventional Commits 规范：

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具链相关
```

示例：
```bash
git commit -m "feat: 添加学员错题本功能"
git commit -m "fix: 修复登录令牌过期问题"
```

## 🚢 部署说明

### Docker 部署（推荐）

详细部署文档请查看 [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)

快速部署：

```bash
# 1. 配置生产环境变量
cp .env.example .env
# 编辑 .env 文件

# 2. 构建并启动服务
docker-compose -f docker-compose.prod.yml up -d

# 3. 运行数据库迁移
docker-compose -f docker-compose.prod.yml exec backend pnpm prisma migrate deploy

# 4. 查看日志
docker-compose -f docker-compose.prod.yml logs -f
```

### 手动部署

详细步骤请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)

### CI/CD

项目使用 GitHub Actions 进行自动化部署，详见 [CI_CD_GUIDE.md](./CI_CD_GUIDE.md)

## 📚 API 文档

完整的 API 文档请查看 [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

快速示例：

```bash
# 登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'

# 获取个人档案
curl -X GET http://localhost:3000/api/student/profile \
  -H "Authorization: Bearer <token>"
```

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: 添加某个功能'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 开发流程

1. 在 Issue 中讨论新功能或 bug 修复
2. 获得批准后开始开发
3. 编写测试确保代码质量
4. 提交 PR 并等待 Code Review
5. 合并到主分支

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 Issue: [GitHub Issues](https://github.com/your-repo/issues)
- 邮箱: support@example.com

---

<div align="center">

**[⬆ 回到顶部](#智能提分训练平台)**

Made with ❤️ by the Development Team

</div>
