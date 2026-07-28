# 设计文档：智能训练平台 - 档案提取模式

## 概述

本设计实现基于学员档案的 AI 智能训练平台。系统采用"诊断-规划-训练-考试"四阶段模型，通过 AI 动态生成所有训练内容，实现个性化的学习体验。

### 核心设计理念

**类似 Kiro Spec 模式的训练流程**：
1. **诊断阶段**：通过测试了解学员当前水平（类似需求分析）
2. **规划阶段**：AI 生成详细的学习计划（类似设计文档）
3. **训练阶段**：按计划系统化训练（类似任务执行）
4. **考试阶段**：综合验收学习成果（类似验收测试）

### 技术栈

- **后端**：Node.js + TypeScript + Express + Prisma
- **前端**：React + TypeScript + Zustand
- **AI 服务**：多提供商支持（OpenAI/Claude/DeepSeek等）
- **数据库**：PostgreSQL

## 架构

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         前端层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 家长任务配置  │  │  训练舱界面   │  │  报告查看     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                         API 层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 任务管理API   │  │  训练会话API  │  │  报告API      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        服务层                                │
│  ┌──────────────────────────────────────────────────┐       │
│  │           AI 题目生成服务                         │       │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐ │       │
│  │  │ 诊断测试   │  │ 训练计划   │  │ 题目生成   │ │       │
│  │  │ 生成器     │  │ 生成器     │  │ 引擎       │ │       │
│  │  └────────────┘  └────────────┘  └────────────┘ │       │
│  └──────────────────────────────────────────────────┘       │
│  ┌──────────────────────────────────────────────────┐       │
│  │           训练会话管理服务                        │       │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐ │       │
│  │  │ 状态机     │  │ 进度追踪   │  │ 答题记录   │ │       │
│  │  └────────────┘  └────────────┘  └────────────┘ │       │
│  └──────────────────────────────────────────────────┘       │
│  ┌──────────────────────────────────────────────────┐       │
│  │           AI 服务管理器                           │       │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐ │       │
│  │  │ 提供商管理 │  │ 负载均衡   │  │ 错误处理   │ │       │
│  │  └────────────┘  └────────────┘  └────────────┘ │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        数据层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 任务配置     │  │  训练会话     │  │  答题记录     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 学员档案     │  │  训练计划     │  │  训练报告     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 训练流程状态机

```
┌─────────────┐
│   CREATED   │ 任务创建
└──────┬──────┘
       │
       ↓
┌─────────────────┐
│ DIAGNOSTIC_TEST │ 诊断测试阶段
└──────┬──────────┘
       │ 完成所有诊断题
       ↓
┌─────────────┐
│  PLANNING   │ AI 生成训练计划
└──────┬──────┘
       │ 学员确认计划
       ↓
┌──────────────────┐
│ GUIDED_TRAINING  │ 引导式训练阶段
│                  │
│ ┌──────────────┐ │
│ │ 基础巩固     │ │
│ └──────┬───────┘ │
│        ↓         │
│ ┌──────────────┐ │
│ │ 能力提升     │ │
│ └──────┬───────┘ │
│        ↓         │
│ ┌──────────────┐ │
│ │ 综合应用     │ │
│ └──────────────┘ │
└──────┬───────────┘
       │ 完成所有训练
       ↓
┌─────────────┐
│ FINAL_EXAM  │ 综合考试阶段
└──────┬──────┘
       │ 提交考试
       ↓
┌─────────────┐
│  COMPLETED  │ 生成报告，任务完成
└─────────────┘
```

## 组件和接口

### 1. AI 题目生成服务 (AIQuestionGeneratorService)

负责所有 AI 内容生成，包括诊断题目、训练题目、训练计划和训练报告。

#### 接口

```typescript
interface AIQuestionGeneratorService {
  // 生成诊断测试题目
  generateDiagnosticQuestion(
    context: DiagnosticContext,
    questionNumber: number
  ): Promise<Question>;

  // 判断答案并生成反馈
  evaluateAnswer(
    question: Question,
    studentAnswer: string,
    context: EvaluationContext
  ): Promise<AnswerEvaluation>;

  // 分析诊断结果并生成训练计划
  generateTrainingPlan(
    diagnosticResults: DiagnosticResults,
    studentProfile: StudentProfile,
    trainingGoal: string
  ): Promise<TrainingPlan>;

  // 生成训练阶段题目
  generateTrainingQuestion(
    stage: TrainingStage,
    context: TrainingContext,
    questionNumber: number
  ): Promise<Question>;

  // 生成综合考试题目
  generateExamQuestions(
    trainingPlan: TrainingPlan,
    trainingHistory: TrainingHistory
  ): Promise<Question[]>;

  // 生成训练报告
  generateTrainingReport(
    session: TrainingSession,
    examResults: ExamResults
  ): Promise<TrainingReport>;

  // AI 助手对话
  chatWithAssistant(
    message: string,
    context: ChatContext
  ): Promise<string>;
}
```

#### Prompt 设计策略

