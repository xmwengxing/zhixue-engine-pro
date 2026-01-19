# 智能提分训练平台 - 前端应用

基于 React + TypeScript + Vite 的现代化前端应用。

## 技术栈

- **框架**: React 18
- **语言**: TypeScript
- **构建工具**: Vite
- **样式**: Tailwind CSS
- **状态管理**: Zustand
- **路由**: React Router
- **HTTP 客户端**: Axios
- **测试**: Vitest + fast-check

## 项目结构

```
frontend/
├── src/
│   ├── main.tsx              # 应用入口
│   ├── App.tsx               # 根组件
│   ├── components/           # 通用组件
│   │   ├── shared/          # 共享组件
│   │   ├── admin/           # 管理员端组件
│   │   ├── parent/          # 家长端组件
│   │   └── student/         # 学员端组件
│   ├── pages/               # 页面组件
│   ├── stores/              # Zustand 状态管理
│   ├── services/            # API 服务
│   ├── hooks/               # 自定义 Hooks
│   ├── utils/               # 工具函数
│   ├── types/               # TypeScript 类型定义
│   └── styles/              # 全局样式
├── public/                  # 静态资源
└── package.json
```

## 开发指南

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
npm run build
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

## 设计规范

- 严格遵循 `stitch_admin_user_management_dashboard` 设计稿
- 使用蓝白色调配色方案
- 响应式设计，支持桌面端和移动端
- 训练舱采用三栏布局（桌面端）和自适应布局（移动端）

## 许可证

MIT
