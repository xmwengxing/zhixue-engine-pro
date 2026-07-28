# API 文档

## 概述

智能提分训练平台提供 RESTful API 接口，支持管理员、家长和学员三种角色的功能访问。

### 基础信息

- **Base URL**: `http://localhost:3000/api`
- **认证方式**: JWT Bearer Token
- **请求格式**: JSON
- **响应格式**: JSON
- **字符编码**: UTF-8

### 通用响应格式

#### 成功响应

```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

#### 错误响应

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": { ... },
    "timestamp": "2024-01-20T10:00:00Z",
    "requestId": "uuid"
  }
}
```

### HTTP 状态码

- `200 OK`: 请求成功
- `201 Created`: 资源创建成功
- `400 Bad Request`: 请求参数错误
- `401 Unauthorized`: 未认证或令牌无效
- `403 Forbidden`: 权限不足
- `404 Not Found`: 资源不存在
- `409 Conflict`: 资源冲突
- `422 Unprocessable Entity`: 业务逻辑验证失败
- `500 Internal Server Error`: 服务器内部错误
- `502 Bad Gateway`: AI 服务调用失败
- `503 Service Unavailable`: 服务暂时不可用

---

## 认证接口

### 用户登录


**POST** `/auth/login`

用户登录并获取访问令牌。

**请求体**:
```json
{
  "username": "string",
  "password": "string"
}
```

**响应示例**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "testuser",
    "role": "student"
  }
}
```

### 用户注册

**POST** `/auth/register`

注册新用户，支持家长和学员两种角色。

**请求体**:
```json
{
  "role": "PARENT" | "STUDENT",
  "username": "string",
  "password": "string",
  "email": "string (家长必填)",
  "authCode": "string (学员必填)",
  
  // 家长特有字段（选填）
  "realName": "string",
  "gender": "string",
  "phone": "string",
  "address": "string",
  "industry": "string",
  
  // 学员特有字段
  "studentName": "string (必填)",
  "studentGender": "string (必填)",
  "birthDate": "string (必填, ISO 8601格式)",
  "grade": "string (必填, 如PRIMARY_1_1)",
  "school": "string (选填)",
  "learningFoundation": "string (选填, WEAK|AVERAGE|GOOD|EXCELLENT)",
  "interests": "string (选填)"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "username": "testuser",
    "role": "STUDENT",
    "studentIdNumber": "STU26000001"
  }
}
```

**说明**:
- 家长注册不需要授权码
- 学员注册必须提供有效的授权码
- 学员注册成功后自动生成学号（格式：STU+年份后两位+6位流水号）
- 年级选单值参考标准化年级列表

### 刷新令牌

**POST** `/auth/refresh`

刷新访问令牌。

**请求体**:
```json
{
  "refreshToken": "string"
}
```

**响应示例**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 管理员接口

### 用户管理

#### 获取用户列表

**GET** `/admin/users`


**查询参数**:
- `role`: 角色筛选 (admin/parent/student)
- `page`: 页码 (默认: 1)
- `limit`: 每页数量 (默认: 10)

**响应示例**:
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "testuser",
      "role": "student",
      "status": "active",
      "createdAt": "2024-01-20T10:00:00Z"
    }
  ],
  "total": 100
}
```

#### 创建用户

**POST** `/admin/users`

**请求体**:
```json
{
  "role": "ADMIN" | "PARENT" | "STUDENT",
  "username": "string",
  "password": "string",
  "email": "string (可选)",
  "phone": "string (可选)",
  "authCode": "string (学员角色必填)",
  
  // 家长特有字段（可选）
  "realName": "string",
  "gender": "string",
  "address": "string",
  "industry": "string",
  
  // 学员特有字段
  "studentName": "string (学员角色必填)",
  "studentGender": "string (学员角色必填)",
  "birthDate": "string (学员角色必填)",
  "grade": "string (学员角色必填)",
  "school": "string",
  "learningFoundation": "string",
  "interests": "string"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "username": "testuser",
    "role": "STUDENT",
    "studentIdNumber": "STU26000001"
  }
}
```

#### 更新用户

**PUT** `/admin/users/:id`

**请求体**:
```json
{
  "status": "active|locked|deleted (可选)",
  "email": "string (可选)",
  "phone": "string (可选)",
  "password": "string (可选, 仅管理员角色可修改)",
  
  // 家长用户可修改字段
  "realName": "string",
  "gender": "string",
  "address": "string",
  "industry": "string",
  
  // 学员用户可修改字段（学号和账户名不可修改）
  "grade": "string",
  "school": "string",
  "learningFoundation": "string",
  "interests": "string"
}
```

**说明**:
- 管理员角色用户仅可修改密码
- 学员的学号、账户名、姓名、性别、出生年月不可修改
- 家长和学员的其他字段可以修改

#### 删除用户

**DELETE** `/admin/users/:id`

**响应示例**:
```json
{
  "success": true
}
```

### 学号管理

#### 获取学号列表

**GET** `/admin/student-ids`

**查询参数**:
- `status`: 状态筛选 (available/assigned/locked)
- `page`: 页码
- `limit`: 每页数量


**响应示例**:
```json
{
  "studentIds": [
    {
      "id": "uuid",
      "studentIdNumber": "2024001",
      "status": "available",
      "userId": null,
      "createdAt": "2024-01-20T10:00:00Z"
    }
  ],
  "total": 50
}
```

#### 分配学号

**POST** `/admin/student-ids/assign`

**请求体**:
```json
{
  "studentIdId": "uuid",
  "userId": "uuid"
}
```

#### 锁定学号

**PUT** `/admin/student-ids/:id/lock`

### 授权码管理

#### 获取授权码列表

**GET** `/admin/auth-codes`

**查询参数**:
- `status`: 状态筛选 (unused/used/expired)
- `page`: 页码
- `limit`: 每页数量

#### 批量生成授权码