**诊断测试题目生成 Prompt**：
```
你是一位经验丰富的教师，需要为学员生成诊断测试题目。

学员信息：
- 年级：{grade}
- 教材版本：{materialVersion}
- 学习基础：{learningFoundation}
- 训练目标：{trainingGoal}

当前进度：第 {questionNumber}/{totalQuestions} 题

要求：
1. 题目应覆盖训练目标相关的不同知识点
2. 难度从易到难，全面评估学员水平
3. 题目类型：单选题
4. 返回 JSON 格式：
{
  "stem": "题干内容",
  "options": ["A选项", "B选项", "C选项", "D选项"],
  "correctAnswer": "A",
  "knowledgePoint": "知识点名称",
  "difficulty": "easy|medium|hard",
  "explanation": "详细解析"
}
```

**训练计划生成 Prompt**：
```
你是一位资深教育专家，需要根据诊断测试结果为学员制定详细的训练计划。

学员信息：
- 年级：{grade}
- 教材版本：{materialVersion}
- 学习基础：{learningFoundation}
- 训练目标：{trainingGoal}

诊断测试结果：
- 总题数：{totalQuestions}
- 正确率：{accuracy}%
- 错题分布：{errorDistribution}
- 薄弱知识点：{weakPoints}

要求生成一份类似 Kiro Spec 的详细训练计划，包括：

1. 学习目标分解（3-5个子目标）
2. 知识点清单（5-10个知识点，标注掌握程度）
3. 训练阶段规划：
   - 基础巩固阶段：针对薄弱点，10-20题
   - 能力提升阶段：进阶训练，15-25题
   - 综合应用阶段：实战演练，10-15题
4. 每个阶段的详细内容：
   - 学习重点
   - 练习题数量和类型
   - 预计用时
   - 验收标准
5. 综合考试规划：
   - 考试范围
   - 题目数量（20-50题）
   - 难度分布（基础40%、中等40%、难题20%）
   - 及格标准（70分）

返回 JSON 格式的训练计划。
```

**训练题目生成 Prompt**：
```
你是一位教师，正在为学员生成训练题目。

学员信息：
- 年级：{grade}
- 教材版本：{materialVersion}
- 训练目标：{trainingGoal}

当前训练阶段：{stage}（基础巩固/能力提升/综合应用）
阶段目标：{stageGoal}
当前进度：第 {questionNumber}/{totalQuestions} 题

已掌握知识点：{masteredPoints}
薄弱知识点：{weakPoints}

要求：
1. 根据训练阶段生成相应难度的题目
2. 基础巩固：针对薄弱点，包含详细讲解
3. 能力提升：综合性题目，难度递增
4. 综合应用：实际场景题目，跨知识点
5. 返回 JSON 格式的题目对象
```

**综合考试题目生成 Prompt**：
```
你是一位出题专家，需要为学员生成期末考试级别的综合考试。

学员信息：
- 年级：{grade}
- 教材版本：{materialVersion}
- 训练目标：{trainingGoal}

训练计划：
- 训练过的知识点：{trainedPoints}
- 训练题目总数：{totalTrainingQuestions}
- 训练表现：{trainingPerformance}

考试要求：
1. 题目数量：{examQuestionCount}（20-50题）
2. 题型分布：
   - 单选题：60%
   - 填空题：20%
   - 解答题：20%
3. 难度分布：
   - 基础题：40%（巩固基础）
   - 中等题：40%（能力检验）
   - 难题：20%（拔高挑战）
4. 知识点覆盖：涵盖所有训练过的知识点
5. 时间限制：{timeLimit}分钟

一次性生成所有考试题目，返回 JSON 数组。
```

**训练报告生成 Prompt**：
```
你是一位教育分析专家，需要为学员生成详细的训练报告。

诊断测试数据：
- 正确率：{diagnosticAccuracy}%
- 薄弱知识点：{diagnosticWeakPoints}

训练过程数据：
- 基础巩固阶段：{foundationStageData}
- 能力提升阶段：{improvementStageData}
- 综合应用阶段：{applicationStageData}

综合考试数据：
- 总分：{examScore}
- 正确率：{examAccuracy}%
- 各知识点得分：{knowledgePointScores}

要求生成包含以下内容的训练报告：
1. 诊断测试分析：初始水平评估
2. 训练过程回顾：各阶段表现和进步
3. 综合考试成绩：详细的成绩分析
4. 进步情况对比：诊断测试 vs 综合考试
5. 薄弱点分析：仍需加强的内容
6. 学习建议：后续学习方向和具体建议
7. 积分奖励：根据表现计算积分

返回 Markdown 格式的报告。
```

### 2. 训练会话管理服务 (StudentTrainingService)

管理训练会话的生命周期和状态转换。

#### 接口

