# 通用组件库使用指南

本目录包含智能提分训练平台的所有通用 UI 组件，严格遵循设计稿的蓝白色调和视觉规范。

## 组件分类

### 1. 布局组件

#### Layout
页面整体布局容器，包含侧边栏、头部和内容区。

```tsx
import { Layout } from '@/components/shared/Layout';

<Layout>
  <YourPageContent />
</Layout>
```

#### Sidebar
侧边栏导航组件。

```tsx
import { Sidebar } from '@/components/shared/Sidebar';

<Sidebar />
```

#### Header
顶部导航栏组件。

```tsx
import { Header } from '@/components/shared/Header';

<Header />
```

#### Footer
页脚组件。

```tsx
import { Footer } from '@/components/shared/Footer';

<Footer />
```

### 2. 表单组件

#### Input
输入框组件，支持多种类型和验证。

```tsx
import { Input } from '@/components/shared/Input';

<Input
  label="用户名"
  placeholder="请输入用户名"
  value={username}
  onChange={(e) => setUsername(e.target.value)}
  error="用户名不能为空"
/>
```

#### Select
下拉选择组件。

```tsx
import { Select } from '@/components/shared/Select';

<Select
  label="年级"
  options={[
    { value: '1', label: '一年级' },
    { value: '2', label: '二年级' },
  ]}
  value={grade}
  onChange={(e) => setGrade(e.target.value)}
/>
```

#### Button
按钮组件，支持多种样式和尺寸。

```tsx
import { Button } from '@/components/shared/Button';

<Button variant="primary" size="md" onClick={handleClick}>
  提交
</Button>
```

#### Form
表单容器组件。

```tsx
import { Form } from '@/components/shared/Form';

<Form onSubmit={handleSubmit}>
  {/* 表单内容 */}
</Form>
```

#### DatePicker
日期选择器组件。

```tsx
import { DatePicker } from '@/components/shared/DatePicker';

<DatePicker
  label="选择日期"
  value={date}
  onChange={setDate}
/>
```

### 3. 数据展示组件

#### Table
数据表格组件，支持分页和排序。

```tsx
import { Table } from '@/components/shared/Table';

<Table
  columns={[
    { key: 'name', label: '姓名' },
    { key: 'age', label: '年龄' },
  ]}
  data={users}
  pagination={{
    current: 1,
    pageSize: 10,
    total: 100,
  }}
/>
```

#### Card
卡片容器组件。

```tsx
import { Card } from '@/components/shared/Card';

<Card title="标题" footer={<Button>操作</Button>}>
  卡片内容
</Card>
```

#### Chart
图表组件，包含雷达图、饼图和折线图。

```tsx
import { RadarChart, PieChart, LineChart } from '@/components/shared/Chart';

// 雷达图
<RadarChart
  data={[
    { subject: '数学', value: 85 },
    { subject: '语文', value: 90 },
  ]}
/>

// 饼图/环形图
<PieChart
  data={[
    { name: '已掌握', value: 30, color: '#22c55e' },
    { name: '攻克中', value: 20, color: '#f59e0b' },
    { name: '未掌握', value: 10, color: '#ef4444' },
  ]}
  innerRadius={60}
/>

// 折线图
<LineChart
  data={[
    { name: '周一', score: 85 },
    { name: '周二', score: 90 },
  ]}
  lines={[
    { dataKey: 'score', name: '分数', color: '#3b82f6' },
  ]}
/>
```

#### Badge
徽章标签组件。

```tsx
import { Badge } from '@/components/shared/Badge';

<Badge variant="success">已完成</Badge>
<Badge variant="warning">进行中</Badge>
<Badge variant="error">失败</Badge>
```

#### Progress
进度条组件。

```tsx
import { Progress } from '@/components/shared/Progress';

<Progress value={60} max={100} />
```

### 4. 反馈组件

#### Modal
模态对话框组件。

```tsx
import Modal from '@/components/shared/Modal';

<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="确认操作"
  footer={
    <>
      <Button variant="outline" onClick={() => setIsOpen(false)}>
        取消
      </Button>
      <Button onClick={handleConfirm}>确认</Button>
    </>
  }
>
  <p>确定要执行此操作吗？</p>
</Modal>
```

