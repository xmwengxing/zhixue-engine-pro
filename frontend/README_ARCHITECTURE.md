# 前端核心架构文档

## 概述

本文档描述了智能提分训练平台前端的核心架构实现，包括路由配置、状态管理、HTTP 客户端和设计系统。

## 技术栈

- **框架**: React 19 + TypeScript
- **构建工具**: Vite 7
- **路由**: React Router v7
- **状态管理**: Zustand
- **HTTP 客户端**: Axios
- **样式**: Tailwind CSS 3
- **测试**: Vitest + fast-check

## 目录结构

```
frontend/src/
├── components/          # 通用组件
│   └── ProtectedRoute.tsx  # 路由守卫组件
├── pages/              # 页面组件
│   ├── Login.tsx       # 登录页
│   ├── NotFound.tsx    # 404 页面
│   ├── admin/          # 管理员端页面
│   ├── parent/         # 家长端页面
│   └── student/        # 学员端页面
├── router/             # 路由配置
│   └── index.tsx       # 路由定义
├── stores/             # 状态管理
│   ├── authStore.ts    # 认证状态
│   ├── userStore.ts    # 用户偏好
│   └── index.ts        # Store 导出
├── services/           # API 服务
│   └── authService.ts  # 认证 API
├── utils/              # 工具函数
│   └── request.ts      # Axios 配置
├── types/              # TypeScript 类型
│   ├── auth.ts         # 认证类型
│   └── api.ts          # API 类型
└── styles/             # 样式文件
    └── design-system.md # 设计系统文档
```

## 核心功能

### 1. 路由系统

#### 路由配置
- `/` - 重定向到登录页
- `/login` - 登录页（公开）
- `/admin/*` - 管理员端（需要 admin 角色）
- `/parent/*` - 家长端（需要 parent 角色）
- `/student/*` - 学员端（需要 student 角色）
- `*` - 404 页面

#### 路由守卫
`ProtectedRoute` 组件提供：
- 认证检查：未登录用户重定向到登录页
- 角色权限控制：根据用户角色限制访问
- 自动跳转：角色不匹配时跳转到对应首页

### 2. 状态管理

#### authStore（认证状态）
- `isAuthenticated`: 认证状态
- `user`: 用户信息
- `token`: JWT token
- `login()`: 登录方法
- `logout()`: 登出方法
- `updateUser()`: 更新用户信息

**特性**：
- 使用 Zustand 管理状态
- 持久化到 localStorage
- 自动恢复登录状态

#### userStore（用户偏好）
- `preferences`: 用户偏好设置
  - `theme`: 主题（light/dark）
  - `language`: 语言（zh-CN/en-US）
  - `sidebarCollapsed`: 侧边栏折叠状态
- `setPreferences()`: 设置偏好
- `resetPreferences()`: 重置偏好

### 3. HTTP 客户端

#### 配置
- 基础 URL: `http://localhost:3000/api`（可通过环境变量配置）
- 超时时间: 30 秒
- 自动添加 `Content-Type: application/json`

#### 请求拦截器
- 自动从 authStore 获取 token
- 添加 `Authorization: Bearer <token>` 请求头

#### 响应拦截器
- 统一错误处理
- 401: 清除认证信息，跳转登录页
- 403: 权限不足提示
- 404: 资源不存在提示
- 422: 业务逻辑错误提示
- 500/502/503: 服务器错误提示

### 4. 设计系统

#### 颜色主题
- **主色调**: 蓝色系（primary-50 到 primary-900）
- **辅助色**: 灰色系（secondary-50 到 secondary-900）
- **状态色**: 成功（绿色）、警告（黄色）、错误（红色）

#### 响应式断点
- `xs`: 475px
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

#### 组件样式类
- `.btn` / `.btn-primary` / `.btn-secondary`: 按钮
- `.card`: 卡片容器
- `.input`: 输入框
- `.label`: 标签

#### 动画
- `.animate-fade-in`: 淡入动画
- `.animate-slide-in`: 滑入动画

## 使用示例

### 创建受保护的页面

```tsx
import { ProtectedRoute } from '../components/ProtectedRoute';

// 在路由配置中使用
{
  path: '/admin/users',
  element: (
    <ProtectedRoute allowedRoles={['admin']}>
      <UserManagement />
    </ProtectedRoute>
  ),
}
```

### 使用状态管理

```tsx
import { useAuthStore } from '../stores/authStore';

function MyComponent() {
  const { user, isAuthenticated, logout } = useAuthStore();
  
  return (
    <div>
      {isAuthenticated && <p>欢迎, {user?.username}</p>}
      <button onClick={logout}>登出</button>
    </div>
  );
}
```

### 调用 API

```tsx
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';

async function handleLogin(username: string, password: string) {
  try {
    const response = await authService.login({ username, password });
    useAuthStore.getState().login(response.user, response.token);
  } catch (error) {
    console.error('登录失败', error);
  }
}
```

### 使用设计系统

```tsx
function MyButton() {
  return (
    <button className="btn btn-primary">
      点击我
    </button>
  );
}

function MyCard() {
  return (
    <div className="card animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-900">标题</h2>
      <p className="mt-2 text-gray-600">内容</p>
    </div>
  );
}
```

## 环境变量

创建 `.env` 文件：

```env
# API 基础 URL
VITE_API_BASE_URL=http://localhost:3000/api

# 应用环境
VITE_APP_ENV=development
```

## 测试

运行测试：
```bash
npm run test
```

运行测试（监听模式）：
```bash
npm run test:watch
```

## 下一步

1. 实现具体的页面组件
2. 添加更多 API 服务
3. 完善错误处理和用户反馈
4. 添加更多通用组件
5. 实现主题切换功能

## 注意事项

1. 所有类型导入使用 `type` 关键字（TypeScript 要求）
2. API 响应自动解包，直接返回 `response.data`
3. 认证状态自动持久化到 localStorage
4. 路由守卫会自动处理未认证和权限不足的情况