```typescript
interface StudentTrainingService {
  // 创建训练会话
  createSession(
    taskId: string,
    studentId: string
  ): Promise<TrainingSession>;

  // 获取当前会话状态
  getSession(sessionId: string): Promise<TrainingSession>;

  // 获取下一道题目
  getNextQuestion(sessionId: string): Promise<QuestionResponse>;

  // 提交答案
  submitAnswer(
    sessionId: string,
    answer: SubmitAnswerRequest
  ): Promise<AnswerResponse>;

  // 确认训练计划，开始训练
  confirmTrainingPlan(sessionId: string): Promise<void>;

  // 完成当前阶段
  completeStage(sessionId: string): Promise<StageCompletionReport>;

  // 开始综合考试
  startFinalExam(sessionId: string): Promise<ExamQuestions>;

  // 提交综合考试
  submitFinalExam(
    sessionId: string,
    answers: ExamAnswers
  ): Promise<ExamResults>;

  // 获取训练报告
  getTrainingReport(sessionId: string): Promise<TrainingReport>;

  // 更新会话状态
  updateSessionPhase(
    sessionId: string,
    phase: TrainingPhase
  ): Promise<void>;
}
```

### 3. AI 服务管理器 (AIServiceManager)

管理多个 AI 服务提供商，实现负载均衡和错误处理。

#### 接口

```typescript
interface AIServiceManager {
  // 调用 AI 服务
  callAI(
    prompt: string,
    options: AICallOptions
  ): Promise<string>;

  // 获取可用的 AI 提供商
  getAvailableProviders(): Promise<AIProvider[]>;

  // 健康检查
  healthCheck(providerId: string): Promise<boolean>;

  // 错误处理和重试
  retryWithFallback(
    operation: () => Promise<string>,
    maxRetries: number
  ): Promise<string>;
}
```

### 4. 前端训练舱组件 (TrainingCabin)

学员训练的主界面，采用三栏布局。

#### 组件结构

```typescript
interface TrainingCabinProps {
  taskId: string;
  studentId: string;
}

interface TrainingCabinState {
  session: TrainingSession | null;
  currentQuestion: Question | null;
  trainingPlan: TrainingPlan | null;
  loading: boolean;
  phase: TrainingPhase;
  progress: Progress;
}

// 三栏布局
const TrainingCabin: React.FC<TrainingCabinProps> = () => {
  return (
    <div className="training-cabin">
      {/* 左侧栏：任务信息和进度 (20%) */}
      <LeftPanel 
        session={session}
        progress={progress}
        trainingPlan={trainingPlan}
      />
      
      {/* 中间栏：题目区域 (50%) */}
      <CenterPanel
        phase={phase}
        question={currentQuestion}
        onSubmitAnswer={handleSubmitAnswer}
        loading={loading}
      />
      
      {/* 右侧栏：AI 助手 (30%) */}
      <RightPanel
        aiAssistantEnabled={phase !== 'FINAL_EXAM'}
        onSendMessage={handleAIChat}
      />
    </div>
  );
};
```

## 数据模型

### 训练会话 (TrainingSession)

```typescript
interface TrainingSession {
  id: string;
  taskId: string;
  studentId: string;
  phase: TrainingPhase;
  
  // 诊断测试数据
  diagnosticTest: {
    totalQuestions: number;
    currentQuestion: number;
    answers: AnswerRecord[];
    results?: DiagnosticResults;
  };
  
  // 训练计划
  trainingPlan?: TrainingPlan;
  
  // 训练阶段数据
  guidedTraining?: {
    currentStage: TrainingStageType;
    stages: {
      foundation: StageProgress;
      improvement: StageProgress;
      application: StageProgress;
    };
  };
  
  // 综合考试数据
  finalExam?: {
    questions: Question[];
    answers: ExamAnswers;
    results?: ExamResults;
  };
  
  // 训练报告
  report?: TrainingReport;
  
  // 元数据
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

type TrainingPhase = 
  | 'CREATED'
  | 'DIAGNOSTIC_TEST'
  | 'PLANNING'
  | 'GUIDED_TRAINING'
  | 'FINAL_EXAM'
  | 'COMPLETED';

type TrainingStageType = 
  | 'foundation'
  | 'improvement'
  | 'application';
```

### 题目 (Question)

```typescript
interface Question {
  id: string;
  stem: string;
  type: QuestionType;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  knowledgePoint: string;
  difficulty: 'easy' | 'medium' | 'hard';
  
  // AI 生成的元数据
  generatedAt: Date;
  generationContext: {
    phase: TrainingPhase;
    stage?: TrainingStageType;
    questionNumber: number;
  };
}

type QuestionType = 
  | 'single_choice'
  | 'multiple_choice'
  | 'fill_blank'
  | 'short_answer';
```

### 训练计划 (TrainingPlan)

