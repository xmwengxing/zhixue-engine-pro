# 工具函数说明

## 事务管理器 (transaction.ts)

事务管理器提供了数据库事务操作的封装，确保关键操作的原子性和一致性。

### 核心功能

1. **基础事务执行**：`TransactionManager.execute()`
2. **带重试的事务执行**：`TransactionManager.executeWithRetry()`
3. **预定义事务操作**：针对常见业务场景的事务封装

### 使用示例

#### 1. 基础事务

```typescript
import { TransactionManager } from '../utils/transaction';

// 执行自定义事务
const result = await TransactionManager.execute(async (tx) => {
  // 在事务中执行多个操作
  const user = await tx.user.create({
    data: { username: 'test', passwordHash: 'hash', role: 'STUDENT' },
  });

  await tx.studentProfile.create({
    data: {
      userId: user.id,
      realName: '测试用户',
      grade: '初一',
      materialVersion: '人教版',
      subjectLevels: {},
    },
  });

  return user;
});
```

#### 2. 带重试的事务

```typescript
// 自动重试失败的事务（最多 3 次）
const result = await TransactionManager.executeWithRetry(
  async (tx) => {
    // 事务操作
    return await tx.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
    });
  },
  3, // 最大重试次数
  1000 // 重试延迟（毫秒）
);
```

#### 3. 愿望审批事务

```typescript
import { approveWishTransaction } from '../utils/transaction';

// 审批愿望（包含积分扣除和状态更新）
await approveWishTransaction(
  wishId,
  reviewerId,
  true, // 是否同意
  '同意兑现' // 审批理由
);
```

#### 4. 任务完成事务

```typescript
import { completeTaskTransaction } from '../utils/transaction';

// 完成任务（包含状态更新和积分发放）
await completeTaskTransaction(
  sessionId,
  100 // 获得的积分
);
```

#### 5. 错题重做完成事务

```typescript
import { completeErrorRetryTransaction } from '../utils/transaction';

// 完成错题重做（包含掌握度更新和积分奖励）
await completeErrorRetryTransaction(
  errorQuestionId,
  true, // 是否答对
  20 // 获得的积分
);
```

#### 6. 创建用户事务

```typescript
import { createUserTransaction } from '../utils/transaction';

// 创建用户（包含用户创建和授权码标记）
const { userId } = await createUserTransaction(
  'username',
  'passwordHash',
  'STUDENT',
  'AUTH_CODE_123'
);
```

#### 7. 绑定学员事务

```typescript
import { bindStudentTransaction } from '../utils/transaction';

// 绑定学员（包含亲子关系创建）
await bindStudentTransaction(
  parentId,
  studentId,
  '父亲' // 关系
);
```

### 事务特性

#### 原子性保证

所有事务操作要么全部成功，要么全部失败回滚，确保数据一致性。

```typescript
// 示例：积分扣除和愿望状态更新必须同时成功
await approveWishTransaction(wishId, reviewerId, true);
// 如果积分扣除失败，愿望状态不会更新
// 如果愿望状态更新失败，积分扣除会回滚
```

#### 自动重试

对于可重试的错误（如事务冲突、连接错误），事务管理器会自动重试。

```typescript
// 可重试的错误类型：
// - P2034: 事务冲突
// - P2028: 事务 API 错误
// - 数据库连接错误
```

#### 错误处理

事务失败时会抛出详细的错误信息，便于调试和日志记录。

```typescript
try {
  await completeTaskTransaction(sessionId, points);
} catch (error) {
  console.error('任务完成失败:', error);
  // 所有操作已回滚，数据保持一致
}
```

### 最佳实践

1. **使用预定义事务**：优先使用预定义的事务函数，它们已经过测试和优化
2. **保持事务简短**：事务应该快速执行，避免长时间持有锁
3. **避免外部调用**：事务内不要调用外部 API 或执行耗时操作
4. **合理使用重试**：只对可重试的操作使用重试机制
5. **记录日志**：在事务前后记录日志，便于追踪问题

### 注意事项

1. **事务隔离级别**：Prisma 默认使用 READ COMMITTED 隔离级别
2. **死锁风险**：避免在事务中以不同顺序访问相同资源
3. **性能影响**：事务会持有数据库锁，影响并发性能
4. **嵌套事务**：Prisma 不支持嵌套事务，使用 savepoint 代替

### 常见问题

#### Q: 什么时候需要使用事务？

A: 当多个数据库操作需要保持一致性时，例如：
- 积分扣除和状态更新
- 用户创建和授权码标记
- 任务完成和积分发放

#### Q: 事务失败后数据会怎样？

A: 事务失败后，所有操作会自动回滚，数据库状态恢复到事务开始前。

#### Q: 如何处理事务超时？

A: Prisma 默认事务超时为 5 秒，可以通过配置调整：

```typescript
await prisma.$transaction(
  async (tx) => {
    // 事务操作
  },
  {
    maxWait: 5000, // 最大等待时间
    timeout: 10000, // 超时时间
  }
);
```

#### Q: 事务中可以调用其他服务吗？

A: 可以，但要注意：
- 避免调用外部 API
- 避免执行耗时操作
- 确保被调用的服务不会开启新事务（避免嵌套）

### 相关资源

- [Prisma 事务文档](https://www.prisma.io/docs/concepts/components/prisma-client/transactions)
- [数据库事务最佳实践](https://www.postgresql.org/docs/current/tutorial-transactions.html)
