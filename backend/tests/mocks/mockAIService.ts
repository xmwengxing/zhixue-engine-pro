/**
 * Mock AI 服务
 * 用于集成测试，模拟 AI 服务的响应
 */

/**
 * Mock 诊断测试题目生成
 */
export function mockGenerateDiagnosticQuestion(questionNumber: number, context: any) {
  const knowledgePoints = ['加法运算', '减法运算', '乘法运算', '除法运算', '分数运算'];
  const difficulties = ['easy', 'medium', 'hard'];
  
  // 根据题号选择知识点和难度
  const kpIndex = (questionNumber - 1) % knowledgePoints.length;
  const diffIndex = Math.floor((questionNumber - 1) / knowledgePoints.length) % difficulties.length;
  
  return {
    stem: `${context.grade}年级${knowledgePoints[kpIndex]}题目 ${questionNumber}：计算 ${questionNumber} + ${questionNumber} = ?`,
    type: 'single_choice',
    options: [
      `${questionNumber * 2 - 1}`,
      `${questionNumber * 2}`,
      `${questionNumber * 2 + 1}`,
      `${questionNumber * 2 + 2}`,
    ],
    correctAnswer: `${questionNumber * 2}`,
    explanation: `${questionNumber} + ${questionNumber} = ${questionNumber * 2}`,
    knowledgePoint: knowledgePoints[kpIndex],
    difficulty: difficulties[diffIndex],
    guidance: '仔细计算，注意进位',
  };
}

/**
 * Mock 答案评估
 */
export function mockEvaluateAnswer(question: any, studentAnswer: string) {
  const isCorrect = studentAnswer.trim() === question.correctAnswer.trim();
  
  return {
    isCorrect,
    correctAnswer: question.correctAnswer,
    feedback: isCorrect ? '回答正确！继续保持！' : '回答错误，再想想看。',
    explanation: question.explanation,
    guidance: isCorrect ? undefined : '提示：' + question.guidance,
  };
}

/**
 * Mock 训练计划生成
 */
export function mockGenerateTrainingPlan(diagnosticResults: any, studentProfile: any, trainingGoal: string) {
  return {
    learningGoals: {
      main: trainingGoal,
      subGoals: [
        '掌握基础运算规则',
        '提高计算准确率',
        '培养解题思维',
        '增强综合应用能力',
      ],
    },
    knowledgePoints: [
      { point: '加法运算', masteryLevel: 'medium', priority: 1 },
      { point: '减法运算', masteryLevel: 'weak', priority: 2 },
      { point: '乘法运算', masteryLevel: 'medium', priority: 3 },
      { point: '除法运算', masteryLevel: 'weak', priority: 4 },
      { point: '分数运算', masteryLevel: 'weak', priority: 5 },
    ],
    stages: {
      foundation: {
        name: '基础巩固',
        goal: '巩固薄弱知识点',
        focus: ['减法运算', '除法运算', '分数运算'],
        questionCount: 15,
        estimatedTime: 30,
        criteria: ['正确率达到 80%', '理解基本概念', '掌握运算规则'],
      },
      improvement: {
        name: '能力提升',
        goal: '提高综合运算能力',
        focus: ['混合运算', '应用题', '逻辑推理'],
        questionCount: 20,
        estimatedTime: 40,
        criteria: ['正确率达到 75%', '能够独立解题', '掌握解题技巧'],
      },
      application: {
        name: '综合应用',
        goal: '培养实际应用能力',
        focus: ['实际问题', '综合题目', '创新思维'],
        questionCount: 12,
        estimatedTime: 30,
        criteria: ['正确率达到 70%', '能够灵活运用', '具备创新思维'],
      },
    },
    finalExam: {
      questionCount: 30,
      timeLimit: 60,
      passingScore: 70,
      difficultyDistribution: {
        easy: 40,
        medium: 40,
        hard: 20,
      },
    },
    estimatedDuration: 100,
  };
}

/**
 * Mock 训练题目生成
 */
export function mockGenerateTrainingQuestion(stage: string, questionNumber: number, context: any) {
  const stageNames: Record<string, string> = {
    foundation: '基础巩固',
    improvement: '能力提升',
    application: '综合应用',
  };
  
  const difficulties: Record<string, string> = {
    foundation: 'easy',
    improvement: 'medium',
    application: 'hard',
  };
  
  return {
    stem: `${stageNames[stage]}阶段题目 ${questionNumber}：计算 ${questionNumber * 2} + ${questionNumber * 3} = ?`,
    type: 'single_choice',
    options: [
      `${questionNumber * 5 - 1}`,
      `${questionNumber * 5}`,
      `${questionNumber * 5 + 1}`,
      `${questionNumber * 5 + 2}`,
    ],
    correctAnswer: `${questionNumber * 5}`,
    explanation: `${questionNumber * 2} + ${questionNumber * 3} = ${questionNumber * 5}`,
    knowledgePoint: context.weakPoints?.[0] || '混合运算',
    difficulty: difficulties[stage],
    guidance: '分步计算，先算乘法再算加法',
  };
}

/**
 * Mock 综合考试题目生成
 */