**POST** `/admin/auth-codes/generate`

**请求体**:
```json
{
  "count": 100,
  "expiryDays": 30
}
```

**响应示例**:
```json
{
  "authCodes": [
    {
      "id": "uuid",
      "code": "ABC123XYZ",
      "status": "unused",
      "expiryDate": "2024-02-20T10:00:00Z"
    }
  ]
}
```

#### 导出授权码

**GET** `/admin/auth-codes/export`

**响应**: CSV 文件下载


### 教材体系管理

#### 获取教材树

**GET** `/admin/materials`

**响应示例**:
```json
{
  "materials": [
    {
      "id": "uuid",
      "name": "人教版",
      "type": "version",
      "children": [
        {
          "id": "uuid",
          "name": "七年级",
          "type": "grade",
          "children": []
        }
      ]
    }
  ]
}
```

#### 创建教材节点

**POST** `/admin/materials`

**请求体**:
```json
{
  "name": "string",
  "type": "version|grade|subject|unit|chapter",
  "parentId": "uuid (可选)",
  "order": 1,
  "metadata": {
    "description": "string (可选)",
    "keywords": ["string"]
  }
}
```

#### 更新教材节点

**PUT** `/admin/materials/:id`

#### 删除教材节点

**DELETE** `/admin/materials/:id`

#### 下载教材导入模板

**GET** `/admin/materials/template`

**响应**: Excel文件下载

**模板格式**:
| 科目 | 教材版本 | 单元 | 备注 | 关键词 |
|------|----------|------|------|--------|
| 数学 | 人教版   | 第一单元 | 加减法 | 计算,基础 |

#### 批量导入教材

**POST** `/admin/materials/import`

**请求**:
- Content-Type: multipart/form-data
- 文件字段名: file
- 文件格式: Excel (.xlsx)

**响应示例**:
```json
{
  "success": true,
  "data": {
    "imported": 50,
    "failed": 2,
    "errors": [
      {
        "row": 3,
        "message": "缺少必填字段：科目"
      },
      {
        "row": 5,
        "message": "教材版本格式不正确"
      }
    ]
  }
}
```

**说明**:
- 必填字段：科目、教材版本、单元
- 选填字段：备注、关键词
- 关键词使用逗号分隔
- 导入失败的行会在响应中列出

### AI 服务配置

#### 获取 AI 服务商列表

**GET** `/admin/ai-providers`

**响应示例**:
```json
{
  "providers": [
    {
      "id": "uuid",
      "name": "OpenAI",
      "type": "openai",
      "model": "gpt-4",
      "priority": 1,
      "status": "active"
    }
  ]
}
```

#### 创建 AI 服务商

**POST** `/admin/ai-providers`

**请求体**:
```json
{
  "name": "string",
  "type": "openai|claude|custom",
  "apiKey": "string",
  "endpoint": "string",
  "model": "string",
  "priority": 1
}
```


#### 更新 AI 服务商

**PUT** `/admin/ai-providers/:id`

#### 获取科目教学指令

**GET** `/admin/ai-instructions`

**查询参数**:
- `subject`: 科目名称 (可选)

**响应示例**:
```json
{
  "instructions": [
    {
      "id": "uuid",
      "subject": "数学",
      "systemPrompt": "你是一位数学老师...",
      "examples": [
        {
          "question": "如何解这道题？",
          "response": "让我们一步步分析..."
        }
      ]
    }
  ]
}
```

#### 更新科目教学指令

**PUT** `/admin/ai-instructions/:subject`

**请求体**:
```json
{
  "systemPrompt": "string",
  "examples": [
    {
      "question": "string",
      "response": "string"
    }
  ]
}
```

### API 监控

#### 获取 API 指标

**GET** `/admin/api-metrics`

**查询参数**:
- `startDate`: 开始日期 (ISO 8601)
- `endDate`: 结束日期 (ISO 8601)

**响应示例**:
```json
{
  "metrics": {
    "totalRequests": 10000,
    "totalTokens": 500000,
    "averageResponseTime": 1200,
    "errorRate": 0.02,
    "providerStats": [
      {
        "providerId": "uuid",
        "name": "OpenAI",
        "requests": 8000,
        "errors": 160
      }
    ]
  }
}
```

### 亲子关系管理

#### 获取亲子关系列表

**GET** `/admin/relations`

**查询参数**:
- `page`: 页码 (默认: 1)
- `limit`: 每页数量 (默认: 10)
- `search`: 搜索关键词（家长或学员姓名/账户名）
- `parentId`: 按家长ID筛选
- `studentId`: 按学员ID筛选

**响应示例**:
```json
{
  "success": true,
  "data": {
    "relations": [
      {
        "id": "uuid",
        "parentId": "uuid",
        "parentName": "张三",
        "parentUsername": "parent01",
        "studentId": "uuid",
        "studentName": "张小明",
        "studentIdNumber": "STU26000001",
        "relation": "父亲",
        "bindedAt": "2024-01-20T10:00:00Z",
        "status": "ACTIVE"
      }
    ],
    "total": 50,
    "page": 1,
    "totalPages": 5
  }
}
```

#### 解绑亲子关系

**DELETE** `/admin/relations/:id/unbind`

**响应示例**:
```json
{
  "success": true,
  "message": "亲子关系已解绑，账户和历史数据已保留"
}
```

**说明**:
- 解绑操作会删除亲子绑定关系
- 家长和学员的账户及历史数据会被保留
- 解绑后家长无法查看该学员的学习数据
- 操作会被记录到审计日志

---

## 家长接口

### 个人中心

#### 获取个人信息

