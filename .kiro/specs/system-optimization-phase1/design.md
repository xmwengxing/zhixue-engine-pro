# 设计文档 - 系统优化第一阶段

## 概述

本设计文档描述了智能提分训练平台系统优化第一阶段的技术实现方案。本次优化主要涉及用户注册流程、个人信息管理、教材体系、任务管理、授权码规则等核心功能的改进和增强。

### 设计目标

1. **优化用户体验**: 简化注册流程,提供差异化的角色注册体验
2. **增强数据管理**: 改进学号生成规则,优化教材体系管理
3. **完善功能模块**: 修复现有bug,增强个人中心和任务管理功能
4. **提升系统质量**: 加强数据验证、错误处理和安全性

### 技术栈

- **前端**: React 18 + TypeScript + Tailwind CSS
- **后端**: Node.js + Express + TypeScript
- **数据库**: PostgreSQL + Prisma ORM
- **认证**: JWT (JSON Web Tokens)
- **验证**: Zod (schema validation)

## 架构设计

### 系统架构

系统采用前后端分离的架构,前端通过RESTful API与后端通信。

```
┌─────────────────┐
│   前端应用      │
│  (React + TS)   │
└────────┬────────┘
         │ HTTP/HTTPS
         │ (JWT Token)
┌────────▼────────┐
│   后端API服务   │
│ (Express + TS)  │
└────────┬────────┘
         │ Prisma ORM
┌────────▼────────┐
│  PostgreSQL DB  │
└─────────────────┘
```

### 模块划分

1. **认证模块** (Auth Module)
   - 用户注册(支持角色选择)
   - 用户登录
   - JWT令牌管理

2. **用户管理模块** (User Management Module)
   - 管理员用户CRUD
   - 个人中心信息管理
   - 密码修改

3. **学号管理模块** (Student ID Module)
   - 学号生成算法
   - 学号分配和管理

4. **授权码模块** (Auth Code Module)
   - 授权码生成
   - 授权码验证和使用

5. **亲子关系模块** (Parent-Child Module)
   - 家长添加学员
   - 亲子关系绑定/解绑
   - 关系查询

6. **教材管理模块** (Material Module)
   - 教材CRUD
   - 批量导入
   - 教材查询

7. **任务管理模块** (Task Module)
   - 任务配置(两种模式)
   - 任务创建和推送


## 组件和接口设计

### 1. 注册流程优化

#### 前端组件设计

**Register.tsx 组件重构**

```typescript
interface RegisterFormData {
  role: 'PARENT' | 'STUDENT';
  username: string;
  password: string;
  confirmPassword: string;
  email?: string;
  authCode?: string;
  
  // 家长特有字段
  parentName?: string;
  parentGender?: string;
  parentPhone?: string;
  parentAddress?: string;
  parentIndustry?: string;
  
  // 学员特有字段
  studentName?: string;
  studentGender?: string;
  birthDate?: string;
  grade?: string;
  school?: string;
  learningFoundation?: string;
  interests?: string;
}
```

**组件状态管理**
- 使用useState管理表单数据和角色选择
- 根据角色动态渲染不同的表单字段
- 实时表单验证和错误提示

#### 后端API设计

**POST /api/auth/register**

请求体:
```typescript
{
  role: 'PARENT' | 'STUDENT',
  username: string,
  password: string,
  email?: string,
  authCode?: string, // 仅学员需要
  
  // 角色特定字段
  profile?: {
    name?: string,
    gender?: string,
    phone?: string,
    address?: string,
    industry?: string,
    birthDate?: string,
    grade?: string,
    school?: string,
    learningFoundation?: string,
    interests?: string
  }
}
```

响应:
```typescript
{
  success: boolean,
  data: {
    userId: string,
    username: string,
    role: string,
    studentIdNumber?: string // 仅学员返回
  }
}
```

#### 数据库模型调整

需要在User表中添加家长特有字段:

```prisma
model User {
  // ... 现有字段
  
  // 家长特有字段
  realName     String?
  gender       String?
  address      String?
  industry     String?
}
```

学员信息继续使用StudentProfile表存储。

### 2. 学号生成规则优化

#### 学号生成算法

**格式**: STU + 年份后两位 + 6位流水号