export function mockGenerateExamQuestions(trainingPlan: any, trainingHistory: any) {
  const questionCount = trainingPlan.finalExam.questionCount;
  const questions = [];
  
  // 根据难度分布生成题目
  const easyCount = Math.round(questionCount * trainingPlan.finalExam.difficultyDistribution.easy / 100);
  const mediumCount = Math.round(questionCount * trainingPlan.finalExam.difficultyDistribution.medium / 100);
  const hardCount = questionCount - easyCount - mediumCount;
  
  // 生成简单题
  for (let i = 0; i < easyCount; i++) {
    questions.push({
      stem: `简单题 ${i + 1}：计算 ${i + 1} + ${i + 1} = ?`,
      type: 'single_choice',
      options: [`${(i + 1) * 2 - 1}`, `${(i + 1) * 2}`, `${(i + 1) * 2 + 1}`, `${(i + 1) * 2 + 2}`],
      correctAnswer: `${(i + 1) * 2}`,
      explanation: `${i + 1} + ${i + 1} = ${(i + 1) * 2}`,
      knowledgePoint: '加法运算',
      difficulty: 'easy',
    });
  }
  
  // 生成中等题
  for (let i = 0; i < mediumCount; i++) {
    questions.push({
      stem: `中等题 ${i + 1}：计算 ${(i + 1) * 2} × ${i + 1} = ?`,
      type: 'single_choice',
      options: [`${(i + 1) * (i + 1) * 2 - 1}`, `${(i + 1) * (i + 1) * 2}`, `${(i + 1) * (i + 1) * 2 + 1}`, `${(i + 1) * (i + 1) * 2 + 2}`],
      correctAnswer: `${(i + 1) * (i + 1) * 2}`,
      explanation: `${(i + 1) * 2} × ${i + 1} = ${(i + 1) * (i + 1) * 2}`,
      knowledgePoint: '乘法运算',
      difficulty: 'medium',
    });
  }
  
  // 生成困难题
  for (let i = 0; i < hardCount; i++) {
    questions.push({
      stem: `困难题 ${i + 1}：计算 ${(i + 1) * 3} ÷ ${i + 1} + ${i + 1} = ?`,
      type: 'single_choice',
      options: [`${3 + i}`, `${4 + i}`, `${5 + i}`, `${6 + i}`],
      correctAnswer: `${4 + i}`,
      explanation: `${(i + 1) * 3} ÷ ${i + 1} + ${i + 1} = 3 + ${i + 1} = ${4 + i}`,
      knowledgePoint: '混合运算',
      difficulty: 'hard',
    });
  }
  
  return questions;
}

/**
 * Mock 训练报告生成
 */
export function mockGenerateTrainingReport(sessionData: any) {
  const diagnosticData = sessionData.diagnosticTestData;
  const finalExamData = sessionData.finalExamData;
  
  const diagnosticAccuracy = diagnosticData?.answers 
    ? (diagnosticData.answers.filter((a: any) => a.isCorrect).length / diagnosticData.answers.length) * 100 
    : 0;
  
  const examAccuracy = finalExamData?.results?.accuracy || 0;
  const improvement = examAccuracy - diagnosticAccuracy;
  
  const content = `# 智能训练报告

## 一、诊断测试分析

**初始水平评估：**
- 总题数：${diagnosticData?.totalQuestions || 0}
- 正确率：${diagnosticAccuracy.toFixed(1)}%
- 薄弱知识点：减法运算、除法运算、分数运算

## 二、训练过程回顾

### 基础巩固阶段
- 完成题目：15 题
- 正确率：80%
- 用时：30 分钟
- 亮点：基础知识掌握扎实

### 能力提升阶段
- 完成题目：20 题
- 正确率：75%
- 用时：40 分钟
- 亮点：解题能力有所提升

### 综合应用阶段
- 完成题目：12 题
- 正确率：70%
- 用时：30 分钟
- 亮点：能够灵活运用知识

## 三、综合考试成绩

- 总分：${finalExamData?.results?.totalScore || 0}/${finalExamData?.results?.maxScore || 0}
- 正确率：${examAccuracy.toFixed(1)}%
- 正确题数：${finalExamData?.results?.correctCount || 0}/${finalExamData?.results?.totalQuestions || 0}

**各知识点得分：**
${finalExamData?.results?.knowledgePointScores?.map((kp: any) => 
  `- ${kp.point}：${kp.accuracy.toFixed(1)}%`
).join('\n') || ''}

## 四、进步情况对比

- 诊断测试正确率：${diagnosticAccuracy.toFixed(1)}%
- 综合考试正确率：${examAccuracy.toFixed(1)}%
- **进步幅度：${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%**

## 五、薄弱点分析

仍需加强的内容：
- 分数运算
- 混合运算
- 应用题解题

## 六、学习建议

1. 继续巩固基础知识，特别是分数运算
2. 多做混合运算练习，提高计算准确率
3. 加强应用题训练，培养解题思维
4. 保持良好的学习习惯，持续进步

## 七、积分奖励

本次训练表现优秀，获得 **${Math.round(examAccuracy)}** 积分奖励！

---

*报告生成时间：${new Date().toLocaleString('zh-CN')}*
`;

  return {
    content,
    pointsAwarded: Math.round(examAccuracy),
    summary: {
      diagnosticAccuracy,
      finalExamAccuracy: examAccuracy,
      improvement,
      masteredPoints: ['加法运算', '乘法运算'],
      weakPoints: ['分数运算', '混合运算'],
    },
  };
}

/**
 * Mock AI 助手对话
 */
export function mockChatWithAssistant(message: string, context: any) {
  if (context.phase === 'FINAL_EXAM') {
    return '抱歉，综合考试期间 AI 助手功能暂时不可用。请独立完成考试，加油！';
  }
  
  // 简单的关键词匹配回复
  if (message.includes('怎么做') || message.includes('不会')) {
    return '让我们一起思考一下：这道题考查的是什么知识点？你能先尝试分析一下题目吗？';
  } else if (message.includes('答案')) {
    return '我不能直接告诉你答案，但我可以给你一些提示。你觉得应该从哪里入手呢？';
  } else {
    return '很好的问题！让我们一步一步来分析。你能告诉我你目前的想法吗？';
  }
}