**GET** `/parent/profile`

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "parent01",
    "email": "parent@example.com",
    "realName": "张三",
    "gender": "男",
    "phone": "13800138000",
    "address": "北京市朝阳区",
    "industry": "IT行业",
    "createdAt": "2024-01-20T10:00:00Z"
  }
}
```

#### 更新个人信息

**PUT** `/parent/profile`

**请求体**:
```json
{
  "email": "string (可选)",
  "realName": "string (可选)",
  "gender": "string (可选)",
  "phone": "string (可选)",
  "address": "string (可选)",
  "industry": "string (可选)"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "个人信息更新成功"
}
```

#### 修改密码

**PUT** `/parent/password`

**请求体**:
```json
{
  "currentPassword": "string",
  "newPassword": "string",
  "confirmPassword": "string"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "密码修改成功，请重新登录"
}
```

**说明**:
- 密码修改成功后，当前令牌会失效
- 用户需要使用新密码重新登录
- 新密码至少8个字符

### 亲子关系管理

#### 获取子女列表

**GET** `/parent/children`


**响应示例**:
```json
{
  "children": [
    {
      "id": "uuid",
      "username": "student01",
      "realName": "张三",
      "grade": "七年级",
      "bindedAt": "2024-01-20T10:00:00Z"
    }
  ]
}
```

#### 绑定学员

**POST** `/parent/children/bind`

**请求体**:
```json
{
  "authCode": "string (可选)",
  "studentId": "string (可选)"
}
```

**响应示例**:
```json
{
  "success": true,
  "child": {
    "id": "uuid",
    "username": "student01",
    "realName": "张三"
  }
}
```

#### 创建学员并绑定

**POST** `/parent/children/create`

**请求体**:
```json
{
  "authCode": "string (必填)",
  "username": "string (必填)",
  "password": "string (必填)",
  "studentName": "string (必填)",
  "studentGender": "string (必填)",
  "birthDate": "string (必填, ISO 8601格式)",
  "grade": "string (必填)",
  "school": "string (选填)",
  "learningFoundation": "string (选填)",
  "interests": "string (选填)",
  "relation": "string (必填, 如：父亲/母亲/监护人)"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "studentId": "uuid",
    "username": "student01",
    "studentIdNumber": "STU26000001",
    "initialPassword": "password123",
    "relationId": "uuid"
  }
}
```

**说明**:
- 家长可以直接创建学员账户并自动建立绑定关系
- 需要提供有效的授权码
- 系统自动生成学号
- 返回初始密码，请妥善保管并告知学员

#### 解绑学员

**DELETE** `/parent/children/:id/unbind`

### 学情概览

#### 获取学情数据

**GET** `/parent/overview/:studentId`

**响应示例**:
```json
{
  "abilityRadar": {
    "subjects": ["数学", "语文", "英语"],
    "scores": [85, 78, 92]
  },
  "errorStats": {
    "unmastered": 15,
    "mastering": 8,
    "mastered": 27
  },
  "learningStreak": {
    "days": 7,
    "weeklyHours": 12.5
  }
}
```

### 任务管理

#### 获取任务列表

**GET** `/parent/tasks`

**查询参数**:
- `studentId`: 学员 ID
- `status`: 状态筛选 (pending/in_progress/completed)
- `page`: 页码
- `limit`: 每页数量


#### 创建任务

**POST** `/parent/tasks`

**请求体**:
```json
{
  "studentId": "uuid (必填)",
  "mode": "PROFILE" | "CUSTOM (必填)",
  "title": "string (可选)",
  "aiTeacher": "string (必填, AI科目老师ID)",
  
  // 自定义模式字段
  "customConfig": {
    "subject": "string (必填)",
    "materialVersion": "string (必填)",
    "units": ["uuid1", "uuid2"] (必填, 单元ID数组),
    "goal": "string (必填, 任务目标)",
    "personality": "string (选填, 学员性格特征)",
    "questionCount": 20,
    "difficulty": 3
  },
  
  // 档案提取模式字段（智能训练平台）
  "profileConfig": {
    "trainingGoal": "string (必填, 10-500字符, 训练目标)",
    "diagnosticQuestionCount": 10 (选填, 5-20, 诊断测试题目数量),
    "tempOverrides": {
      "school": "string (选填, 临时修改)",
      "learningFoundation": "string (选填, 临时修改)",
      "interests": "string (选填, 临时修改)"
    }
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "task": {
      "id": "uuid",
      "title": "数学单元测试",
      "mode": "CUSTOM",
      "status": "pending",
      "createdAt": "2024-01-20T10:00:00Z"
    }
  }
}
```

**档案提取模式（智能训练平台）请求示例**:
```json
{
  "studentId": "uuid",
  "mode": "PROFILE",
  "aiTeacher": "math-teacher-id",
  "profileConfig": {
    "trainingGoal": "掌握小学六年级数学上册第一单元分数乘法的基本概念和运算方法，能够熟练进行分数乘法计算，并应用到实际问题中。",
    "diagnosticQuestionCount": 10,
    "tempOverrides": {
      "learningFoundation": "GOOD"
    }
  }
}
```

**说明**:
- **档案提取模式（智能训练平台）**：
  - 系统自动提取学员档案信息（年级、教材版本、学习基础等）
  - 家长只需填写训练目标和诊断题目数量
  - 可临时修改部分档案信息（仅用于当前任务，不更新学员档案）
  - AI 会根据档案信息动态生成所有训练内容
  - 采用"诊断-规划-训练-考试"四阶段模型
  - 训练目标长度：10-500 字符
  - 诊断题目数量：5-20 题，默认 10 题
- **自定义配置模式**：家长完全自主配置所有参数
- AI科目老师的指令由管理员配置的科目指令（第一级）和家长的任务配置（第二级）共同决定
- 临时修改的学员信息不会更新到学员的个人档案

**验证规则**:
- 训练目标不能为空，长度必须在 10-500 字符之间
- 诊断题目数量必须在 5-20 之间
- 学员必须已完善个人档案（年级、教材版本等信息）

#### 获取任务详情

**GET** `/parent/tasks/:id`

### 任务报告

#### 获取报告列表

**GET** `/parent/reports`

**查询参数**:
- `studentId`: 学员 ID
- `page`: 页码
- `limit`: 每页数量

**响应示例**:
```json
{
  "reports": [
    {
      "id": "uuid",
      "taskId": "uuid",
      "studentId": "uuid",
      "generatedAt": "2024-01-20T10:00:00Z",
      "summary": "本次训练表现良好..."
    }
  ],
  "total": 10
}
```

#### 获取报告详情

**GET** `/parent/reports/:id`

**响应示例**:
```json
{
  "report": {
    "id": "uuid",
    "content": {
      "summary": "本次训练表现良好...",
      "abilityAnalysis": {
        "代数运算": 85,
        "几何证明": 78
      },
      "errorAnalysis": [
        {
          "questionId": "uuid",
          "reason": "计算错误",
          "suggestion": "加强基础运算练习"
        }
      ],
      "learningAdvice": "建议重点复习..."
    }
  }
}
```

#### 导出报告

**GET** `/parent/reports/:id/export`

**响应**: PDF 文件下载


### 愿望审批

#### 获取愿望列表

**GET** `/parent/wishes`

**查询参数**:
- `studentId`: 学员 ID
- `status`: 状态筛选 (pending/approved/rejected/fulfilled)
- `page`: 页码
- `limit`: 每页数量

**响应示例**:
```json
{
  "wishes": [
    {
      "id": "uuid",
      "studentId": "uuid",
      "description": "想要一本新书",
      "requiredPoints": 100,
      "status": "pending",
      "submittedAt": "2024-01-20T10:00:00Z"
    }
  ],
  "total": 5
}
```

#### 审批愿望

**PUT** `/parent/wishes/:id/approve`

**请求体**:
```json
{
  "approved": true,
  "reason": "表现很好，同意兑现 (可选)"
}
```

**响应示例**:
```json
{
  "wish": {
    "id": "uuid",
    "status": "approved",
    "reviewedAt": "2024-01-20T10:00:00Z"
  }
}
```

---

## 学员接口

### 个人档案

#### 获取个人档案

**GET** `/student/profile`

**响应示例**:
```json
{
  "profile": {
    "id": "uuid",
    "userId": "uuid",
    "username": "student01",
    "studentIdNumber": "STU26000001",
    "realName": "张小明",
    "gender": "男",
    "birthDate": "2010-05-15",
    "grade": "PRIMARY_6_1",
    "school": "北京小学",
    "materialVersion": "人教版",
    "learningFoundation": "GOOD",
    "interests": "数学、编程",
    "subjectLevels": {
      "数学": "good",
      "语文": "average",
      "英语": "excellent"
    },
    "completeness": 85
  }
}
```

**说明**:
- studentIdNumber（学号）不可修改
- username（账户名）不可修改
- realName（姓名）不可修改
- gender（性别）不可修改
- birthDate（出生年月）不可修改

#### 更新个人档案

**PUT** `/student/profile`

**请求体**:
```json
{
  "grade": "string (可选, 如PRIMARY_6_2)",
  "school": "string (可选)",
  "materialVersion": "string (可选)",
  "learningFoundation": "string (可选, WEAK|AVERAGE|GOOD|EXCELLENT)",
  "interests": "string (可选)",
  "subjectLevels": {
    "数学": "weak|average|good|excellent"
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "个人档案更新成功"
}
```

**说明**:
- 只能修改可编辑字段
- 核心身份信息（学号、账户名、姓名、性别、出生年月）不可修改
- 年级选单使用标准化格式
- 学习基础分为四个等级：薄弱(WEAK)、一般(AVERAGE)、良好(GOOD)、优秀(EXCELLENT)

#### 修改密码

**PUT** `/student/password`

**请求体**:
```json
{
  "currentPassword": "string",
  "newPassword": "string",
  "confirmPassword": "string"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "密码修改成功，请重新登录"
}
```

**说明**:
- 密码修改成功后，当前令牌会失效
- 需要使用新密码重新登录


#### 提交学习基础自评

**POST** `/student/profile/self-assessment`

**请求体**:
```json
{
  "subject": "数学",
  "level": "weak|average|good|excellent"
}
```

### 训练舱

#### 获取当前任务

**GET** `/student/tasks/current`

**响应示例**:
```json
{
  "task": {
    "id": "uuid",
    "title": "数学单元测试",
    "status": "pending",
    "config": {
      "questionCount": 20,
      "difficulty": 3
    }
  }
}
```

#### 开始训练

**POST** `/student/training/start/:taskId`

**响应示例**:
```json
{
  "session": {
    "id": "uuid",
    "taskId": "uuid",
    "phase": "pre_test",
    "currentStep": 1,
    "totalSteps": 5,
    "progress": 0
  }
}
```

#### 获取训练会话

**GET** `/student/training/session/:sessionId`

**响应示例**:
```json
{
  "session": {
    "id": "uuid",
    "phase": "training",
    "currentStep": 3,
    "totalSteps": 5,
    "progress": 60,
    "questions": ["uuid1", "uuid2", "uuid3"]
  }
}
```

#### 提交答案

**POST** `/student/training/answer`

**请求体**:
```json
{
  "sessionId": "uuid",
  "questionId": "uuid",
  "answer": "string"
}
```

**响应示例**:
```json
{
  "correct": true,
  "feedback": "回答正确！",
  "nextQuestion": {
    "id": "uuid",
    "type": "choice",
    "content": "题目内容...",
    "options": ["A", "B", "C", "D"]
  }
}
```


#### 完成训练

**POST** `/student/training/complete/:sessionId`

**响应示例**:
```json
{
  "report": {
    "id": "uuid",
    "summary": "本次训练表现良好..."
  },
  "points": 50
}
```

### 智能训练平台（档案提取模式）

智能训练平台采用"诊断-规划-训练-考试"四阶段模型，通过 AI 动态生成所有训练内容，实现个性化学习体验。

#### 训练阶段说明

训练会话包含以下阶段：

1. **DIAGNOSTIC_TEST**: 诊断测试阶段 - AI 根据学员档案逐题生成诊断题目
2. **PLANNING**: 规划阶段 - AI 分析诊断结果并生成详细训练计划
3. **GUIDED_TRAINING**: 引导式训练阶段 - 包含基础巩固、能力提升、综合应用三个子阶段
4. **FINAL_EXAM**: 综合考试阶段 - 大型验收考试，禁用 AI 助手
5. **COMPLETED**: 完成阶段 - 生成训练报告并发放积分

#### 创建训练会话

**POST** `/student/training/start/:taskId`

为档案提取模式的任务创建训练会话。

**路径参数**:
- `taskId`: 任务 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "uuid",
      "taskId": "uuid",
      "phase": "DIAGNOSTIC_TEST",
      "diagnosticTest": {
        "totalQuestions": 10,
        "currentQuestion": 0,
        "answers": []
      },
      "createdAt": "2024-01-20T10:00:00Z"
    }
  }
}
```

**说明**:
- 仅支持档案提取模式的任务
- 会话初始阶段为 DIAGNOSTIC_TEST
- 诊断题目数量由任务配置决定（5-20题）

#### 获取会话状态

**GET** `/student/training/session/:sessionId`

获取当前训练会话的完整状态。

**路径参数**:
- `sessionId`: 会话 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "uuid",
      "taskId": "uuid",
      "phase": "GUIDED_TRAINING",
      "diagnosticTest": {
        "totalQuestions": 10,
        "currentQuestion": 10,
        "answers": [...],
        "results": {
          "accuracy": 0.7,
          "weakPoints": ["代数运算", "几何证明"]
        }
      },
      "trainingPlan": {
        "learningGoals": {...},
        "stages": {...}
      },
      "guidedTraining": {
        "currentStage": "foundation",
        "stages": {
          "foundation": {
            "completed": false,
            "totalQuestions": 15,
            "currentQuestion": 5
          }
        }
      }
    }
  }
}
```

#### 获取下一道题目

**GET** `/student/training/next-question/:sessionId`

获取当前阶段的下一道题目。AI 会根据学员档案和当前阶段动态生成题目。

**路径参数**:
- `sessionId`: 会话 ID

**响应示例（诊断测试阶段）**:
```json
{
  "success": true,
  "data": {
    "question": {
      "id": "uuid",
      "questionNumber": 1,
      "totalQuestions": 10,
      "stem": "计算：3 + 5 = ?",
      "type": "single_choice",
      "options": ["6", "7", "8", "9"],
      "knowledgePoint": "加法运算",
      "difficulty": "easy"
    },
    "phase": "DIAGNOSTIC_TEST",
    "loading": false
  }
}
```

**响应示例（训练阶段）**:
```json
{
  "success": true,
  "data": {
    "question": {
      "id": "uuid",
      "questionNumber": 3,
      "totalQuestions": 15,
      "stem": "解方程：2x + 3 = 7",
      "type": "fill_blank",
      "knowledgePoint": "一元一次方程",
      "difficulty": "medium",
      "hint": "先移项，再化简"
    },
    "phase": "GUIDED_TRAINING",
    "stage": "foundation",
    "loading": false
  }
}
```

**响应示例（生成中）**:
```json
{
  "success": true,
  "data": {
    "loading": true,
    "message": "AI 正在为你生成题目，请稍候..."
  }
}
```

**错误响应**:
```json
{
  "error": {
    "code": "AI_SERVICE_ERROR",
    "message": "AI 服务暂时不可用，请稍后重试",
    "timestamp": "2024-01-20T10:00:00Z"
  }
}
```

**说明**:
- 题目由 AI 实时生成，可能需要 5-10 秒
- 诊断测试阶段：题目难度从易到难，覆盖不同知识点
- 训练阶段：题目针对薄弱知识点，包含详细讲解
- 考试阶段：一次性生成所有题目

#### 提交答案

**POST** `/student/training/submit-answer/:sessionId`

提交当前题目的答案，获取 AI 判断和反馈。

**路径参数**:
- `sessionId`: 会话 ID

**请求体**:
```json
{
  "questionId": "uuid",
  "answer": "8",
  "timeSpent": 45
}
```

**响应示例（答对）**:
```json
{
  "success": true,
  "data": {
    "isCorrect": true,
    "correctAnswer": "8",
    "feedback": "回答正确！你对加法运算掌握得很好。",
    "explanation": "3 + 5 = 8，这是基础的加法运算。",
    "nextAvailable": true
  }
}
```

**响应示例（答错 - 诊断阶段）**:
```json
{
  "success": true,
  "data": {
    "isCorrect": false,
    "correctAnswer": "8",
    "feedback": "答案不正确。让我们一起分析一下这道题。",
    "explanation": "3 + 5 = 8。加法运算需要将两个数相加。",
    "guidance": "建议：加强基础加法运算练习。",
    "nextAvailable": true
  }
}
```

**响应示例（答错 - 训练阶段）**:
```json
{
  "success": true,
  "data": {
    "isCorrect": false,
    "correctAnswer": "x = 2",
    "feedback": "答案不正确，但不要气馁！",
    "explanation": "解方程步骤：\n1. 移项：2x = 7 - 3\n2. 化简：2x = 4\n3. 求解：x = 2",
    "guidance": "你可以重新尝试这道题，或者向 AI 助手求助。",
    "canRetry": true,
    "nextAvailable": false
  }
}
```

**说明**:
- AI 会判断答案正确性并生成详细反馈
- 诊断阶段：答错后自动进入下一题
- 训练阶段：答错后可以重做或求助 AI 助手
- 考试阶段：答案提交后不可修改

#### 确认训练计划

**POST** `/student/training/confirm-plan/:sessionId`

学员确认 AI 生成的训练计划，开始引导式训练。

**路径参数**:
- `sessionId`: 会话 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "message": "训练计划已确认，开始训练！",
    "phase": "GUIDED_TRAINING",
    "currentStage": "foundation"
  }
}
```