**实现逻辑**:
```typescript
async function generateStudentId(): Promise<string> {
  const year = new Date().getFullYear() % 100; // 获取年份后两位
  const yearPrefix = year.toString().padStart(2, '0');
  
  // 查询当年已生成的最大流水号
  const lastStudent = await prisma.studentID.findFirst({
    where: {
      studentIdNumber: {
        startsWith: `STU${yearPrefix}`
      }
    },
    orderBy: {
      studentIdNumber: 'desc'
    }
  });
  
  let sequence = 1;
  if (lastStudent) {
    const lastSequence = parseInt(lastStudent.studentIdNumber.slice(-6));
    sequence = lastSequence + 1;
  }
  
  const sequenceStr = sequence.toString().padStart(6, '0');
  return `STU${yearPrefix}${sequenceStr}`;
}
```

**并发安全**: 使用数据库事务和唯一约束确保学号唯一性

### 3. 个人中心功能

#### 家长个人中心

**前端组件**: ParentProfileCenter.tsx

**功能模块**:
1. 个人信息展示和编辑
2. 密码修改
3. 邮箱验证(可选)

**API接口**:
- GET /api/parent/profile - 获取个人信息
- PUT /api/parent/profile - 更新个人信息
- PUT /api/parent/password - 修改密码

#### 学员个人档案增强

**前端组件**: StudentProfileManagement.tsx (已存在,需增强)

**新增功能**:
- 密码修改入口
- 年级选单更新
- 学习基础选单更新

**API接口**:
- PUT /api/student/profile - 更新档案信息
- PUT /api/student/password - 修改密码

### 4. 管理员用户管理修复

#### 问题分析

当前UserManagement.tsx组件中的新增、编辑、删除按钮没有实际功能实现。

#### 解决方案

**新增用户弹窗组件**: CreateUserModal.tsx

```typescript
interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

// 支持选择角色并显示对应字段
```

**编辑用户弹窗组件**: EditUserModal.tsx

```typescript
interface EditUserModalProps {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

// 根据角色限制可编辑字段
// 管理员角色仅可修改密码
```

**删除确认弹窗组件**: DeleteUserModal.tsx

**API接口**:
- POST /api/admin/users - 创建用户
- PUT /api/admin/users/:id - 更新用户
- DELETE /api/admin/users/:id - 删除用户

### 5. 授权码使用规则调整

#### 业务规则

1. 家长注册: 不需要授权码
2. 学员注册: 需要授权码
3. 家长添加学员: 需要授权码
4. 管理员创建学员: 需要授权码

#### 实现逻辑

```typescript
async function validateAuthCode(
  code: string,
  role: 'PARENT' | 'STUDENT'
): Promise<boolean> {
  // 家长不需要验证授权码
  if (role === 'PARENT') {
    return true;
  }
  
  // 学员需要验证授权码
  const authCode = await prisma.authCode.findUnique({
    where: { code }
  });
  
  if (!authCode) {
    throw new Error('授权码不存在');
  }
  
  if (authCode.status !== 'UNUSED') {
    throw new Error('授权码已被使用或已过期');
  }
  
  if (authCode.expiryDate < new Date()) {
    await prisma.authCode.update({
      where: { id: authCode.id },
      data: { status: 'EXPIRED' }
    });
    throw new Error('授权码已过期');
  }
  
  return true;
}
```


### 6. 家长添加学员流程

#### 业务流程

```
家长点击"添加学员" 
  → 填写学员信息表单
  → 输入授权码
  → 提交
  → 后端验证授权码
  → 创建学员账户
  → 生成学号
  → 建立亲子绑定关系
  → 返回学员信息和初始密码
```

#### API设计

**POST /api/parent/children/create**

请求体:
```typescript
{
  authCode: string,
  username: string,
  password: string,
  profile: {
    name: string,
    gender: string,
    birthDate: string,
    grade: string,
    school?: string,
    learningFoundation?: string,
    interests?: string
  },
  relation: string // 父亲/母亲/监护人
}
```

响应:
```typescript
{
  success: boolean,
  data: {
    studentId: string,
    username: string,
    studentIdNumber: string,
    initialPassword: string,
    relationId: string
  }
}
```

#### 实现逻辑

```typescript
async function createStudentByParent(
  parentId: string,
  data: CreateStudentData
): Promise<CreateStudentResult> {
  return await prisma.$transaction(async (tx) => {
    // 1. 验证授权码
    await validateAuthCode(data.authCode, 'STUDENT');
    
    // 2. 创建用户账户
    const user = await tx.user.create({
      data: {
        username: data.username,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: 'STUDENT',
        status: 'ACTIVE'
      }
    });
    
    // 3. 生成并分配学号
    const studentIdNumber = await generateStudentId();
    await tx.studentID.create({
      data: {
        studentIdNumber,
        userId: user.id,
        status: 'ASSIGNED',
        assignedAt: new Date()
      }
    });
    
    // 4. 创建学员档案
    await tx.studentProfile.create({
      data: {
        userId: user.id,
        realName: data.profile.name,
        grade: data.profile.grade,
        // ... 其他字段
      }
    });
    
    // 5. 标记授权码为已使用
    await tx.authCode.update({
      where: { code: data.authCode },
      data: {
        status: 'USED',
        usedBy: user.id,
        usedAt: new Date()
      }
    });
    
    // 6. 建立亲子绑定关系
    const relation = await tx.parentChildRelation.create({
      data: {
        parentId,
        studentId: user.id,
        relation: data.relation,
        status: 'ACTIVE'
      }
    });
    
    return {
      studentId: user.id,
      username: user.username,
      studentIdNumber,
      initialPassword: data.password,
      relationId: relation.id
    };
  });
}
```

