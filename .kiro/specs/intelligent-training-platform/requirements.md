# 需求文档：智能训练平台 - 档案提取模式

## 简介

本系统实现基于学员档案的 AI 智能训练平台，核心理念类似 Kiro 的 Spec 模式：不是简单出几道题，而是通过诊断测试了解学员水平，生成详细的学习计划，进行系统化的引导式训练，最后通过大型综合考试验收学习成果。

## 术语表

- **训练舱（Training_Cabin）**：学员进行训练的主界面
- **训练会话（Training_Session）**：一次完整的训练过程实例
- **档案提取模式（Profile_Based_Mode）**：基于学员档案信息，由 AI 动态生成所有内容的训练模式
- **诊断测试（Diagnostic_Test）**：训练开始前的评估测试，用于了解学员当前水平
- **训练计划（Training_Plan）**：AI 根据诊断结果生成的详细学习计划文档
- **引导式训练（Guided_Training）**：按照训练计划进行的系统化训练过程
- **综合考试（Final_Exam）**：训练结束时的大型验收考试，类似期末考试
- **AI_服务管理器（AI_Service_Manager）**：管理多个 AI 服务提供商的服务
- **学员档案（Student_Profile）**：包含学员年级、教材版本、学习基础等信息

## 需求

### 需求 1：家长创建档案提取模式任务

**用户故事**：作为家长，我想要创建基于学员档案的训练任务，以便 AI 能够根据学员的实际情况生成个性化的训练内容。

#### 验收标准

1. WHEN 家长选择"档案提取模式"，THEN THE 系统 SHALL 自动提取选中学员的完整档案信息
2. WHEN 家长填写训练目标，THEN THE 系统 SHALL 验证训练目标不为空且长度在 10-500 字符之间
3. WHEN 家长设置诊断测试题目数量，THEN THE 系统 SHALL 限制范围在 5-20 题之间，默认值为 10 题
4. WHEN 家长提交任务创建，THEN THE 系统 SHALL 创建任务记录并关联学员档案信息
5. THE 系统 SHALL 在任务配置中保存训练目标、诊断题目数量和档案提取模式标识

### 需求 2：学员启动训练会话

**用户故事**：作为学员，我想要进入训练舱开始训练，以便系统能够为我创建训练会话并开始诊断测试。

#### 验收标准

1. WHEN 学员点击进入训练舱，THEN THE 系统 SHALL 检测任务是否为档案提取模式
2. WHEN 任务为档案提取模式，THEN THE 系统 SHALL 创建训练会话且不依赖题库数据
3. WHEN 创建训练会话，THEN THE 系统 SHALL 设置初始阶段为 DIAGNOSTIC_TEST
4. WHEN 创建训练会话，THEN THE 系统 SHALL 初始化空的题目列表和答题记录
5. THE 系统 SHALL 将诊断测试题目数量设置为任务配置中的值

### 需求 3：AI 生成诊断测试题目

**用户故事**：作为学员，我想要 AI 根据我的档案信息逐题生成诊断测试题目，以便系统能够全面评估我的当前水平。

#### 验收标准

1. WHEN 训练会话处于 DIAGNOSTIC_TEST 阶段，THEN THE AI_服务管理器 SHALL 根据学员档案生成诊断题目
2. WHEN 生成诊断题目，THEN THE AI_服务管理器 SHALL 包含学员的年级、教材版本、学习基础和训练目标信息
3. WHEN 生成诊断题目，THEN THE 系统 SHALL 返回包含题干、选项、题型的题目对象
4. WHEN 生成诊断题目，THEN THE 题目 SHALL 覆盖训练目标相关的不同知识点
5. WHEN 生成诊断题目，THEN THE 题目难度 SHALL 从易到难分布，全面评估学员水平
6. WHEN AI 服务调用失败，THEN THE 系统 SHALL 返回友好的错误提示并允许重试
7. THE 系统 SHALL 在 10 秒内完成单道题目的生成

### 需求 4：学员完成诊断测试

**用户故事**：作为学员，我想要作答诊断测试题目并获得即时反馈，以便了解自己的答题情况。

#### 验收标准

1. WHEN 学员提交诊断测试答案，THEN THE AI_服务管理器 SHALL 判断答案正确性
2. WHEN AI 判断答案，THEN THE 系统 SHALL 返回正确答案、详细解析和反馈
3. WHEN 学员完成一道诊断题，THEN THE 系统 SHALL 记录答题情况、用时和错误类型
4. WHEN 学员点击"下一题"，THEN THE 系统 SHALL 生成下一道诊断题目
5. WHEN 完成所有诊断题目，THEN THE 系统 SHALL 自动进入 PLANNING 阶段
6. THE 系统 SHALL 在 5 秒内完成答案判断和反馈生成

### 需求 5：AI 分析诊断结果并生成训练计划

