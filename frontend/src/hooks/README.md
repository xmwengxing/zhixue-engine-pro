# Hooks 使用说明

## useSyncState Hook

`useSyncState` Hook 提供了前后端状态同步功能，支持乐观更新和自动状态验证。

### 基本用法

```typescript
import { useSyncState } from '../hooks/useSyncState';

function ProfileEditor() {
  const {
    data: profile,
    isSyncing,
    error,
    update,
    validate,
  } = useSyncState({
    resource: 'student/profile',
    resourceId: 'user-123',
    initialData: {
      realName: '',
      grade: '',
      materialVersion: '',
    },
    autoValidate: true, // 自动验证状态
    validateInterval: 30000, // 每 30 秒验证一次
  });

  const handleSave = async () => {
    await update({
      realName: '张三',
      grade: '初一',
    });
  };

  return (
    <div>
      <input
        value={profile.realName}
        onChange={(e) => update({ realName: e.target.value })}
      />
      {isSyncing && <span>同步中...</span>}
      {error && <span>错误: {error.message}</span>}
      <button onClick={handleSave}>保存</button>
      <button onClick={validate}>验证状态</button>
    </div>
  );
}
```

### 功能特性

1. **乐观更新**：立即更新本地状态，提升用户体验
2. **自动同步**：后台自动同步到服务器
3. **失败回滚**：同步失败时自动回滚到原始状态
4. **状态验证**：定期验证前后端状态一致性
5. **冲突解决**：检测到不一致时使用服务器状态

### API

#### 参数

- `resource`: 资源类型（如 'student/profile', 'parent/tasks'）
- `resourceId`: 资源 ID（可选，创建操作不需要）
- `initialData`: 初始数据
- `autoValidate`: 是否自动验证状态（默认 false）
- `validateInterval`: 验证间隔，毫秒（默认 30000）

#### 返回值

- `data`: 当前数据
- `isLoading`: 是否加载中
- `isSyncing`: 是否同步中
- `error`: 错误信息
- `update(newData)`: 更新数据
- `create(newData)`: 创建数据
- `remove()`: 删除数据
- `validate()`: 验证状态
- `refresh()`: 刷新数据

### 使用场景

1. **表单编辑**：用户编辑个人资料、任务配置等
2. **列表操作**：添加、删除列表项
3. **实时协作**：多用户同时编辑同一资源
4. **离线支持**：配合离线缓存使用

### 注意事项

1. 乐观更新适用于成功率高的操作
2. 对于关键操作（如支付），建议等待服务器确认
3. 自动验证会增加网络请求，根据需要启用
4. 状态冲突时默认使用服务器状态