```typescript
interface TrainingPlan {
  id: string;
  sessionId: string;
  
  // 学习目标分解
  learningGoals: {
    main: string;
    subGoals: string[];
  };
  
  // 知识点清单
  knowledgePoints: {
    point: string;
    masteryLevel: 'weak' | 'medium' | 'strong';
    priority: number;
  }[];
  
  // 训练阶段
  stages: {
    foundation: TrainingStageConfig;
    improvement: TrainingStageConfig;
    application: TrainingStageConfig;
  };
  
  // 综合考试规划
  finalExam: {
    questionCount: number;
    timeLimit: number;
    passingScore: number;
    difficultyDistribution: {
      easy: number;
      medium: number;
      hard: number;
    };
  };
  
  // 预计总用时
  estimatedDuration: number;
  
  generatedAt: Date;
}

interface TrainingStageConfig {
  name: string;
  goal: string;
  focus: string[];
  questionCount: number;
  estimatedTime: number;
  criteria: string[];
}
```

### 答题记录 (AnswerRecord)

```typescript
interface AnswerRecord {
  questionId: string;
  questionNumber: number;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  timeSpent: number;
  feedback: string;
  explanation: string;
  knowledgePoint: string;
  answeredAt: Date;
}
```

### 训练报告 (TrainingReport)

```typescript
interface TrainingReport {
  id: string;
  sessionId: string;
  
  // 诊断测试分析
  diagnosticAnalysis: {
    totalQuestions: number;
    accuracy: number;
    weakPoints: string[];
    initialLevel: string;
  };
  
  // 训练过程回顾
  trainingReview: {
    foundation: StageReport;
    improvement: StageReport;
    application: StageReport;
  };
  
  // 综合考试成绩
  examResults: {
    totalScore: number;
    accuracy: number;
    knowledgePointScores: {
      point: string;
      score: number;
      accuracy: number;
    }[];
  };
  
  // 进步情况
  improvement: {
    accuracyImprovement: number;
    masteredPoints: string[];
    improvedPoints: string[];
  };
  
  // 薄弱点分析
  weaknessAnalysis: {
    remainingWeakPoints: string[];
    suggestions: string[];
  };
  
  // 学习建议
  recommendations: {
    nextSteps: string[];
    focusAreas: string[];
    studyMethods: string[];
  };
  
  // 积分奖励
  pointsAwarded: number;
  
  generatedAt: Date;
  content: string; // Markdown 格式的完整报告
}

interface StageReport {
  totalQuestions: number;
  accuracy: number;
  timeSpent: number;
  highlights: string[];
  improvements: string[];
}
```

### 诊断结果 (DiagnosticResults)

```typescript
interface DiagnosticResults {
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  
  // 知识点分析
  knowledgePointAnalysis: {
    point: string;
    totalQuestions: number;
    correctCount: number;
    accuracy: number;
  }[];
  
  // 难度分析
  difficultyAnalysis: {
    easy: { total: number; correct: number };
    medium: { total: number; correct: number };
    hard: { total: number; correct: number };
  };
  
  // 薄弱知识点
  weakPoints: string[];
  
  // 学习风格评估
  learningStyle: {
    preferredDifficulty: 'easy' | 'medium' | 'hard';
    averageTimePerQuestion: number;
    errorPatterns: string[];
  };
}
```

## 正确性属性

*属性是一个特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的正式陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性 1：任务配置往返一致性

*对于任意*有效的任务配置（训练目标、诊断题目数量、档案提取模式标识），创建任务后查询该任务应该返回相同的配置信息。

**验证：需求 1.4, 1.5**

### 属性 2：输入验证正确性

*对于任意*输入字符串，训练目标验证应该拒绝空字符串和长度不在 10-500 范围内的字符串；*对于任意*数字输入，诊断题目数量验证应该拒绝不在 5-20 范围内的值。

**验证：需求 1.2, 1.3**

### 属性 3：会话初始化完整性

*对于任意*档案提取模式的任务，创建训练会话时应该：(1) 设置阶段为 DIAGNOSTIC_TEST，(2) 初始化空的题目列表和答题记录，(3) 设置诊断题目数量为任务配置值。

**验证：需求 2.2, 2.3, 2.4, 2.5**

### 属性 4：AI 题目生成包含学员信息

*对于任意*处于诊断测试阶段的训练会话，生成题目时 AI prompt 应该包含学员的年级、教材版本、学习基础和训练目标信息。

**验证：需求 3.1, 3.2**

### 属性 5：题目对象结构完整性

*对于任意*AI 生成的题目，返回的题目对象应该包含题干、选项、题型、正确答案、解析和知识点等所有必需字段。

**验证：需求 3.3**

### 属性 6：诊断题目知识点多样性

*对于任意*完整的诊断测试题目序列，题目应该覆盖至少 3 个不同的知识点。

**验证：需求 3.4**

### 属性 7：题目难度递增趋势

*对于任意*诊断测试题目序列，后续题目的平均难度应该不低于前面题目的平均难度（难度：easy=1, medium=2, hard=3）。

**验证：需求 3.5**

### 属性 8：答案判断返回完整性

*对于任意*答案提交，AI 判断结果应该包含正确答案、详细解析和反馈信息。

**验证：需求 4.1, 4.2**

### 属性 9：答题记录持久化

