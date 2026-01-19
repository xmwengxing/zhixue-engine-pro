---
inclusion: always
---

# 语言偏好设置

## 默认交流语言
- **使用中文进行所有交流**，包括：
  - 代码注释使用中文
  - 变量命名可以使用拼音或英文，但注释必须用中文
  - 错误提示和说明使用中文
  - 文档和说明使用中文
  - Git commit 信息使用中文

## 代码规范
- 保持代码中的英文关键字、函数名、API名称不变
- 字符串字面量（UI文本）使用中文
- 注释详细且使用中文解释逻辑
- 文档文件（.md）使用中文编写

## 示例
```typescript
// ✅ 正确示例
// 获取用户信息
const getUserInfo = async (userId: string) => {
  // 从数据库查询用户数据
  const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
  return user;
};

// ❌ 避免
// Get user information
const getUserInfo = async (userId: string) => {
  // Query user data from database
  const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
  return user;
};
```

## 沟通风格
- 使用简洁、专业的中文
- 技术术语可以保留英文或使用中英文混合（如：React组件、API接口）
- 解释问题时先说结论，再说原因
- 提供代码示例时附带中文说明
