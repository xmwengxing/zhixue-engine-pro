# 需求文档

## 简介

智能提分训练平台是一个面向中小学生的全栈 Web 应用，通过 AI 驱动的个性化学习、错题管理和激励系统，帮助学生提升学习成绩。平台包含管理员端、家长端和学员端三个角色视角，实现从教材配置、任务发布、智能训练到学习反馈的完整闭环。

## 术语表

- **System**: 智能提分训练平台系统
- **Admin_Portal**: 管理员端门户
- **Parent_Portal**: 家长端门户
- **Student_Portal**: 学员端门户
- **Training_Cabin**: 训练舱（核心学习交互模块）
- **AI_Agent**: AI 教学助手
- **Authorization_Code**: 授权码（用于账户激活）
- **Student_ID**: 学号
- **Wish_System**: 愿望激励系统
- **Error_Book**: 错题本
- **Task**: 学习任务
- **Report**: AI 生成的学习报告
- **Material_System**: 教材体系
- **Points**: 积分

## 需求

### 需求 1: 用户认证与角色管理

**用户故事:** 作为系统管理员，我希望能够管理不同角色的用户账户，以便控制平台访问权限和用户数据。

#### 验收标准

1. THE System SHALL 支持三种用户角色：管理员、家长、学员
2. WHEN 用户登录时，THE System SHALL 验证用户凭证并返回对应角色的访问令牌
3. WHEN 管理员创建新账户时，THE System SHALL 生成唯一的用户标识符并分配初始权限
4. WHEN 用户会话过期时，THE System SHALL 要求重新认证
5. THE System SHALL 记录所有用户登录和关键操作的审计日志

### 需求 2: 管理员端 - 学号与授权码管理

**用户故事:** 作为管理员，我希望能够批量生成和管理学号及授权码，以便高效地进行用户账户分配。

#### 验收标准

1. WHEN 管理员请求批量生成授权码时，THE System SHALL 创建指定数量的唯一授权码并记录生成时间
2. THE Admin_Portal SHALL 显示授权码列表，包含状态（未激活/已激活/已过期）和关联学号
3. WHEN 管理员查看学号管理中心时，THE System SHALL 展示所有学号的分配状态和使用统计
4. WHEN 管理员锁定或解绑学号时，THE System SHALL 更新学号状态并通知相关用户
5. THE System SHALL 支持导出未激活授权码列表为 CSV 格式

### 需求 3: 管理员端 - 教材体系管理

**用户故事:** 作为管理员，我希望能够导入和维护各版本教材的结构，以便为学习任务提供标准化的知识体系。

#### 验收标准

1. WHEN 管理员导入教材数据时，THE System SHALL 解析并存储年级、科目、单元的树状结构
2. THE Admin_Portal SHALL 以可展开的树形视图显示教材体系
3. WHEN 管理员编辑教材节点时，THE System SHALL 验证数据完整性并更新相关联的学习任务
4. THE System SHALL 支持多个教材版本（如人教版、苏教版）的并存管理
5. WHEN 删除教材节点时，IF 该节点被任务引用，THEN THE System SHALL 阻止删除并提示依赖关系

### 需求 4: 管理员端 - AI 服务配置

**用户故事:** 作为管理员，我希望能够配置多个 AI 服务商和科目教学指令，以便系统能够提供智能化的教学服务。

#### 验收标准

1. THE Admin_Portal SHALL 支持配置多个 AI 服务商（OpenAI、Claude 等）的 API 密钥和端点
2. WHEN 主 AI 服务不可用时，THE System SHALL 自动切换到备用服务商
3. WHEN 管理员配置科目教学指令时，THE System SHALL 保存每个科目的 System Prompt 模板
4. THE Admin_Portal SHALL 实时显示 API 监控数据，包括 Token 消耗、响应时长和错误率
5. WHEN API 错误率超过阈值时，THE System SHALL 发送告警通知给管理员

### 需求 5: 家长端 - 亲子关系管理

**用户故事:** 作为家长，我希望能够绑定和管理我的子女账户，以便查看他们的学习情况。

#### 验收标准

1. WHEN 家长添加学员时，THE System SHALL 通过授权码或学号验证并建立亲子绑定关系
2. THE Parent_Portal SHALL 支持一个家长账户绑定多个学员账户
3. WHEN 家长查看学情概览时，THE System SHALL 提供学员切换功能并显示选中学员的数据
4. WHEN 家长请求解绑学员时，THE System SHALL 要求二次确认并保留历史数据
5. THE System SHALL 在学员档案中记录绑定的家长信息

### 需求 6: 家长端 - 学情概览看板

**用户故事:** 作为家长，我希望能够直观地查看子女的学习数据，以便了解他们的学习进展和薄弱环节。

#### 验收标准