*对于任意*答题操作，系统应该创建包含题目ID、学员答案、正确答案、是否正确、用时和知识点的答题记录。

**验证：需求 4.3**

### 属性 10：诊断测试完成后状态转换

*对于任意*训练会话，当答题记录数量等于配置的诊断题目数量时，会话阶段应该自动转换为 PLANNING。

**验证：需求 4.5**

### 属性 11：训练计划结构完整性

*对于任意*生成的训练计划，应该包含：(1) 3-5个学习子目标，(2) 5-10个知识点，(3) 三个训练阶段（基础巩固、能力提升、综合应用），(4) 每个阶段包含学习重点、题目数量、预计用时和验收标准，(5) 综合考试规划包含题目数量（20-50）、难度分布和及格标准。

**验证：需求 5.4, 5.5, 5.6, 5.7, 5.8**

### 属性 12：诊断结果统计准确性

*对于任意*完成的诊断测试，分析结果中的正确率应该等于（正确答案数 / 总题目数），错题分布应该准确反映各知识点的答题情况。

**验证：需求 5.2**

### 属性 13：训练阶段题目针对性

*对于任意*基础巩固阶段的题目，题目的知识点应该在诊断结果的薄弱知识点列表中。

**验证：需求 6.2**

### 属性 14：训练阶段题目数量范围

*对于任意*训练计划，基础巩固阶段应该包含 10-20 道题，能力提升阶段应该包含 15-25 道题，综合应用阶段应该包含 10-15 道题。

**验证：需求 6.7, 7.5, 8.5**

### 属性 15：答错题目提供引导

*对于任意*答错的题目，AI 反馈应该包含引导式思考提示，并且系统应该允许学员重做该题。

**验证：需求 6.4, 6.5**

### 属性 16：训练阶段完成生成小结

*对于任意*完成的训练阶段（基础巩固、能力提升、综合应用），系统应该生成包含题目数量、正确率、用时和改进建议的阶段小结报告。

**验证：需求 6.6, 7.4, 8.4**

### 属性 17：综合考试题目配置符合性

*对于任意*生成的综合考试，题目数量应该在 20-50 之间，题型应该包含至少两种不同类型，难度分布应该符合基础题 40%、中等题 40%、难题 20% 的比例（误差 ±5%）。

**验证：需求 9.2, 9.3, 9.4**

### 属性 18：综合考试知识点覆盖

*对于任意*综合考试，考试题目应该覆盖训练计划中列出的所有知识点（至少每个知识点一道题）。

**验证：需求 9.5**

### 属性 19：考试期间 AI 助手禁用

*对于任意*处于 FINAL_EXAM 阶段的训练会话，AI 助手对话功能应该被禁用并返回错误提示。

**验证：需求 9.7, 11.4**

### 属性 20：考试提交后状态转换

*对于任意*综合考试，当学员提交所有答案后，会话阶段应该转换为 COMPLETED。

**验证：需求 9.8**

### 属性 21：训练报告内容完整性

*对于任意*完成的训练会话，生成的训练报告应该包含：(1) 诊断测试分析，(2) 各训练阶段回顾，(3) 综合考试成绩，(4) 进步情况对比，(5) 薄弱点分析，(6) 学习建议，(7) 积分奖励。

**验证：需求 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8**

### 属性 22：报告生成后任务完成

*对于任意*训练会话，当训练报告生成完成后，关联的任务状态应该更新为 COMPLETED。

**验证：需求 10.9**

### 属性 23：训练期间 AI 助手可用

*对于任意*处于 DIAGNOSTIC_TEST 或 GUIDED_TRAINING 阶段的训练会话，AI 助手对话功能应该可用并能正常响应学员提问。

**验证：需求 11.1**

### 属性 24：AI 助手提供启发式引导

*对于任意*学员向 AI 助手的提问，AI 响应应该包含引导性问题或提示，而不是直接给出答案。

**验证：需求 11.2**

### 属性 25：AI 服务错误优雅处理

*对于任意*AI 服务调用，当超时（>30秒）或失败时，系统应该返回友好的错误提示而不是抛出异常；当连续失败 3 次时，系统应该停止重试并建议稍后再试。

**验证：需求 13.1, 13.2, 13.3, 13.5**

## 错误处理

### AI 服务错误处理策略

1. **超时控制**
   - 所有 AI 调用设置 30 秒超时
   - 超时后返回友好错误提示
   - 提供重试选项

2. **重试机制**
   - 失败后自动重试，最多 3 次
   - 使用指数退避策略（1s, 2s, 4s）
   - 3 次失败后建议用户稍后再试

3. **降级方案**
   - 题目生成失败：提示用户刷新重试
   - 答案判断失败：允许跳过该题
   - 报告生成失败：保存原始数据，稍后重新生成

4. **质量检查**
   - 验证 AI 返回的 JSON 格式
   - 检查必需字段是否存在
   - 验证数据类型和范围
   - 异常内容自动重新生成

### 数据一致性保证

1. **事务处理**
   - 答题记录和会话状态更新使用事务
   - 确保数据一致性