### 7. 管理员亲子关系管理

#### 功能设计

**前端组件**: ParentChildRelationManagement.tsx (新建)

**功能列表**:
1. 显示所有亲子绑定关系列表
2. 搜索和筛选(按家长或学员)
3. 查看关系详情
4. 手动解绑

#### API设计

**GET /api/admin/relations**

查询参数:
- page: number
- limit: number
- search?: string (搜索家长或学员姓名/账户名)
- parentId?: string
- studentId?: string

响应:
```typescript
{
  success: boolean,
  data: {
    relations: Array<{
      id: string,
      parentId: string,
      parentName: string,
      parentUsername: string,
      studentId: string,
      studentName: string,
      studentIdNumber: string,
      relation: string,
      bindedAt: string,
      status: string
    }>,
    total: number,
    page: number,
    totalPages: number
  }
}
```

**DELETE /api/admin/relations/:id/unbind**

响应:
```typescript
{
  success: boolean,
  message: string
}
```

### 8. 教材体系管理优化

#### UI优化

1. 将"创建节点"按钮文本改为"创建教材"
2. 优化创建对话框字段布局
3. 添加批量导入功能入口

#### 创建教材对话框

**字段设计**:
```typescript
interface MaterialFormData {
  subject: string;        // 科目
  version: string;        // 教材版本
  units: string[];        // 单元列表(支持多项)
  notes?: string;         // 备注
  keywords?: string[];    // 关键词
}
```

**单元字段**: 使用动态表单,支持添加/删除多个单元

#### 批量导入功能

**Excel模板格式**:

| 科目 | 教材版本 | 单元 | 备注 | 关键词 |
|------|----------|------|------|--------|
| 数学 | 人教版   | 第一单元 | 加减法 | 计算,基础 |
| 语文 | 苏教版   | 第一单元 | 拼音 | 声母,韵母 |

**API设计**:

**GET /api/admin/materials/template**
- 下载Excel导入模板

**POST /api/admin/materials/import**
- Content-Type: multipart/form-data
- 上传Excel文件
- 解析并批量创建教材节点

**实现逻辑**:
```typescript
import * as XLSX from 'xlsx';

async function importMaterials(file: Express.Multer.File) {
  // 1. 解析Excel文件
  const workbook = XLSX.read(file.buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);
  
  // 2. 验证数据格式
  const errors: string[] = [];
  const validData: MaterialData[] = [];
  
  data.forEach((row: any, index: number) => {
    if (!row['科目'] || !row['教材版本'] || !row['单元']) {
      errors.push(`第${index + 2}行: 缺少必填字段`);
    } else {
      validData.push({
        subject: row['科目'],
        version: row['教材版本'],
        unit: row['单元'],
        notes: row['备注'] || '',
        keywords: row['关键词'] ? row['关键词'].split(',') : []
      });
    }
  });
  
  if (errors.length > 0) {
    throw new Error(`数据验证失败:\n${errors.join('\n')}`);
  }
  
  // 3. 批量创建教材节点
  const results = await prisma.$transaction(
    validData.map(item => 
      prisma.materialNode.create({
        data: {
          name: `${item.subject}-${item.version}-${item.unit}`,
          type: 'UNIT',
          metadata: {
            subject: item.subject,
            version: item.version,
            unit: item.unit,
            notes: item.notes,
            keywords: item.keywords
          }
        }
      })
    )
  );
  
  return {
    success: true,
    imported: results.length,
    errors: errors.length
  };
}
```

### 9. 家长任务管理流程优化

#### 两种配置模式

**1. 自定义配置模式**

字段:
- 选择学员(下拉选单)
- 任务标题
- AI科目老师(下拉选单)
- 科目(下拉选单)
- 教材版本(下拉选单)
- 单元(多选)
- 任务目标(文本域)
- 性格特征(选填,文本域)