**用户故事**：作为学员，我想要 AI 深度分析我的诊断测试结果并生成详细的训练计划，以便我能够进行系统化的学习。

#### 验收标准

1. WHEN 诊断测试完成，THEN THE AI_服务管理器 SHALL 分析所有诊断测试答题数据
2. WHEN AI 分析诊断结果，THEN THE 系统 SHALL 统计正确率、错题分布和薄弱知识点
3. WHEN AI 分析诊断结果，THEN THE 系统 SHALL 结合学员档案信息评估学习风格
4. WHEN AI 生成训练计划，THEN THE 训练计划 SHALL 包含学习目标分解（至少 3-5 个子目标）
5. WHEN AI 生成训练计划，THEN THE 训练计划 SHALL 包含完整的知识点清单（至少 5-10 个知识点）
6. WHEN AI 生成训练计划，THEN THE 训练计划 SHALL 包含至少 3 个训练阶段：基础巩固、能力提升、综合应用
7. WHEN AI 生成训练计划，THEN THE 每个训练阶段 SHALL 包含学习重点、练习题数量、预计用时和验收标准
8. WHEN AI 生成训练计划，THEN THE 训练计划 SHALL 包含综合考试规划（考试范围、题目数量 20-50 题、难度分布、及格标准）
9. WHEN 训练计划生成完成，THEN THE 系统 SHALL 显示完整的训练计划给学员确认
10. THE 系统 SHALL 在 30 秒内完成训练计划的生成

### 需求 6：学员进行基础巩固阶段训练

**用户故事**：作为学员，我想要按照训练计划进行基础巩固训练，以便加强我的薄弱知识点。

#### 验收标准

1. WHEN 学员点击"开始训练"，THEN THE 系统 SHALL 进入 GUIDED_TRAINING 阶段
2. WHEN 进入基础巩固阶段，THEN THE AI_服务管理器 SHALL 针对薄弱知识点生成练习题
3. WHEN 生成基础巩固题目，THEN THE 题目 SHALL 包含详细的知识点讲解
4. WHEN 学员答错题目，THEN THE AI_服务管理器 SHALL 提供引导式思考提示
5. WHEN 学员答错题目，THEN THE 系统 SHALL 允许学员重做该题
6. WHEN 完成基础巩固阶段，THEN THE AI_服务管理器 SHALL 生成阶段小结报告
7. THE 基础巩固阶段 SHALL 包含至少 10-20 道练习题

### 需求 7：学员进行能力提升阶段训练

**用户故事**：作为学员，我想要进行能力提升训练，以便提高我的综合解题能力。

#### 验收标准

1. WHEN 进入能力提升阶段，THEN THE AI_服务管理器 SHALL 生成难度逐步提升的题目
2. WHEN 生成能力提升题目，THEN THE 题目 SHALL 包含综合性和跨知识点内容
3. WHEN 学员遇到困难，THEN THE AI_服务管理器 SHALL 提供解题思路指导
4. WHEN 完成能力提升阶段，THEN THE AI_服务管理器 SHALL 生成阶段小结报告
5. THE 能力提升阶段 SHALL 包含至少 15-25 道练习题

### 需求 8：学员进行综合应用阶段训练

**用户故事**：作为学员，我想要进行综合应用训练，以便培养解决实际问题的能力。

#### 验收标准

1. WHEN 进入综合应用阶段，THEN THE AI_服务管理器 SHALL 生成实际应用场景题目
2. WHEN 生成综合应用题目，THEN THE 题目 SHALL 包含跨知识点综合题
3. WHEN 学员作答，THEN THE AI_服务管理器 SHALL 评估学员的综合应用能力
4. WHEN 完成综合应用阶段，THEN THE AI_服务管理器 SHALL 生成阶段小结报告
5. THE 综合应用阶段 SHALL 包含至少 10-15 道练习题

### 需求 9：学员参加综合考试

**用户故事**：作为学员，我想要参加综合考试验收学习成果，以便全面检验我的学习效果。

#### 验收标准

1. WHEN 所有训练阶段完成，THEN THE 系统 SHALL 进入 FINAL_EXAM 阶段
2. WHEN 进入综合考试，THEN THE AI_服务管理器 SHALL 生成 20-50 道考试题目
3. WHEN 生成考试题目，THEN THE 题目 SHALL 包含多种题型（选择题、填空题、解答题）
4. WHEN 生成考试题目，THEN THE 题目难度分布 SHALL 为：基础题 40%、中等题 40%、难题 20%
5. WHEN 生成考试题目，THEN THE 题目 SHALL 涵盖所有训练过的知识点
6. WHEN 学员参加考试，THEN THE 系统 SHALL 设置合理的时间限制
7. WHEN 学员参加考试，THEN THE 系统 SHALL 禁用 AI 助手功能（模拟真实考试）
8. WHEN 学员提交考试，THEN THE 系统 SHALL 进入 COMPLETED 阶段
9. THE 综合考试题目数量 SHALL 根据训练目标复杂度在 20-50 题之间