**说明**:
- 仅在 PLANNING 阶段可调用
- 确认后会话进入 GUIDED_TRAINING 阶段
- 开始基础巩固阶段训练

#### 完成训练阶段

**POST** `/student/training/complete-stage/:sessionId`

完成当前训练阶段（基础巩固/能力提升/综合应用），获取阶段小结。

**路径参数**:
- `sessionId`: 会话 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "stageSummary": {
      "stage": "foundation",
      "stageName": "基础巩固",
      "totalQuestions": 15,
      "correctCount": 12,
      "accuracy": 0.8,
      "timeSpent": 1800,
      "highlights": [
        "加法运算掌握良好",
        "减法运算有所提升"
      ],
      "improvements": [
        "乘法运算需要加强练习",
        "建议多做综合题目"
      ]
    },
    "nextStage": "improvement",
    "allStagesCompleted": false
  }
}
```

**响应示例（所有阶段完成）**:
```json
{
  "success": true,
  "data": {
    "stageSummary": {...},
    "allStagesCompleted": true,
    "message": "所有训练阶段已完成，准备进入综合考试！"
  }
}
```

**说明**:
- 完成当前阶段的所有题目后才能调用
- AI 会生成阶段小结报告
- 所有阶段完成后自动准备综合考试

#### 开始综合考试

**POST** `/student/training/start-exam/:sessionId`

开始综合考试，AI 一次性生成所有考试题目。

**路径参数**:
- `sessionId`: 会话 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "exam": {
      "totalQuestions": 30,
      "timeLimit": 3600,
      "questions": [
        {
          "id": "uuid",
          "questionNumber": 1,
          "stem": "计算：15 × 3 = ?",
          "type": "single_choice",
          "options": ["40", "45", "50", "55"],
          "knowledgePoint": "乘法运算",
          "difficulty": "easy"
        },
        {
          "id": "uuid",
          "questionNumber": 2,
          "stem": "解方程：3x - 5 = 10",
          "type": "fill_blank",
          "knowledgePoint": "一元一次方程",
          "difficulty": "medium"
        }
        // ... 更多题目
      ],
      "difficultyDistribution": {
        "easy": 12,
        "medium": 12,
        "hard": 6
      },
      "passingScore": 70
    },
    "phase": "FINAL_EXAM",
    "aiAssistantDisabled": true
  }
}
```

