# 设计系统文档

## 颜色主题

### 主色调（蓝色）
- `primary-50` 到 `primary-900`：主要用于按钮、链接、重要信息提示
- 主色调：`primary-500` (#3b82f6)

### 辅助色（灰色）
- `secondary-50` 到 `secondary-900`：用于文本、边框、背景
- 主要文本：`secondary-900`
- 次要文本：`secondary-600`

### 状态色
- **成功**：`success-500` (#22c55e)
- **警告**：`warning-500` (#f59e0b)
- **错误**：`error-500` (#ef4444)

## 字体

### 字体家族
使用系统字体栈，优先中文字体：
```
-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 
'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', 
Helvetica, Arial, sans-serif
```

### 字体大小
- `text-xs`: 0.75rem (12px)
- `text-sm`: 0.875rem (14px)
- `text-base`: 1rem (16px)
- `text-lg`: 1.125rem (18px)
- `text-xl`: 1.25rem (20px)
- `text-2xl`: 1.5rem (24px)
- `text-3xl`: 1.875rem (30px)
- `text-4xl`: 2.25rem (36px)

## 间距

### 标准间距
- `p-1` / `m-1`: 0.25rem (4px)
- `p-2` / `m-2`: 0.5rem (8px)
- `p-4` / `m-4`: 1rem (16px)
- `p-6` / `m-6`: 1.5rem (24px)
- `p-8` / `m-8`: 2rem (32px)

## 断点（响应式）

- `xs`: 475px
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

### 使用示例
```tsx
<div className="w-full md:w-1/2 lg:w-1/3">
  响应式宽度
</div>
```

## 圆角

- `rounded-sm`: 0.25rem
- `rounded`: 0.375rem (默认)
- `rounded-md`: 0.5rem
- `rounded-lg`: 0.75rem
- `rounded-xl`: 1rem

## 阴影

- `shadow-sm`: 轻微阴影
- `shadow`: 默认阴影
- `shadow-md`: 中等阴影
- `shadow-lg`: 较大阴影
- `shadow-card`: 卡片专用阴影

## 组件样式类

### 按钮
```tsx
<button className="btn btn-primary">主要按钮</button>
<button className="btn btn-secondary">次要按钮</button>
```

### 卡片
```tsx
<div className="card">
  卡片内容
</div>
```

### 输入框
```tsx
<label className="label">标签</label>
<input className="input" type="text" />
```

## 动画

### 淡入动画
```tsx
<div className="animate-fade-in">
  淡入内容
</div>
```

### 滑入动画
```tsx
<div className="animate-slide-in">
  滑入内容
</div>
```

## 布局模式

### 三栏布局（训练舱）
```tsx
<div className="flex flex-col lg:flex-row">
  {/* 左侧导航 - 移动端隐藏 */}
  <aside className="hidden lg:block lg:w-1/5">
    左侧内容
  </aside>
  
  {/* 中间内容区 */}
  <main className="flex-1 lg:w-1/2">
    中间内容
  </main>
  
  {/* 右侧区域 - 移动端隐藏 */}
  <aside className="hidden lg:block lg:w-3/10">
    右侧内容
  </aside>
</div>
```

## 设计原则

1. **一致性**：所有页面使用统一的颜色、字体和间距
2. **响应式**：优先移动端，渐进增强到桌面端
3. **可访问性**：确保足够的颜色对比度和键盘导航支持
4. **性能**：使用 Tailwind 的 JIT 模式，按需生成样式
