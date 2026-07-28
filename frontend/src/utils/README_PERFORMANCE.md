# 性能优化工具使用指南

本文档介绍前端性能优化相关的工具函数和Hooks的使用方法。

## 防抖和节流

### 1. useDebounce Hook

用于延迟更新值，适合搜索输入框等场景。

```typescript
import { useDebounce } from '../hooks/useDebounce';

function SearchComponent() {
  const [searchTerm, setSearchTerm] = useState('');
  // 延迟500ms更新搜索词
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  useEffect(() => {
    // 使用防抖后的搜索词进行API调用
    if (debouncedSearchTerm) {
      fetchSearchResults(debouncedSearchTerm);
    }
  }, [debouncedSearchTerm]);

  return (
    <input
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="搜索..."
    />
  );
}
```

### 2. useDebounceCallback Hook

用于防抖函数调用。

```typescript
import { useDebounceCallback } from '../hooks/useDebounce';

function Component() {
  const handleSearch = useDebounceCallback((term: string) => {
    console.log('搜索:', term);
    fetchSearchResults(term);
  }, 500);

  return (
    <input
      onChange={(e) => handleSearch(e.target.value)}
      placeholder="搜索..."
    />
  );
}
```

### 3. useThrottle Hook

用于限制函数调用频率，适合滚动事件等高频触发的场景。

```typescript
import { useThrottle } from '../hooks/useDebounce';

function ScrollComponent() {
  const handleScroll = useThrottle(() => {
    console.log('滚动位置:', window.scrollY);
  }, 200);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return <div>滚动内容...</div>;
}
```

## 防止重复提交

### usePreventDoubleSubmit Hook

用于防止按钮重复点击和表单重复提交。

```typescript
import { usePreventDoubleSubmit } from '../hooks/useDebounce';

function FormComponent() {
  const { execute: handleSubmit, loading } = usePreventDoubleSubmit(
    async (formData) => {
      await api.submitForm(formData);
    }
  );

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      handleSubmit(formData);
    }}>
      <button type="submit" disabled={loading}>
        {loading ? '提交中...' : '提交'}
      </button>
    </form>
  );
}
```

## 使用场景

### 搜索输入框

使用 `useDebounce` 延迟搜索请求：

```typescript
const [searchQuery, setSearchQuery] = useState('');
const debouncedSearchQuery = useDebounce(searchQuery, 500);

useEffect(() => {
  if (debouncedSearchQuery) {
    fetchResults(debouncedSearchQuery);
  }
}, [debouncedSearchQuery]);
```

### 滚动加载

使用 `useThrottle` 限制滚动事件处理频率：

```typescript
const handleScroll = useThrottle(() => {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
    loadMore();
  }
}, 200);
```

### 表单提交

使用 `usePreventDoubleSubmit` 防止重复提交：

```typescript
const { execute: submitForm, loading } = usePreventDoubleSubmit(
  async (data) => {
    await api.createUser(data);
  }
);

<button onClick={() => submitForm(formData)} disabled={loading}>
  {loading ? '创建中...' : '创建用户'}
</button>
```

### 按钮点击

使用 `usePreventDoubleSubmit` 防止重复点击：

```typescript
const { execute: handleDelete, loading } = usePreventDoubleSubmit(
  async (id) => {
    await api.deleteItem(id);
  }
);

<button onClick={() => handleDelete(itemId)} disabled={loading}>
  {loading ? '删除中...' : '删除'}
</button>
```

## 性能优化建议

1. **搜索输入框**: 使用 300-500ms 的防抖延迟
2. **滚动事件**: 使用 100-200ms 的节流间隔
3. **窗口调整**: 使用 200-300ms 的节流间隔
4. **表单提交**: 始终使用防重复提交
5. **删除操作**: 使用防重复提交并显示加载状态

## 注意事项

1. 防抖和节流会延迟函数执行，确保用户体验不受影响
2. 使用防重复提交时，务必显示加载状态给用户反馈
3. 清理定时器：所有Hooks都会自动清理，无需手动处理
4. 依赖项：确保回调函数的依赖项正确设置

## 已应用的组件

以下组件已经应用了性能优化：

- `UserManagement.tsx` - 搜索框防抖
- `CreateUserModal.tsx` - 表单提交防重复
- `EditUserModal.tsx` - 表单提交防重复
- `DeleteUserModal.tsx` - 删除操作防重复

## 待优化的组件

建议在以下组件中应用性能优化：

- 所有包含搜索功能的列表页面
- 所有包含表单提交的组件
- 所有包含删除/修改操作的组件
- 滚动加载的列表组件