1. THE Parent_Portal SHALL 在首页显示能力雷达图，展示各科目的掌握程度
2. THE Parent_Portal SHALL 显示错题攻克环形图，标注未掌握、攻克中、已掌握的错题数量
3. THE Parent_Portal SHALL 显示连续学习天数统计和本周学习时长
4. WHEN 家长点击数据卡片时，THE System SHALL 跳转到对应的详细报告页面
5. THE System SHALL 每日更新学情数据并在家长登录时展示最新信息

### 需求 7: 家长端 - 任务配置与发布

**用户故事:** 作为家长，我希望能够为子女创建学习任务，以便引导他们进行针对性的学习。

#### 验收标准

1. THE Parent_Portal SHALL 提供两种任务发布模式：档案提取模式和自定义配置模式
2. WHEN 家长选择档案提取模式时，THE System SHALL 基于学员档案自动生成推荐任务目标
3. WHEN 家长选择自定义配置模式时，THE System SHALL 允许跨版本、跨单元选择学习内容
4. WHEN 家长发布任务时，THE System SHALL 验证任务配置的完整性并通知学员
5. THE System SHALL 保存任务配置历史并支持复用已有配置

### 需求 8: 家长端 - 任务报告中心

**用户故事:** 作为家长，我希望能够查看子女完成任务后的 AI 分析报告，以便了解学习效果和改进方向。

#### 验收标准

1. THE Parent_Portal SHALL 以时间线形式展示所有已完成任务的报告列表
2. WHEN 家长点击报告时，THE System SHALL 显示 AI 生成的深度分析，包括知识点掌握度、错题分析和学习建议
3. THE Report SHALL 包含可视化图表，展示正确率、用时分布和能力变化趋势
4. THE System SHALL 支持报告导出为 PDF 格式
5. WHEN 任务完成时，THE System SHALL 自动生成报告并通知家长查看

### 需求 9: 家长端 - 愿望审批系统

**用户故事:** 作为家长，我希望能够审批子女提交的愿望申请，以便通过激励机制促进学习积极性。

#### 验收标准

1. THE Parent_Portal SHALL 显示学员提交的愿望列表，包含愿望描述、所需积分和提交时间
2. WHEN 家长审批愿望时，THE System SHALL 提供同意、拒绝和附加理由反馈三个操作选项
3. WHEN 家长同意愿望时，THE System SHALL 扣除学员对应积分并更新愿望状态为"待兑现"
4. WHEN 家长拒绝愿望时，THE System SHALL 保留学员积分并通知学员拒绝理由
5. THE System SHALL 记录所有审批操作的时间戳和操作人

### 需求 10: 学员端 - 个人档案管理

**用户故事:** 作为学员，我希望能够维护我的个人学习档案，以便系统能够提供个性化的学习内容。

#### 验收标准

1. THE Student_Portal SHALL 允许学员填写基础信息，包括年级、使用教材版本和各科目基础水平
2. WHEN 学员进行学习基础自评时，THE System SHALL 提供各科目的能力等级选择（薄弱/一般/良好/优秀）
3. THE System SHALL 基于档案信息调整训练舱的初始难度和内容推荐
4. WHEN 学员更新档案时，THE System SHALL 保存修改历史并重新计算学习路径
5. THE Student_Portal SHALL 显示档案完整度进度条，提示学员补充缺失信息

### 需求 11: 学员端 - 训练舱核心功能

**用户故事:** 作为学员，我希望能够在训练舱中进行智能化的学习训练，以便高效提升成绩。

#### 验收标准

1. THE Training_Cabin SHALL 实现三栏布局：左侧进度导航、中间题目交互区、右侧 AI 对话框
2. WHEN 学员开始训练时，THE System SHALL 依次执行训前测试、动态训练步骤和综合考试流程
3. THE Training_Cabin SHALL 实时保存学员的答题记录和进度状态
4. WHEN 学员答题时，THE AI_Agent SHALL 根据答题情况提供启发式引导而非直接答案
5. THE Training_Cabin SHALL 显示当前进度百分比和已完成题目数量

### 需求 12: 学员端 - AI 启发式教学

**用户故事:** 作为学员，我希望 AI 助手能够在我遇到困难时提供启发式引导，以便培养独立思考能力。

#### 验收标准

1. WHEN 学员答错题目时，THE AI_Agent SHALL 分析错误原因并提供分步骤的思路引导
2. THE AI_Agent SHALL 避免直接给出答案，而是通过提问方式引导学员思考
3. WHEN 学员请求帮助时，THE AI_Agent SHALL 根据科目教学指令生成个性化的启发式对话
4. THE Training_Cabin SHALL 在右侧对话框显示 AI 对话历史，支持滚动查看
5. THE System SHALL 记录 AI 对话内容用于生成学习报告

### 需求 13: 学员端 - 错题本管理

**用户故事:** 作为学员，我希望能够系统化地管理和复习错题，以便攻克薄弱知识点。

#### 验收标准