**2. 档案提取模式**

流程:
1. 选择学员
2. 自动加载学员档案信息
3. 显示已填信息(只读)
4. 允许填写AI科目老师
5. 允许临时修改选填信息(仅用于当前任务)

#### 前端组件重构

**TaskConfigCenter.tsx 重构**

```typescript
interface TaskConfigFormData {
  mode: 'CUSTOM' | 'PROFILE';
  studentId: string;
  
  // 自定义模式字段
  title?: string;
  aiTeacher?: string;
  subject?: string;
  materialVersion?: string;
  units?: string[];
  goal?: string;
  personality?: string;
  
  // 档案模式临时修改字段
  tempSchool?: string;
  tempLearningFoundation?: string;
  tempInterests?: string;
}
```

**UI设计**:
- 使用Tab切换两种模式
- 自定义模式: 完整表单
- 档案模式: 学员信息展示 + AI老师选择 + 临时修改字段

#### API设计

**POST /api/parent/tasks/create**

请求体:
```typescript
{
  mode: 'CUSTOM' | 'PROFILE',
  studentId: string,
  
  // 自定义模式
  customConfig?: {
    title: string,
    aiTeacher: string,
    subject: string,
    materialVersion: string,
    units: string[],
    goal: string,
    personality?: string
  },
  
  // 档案模式
  profileConfig?: {
    aiTeacher: string,
    tempOverrides?: {
      school?: string,
      learningFoundation?: string,
      interests?: string
    }
  }
}
```

#### AI指令组装

任务创建时,需要组装AI科目老师的完整指令:

```typescript
function assembleAIInstruction(
  task: Task,
  subjectInstruction: SubjectInstruction,
  taskConfig: TaskConfig
): string {
  // 第一级: 管理员配置的科目指令
  let instruction = subjectInstruction.systemPrompt;
  
  // 第二级: 家长的任务配置
  instruction += `\n\n任务目标: ${taskConfig.goal}`;
  
  if (taskConfig.personality) {
    instruction += `\n学员性格特征: ${taskConfig.personality}`;
  }
  
  if (taskConfig.learningFoundation) {
    instruction += `\n学习基础: ${taskConfig.learningFoundation}`;
  }
  
  return instruction;
}
```


### 10. 家长端页面授权问题修复

#### 问题分析

当前家长端的学习报告和愿望审批页面出现401未授权错误,原因是:
1. API请求未正确携带JWT令牌
2. 令牌可能已过期但未刷新
3. 前端请求拦截器配置不正确

#### 解决方案

**1. 统一请求拦截器**

创建axios实例并配置拦截器:

```typescript
// src/utils/request.ts
import axios from 'axios';
import { authStore } from '../stores/authStore';

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  timeout: 10000
});

// 请求拦截器 - 自动添加token
request.interceptors.request.use(
  (config) => {
    const token = authStore.getState().token || localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理401错误
request.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // 清除token并跳转到登录页
      authStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default request;
```

**2. 更新所有API调用**

将所有直接使用fetch或axios的地方改为使用统一的request实例:

```typescript
// 修改前
const response = await fetch('/api/parent/wishes', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});

// 修改后
import request from '../utils/request';
const response = await request.get('/api/parent/wishes');
```

**3. Token刷新机制**

实现token自动刷新:

```typescript
// 在响应拦截器中添加token刷新逻辑
request.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // 尝试刷新token
        const refreshToken = localStorage.getItem('refreshToken');
        const response = await axios.post('/api/auth/refresh', {
          refreshToken
        });
        
        const { token } = response.data.data;
        localStorage.setItem('token', token);
        authStore.getState().setToken(token);
        
        // 重试原请求
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return request(originalRequest);
      } catch (refreshError) {
        // 刷新失败,跳转登录
        authStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);
```

## 数据模型

### 数据库Schema调整

#### User表扩展

```prisma
model User {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String   @map("password_hash")
  role         Role
  email        String?
  phone        String?
  status       UserStatus @default(ACTIVE)
  
  // 新增家长特有字段
  realName     String?  @map("real_name")
  gender       String?
  address      String?
  industry     String?
  
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  lastLoginAt  DateTime? @map("last_login_at")
  
  // ... 关联关系保持不变
}
```

#### StudentProfile表扩展

```prisma
model StudentProfile {
  id              String   @id @default(uuid())
  userId          String   @unique @map("user_id")
  realName        String   @map("real_name")
  gender          String
  birthDate       DateTime @map("birth_date")
  grade           String   // 标准化年级选单
  school          String?
  materialVersion String?  @map("material_version")
  learningFoundation String? @map("learning_foundation") // 薄弱/一般/良好/优秀
  interests       String?
  subjectLevels   Json     @map("subject_levels")
  completeness    Int      @default(0)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("student_profiles")
}
```

