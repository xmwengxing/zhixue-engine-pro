# 训练舱 AI 接入修复说明

## 问题描述

学员进入训练舱后，显示的是硬编码的模拟数据，没有真正调用 AI 服务生成题目和评估答案。

## 问题原因

前端代码中所有 API 调用都被注释掉（标记为 TODO），使用的是临时模拟数据：

1. **TrainingCabin.tsx**：初始化会话时使用 mockSession
2. **TrainingCenterPanel.tsx**：获取题目和提交答案时使用模拟数据
3. **TrainingRightPanel.tsx**：AI 助手对话使用模拟回复

## 修复内容

### 1. 前端修复

#### TrainingCabin.tsx
- ✅ 移除 mockSession 模拟数据
- ✅ 启用真实的 API 调用：`POST /api/student/training/start/:taskId`
- ✅ 添加错误处理和 token 认证

#### TrainingCenterPanel.tsx
- ✅ 启用获取题目 API：`GET /api/student/training/next-question/:sessionId`
- ✅ 启用提交答案 API：`POST /api/student/training/submit-answer/:sessionId`
- ✅ 启用确认训练计划 API：`POST /api/student/training/confirm-plan/:sessionId`
- ✅ 修复返回数据解析：后端返回 `{ success: true, data: question }`
- ✅ 添加自动加载第一道题目的逻辑

#### TrainingRightPanel.tsx
- ✅ 启用 AI 助手对话 API：`POST /api/student/training/chat/:sessionId`
- ✅ 移除模拟回复，使用真实 AI 响应

### 2. 后端验证

后端代码已经正确实现，无需修改：

- ✅ `studentTrainingService.getNextQuestion()` 调用 `aiQuestionGeneratorService.generateDiagnosticQuestion()`
- ✅ `studentTrainingService.submitAnswer()` 调用 `aiQuestionGeneratorService.evaluateAnswer()`
- ✅ `studentTrainingService.handleAIChat()` 调用 `aiQuestionGeneratorService.chatWithAssistant()`
- ✅ 所有 AI 服务通过 `aiServiceManager.callAI()` 统一调用

## AI 服务调用流程

### 诊断测试阶段

```
学员进入训练舱
  ↓
前端：POST /api/student/training/start/:taskId
  ↓
后端：创建会话，phase = 'DIAGNOSTIC_TEST'
  ↓
前端：自动调用 GET /api/student/training/next-question/:sessionId
  ↓
后端：aiQuestionGeneratorService.generateDiagnosticQuestion()
  ↓
AI 服务：根据学员档案生成个性化题目
  ↓
前端：显示题目
  ↓
学员作答
  ↓
前端：POST /api/student/training/submit-answer/:sessionId
  ↓
后端：aiQuestionGeneratorService.evaluateAnswer()
  ↓
AI 服务：智能评估答案，提供反馈和解释
  ↓
前端：显示 AI 反馈
  ↓
重复直到完成所有诊断题目
  ↓
自动进入 PLANNING 阶段
```

### 训练计划生成阶段

```
完成诊断测试
  ↓
后端：自动调用 aiQuestionGeneratorService.generateTrainingPlan()
  ↓
AI 服务：分析诊断结果，生成个性化训练计划
  ↓
前端：显示训练计划
  ↓
学员确认
  ↓
前端：POST /api/student/training/confirm-plan/:sessionId
  ↓
进入 GUIDED_TRAINING 阶段
```

### 引导式训练阶段

```
确认训练计划
  ↓
前端：自动调用 GET /api/student/training/next-question/:sessionId
  ↓
后端：aiQuestionGeneratorService.generateTrainingQuestion()
  ↓
AI 服务：根据训练计划和当前阶段生成针对性题目
  ↓
学员作答 + AI 评估（同诊断测试流程）
  ↓
完成三个训练阶段（基础巩固 → 能力提升 → 综合应用）
  ↓
进入 FINAL_EXAM 阶段
```

### AI 助手对话

```
学员提问
  ↓
前端：POST /api/student/training/chat/:sessionId
  ↓
后端：aiQuestionGeneratorService.chatWithAssistant()
  ↓
AI 服务：启发式引导，不直接给答案
  ↓
前端：显示 AI 回复
```

## 关键修改点

### 1. API 返回格式统一

后端 `getNextQuestion` 返回：
```typescript
{
  success: true,
  data: question  // 注意是 data 字段
}
```

前端解析：
```typescript
const data = await response.json();
onQuestionUpdate(data.data); // 使用 data.data
```

### 2. 自动加载题目

添加 useEffect 自动加载第一道题目：
```typescript
useEffect(() => {
  const shouldLoadQuestion = 
    !currentQuestion && 
    !isLoading && 
    (session.phase === 'DIAGNOSTIC_TEST' || session.phase === 'GUIDED_TRAINING');
  
  if (shouldLoadQuestion) {
    loadNextQuestion();
  }
}, [session.phase, currentQuestion, isLoading]);
```

### 3. Token 认证

所有 API 调用都添加了 Authorization header：
```typescript
const token = localStorage.getItem('token');
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

## 测试建议

### 1. 确认 AI 服务配置

检查 `.env` 文件中的 AI 服务配置：
```bash
# 查看后端配置
cat backend/.env | grep AI
```

确保已配置：
- `AI_PROVIDER_TYPE`（OpenAI 或 Claude）
- `AI_API_KEY`
- `AI_MODEL`

### 2. 测试完整流程

1. 家长创建任务，选择 AI 科目老师
2. 学员登录，进入任务中心
3. 点击"开始训练"进入训练舱
4. 验证自动加载第一道诊断题目（AI 生成）
5. 作答后验证 AI 反馈和解释
6. 完成诊断测试，验证训练计划生成
7. 确认训练计划，进入引导式训练
8. 测试 AI 助手对话功能

### 3. 检查日志

查看后端日志确认 AI 调用：
```bash
# 查看最新日志
tail -f backend/logs/combined.log | grep AI
```

应该看到类似日志：
```
为会话 xxx 生成第 1/10 道诊断题目
成功生成第 1 道诊断题目，知识点：加法运算
AI 评估答案：正确
```

## 注意事项

1. **AI 服务费用**：每次题目生成和答案评估都会调用 AI 服务，产生费用
2. **超时处理**：AI 调用设置了超时时间（10-30秒），超时会自动重试
3. **考试期间**：综合考试阶段 AI 助手会被禁用
4. **错误处理**：如果 AI 服务不可用，会显示友好的错误提示

## 相关文件

### 前端
- `frontend/src/pages/student/TrainingCabin.tsx`
- `frontend/src/components/student/TrainingCenterPanel.tsx`
- `frontend/src/components/student/TrainingRightPanel.tsx`

### 后端
- `backend/src/controllers/studentTrainingController.ts`
- `backend/src/services/studentTrainingService.ts`
- `backend/src/services/aiQuestionGeneratorService.ts`
- `backend/src/services/aiServiceManager.ts`

## 修复完成时间

2026-01-22