1. THE Student_Portal SHALL 自动收集训练舱中的所有错题并分类存储
2. THE Error_Book SHALL 按科目和掌握度（未掌握/攻克中/已掌握）分类展示错题
3. WHEN 学员进入错题重做模式时，THE System SHALL 提供 AI 引导的二次挑战
4. WHEN 学员正确完成错题重做时，THE System SHALL 更新错题掌握度并奖励积分
5. THE Error_Book SHALL 显示每道错题的原始答案、正确答案和 AI 解析

### 需求 14: 学员端 - 积分与愿望系统

**用户故事:** 作为学员，我希望能够通过学习获得积分并兑换愿望，以便获得学习动力。

#### 验收标准

1. THE Student_Portal SHALL 显示当前可用积分、累计积分和积分获取历史
2. WHEN 学员完成任务或攻克错题时，THE System SHALL 根据难度和表现计算并发放积分
3. THE Student_Portal SHALL 提供愿望提交功能，允许学员自定义愿望描述、设定所需积分和上传参考图片
4. WHEN 学员提交愿望时，IF 所需积分超过当前可用积分，THEN THE System SHALL 显示积分差距提示
5. THE Student_Portal SHALL 显示愿望审核状态（待审核/已同意/已拒绝/已兑现）

### 需求 15: 响应式设计与移动端适配

**用户故事:** 作为用户，我希望能够在不同设备上流畅使用平台，以便随时随地进行学习和管理。

#### 验收标准

1. WHEN 用户在桌面端访问时，THE System SHALL 保持完整的三栏布局显示
2. WHEN 用户在移动端访问训练舱时，THE System SHALL 自动隐藏左侧导航栏并提供汉堡菜单切换
3. WHEN 用户在移动端访问训练舱时，THE System SHALL 将 AI 对话框改为底部浮动图标弹出式设计
4. THE System SHALL 在不同屏幕尺寸下保持布局合理性和可读性
5. THE System SHALL 支持触摸手势操作，如滑动切换题目和双指缩放图片

### 需求 16: UI 设计还原与视觉一致性

**用户故事:** 作为产品设计师，我希望开发能够严格还原设计稿，以便保持品牌视觉一致性和用户体验。

#### 验收标准

1. THE System SHALL 使用设计稿中指定的蓝白色调配色方案
2. THE System SHALL 严格还原设计稿中的布局、字体大小、间距和组件样式
3. THE System SHALL 使用统一的组件库确保各页面视觉一致性
4. WHEN 用户交互时，THE System SHALL 提供符合设计规范的动画和过渡效果
5. THE System SHALL 在所有页面保持统一的导航结构和品牌元素

### 需求 17: 数据持久化与状态管理

**用户故事:** 作为开发者，我希望系统能够可靠地存储和管理用户数据，以便保证数据安全和系统稳定性。

#### 验收标准

1. THE System SHALL 将用户数据、学习记录和配置信息持久化存储到数据库
2. WHEN 用户进行操作时，THE System SHALL 实时更新前端状态并与后端同步
3. THE System SHALL 在网络中断时缓存用户操作，并在恢复连接后自动同步
4. THE System SHALL 定期备份关键数据并支持数据恢复
5. THE System SHALL 使用事务机制确保数据一致性，特别是在积分扣除和任务状态更新时

### 需求 18: AI 报告生成

**用户故事:** 作为学员和家长，我希望系统能够自动生成详细的学习分析报告，以便了解学习效果和改进方向。

#### 验收标准

1. WHEN 学员完成训练任务时，THE System SHALL 调用 AI 服务生成深度学习报告
2. THE Report SHALL 包含知识点掌握度分析、错题统计、能力雷达图和个性化学习建议
3. THE System SHALL 在报告生成过程中显示进度提示（如"AI 报告生成中"）
4. WHEN 报告生成完成时，THE System SHALL 通知学员和家长查看
5. THE System SHALL 保存报告历史并支持对比不同时期的学习数据

### 需求 19: 系统性能与可扩展性

**用户故事:** 作为系统架构师，我希望系统能够支持大规模用户并发访问，以便满足业务增长需求。

#### 验收标准

1. THE System SHALL 支持至少 1000 个并发用户同时在线学习
2. WHEN 用户请求页面时，THE System SHALL 在 2 秒内完成页面加载
3. WHEN AI 服务调用时，THE System SHALL 实现请求队列和限流机制防止过载
4. THE System SHALL 使用缓存机制减少数据库查询压力
5. THE System SHALL 支持水平扩展，通过增加服务器节点提升处理能力

### 需求 20: 代码质量与可维护性

**用户故事:** 作为开发团队成员，我希望代码具有良好的结构和文档，以便团队协作和长期维护。

#### 验收标准

1. THE System SHALL 采用模块化架构，前后端分离，组件职责清晰
2. THE System SHALL 在关键代码处添加中文注释说明业务逻辑
3. THE System SHALL 遵循统一的代码风格规范（如 ESLint、Prettier 配置）
4. THE System SHALL 为核心功能模块编写单元测试，测试覆盖率不低于 60%
5. THE System SHALL 提供 API 文档和部署文档，便于新成员快速上手