**说明**:
- 仅在所有训练阶段完成后可调用
- 题目数量 20-50 题，由训练计划决定
- 难度分布：基础题 40%、中等题 40%、难题 20%
- 考试期间 AI 助手功能被禁用
- 设置时间限制（通常 60-90 分钟）

#### 提交综合考试

**POST** `/student/training/submit-exam/:sessionId`

提交综合考试的所有答案，触发报告生成。

**路径参数**:
- `sessionId`: 会话 ID

**请求体**:
```json
{
  "answers": [
    {
      "questionId": "uuid",
      "answer": "45",
      "timeSpent": 30
    },
    {
      "questionId": "uuid",
      "answer": "x = 5",
      "timeSpent": 120
    }
    // ... 所有题目的答案
  ]
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "examResults": {
      "totalQuestions": 30,
      "correctCount": 24,
      "accuracy": 0.8,
      "score": 80,
      "passed": true,
      "timeSpent": 2400,
      "knowledgePointScores": {
        "加法运算": 0.9,
        "减法运算": 0.85,
        "乘法运算": 0.75,
        "除法运算": 0.7
      }
    },
    "phase": "COMPLETED",
    "reportGenerating": true,
    "message": "考试已提交，AI 正在生成训练报告..."
  }
}
```

**说明**:
- 必须提交所有题目的答案
- AI 会批改所有题目并计算成绩
- 及格标准通常为 70 分
- 提交后会话进入 COMPLETED 阶段
- 触发训练报告生成（需要 20-30 秒）