#### MaterialNode表优化

```prisma
model MaterialNode {
  id        String   @id @default(uuid())
  name      String
  type      MaterialNodeType
  parentId  String?  @map("parent_id")
  order     Int      @default(0)
  
  // 优化metadata结构
  metadata  Json     @default("{}") // {
    // subject: string,
    // version: string,
    // unit?: string,
    // notes?: string,
    // keywords?: string[]
  // }
  
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  
  parent    MaterialNode?  @relation("MaterialHierarchy", fields: [parentId], references: [id])
  children  MaterialNode[] @relation("MaterialHierarchy")
  questions Question[]
  
  @@map("material_nodes")
}
```

### 标准化数据

#### 年级选单

```typescript
const GRADE_OPTIONS = [
  // 小学
  { value: 'PRIMARY_1_1', label: '一年级上' },
  { value: 'PRIMARY_1_2', label: '一年级下' },
  { value: 'PRIMARY_2_1', label: '二年级上' },
  { value: 'PRIMARY_2_2', label: '二年级下' },
  { value: 'PRIMARY_3_1', label: '三年级上' },
  { value: 'PRIMARY_3_2', label: '三年级下' },
  { value: 'PRIMARY_4_1', label: '四年级上' },
  { value: 'PRIMARY_4_2', label: '四年级下' },
  { value: 'PRIMARY_5_1', label: '五年级上' },
  { value: 'PRIMARY_5_2', label: '五年级下' },
  { value: 'PRIMARY_6_1', label: '六年级上' },
  { value: 'PRIMARY_6_2', label: '六年级下' },
  
  // 初中
  { value: 'MIDDLE_1_1', label: '初一上' },
  { value: 'MIDDLE_1_2', label: '初一下' },
  { value: 'MIDDLE_2_1', label: '初二上' },
  { value: 'MIDDLE_2_2', label: '初二下' },
  { value: 'MIDDLE_3_1', label: '初三上' },
  { value: 'MIDDLE_3_2', label: '初三下' },
  
  // 高中
  { value: 'HIGH_1_1', label: '高一上' },
  { value: 'HIGH_1_2', label: '高一下' },
  { value: 'HIGH_2_1', label: '高二上' },
  { value: 'HIGH_2_2', label: '高二下' },
  { value: 'HIGH_3_1', label: '高三上' },
  { value: 'HIGH_3_2', label: '高三下' },
];
```

#### 学习基础选单

```typescript
const LEARNING_FOUNDATION_OPTIONS = [
  { value: 'WEAK', label: '薄弱' },
  { value: 'AVERAGE', label: '一般' },
  { value: 'GOOD', label: '良好' },
  { value: 'EXCELLENT', label: '优秀' },
];
```

## 正确性属性

*属性是一个特征或行为,应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

基于需求验收标准的预分析,我们定义以下可测试的正确性属性:

### 属性 1: 角色注册字段验证

*对于任何*注册请求,如果角色为家长,则必须包含账户名、密码、邮箱字段;如果角色为学员,则必须包含账户名、密码、姓名、性别、出生年月、年级字段。

**验证需求**: 1.2, 1.4

### 属性 2: 授权码验证规则

*对于任何*用户注册请求,如果角色为家长,则不需要验证授权码;如果角色为学员,则必须提供有效的未使用授权码。

**验证需求**: 1.6, 1.7, 6.1, 6.2

### 属性 3: 学号格式一致性

*对于任何*生成的学号,其格式必须为"STU"加年份后两位加6位流水号,总长度为11位,且在系统中唯一。

**验证需求**: 2.1, 2.2, 2.3, 2.6

### 属性 4: 学号流水号递增

*对于任何*同一年份生成的学号序列,流水号部分必须严格递增且连续。

**验证需求**: 2.3, 2.4

### 属性 5: 密码修改后需重新登录

*对于任何*用户,当密码修改成功后,当前会话令牌应失效,用户需要使用新密码重新登录。

**验证需求**: 3.6

### 属性 6: 学员核心信息不可修改

*对于任何*学员用户,学号、账户名、姓名、性别、出生年月字段在创建后不可通过个人档案编辑接口修改。

**验证需求**: 4.5

### 属性 7: 管理员角色编辑限制

*对于任何*管理员角色的用户,在用户管理编辑功能中仅允许修改密码字段,其他字段应为只读或不可编辑。

**验证需求**: 5.6