### 需求 10：AI 生成完整训练报告

**用户故事**：作为学员，我想要查看完整的训练报告，以便了解我的学习成果和后续改进方向。

#### 验收标准

1. WHEN 综合考试完成，THEN THE AI_服务管理器 SHALL 生成完整的训练报告
2. WHEN 生成训练报告，THEN THE 报告 SHALL 包含诊断测试分析（初始水平评估）
3. WHEN 生成训练报告，THEN THE 报告 SHALL 包含训练过程回顾（各阶段表现）
4. WHEN 生成训练报告，THEN THE 报告 SHALL 包含综合考试成绩（总分、正确率、各知识点得分）
5. WHEN 生成训练报告，THEN THE 报告 SHALL 包含进步情况对比（诊断测试 vs 综合考试）
6. WHEN 生成训练报告，THEN THE 报告 SHALL 包含薄弱点分析（仍需加强的内容）
7. WHEN 生成训练报告，THEN THE 报告 SHALL 包含学习建议（后续学习方向）
8. WHEN 生成训练报告，THEN THE 系统 SHALL 根据表现计算并发放积分奖励
9. WHEN 报告生成完成，THEN THE 系统 SHALL 更新任务状态为 COMPLETED
10. THE 系统 SHALL 在 30 秒内完成训练报告的生成

### 需求 11：训练过程中的 AI 助手支持

**用户故事**：作为学员，我想要在训练过程中随时向 AI 助手求助，以便获得学习指导和答疑。

#### 验收标准

1. WHEN 学员在训练过程中，THEN THE 系统 SHALL 提供 AI 助手对话功能
2. WHEN 学员向 AI 助手提问，THEN THE AI_服务管理器 SHALL 提供启发式引导而非直接答案
3. WHEN 学员答错题目，THEN THE AI 助手 SHALL 主动提供思路引导
4. WHEN 学员在综合考试阶段，THEN THE 系统 SHALL 禁用 AI 助手功能
5. THE AI 助手 SHALL 在 5 秒内响应学员的提问

### 需求 12：训练进度管理和状态追踪

**用户故事**：作为学员，我想要清楚地看到训练进度和当前状态，以便了解我的学习进展。

#### 验收标准

1. WHEN 学员在训练舱中，THEN THE 系统 SHALL 显示当前训练阶段
2. WHEN 学员在训练舱中，THEN THE 系统 SHALL 显示当前阶段的进度（如 5/20 题）
3. WHEN 学员在训练舱中，THEN THE 系统 SHALL 显示已完成的训练阶段列表
4. WHEN 学员在训练舱中，THEN THE 系统 SHALL 显示预计剩余时间
5. THE 系统 SHALL 实时更新训练进度信息

### 需求 13：错误处理和降级方案

**用户故事**：作为系统管理员，我想要系统能够优雅地处理 AI 服务故障，以便保证用户体验。

#### 验收标准

1. WHEN AI 服务调用超时（>30 秒），THEN THE 系统 SHALL 显示友好的错误提示
2. WHEN AI 服务调用失败，THEN THE 系统 SHALL 提供重试选项
3. WHEN AI 服务连续失败 3 次，THEN THE 系统 SHALL 建议学员稍后再试
4. WHEN AI 生成内容质量异常，THEN THE 系统 SHALL 记录日志并重新生成
5. THE 系统 SHALL 在所有 AI 调用中实现超时控制和错误处理

### 需求 14：家长查看训练报告

**用户故事**：作为家长，我想要查看学员的训练报告，以便了解学员的学习情况和进步。

#### 验收标准

1. WHEN 训练完成，THEN THE 系统 SHALL 在家长端显示训练报告
2. WHEN 家长查看报告，THEN THE 系统 SHALL 显示完整的训练数据和分析
3. WHEN 家长查看报告，THEN THE 系统 SHALL 显示学员的进步曲线图
4. WHEN 家长查看报告，THEN THE 系统 SHALL 显示 AI 生成的学习建议
5. THE 家长端 SHALL 支持导出训练报告为 PDF 格式

### 需求 15：训练计划的可视化展示

**用户故事**：作为学员，我想要以可视化的方式查看训练计划，以便更好地理解学习路径。

#### 验收标准

1. WHEN 训练计划生成完成，THEN THE 系统 SHALL 以结构化方式展示训练计划
2. WHEN 展示训练计划，THEN THE 系统 SHALL 显示各阶段的关系和顺序
3. WHEN 展示训练计划，THEN THE 系统 SHALL 高亮显示当前进行的阶段
4. WHEN 展示训练计划，THEN THE 系统 SHALL 显示各阶段的完成状态
5. THE 训练计划展示 SHALL 支持折叠和展开详细内容