2. **状态机验证**
   - 状态转换前验证前置条件
   - 防止非法状态转换

3. **数据校验**
   - 所有输入数据进行验证
   - 防止无效数据进入系统

## 测试策略

### 单元测试

**目标**：验证各个组件的独立功能

**测试范围**：
1. **输入验证**
   - 训练目标长度验证
   - 题目数量范围验证
   - 答案格式验证

2. **数据转换**
   - JSON 解析和序列化
   - 数据模型转换
   - 统计计算

3. **状态机逻辑**
   - 状态转换规则
   - 前置条件检查
   - 状态持久化

4. **错误处理**
   - 超时处理
   - 重试逻辑
   - 降级方案

**测试工具**：Vitest

### 属性测试

**目标**：验证系统的通用正确性属性

**测试范围**：
1. **数据往返属性**
   - 任务配置往返一致性（属性 1）
   - 会话数据持久化

2. **不变量属性**
   - 会话初始化完整性（属性 3）
   - 题目对象结构完整性（属性 5）
   - 训练计划结构完整性（属性 11）
   - 训练报告内容完整性（属性 21）

3. **状态转换属性**
   - 诊断测试完成后状态转换（属性 10）
   - 考试提交后状态转换（属性 20）

4. **业务规则属性**
   - 输入验证正确性（属性 2）
   - 题目难度递增趋势（属性 7）
   - 训练阶段题目数量范围（属性 14）
   - 综合考试题目配置符合性（属性 17）

5. **错误处理属性**
   - AI 服务错误优雅处理（属性 25）

**测试配置**：
- 每个属性测试运行 100 次迭代
- 使用随机数据生成器
- 标签格式：`Feature: intelligent-training-platform, Property {N}: {property_text}`

**测试工具**：fast-check (JavaScript 属性测试库)

### 集成测试

**目标**：验证组件间的协作

**测试场景**：
1. **完整训练流程**
   - 创建任务 → 启动会话 → 诊断测试 → 生成计划 → 引导训练 → 综合考试 → 生成报告

2. **AI 服务集成**
   - 题目生成流程
   - 答案判断流程
   - 报告生成流程

3. **错误恢复流程**
   - AI 服务失败重试
   - 超时处理
   - 数据恢复

**测试工具**：Vitest + 测试数据库

### 端到端测试

**目标**：验证用户完整使用流程

**测试场景**：
1. 家长创建档案提取模式任务
2. 学员完成诊断测试
3. 学员查看并确认训练计划
4. 学员完成各训练阶段
5. 学员参加综合考试
6. 学员和家长查看训练报告

**测试工具**：Playwright

### Mock 策略

**AI 服务 Mock**：
- 开发环境：使用 Mock AI 服务，返回预定义的题目和反馈
- 测试环境：使用真实 AI 服务的测试账号
- 生产环境：使用真实 AI 服务

**Mock 数据生成器**：
```typescript
// 生成随机学员档案
function generateRandomStudentProfile(): StudentProfile;

// 生成随机训练目标
function generateRandomTrainingGoal(): string;

// 生成随机题目
function generateRandomQuestion(difficulty: Difficulty): Question;

// 生成随机训练计划
function generateRandomTrainingPlan(): TrainingPlan;
```

### 属性 1：任务配置往返一致性

*对于任意*有效的任务配置（训练目标、诊断题目数量、档案提取模式标识），创建任务后查询该任务，应该返回相同的配置信息。

**验证：需求 1.4, 1.5**

### 属性 2：输入验证正确性

*对于任意*输入字符串作为训练目标，系统应该正确验证其长度在 10-500 字符之间；*对于任意*数字作为题目数量，系统应该正确验证其在 5-20 范围内。

**验证：需求 1.2, 1.3**

### 属性 3：会话初始化完整性

*对于任意*档案提取模式的任务，创建训练会话时应该：
- 设置阶段为 DIAGNOSTIC_TEST
- 初始化空的题目列表和答题记录
- 设置题目数量为任务配置中的值
- 不依赖题库数据

**验证：需求 2.2, 2.3, 2.4, 2.5**

### 属性 4：AI 题目生成包含学员信息

*对于任意*处于诊断测试阶段的训练会话，生成题目时 AI prompt 应该包含学员的年级、教材版本、学习基础和训练目标信息。

**验证：需求 3.1, 3.2**

### 属性 5：题目对象结构完整性

*对于任意*AI 生成的题目，应该包含所有必需字段：题干、选项、题型、正确答案、解析、知识点、难度。

**验证：需求 3.3**

### 属性 6：诊断题目知识点多样性

*对于任意*诊断测试会话，生成的多道题目应该覆盖至少 3 个不同的知识点。

**验证：需求 3.4**

### 属性 7：诊断题目难度递增

*对于任意*诊断测试会话，生成的题目序列中，后面题目的平均难度应该不低于前面题目的平均难度。

**验证：需求 3.5**

### 属性 8：答题记录完整性