#### 获取训练报告

**GET** `/student/training/report/:sessionId`

获取完整的训练报告，包含诊断分析、训练回顾、考试成绩和学习建议。

**路径参数**:
- `sessionId`: 会话 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "report": {
      "id": "uuid",
      "sessionId": "uuid",
      "diagnosticAnalysis": {
        "totalQuestions": 10,
        "accuracy": 0.7,
        "weakPoints": ["乘法运算", "除法运算"],
        "initialLevel": "良好"
      },
      "trainingReview": {
        "foundation": {
          "totalQuestions": 15,
          "accuracy": 0.8,
          "timeSpent": 1800,
          "highlights": ["加法运算掌握良好"],
          "improvements": ["乘法运算有所提升"]
        },
        "improvement": {
          "totalQuestions": 20,
          "accuracy": 0.85,
          "timeSpent": 2400,
          "highlights": ["综合运算能力提升"],
          "improvements": ["解题速度加快"]
        },
        "application": {
          "totalQuestions": 12,
          "accuracy": 0.75,
          "timeSpent": 1500,
          "highlights": ["实际应用能力良好"],
          "improvements": ["复杂问题分析能力增强"]
        }
      },
      "examResults": {
        "totalScore": 80,
        "accuracy": 0.8,
        "knowledgePointScores": [
          {
            "point": "加法运算",
            "score": 90,
            "accuracy": 0.9
          },
          {
            "point": "乘法运算",
            "score": 75,
            "accuracy": 0.75
          }
        ]
      },
      "improvement": {
        "accuracyImprovement": 0.1,
        "masteredPoints": ["加法运算", "减法运算"],
        "improvedPoints": ["乘法运算"]
      },
      "weaknessAnalysis": {
        "remainingWeakPoints": ["除法运算"],
        "suggestions": [
          "建议加强除法运算的基础练习",
          "多做综合应用题目"
        ]
      },
      "recommendations": {
        "nextSteps": [
          "继续巩固除法运算",
          "开始学习分数运算"
        ],
        "focusAreas": ["除法运算", "综合应用"],
        "studyMethods": [
          "每天练习 10 道除法题",
          "结合实际场景理解运算"
        ]
      },
      "pointsAwarded": 150,
      "content": "# 训练报告\n\n## 诊断测试分析\n...",
      "generatedAt": "2024-01-20T10:00:00Z"
    }
  }
}
```

**响应示例（报告生成中）**:
```json
{
  "success": true,
  "data": {
    "generating": true,
    "message": "AI 正在生成训练报告，请稍候...",
    "progress": 60
  }
}
```

**说明**:
- 仅在 COMPLETED 阶段可调用
- 报告生成需要 20-30 秒
- 报告包含 Markdown 格式的完整内容
- 根据表现自动计算并发放积分
- 家长端也可以查看该报告

#### AI 助手对话

**POST** `/student/training/chat/:sessionId`

在训练过程中与 AI 助手对话，获取启发式引导。

**路径参数**:
- `sessionId`: 会话 ID

**请求体**:
```json
{
  "message": "这道题我不太理解，能给我一些提示吗？",
  "context": {
    "questionId": "uuid",
    "currentAnswer": "x = 3"
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "reply": "让我们一起分析这道方程题：\n\n1. 首先，你注意到方程的结构了吗？\n2. 移项时需要注意什么？\n3. 你觉得第一步应该做什么？\n\n试着按照这些思路重新思考一下。",
    "timestamp": "2024-01-20T10:00:00Z"
  }
}
```

**错误响应（考试期间）**:
```json
{
  "error": {
    "code": "AI_ASSISTANT_DISABLED",
    "message": "考试期间 AI 助手功能已禁用",
    "timestamp": "2024-01-20T10:00:00Z"
  }
}
```

**说明**:
- 仅在 DIAGNOSTIC_TEST 和 GUIDED_TRAINING 阶段可用
- 考试阶段（FINAL_EXAM）AI 助手被禁用
- AI 提供启发式引导，不直接给出答案
- 答错题目时 AI 会主动提供思路引导
- 对话历史会保存在会话中

### AI 助手

#### AI 对话

**POST** `/student/ai/chat`

**请求体**:
```json
{
  "sessionId": "uuid",
  "message": "这道题我不太理解",
  "context": {
    "questionId": "uuid",
    "answer": "string (可选)"
  }
}
```

**响应示例**:
```json
{
  "reply": "让我们一起分析这道题..."
}
```

### 错题本

#### 获取错题列表

**GET** `/student/errors`

**查询参数**:
- `subject`: 科目筛选
- `mastery`: 掌握度筛选 (unmastered/mastering/mastered)
- `page`: 页码
- `limit`: 每页数量

**响应示例**:
```json
{
  "errors": [
    {
      "id": "uuid",
      "questionId": "uuid",
      "subject": "数学",
      "mastery": "unmastered",
      "retryCount": 0,
      "collectedAt": "2024-01-20T10:00:00Z"
    }
  ],
  "total": 15
}
```

#### 获取错题详情

**GET** `/student/errors/:id`

**响应示例**:
```json
{
  "error": {
    "id": "uuid",
    "question": {
      "id": "uuid",
      "content": "题目内容...",
      "answer": "正确答案"
    },
    "studentAnswer": "学员答案",
    "mastery": "unmastered"
  }
}
```

#### 开始错题重做

**POST** `/student/errors/:id/retry`

**响应示例**:
```json
{
  "session": {
    "id": "uuid",
    "errorId": "uuid",
    "questionId": "uuid"
  }
}
```


#### 更新错题掌握度

**PUT** `/student/errors/:id/mastery`

**请求体**:
```json
{
  "mastery": "unmastered|mastering|mastered"
}
```

### 积分与愿望

#### 获取积分信息

**GET** `/student/points`

**响应示例**:
```json
{
  "available": 250,
  "total": 500,
  "history": [
    {
      "id": "uuid",
      "amount": 50,
      "type": "task_complete",
      "balance": 250,
      "createdAt": "2024-01-20T10:00:00Z"
    }
  ]
}
```

#### 获取愿望列表

**GET** `/student/wishes`

**查询参数**:
- `status`: 状态筛选 (pending/approved/rejected/fulfilled)
- `page`: 页码
- `limit`: 每页数量

**响应示例**:
```json
{
  "wishes": [
    {
      "id": "uuid",
      "description": "想要一本新书",
      "requiredPoints": 100,
      "status": "pending",
      "submittedAt": "2024-01-20T10:00:00Z"
    }
  ],
  "total": 3
}
```

#### 提交愿望

**POST** `/student/wishes`

**请求体**:
```json
{
  "description": "string",
  "requiredPoints": 100,
  "imageUrl": "string (可选)"
}
```

**响应示例**:
```json
{
  "wish": {
    "id": "uuid",
    "description": "想要一本新书",
    "status": "pending",
    "submittedAt": "2024-01-20T10:00:00Z"
  }
}
```

#### 获取愿望详情

**GET** `/student/wishes/:id`

---

## 标准化数据说明

### 年级选单

系统使用标准化的年级编码，前后端保持一致：

**小学**:
- `PRIMARY_1_1`: 一年级上
- `PRIMARY_1_2`: 一年级下
- `PRIMARY_2_1`: 二年级上
- `PRIMARY_2_2`: 二年级下
- `PRIMARY_3_1`: 三年级上
- `PRIMARY_3_2`: 三年级下
- `PRIMARY_4_1`: 四年级上
- `PRIMARY_4_2`: 四年级下
- `PRIMARY_5_1`: 五年级上
- `PRIMARY_5_2`: 五年级下
- `PRIMARY_6_1`: 六年级上
- `PRIMARY_6_2`: 六年级下

**初中**:
- `MIDDLE_1_1`: 初一上
- `MIDDLE_1_2`: 初一下
- `MIDDLE_2_1`: 初二上
- `MIDDLE_2_2`: 初二下
- `MIDDLE_3_1`: 初三上
- `MIDDLE_3_2`: 初三下

**高中**:
- `HIGH_1_1`: 高一上
- `HIGH_1_2`: 高一下
- `HIGH_2_1`: 高二上
- `HIGH_2_2`: 高二下
- `HIGH_3_1`: 高三上
- `HIGH_3_2`: 高三下

### 学习基础等级

学习基础分为四个标准化等级：

- `WEAK`: 薄弱 - 需要加强基础
- `AVERAGE`: 一般 - 基础还可以
- `GOOD`: 良好 - 掌握不错
- `EXCELLENT`: 优秀 - 非常好

### 学号格式

学号格式：`STU` + `年份后两位` + `6位流水号`

**示例**:
- 2026年第1个学员：`STU26000001`
- 2026年第100个学员：`STU26000100`
- 2027年第1个学员：`STU27000001`

**规则**:
- 学号在学员注册或家长创建学员时自动生成
- 流水号按年份独立计数，每年从000001开始
- 学号全局唯一，创建后不可修改

---

## 认证说明

所有需要认证的接口都需要在请求头中携带 JWT Token：

```
Authorization: Bearer <token>
```

### 获取 Token

通过登录接口获取：

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'
```