### 属性 8: 授权码单次使用

*对于任何*授权码,一旦被成功使用创建学员账户,其状态必须更新为"已使用",且不能被再次使用。

**验证需求**: 6.5, 6.6

### 属性 9: 家长添加学员自动绑定

*对于任何*家长通过添加学员接口创建的学员账户,系统必须自动建立亲子绑定关系,且绑定状态为活跃。

**验证需求**: 7.5, 7.6

### 属性 10: 亲子关系解绑保留数据

*对于任何*亲子关系解绑操作,解绑后家长和学员的账户及历史数据必须保留,仅删除绑定关系记录。

**验证需求**: 8.5

### 属性 11: 教材批量导入数据验证

*对于任何*批量导入的教材数据,每行必须包含科目、教材版本、单元三个必填字段,否则该行应被标记为错误并在导入结果中报告。

**验证需求**: 9.8, 9.9

### 属性 12: 任务配置模式字段要求

*对于任何*任务创建请求,如果模式为自定义,则必须包含任务标题、科目、教材版本、单元等字段;如果模式为档案提取,则必须包含学员ID和AI科目老师字段。

**验证需求**: 10.2, 10.4, 10.5

### 属性 13: 档案提取模式临时修改隔离

*对于任何*使用档案提取模式创建的任务,临时修改的学员信息仅应用于当前任务配置,不应更新学员的个人档案数据库记录。

**验证需求**: 10.6

### 属性 14: API请求自动携带令牌

*对于任何*需要认证的API请求,请求拦截器必须自动在请求头中添加Authorization Bearer Token。

**验证需求**: 11.3

### 属性 15: 401错误自动处理

*对于任何*返回401状态码的API响应,响应拦截器必须清除本地令牌并重定向用户到登录页面。

**验证需求**: 11.4, 11.7

### 属性 16: 年级选单标准化

*对于任何*涉及年级选择的表单(注册、档案编辑、任务配置),年级选单的选项必须使用统一的标准化格式和值。

**验证需求**: 14.1, 14.2

### 属性 17: 学习基础选单标准化

*对于任何*涉及学习基础选择的表单,学习基础选单必须包含且仅包含"薄弱"、"一般"、"良好"、"优秀"四个选项。

**验证需求**: 15.1, 15.2

### 属性 18: 表单输入实时验证

*对于任何*用户输入的表单字段,前端必须在用户输入时或失去焦点时进行实时验证,并在字段下方显示错误提示。

**验证需求**: 16.1, 16.3

### 属性 19: 邮箱格式验证

*对于任何*邮箱输入字段,必须使用正则表达式验证其格式符合标准邮箱格式(例如: user@example.com)。

**验证需求**: 16.4

### 属性 20: 密码加密存储

*对于任何*用户密码,在存储到数据库前必须使用bcrypt或类似算法进行加密,不得以明文形式存储。

**验证需求**: 18.1


## 错误处理

### 错误分类

1. **验证错误** (400 Bad Request)
   - 必填字段缺失
   - 字段格式不正确
   - 数据类型不匹配

2. **认证错误** (401 Unauthorized)
   - 令牌缺失或无效
   - 令牌已过期
   - 用户未登录

3. **授权错误** (403 Forbidden)
   - 用户无权限执行操作
   - 角色权限不足

4. **资源错误** (404 Not Found)
   - 请求的资源不存在
   - 用户ID、学号等不存在

5. **业务逻辑错误** (422 Unprocessable Entity)
   - 授权码已使用或过期
   - 用户名已存在
   - 学号已分配

6. **服务器错误** (500 Internal Server Error)
   - 数据库连接失败
   - 未预期的异常

### 错误响应格式

统一的错误响应格式:

```typescript
{
  success: false,
  error: {
    code: string,        // 错误代码
    message: string,     // 用户友好的错误消息
    details?: any,       // 详细错误信息(开发环境)
    field?: string       // 相关字段(验证错误)
  }
}
```

### 错误处理策略

#### 前端错误处理

```typescript
// 统一错误处理函数
function handleApiError(error: any): string {
  if (error.response) {
    // 服务器返回错误响应
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        return data.error?.message || '请求参数错误';
      case 401:
        // 自动跳转登录页(由拦截器处理)
        return '请先登录';
      case 403:
        return '您没有权限执行此操作';
      case 404:
        return '请求的资源不存在';
      case 422:
        return data.error?.message || '操作失败';
      case 500:
        return '服务器错误,请稍后重试';
      default:
        return '未知错误';
    }
  } else if (error.request) {
    // 请求已发送但未收到响应
    return '网络连接失败,请检查网络';
  } else {
    // 请求配置错误
    return '请求配置错误';
  }
}
```