#### Toast
消息提示组件，配合 useToast Hook 使用。

```tsx
import { ToastContainer } from '@/components/shared/Toast';
import { useToast } from '@/hooks/useToast';

function MyComponent() {
  const { toasts, removeToast, success, error, warning, info } = useToast();

  const handleSuccess = () => {
    success('操作成功！');
  };

  return (
    <>
      <Button onClick={handleSuccess}>显示成功提示</Button>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
```

#### Loading
加载指示器组件。

```tsx
import Loading, { Skeleton, LoadingDots, LoadingBar } from '@/components/shared/Loading';

// 基础加载
<Loading size="md" text="加载中..." />

// 全屏加载
<Loading fullScreen text="加载中，请稍候..." />

// 遮罩层加载
<Loading overlay text="处理中..." />

// 骨架屏
<Skeleton variant="text" width="100%" height="20px" />
<Skeleton variant="circular" width="40px" height="40px" />

// 加载点
<LoadingDots size="md" />

// 进度条
<LoadingBar progress={60} />
<LoadingBar indeterminate />
```

#### Empty
空状态占位组件。

```tsx
import Empty, {
  EmptySearch,
  EmptyList,
  EmptyError,
  EmptyNetwork,
  EmptyPermission,
} from '@/components/shared/Empty';

// 默认空状态
<Empty title="暂无数据" description="这里还没有任何内容" />

// 搜索为空
<EmptySearch onReset={() => console.log('重置')} />

// 列表为空
<EmptyList onCreate={() => console.log('创建')} createText="创建新项目" />

// 加载错误
<EmptyError onRetry={() => console.log('重试')} />

// 网络错误
<EmptyNetwork onRetry={() => console.log('重新连接')} />

// 无权限
<EmptyPermission />
```

## 设计规范

### 颜色系统

- **主色调**: 蓝色 (#3b82f6)
- **成功**: 绿色 (#22c55e)
- **警告**: 黄色 (#f59e0b)
- **错误**: 红色 (#ef4444)
- **背景**: 白色 (#ffffff) 和浅灰 (#f8fafc)
- **文字**: 深灰 (#1e293b) 和中灰 (#64748b)

### 间距规范

使用 Tailwind CSS 的间距系统：
- `p-2`: 0.5rem (8px)
- `p-4`: 1rem (16px)
- `p-6`: 1.5rem (24px)
- `p-8`: 2rem (32px)

### 圆角规范

- 小圆角: `rounded` (0.25rem)
- 中圆角: `rounded-md` (0.375rem)
- 大圆角: `rounded-lg` (0.5rem)
- 超大圆角: `rounded-xl` (0.75rem)

### 阴影规范

- 小阴影: `shadow-sm`
- 中阴影: `shadow-md`
- 大阴影: `shadow-lg`
- 超大阴影: `shadow-xl`

## 响应式设计

所有组件都支持响应式设计，使用 Tailwind CSS 的断点系统：

- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

示例：
```tsx
<div className="w-full md:w-1/2 lg:w-1/3">
  {/* 移动端全宽，平板半宽，桌面端三分之一宽 */}
</div>
```

## 动画效果

组件使用 CSS 过渡和动画实现流畅的交互效果：

- 过渡时长: 200-300ms
- 缓动函数: ease-in-out
- 常用动画: fade, slide, scale

## 最佳实践

1. **保持一致性**: 使用统一的组件库，避免自定义样式
2. **响应式优先**: 确保所有页面在不同设备上都能正常显示
3. **无障碍访问**: 使用语义化 HTML 和 ARIA 属性
4. **性能优化**: 使用 React.lazy 和代码分割优化加载速度
5. **错误处理**: 使用 Toast 和 Empty 组件提供友好的错误提示

## 示例页面

查看 `FeedbackExample.tsx` 文件了解所有反馈组件的使用示例。

## 贡献指南

添加新组件时，请遵循以下规范：

1. 使用 TypeScript 定义清晰的 Props 接口
2. 添加详细的中文注释说明组件用途
3. 遵循设计稿的视觉规范
4. 确保组件支持响应式设计
5. 添加使用示例到本文档