### 使用 Token

在后续请求中携带 Token：

```bash
curl -X GET http://localhost:3000/api/student/profile \
  -H "Authorization: Bearer <your-token>"
```

---

## 错误代码参考

| 错误代码 | 描述 | HTTP 状态码 |
|---------|------|------------|
| `INVALID_CREDENTIALS` | 用户名或密码错误 | 401 |
| `TOKEN_EXPIRED` | 令牌已过期 | 401 |
| `TOKEN_INVALID` | 令牌无效 | 401 |
| `PERMISSION_DENIED` | 权限不足 | 403 |
| `RESOURCE_NOT_FOUND` | 资源不存在 | 404 |
| `DUPLICATE_RESOURCE` | 资源已存在 | 409 |
| `INVALID_AUTH_CODE` | 授权码无效 | 422 |
| `INSUFFICIENT_POINTS` | 积分不足 | 422 |
| `VALIDATION_ERROR` | 参数验证失败 | 422 |
| `INVALID_TRAINING_GOAL` | 训练目标格式不正确（长度不在10-500字符） | 422 |
| `INVALID_QUESTION_COUNT` | 诊断题目数量不正确（必须在5-20之间） | 422 |
| `INCOMPLETE_PROFILE` | 学员档案信息不完整 | 422 |
| `INVALID_PHASE_TRANSITION` | 训练阶段转换不合法 | 422 |
| `STAGE_NOT_COMPLETED` | 当前训练阶段未完成 | 422 |
| `AI_ASSISTANT_DISABLED` | AI 助手在当前阶段不可用（考试期间） | 422 |
| `AI_SERVICE_ERROR` | AI 服务调用失败 | 502 |
| `AI_SERVICE_TIMEOUT` | AI 服务响应超时 | 504 |
| `SERVICE_UNAVAILABLE` | 服务暂时不可用 | 503 |
| `INTERNAL_ERROR` | 服务器内部错误 | 500 |