#### 后端错误处理

```typescript
// 全局错误处理中间件
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('API错误:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  // 根据错误类型返回相应状态码
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '数据验证失败',
        details: err.details
      }
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '未授权访问'
      }
    });
  }
  
  // 默认500错误
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    }
  });
});
```

### 业务异常处理

```typescript
// 自定义业务异常类
class BusinessError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 422
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}

// 使用示例
if (authCode.status !== 'UNUSED') {
  throw new BusinessError(
    'AUTH_CODE_USED',
    '授权码已被使用',
    422
  );
}
```

## 测试策略

### 测试层次

1. **单元测试** (Unit Tests)
   - 测试独立函数和方法
   - 测试工具函数(如学号生成、密码加密)
   - 测试数据验证逻辑

2. **集成测试** (Integration Tests)
   - 测试API端点
   - 测试数据库操作
   - 测试完整业务流程

3. **端到端测试** (E2E Tests)
   - 测试用户注册流程
   - 测试任务创建流程
   - 测试亲子关系管理流程

### 属性测试配置

使用fast-check库进行属性测试:

```typescript
import fc from 'fast-check';

describe('学号生成属性测试', () => {
  it('属性3: 学号格式一致性', () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2020, max: 2030 }),
        async (year) => {
          const studentId = await generateStudentId(year);
          
          // 验证格式
          expect(studentId).toMatch(/^STU\d{8}$/);
          expect(studentId.length).toBe(11);
          
          // 验证年份
          const yearPart = studentId.substring(3, 5);
          expect(yearPart).toBe((year % 100).toString().padStart(2, '0'));
        }
      ),
      { numRuns: 100 } // 运行100次
    );
  });
  
  it('属性4: 学号流水号递增', () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (count) => {
          const studentIds: string[] = [];
          
          for (let i = 0; i < count; i++) {
            const id = await generateStudentId();
            studentIds.push(id);
          }
          
          // 验证递增
          for (let i = 1; i < studentIds.length; i++) {
            const prev = parseInt(studentIds[i - 1].slice(-6));
            const curr = parseInt(studentIds[i].slice(-6));
            expect(curr).toBe(prev + 1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### 测试数据生成器

```typescript
// 生成随机用户数据
const userArbitrary = fc.record({
  username: fc.string({ minLength: 3, maxLength: 20 }),
  password: fc.string({ minLength: 6, maxLength: 20 }),
  email: fc.emailAddress(),
  role: fc.constantFrom('PARENT', 'STUDENT')
});

// 生成随机学员档案数据
const studentProfileArbitrary = fc.record({
  realName: fc.string({ minLength: 2, maxLength: 10 }),
  gender: fc.constantFrom('男', '女'),
  birthDate: fc.date({ min: new Date('2005-01-01'), max: new Date('2018-12-31') }),
  grade: fc.constantFrom(...GRADE_OPTIONS.map(g => g.value)),
  learningFoundation: fc.constantFrom('WEAK', 'AVERAGE', 'GOOD', 'EXCELLENT')
});
```

### 测试覆盖率目标

- 单元测试覆盖率: ≥ 80%
- 集成测试覆盖率: ≥ 60%
- 关键业务流程: 100%

### 测试执行

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行属性测试
npm run test:property

# 生成覆盖率报告
npm run test:coverage
```

## 安全考虑

### 1. 密码安全

- 使用bcrypt加密,成本因子设置为10
- 密码最小长度6位
- 建议包含大小写字母、数字和特殊字符

### 2. JWT令牌安全

- 访问令牌有效期: 2小时
- 刷新令牌有效期: 7天
- 使用强随机密钥签名
- 令牌包含用户ID、角色等最小必要信息

### 3. 授权码安全

- 授权码使用UUID生成,保证唯一性和随机性
- 设置合理的过期时间(如30天)
- 一次性使用,使用后立即标记为已使用

### 4. API安全

- 所有敏感操作需要认证
- 实现基于角色的访问控制(RBAC)
- 使用HTTPS加密传输
- 实现请求频率限制,防止暴力攻击

### 5. 输入验证

- 前端和后端双重验证
- 使用Zod进行schema验证
- 防止SQL注入(使用Prisma ORM)
- 防止XSS攻击(React自动转义)

### 6. 敏感数据保护

- 密码不得以明文形式存储或传输
- API密钥加密存储
- 日志中不记录敏感信息

## 性能优化

### 1. 数据库优化

- 为常用查询字段添加索引
- 使用数据库连接池
- 批量操作使用事务