*对于任意*提交的答案，系统应该记录答题情况（正确性、用时、错误类型）并正确推进题目序号。

**验证：需求 4.3, 4.4**

### 属性 9：阶段自动转换

*对于任意*训练会话，当完成的题目数量达到配置的诊断题目数量时，会话阶段应该自动从 DIAGNOSTIC_TEST 转换为 PLANNING。

**验证：需求 4.5**

### 属性 10：诊断结果统计正确性

*对于任意*完成的诊断测试，分析结果中的正确率应该等于（正确题目数 / 总题目数），错题分布应该准确反映每个知识点的答题情况。

**验证：需求 5.2**

### 属性 11：训练计划结构完整性

*对于任意*生成的训练计划，应该包含：
- 3-5 个学习子目标
- 5-10 个知识点清单
- 3 个训练阶段（基础巩固、能力提升、综合应用）
- 每个阶段包含学习重点、练习题数量、预计用时、验收标准
- 综合考试规划（考试范围、题目数量 20-50、难度分布、及格标准）

**验证：需求 5.4, 5.5, 5.6, 5.7, 5.8**

### 属性 12：训练阶段题目针对性

*对于任意*基础巩固阶段，生成的题目应该覆盖诊断测试中识别的薄弱知识点。

**验证：需求 6.2**

### 属性 13：训练阶段题目数量范围

*对于任意*训练阶段，生成的题目数量应该在计划配置的范围内：
- 基础巩固：10-20 题
- 能力提升：15-25 题
- 综合应用：10-15 题

**验证：需求 6.7, 7.4, 8.4**

### 属性 14：错题重做功能

*对于任意*答错的题目，系统应该允许学员重新作答，并提供引导式思考提示。

**验证：需求 6.4, 6.5**

### 属性 15：阶段完成生成小结

*对于任意*完成的训练阶段，AI 应该生成包含题目数量、正确率、用时、亮点和改进建议的阶段小结报告。

**验证：需求 6.6**

### 属性 16：综合考试配置正确性

*对于任意*综合考试，应该满足：
- 题目数量在 20-50 之间
- 包含多种题型（选择题、填空题、解答题）
- 难度分布为基础题 40%、中等题 40%、难题 20%（误差 ±5%）
- 涵盖所有训练过的知识点

**验证：需求 9.2, 9.3, 9.4, 9.5**

### 属性 17：考试期间 AI 助手禁用

*对于任意*处于 FINAL_EXAM 阶段的训练会话，AI 助手功能应该被禁用；*对于任意*其他训练阶段，AI 助手功能应该可用。

**验证：需求 9.7, 11.1, 11.4**

### 属性 18：考试提交触发状态转换

*对于任意*综合考试，当学员提交所有答案后，会话阶段应该从 FINAL_EXAM 转换为 COMPLETED。

**验证：需求 9.8**

### 属性 19：训练报告内容完整性

*对于任意*完成的训练会话，生成的报告应该包含：
- 诊断测试分析（初始水平评估）
- 训练过程回顾（各阶段表现）
- 综合考试成绩（总分、正确率、各知识点得分）
- 进步情况对比（诊断测试 vs 综合考试）
- 薄弱点分析
- 学习建议
- 积分奖励

**验证：需求 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8**

### 属性 20：报告生成更新任务状态

*对于任意*训练会话，当训练报告生成完成后，关联的任务状态应该更新为 COMPLETED。

**验证：需求 10.9**

### 属性 21：AI 助手启发式引导

*对于任意*学员向 AI 助手的提问，AI 应该提供启发式引导而非直接答案；*对于任意*答错的题目，AI 助手应该主动提供思路引导。

**验证：需求 11.2, 11.3**

### 属性 22：AI 服务错误处理

*对于任意*AI 服务调用，系统应该：
- 实现超时控制（30 秒）
- 调用失败时返回友好错误提示并提供重试选项
- 连续失败 3 次后建议稍后再试
- 检测内容质量异常并重新生成

**验证：需求 3.6, 13.1, 13.2, 13.3, 13.4, 13.5**

## 错误处理

### AI 服务错误

**场景**：AI 服务调用失败或超时

**处理策略**：
1. 实现 30 秒超时控制
2. 捕获所有 AI 调用异常
3. 返回友好的错误消息
4. 提供重试按钮
5. 记录错误日志
6. 连续失败 3 次后建议用户稍后再试

**降级方案**：
- 使用备用 AI 提供商
- 如果所有提供商都失败，保存会话状态，允许用户稍后继续

### 数据验证错误

**场景**：用户输入无效数据

**处理策略**：
1. 前端实时验证
2. 后端二次验证
3. 返回具体的验证错误信息
4. 高亮显示错误字段

### 会话状态错误

**场景**：会话状态不一致或无效操作

**处理策略**：
1. 检查会话状态是否有效
2. 验证操作是否允许在当前状态下执行
3. 返回明确的状态错误信息
4. 提供恢复建议

### 网络错误

**场景**：网络连接中断