---

## 请求示例

### 使用 cURL

```bash
# 登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'

# 获取个人档案
curl -X GET http://localhost:3000/api/student/profile \
  -H "Authorization: Bearer <token>"

# 提交答案
curl -X POST http://localhost:3000/api/student/training/answer \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "uuid",
    "questionId": "uuid",
    "answer": "A"
  }'
```

### 使用 JavaScript (Axios)

```javascript
import axios from 'axios';

// 配置基础 URL 和拦截器
const api = axios.create({
  baseURL: 'http://localhost:3000/api',
});

// 添加请求拦截器
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 登录
const login = async (username, password) => {
  const response = await api.post('/auth/login', { username, password });
  localStorage.setItem('token', response.data.token);
  return response.data;
};

// 获取个人档案
const getProfile = async () => {
  const response = await api.get('/student/profile');
  return response.data.profile;
};
```


### 使用 Python (requests)

```python
import requests

BASE_URL = 'http://localhost:3000/api'

# 登录
def login(username, password):
    response = requests.post(
        f'{BASE_URL}/auth/login',
        json={'username': username, 'password': password}
    )
    return response.json()

# 获取个人档案
def get_profile(token):
    headers = {'Authorization': f'Bearer {token}'}
    response = requests.get(
        f'{BASE_URL}/student/profile',
        headers=headers
    )
    return response.json()

# 使用示例
login_data = login('testuser', 'password123')
token = login_data['token']
profile = get_profile(token)
print(profile)
```

---

## 分页说明

所有列表接口都支持分页，使用以下查询参数：

- `page`: 页码，从 1 开始 (默认: 1)
- `limit`: 每页数量 (默认: 10，最大: 100)

**响应格式**:
```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 10,
  "totalPages": 10
}
```

---

## 速率限制

为保护服务器资源，API 实施以下速率限制：

- **认证接口**: 每 IP 每分钟 10 次请求
- **AI 对话接口**: 每用户每分钟 20 次请求
- **其他接口**: 每用户每分钟 100 次请求

超过限制将返回 `429 Too Many Requests` 状态码。

---

## 版本控制

当前 API 版本: **v1**

未来版本将通过 URL 路径区分：
- v1: `/api/...`
- v2: `/api/v2/...`

---

## 支持与反馈

如有问题或建议，请联系开发团队或提交 Issue。

**最后更新**: 2024-01-20