```prisma
// 添加索引
model User {
  username String @unique
  email    String? @unique
  
  @@index([role, status])
  @@index([createdAt])
}

model StudentID {
  studentIdNumber String @unique
  
  @@index([status])
  @@index([createdAt])
}
```

### 2. API响应优化

- 实现分页查询,避免一次返回大量数据
- 使用字段选择,只返回必要字段
- 实现缓存机制(Redis)

```typescript
// 分页查询示例
async function getUsers(page: number, limit: number) {
  const skip = (page - 1) * limit;
  
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        status: true,
        createdAt: true
      }
    }),
    prisma.user.count()
  ]);
  
  return {
    users,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
}
```

### 3. 前端性能优化

- 使用React.lazy和Suspense实现代码分割
- 实现虚拟滚动(长列表)
- 使用防抖和节流优化输入事件
- 图片懒加载

```typescript
// 代码分割示例
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const TaskConfigCenter = lazy(() => import('./pages/parent/TaskConfigCenter'));

// 使用
<Suspense fallback={<Loading />}>
  <UserManagement />
</Suspense>
```

### 4. 批量操作优化

- 教材批量导入使用事务
- 限制单次导入数量(如最多1000条)
- 提供进度反馈

## 部署和运维

### 环境变量

```env
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/training_platform

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=2h
REFRESH_TOKEN_EXPIRES_IN=7d

# API
API_PORT=3000
API_BASE_URL=http://localhost:3000

# 前端
VITE_API_BASE_URL=http://localhost:3000
```

### 数据库迁移

```bash
# 生成迁移文件
npx prisma migrate dev --name add_parent_fields

# 应用迁移
npx prisma migrate deploy

# 重置数据库(开发环境)
npx prisma migrate reset
```

### 监控和日志

- 使用Winston记录应用日志
- 记录所有API请求和响应
- 记录错误堆栈信息
- 监控API响应时间
- 监控数据库查询性能

```typescript
// 日志配置
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}
```

## 文档更新计划

### 需要更新的文档

1. **README.md**
   - 添加新的注册流程说明
   - 更新学号规则说明
   - 更新功能特性列表

2. **API_DOCUMENTATION.md**
   - 添加所有新增API接口文档
   - 更新修改的API接口文档
   - 添加请求/响应示例

3. **USER_MANUAL_ADMIN.md**
   - 更新用户管理功能说明
   - 添加亲子关系管理说明
   - 更新教材管理功能说明

4. **USER_MANUAL_PARENT.md**
   - 添加个人中心使用说明
   - 更新任务配置流程说明
   - 添加添加学员流程说明

5. **USER_MANUAL_STUDENT.md**
   - 更新个人档案管理说明
   - 添加密码修改说明

### 文档更新内容要点

- 使用中文编写
- 包含功能截图或流程图
- 提供操作步骤说明
- 标注注意事项和常见问题
- 保持格式统一

## 实施计划

### 阶段划分

**阶段1: 基础功能优化** (预计5天)
- 注册流程优化
- 学号生成规则调整
- 授权码使用规则调整
- 个人中心功能实现

**阶段2: 管理功能增强** (预计4天)
- 管理员用户管理修复
- 管理员亲子关系管理
- 教材体系管理优化

**阶段3: 任务管理优化** (预计3天)
- 家长任务配置优化
- 家长添加学员流程
- 家长端授权问题修复

**阶段4: 数据清理和文档** (预计2天)
- 清除模拟数据
- 更新所有文档
- 测试和bug修复

### 风险和缓解

**风险1: 数据库迁移失败**
- 缓解: 在测试环境充分测试迁移脚本
- 缓解: 生产环境迁移前备份数据库

**风险2: 现有功能受影响**
- 缓解: 编写完整的回归测试
- 缓解: 分阶段发布,逐步验证

**风险3: 性能下降**
- 缓解: 进行性能测试
- 缓解: 优化数据库查询和索引

## 总结

本设计文档详细描述了系统优化第一阶段的技术实现方案,涵盖了注册流程、用户管理、教材体系、任务管理等核心功能的优化。通过标准化数据、增强验证、优化流程,系统将提供更好的用户体验和更高的数据质量。

关键改进点:
1. 差异化的角色注册体验
2. 标准化的学号生成规则
3. 完善的个人信息管理
4. 优化的任务配置流程
5. 增强的数据验证和错误处理
6. 统一的API认证机制

通过属性测试确保核心业务逻辑的正确性,通过完善的错误处理提升系统健壮性,通过性能优化保证系统响应速度,最终实现一个高质量、易用的智能提分训练平台。