**处理策略**：
1. 实现请求重试机制（最多 3 次）
2. 显示网络错误提示
3. 保存本地状态，网络恢复后同步
4. 提供离线模式（查看已生成的内容）

## 测试策略

### 单元测试

**测试范围**：
- 数据验证逻辑
- 状态转换逻辑
- 统计计算函数
- 错误处理函数
- Prompt 构建函数

**测试工具**：Vitest

**测试示例**：
```typescript
describe('训练会话状态转换', () => {
  it('应该在完成所有诊断题目后自动转换到 PLANNING 阶段', () => {
    const session = createSession({ diagnosticQuestionCount: 10 });
    for (let i = 0; i < 10; i++) {
      submitAnswer(session.id, { answer: 'A' });
    }
    expect(session.phase).toBe('PLANNING');
  });
});
```

### 属性测试

**测试范围**：
- 所有正确性属性（属性 1-22）
- 使用随机生成的测试数据
- 每个属性至少运行 100 次迭代

**测试工具**：fast-check (TypeScript 的属性测试库)

**测试示例**：
```typescript
import fc from 'fast-check';

describe('属性 2：输入验证正确性', () => {
  it('对于任意输入字符串，应该正确验证训练目标长度', () => {
    fc.assert(
      fc.property(fc.string(), (trainingGoal) => {
        const result = validateTrainingGoal(trainingGoal);
        const isValid = trainingGoal.length >= 10 && trainingGoal.length <= 500;
        expect(result.valid).toBe(isValid);
      }),
      { numRuns: 100 }
    );
  });

  it('对于任意数字，应该正确验证诊断题目数量范围', () => {
    fc.assert(
      fc.property(fc.integer(), (questionCount) => {
        const result = validateQuestionCount(questionCount);
        const isValid = questionCount >= 5 && questionCount <= 20;
        expect(result.valid).toBe(isValid);
      }),
      { numRuns: 100 }
    );
  });
});

describe('属性 11：训练计划结构完整性', () => {
  it('对于任意生成的训练计划，应该包含所有必需结构', () => {
    fc.assert(
      fc.property(
        fc.record({
          diagnosticResults: arbitraryDiagnosticResults(),
          studentProfile: arbitraryStudentProfile(),
          trainingGoal: fc.string({ minLength: 10, maxLength: 500 })
        }),
        async ({ diagnosticResults, studentProfile, trainingGoal }) => {
          const plan = await generateTrainingPlan(
            diagnosticResults,
            studentProfile,
            trainingGoal
          );
          
          // 验证子目标数量
          expect(plan.learningGoals.subGoals.length).toBeGreaterThanOrEqual(3);
          expect(plan.learningGoals.subGoals.length).toBeLessThanOrEqual(5);
          
          // 验证知识点数量
          expect(plan.knowledgePoints.length).toBeGreaterThanOrEqual(5);
          expect(plan.knowledgePoints.length).toBeLessThanOrEqual(10);
          
          // 验证训练阶段
          expect(plan.stages).toHaveProperty('foundation');
          expect(plan.stages).toHaveProperty('improvement');
          expect(plan.stages).toHaveProperty('application');
          
          // 验证每个阶段的完整性
          for (const stage of Object.values(plan.stages)) {
            expect(stage).toHaveProperty('goal');
            expect(stage).toHaveProperty('focus');
            expect(stage).toHaveProperty('questionCount');
            expect(stage).toHaveProperty('estimatedTime');
            expect(stage).toHaveProperty('criteria');
          }
          
          // 验证综合考试规划
          expect(plan.finalExam.questionCount).toBeGreaterThanOrEqual(20);
          expect(plan.finalExam.questionCount).toBeLessThanOrEqual(50);
          expect(plan.finalExam).toHaveProperty('timeLimit');
          expect(plan.finalExam).toHaveProperty('passingScore');
          expect(plan.finalExam).toHaveProperty('difficultyDistribution');
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### 集成测试

**测试范围**：
- 完整的训练流程（从创建任务到生成报告）
- AI 服务集成
- 数据库操作
- API 端点

**测试场景**：
1. 家长创建档案提取模式任务
2. 学员进入训练舱，完成诊断测试
3. AI 生成训练计划
4. 学员确认计划，进行训练
5. 完成所有训练阶段
6. 参加综合考试
7. 生成训练报告
8. 家长查看报告

### E2E 测试

**测试范围**：
- 用户完整操作流程
- UI 交互
- 跨页面导航

**测试工具**：Playwright

### Mock 策略

**AI 服务 Mock**：
- 在单元测试和集成测试中 mock AI 服务调用
- 使用预定义的响应数据
- 模拟各种错误场景（超时、失败、异常响应）

**数据库 Mock**：
- 使用测试数据库
- 每个测试前重置数据
- 使用事务回滚保证测试隔离

### 测试覆盖率目标

- 代码覆盖率：>80%
- 属性测试：所有 22 个属性
- 集成测试：所有主要流程
- E2E 测试：关键用户路径

