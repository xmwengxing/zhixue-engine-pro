# 需求文档 - 系统优化第一阶段

## 简介

本文档定义了智能提分训练平台的系统优化需求,主要涉及用户注册流程优化、个人信息管理增强、教材体系调整、任务管理流程改进、授权码使用规则调整以及数据清理等核心功能的优化升级。

## 术语表

- **System**: 智能提分训练平台系统
- **Registration_Portal**: 注册门户
- **Parent_User**: 家长用户
- **Student_User**: 学员用户
- **Admin_User**: 管理员用户
- **Student_ID**: 学号(格式: STU+年份后两位+6位流水号)
- **Authorization_Code**: 授权码(用于学员账户创建)
- **Profile_Center**: 个人中心
- **Material_Node**: 教材节点
- **Task_Config**: 任务配置
- **Parent_Child_Binding**: 亲子绑定关系
- **Grade_Selector**: 年级选单
- **Learning_Foundation**: 学习基础(薄弱/一般/良好/优秀)

## 需求

### 需求 1: 注册流程优化 - 角色选择与差异化信息采集

**用户故事:** 作为新用户,我希望在注册时能够选择家长或学员角色,并根据角色填写相应的必填和选填信息,以便系统能够为我提供个性化的服务。

#### 验收标准

1. WHEN 用户访问注册页面时,THE Registration_Portal SHALL 显示家长和学员两个角色选项
2. WHEN 用户选择家长角色时,THE System SHALL 要求填写账户名、密码、邮箱作为必填项
3. WHEN 用户选择家长角色时,THE System SHALL 提供姓名、性别、联系方式、家庭住址、从事行业作为选填项
4. WHEN 用户选择学员角色时,THE System SHALL 要求填写账户名、密码、姓名、性别、出生年月、年级选单作为必填项
5. WHEN 用户选择学员角色时,THE System SHALL 提供就读院校、学习基础选单、兴趣爱好作为选填项
6. WHEN 家长用户提交注册时,THE System SHALL 创建家长账户而不需要授权码
7. WHEN 学员用户提交注册时,THE System SHALL 验证授权码有效性后才允许创建账户
8. THE System SHALL 对所有必填项进行非空验证,对邮箱格式进行正则验证
9. THE System SHALL 在注册成功后自动登录并跳转到对应角色的首页

### 需求 2: 学号生成规则优化

**用户故事:** 作为系统管理员,我希望学号能够按照新的编码规则自动生成,以便更好地管理和识别学员账户。

#### 验收标准

1. WHEN 学员通过注册创建账户时,THE System SHALL 自动生成11位学号
2. THE System SHALL 按照"STU+年份后两位+6位流水号"格式生成学号
3. WHEN 生成学号时,THE System SHALL 基于当前年份和该年度已生成学号数量计算流水号
4. THE System SHALL 确保流水号从000001开始递增,不足6位时前补0
5. WHEN 家长在亲子管理中添加学员时,THE System SHALL 同样按照此规则生成学号
6. THE System SHALL 保证学号的全局唯一性
7. THE System SHALL 在管理员的学号管理中心显示所有已生成的学号及其关联信息

### 需求 3: 家长个人中心功能

**用户故事:** 作为家长用户,我希望能够在个人中心查看和修改我的个人信息,以便保持信息的准确性。

#### 验收标准

1. WHEN 家长访问导航栏时,THE Parent_Portal SHALL 显示"个人中心"菜单项
2. WHEN 家长进入个人中心时,THE System SHALL 显示当前的邮箱、姓名、性别、联系方式、家庭住址、从事行业信息
3. THE Profile_Center SHALL 提供密码修改功能,要求输入原密码和两次新密码
4. THE Profile_Center SHALL 允许家长编辑邮箱、姓名、性别、联系方式、家庭住址、从事行业
5. WHEN 家长提交信息修改时,THE System SHALL 验证数据有效性并更新数据库
6. WHEN 密码修改成功时,THE System SHALL 要求用户重新登录
7. THE System SHALL 在信息更新成功后显示成功提示消息

### 需求 4: 学员个人档案增强

**用户故事:** 作为学员用户,我希望能够在个人档案中查看完整信息并修改部分可编辑字段,以便保持档案的时效性。

#### 验收标准

1. WHEN 学员访问个人档案页面时,THE Student_Portal SHALL 显示学号、账户名、姓名、性别、出生年月等基础信息
2. THE Student_Portal SHALL 显示当前的年级选单、就读院校、学习基础选单、兴趣爱好信息
3. THE Student_Portal SHALL 提供密码修改功能
4. THE Student_Portal SHALL 允许学员修改年级选单、就读院校、学习基础选单、兴趣爱好
5. THE System SHALL 禁止学员修改学号、账户名、姓名、性别、出生年月等核心身份信息
6. WHEN 学员更新档案信息时,THE System SHALL 保存修改历史记录
7. THE System SHALL 在档案更新后重新计算个性化学习推荐

### 需求 5: 管理员用户管理功能修复与增强

**用户故事:** 作为管理员,我希望用户管理功能能够正常工作,并支持创建家长和学员账户,以便高效管理平台用户。

#### 验收标准

1. WHEN 管理员点击"新增用户"按钮时,THE Admin_Portal SHALL 弹出用户创建对话框
2. THE Admin_Portal SHALL 在创建对话框中提供家长和学员角色选单
3. WHEN 管理员选择家长角色时,THE System SHALL 显示家长注册时的所有必填和选填字段
4. WHEN 管理员选择学员角色时,THE System SHALL 显示学员注册时的所有必填和选填字段
5. WHEN 管理员点击用户列表中的"编辑"按钮时,THE System SHALL 弹出编辑对话框并加载用户当前信息
6. WHEN 管理员编辑管理员角色用户时,THE System SHALL 仅允许修改密码
7. WHEN 管理员编辑家长或学员用户时,THE System SHALL 允许修改除学号和账户名外的所有字段
8. WHEN 管理员点击"删除"按钮时,THE System SHALL 显示确认对话框并在确认后执行删除操作
9. THE System SHALL 在用户管理操作成功后刷新用户列表并显示操作结果提示

### 需求 6: 授权码使用规则调整

**用户故事:** 作为系统设计者,我希望明确授权码的使用场景,以便规范学员账户的创建流程。

#### 验收标准

1. WHEN 家长用户注册时,THE System SHALL 不要求输入授权码
2. WHEN 学员用户注册时,THE System SHALL 要求输入有效的授权码
3. WHEN 家长在亲子管理中添加新学员时,THE System SHALL 要求输入有效的授权码
4. WHEN 管理员创建学员账户时,THE System SHALL 要求选择或输入有效的授权码
5. WHEN 授权码被使用后,THE System SHALL 将授权码状态更新为"已激活"并关联到对应学号
6. THE System SHALL 阻止已使用或已过期的授权码被重复使用
7. THE System SHALL 在授权码验证失败时显示明确的错误提示信息

### 需求 7: 家长添加学员流程优化

**用户故事:** 作为家长用户,我希望能够通过填写信息直接为子女创建学员账户并建立绑定关系,以便快速完成账户设置。

#### 验收标准

1. WHEN 家长在亲子管理中点击"添加学员"时,THE Parent_Portal SHALL 显示学员信息填写表单
2. THE Parent_Portal SHALL 要求填写与学员注册时相同的必填和选填信息
3. THE Parent_Portal SHALL 要求输入有效的授权码
4. WHEN 家长提交添加学员请求时,THE System SHALL 验证授权码并创建学员账户
5. WHEN 学员账户创建成功时,THE System SHALL 自动生成学号并建立与家长的亲子绑定关系
6. THE System SHALL 将新创建的学员账户信息和初始密码通知家长
7. THE System SHALL 在添加成功后在家长的学员列表中显示新添加的学员

### 需求 8: 管理员亲子关系管理

**用户故事:** 作为管理员,我希望能够查看所有的亲子绑定关系并支持手动解绑,以便处理特殊情况和数据维护。

#### 验收标准

1. WHEN 管理员访问亲子关系管理页面时,THE Admin_Portal SHALL 显示所有家长与学员的绑定关系列表
2. THE Admin_Portal SHALL 显示家长姓名、家长账户名、学员姓名、学员学号、绑定时间等信息
3. THE Admin_Portal SHALL 提供搜索和筛选功能,支持按家长或学员信息查询
4. WHEN 管理员点击"解绑"按钮时,THE System SHALL 显示确认对话框说明解绑影响
5. WHEN 管理员确认解绑时,THE System SHALL 删除亲子绑定关系但保留双方账户和历史数据
6. THE System SHALL 在解绑成功后通知家长和学员
7. THE System SHALL 记录解绑操作的时间和操作人信息

### 需求 9: 教材体系管理优化

**用户故事:** 作为管理员,我希望教材管理界面更加直观,并支持批量导入教材数据,以便高效维护教材体系。

#### 验收标准

1. WHEN 管理员访问教材体系管理页面时,THE Admin_Portal SHALL 将"创建节点"按钮文本改为"创建教材"
2. WHEN 管理员点击"创建教材"时,THE System SHALL 弹出教材创建对话框
3. THE Admin_Portal SHALL 在创建对话框中提供科目、教材版本、单元、备注、关键词字段
4. THE Admin_Portal SHALL 支持在单元字段中添加多个单元项
5. THE Admin_Portal SHALL 提供"批量导入教材"功能按钮
6. WHEN 管理员点击"批量导入教材"时,THE System SHALL 提供Excel模板下载链接
7. THE System SHALL 提供包含科目、教材版本、单元、备注、关键词列的Excel导入模板
8. WHEN 管理员上传导入文件时,THE System SHALL 解析Excel数据并验证格式
9. WHEN 导入数据验证通过时,THE System SHALL 批量创建教材节点并显示导入结果统计
10. WHEN 导入数据存在错误时,THE System SHALL 显示错误行号和错误原因

### 需求 10: 家长任务管理流程优化

**用户故事:** 作为家长用户,我希望任务配置界面更加清晰,并能够灵活选择配置模式,以便为子女创建合适的学习任务。

#### 验收标准

1. WHEN 家长进入任务配置页面时,THE Parent_Portal SHALL 显示"自定义配置模式"和"档案提取模式"两个选项卡
2. WHEN 家长选择自定义配置模式时,THE System SHALL 显示以下字段:选择学员选单、任务标题、AI科目老师选单、科目选单、教材版本选单、单元选单(支持多选)、任务目标、性格特征(选填)
3. WHEN 家长选择档案提取模式时,THE System SHALL 自动加载选中学员的档案信息
4. WHEN 在档案提取模式下时,THE Parent_Portal SHALL 显示学员的姓名、年级、学习基础等已填信息
5. WHEN 在档案提取模式下时,THE Parent_Portal SHALL 允许家长填写AI科目老师选单和临时修改学员的选填信息
6. WHEN 家长在档案提取模式下修改学员信息时,THE System SHALL 仅将修改应用于当前任务,不更新学员个人档案
7. WHEN 家长提交任务配置时,THE System SHALL 验证所有必填字段并创建任务
8. WHEN 任务创建成功时,THE System SHALL 将任务推送到对应学员的任务中心
9. THE System SHALL 将任务配置信息(包括科目老师AI指令)传递给AI服务用于训练舱交互
10. THE System SHALL 确保科目老师AI的角色约束由管理员配置的科目指令(第一级)和家长的任务配置(第二级)共同决定

### 需求 11: 家长端页面授权问题修复

**用户故事:** 作为家长用户,我希望能够正常访问学习报告和愿望审批页面,以便查看子女的学习情况和处理愿望申请。

#### 验收标准

1. WHEN 家长访问学习报告页面时,THE System SHALL 正确携带认证令牌发起API请求
2. WHEN 家长访问愿望审批页面时,THE System SHALL 正确携带认证令牌发起API请求
3. THE System SHALL 在请求头中包含有效的Authorization Bearer Token
4. WHEN 认证令牌过期时,THE System SHALL 自动刷新令牌或引导用户重新登录
5. THE System SHALL 在API请求失败时显示友好的错误提示而非技术错误信息
6. THE System SHALL 确保所有家长端受保护路由都正确配置了认证中间件
7. THE System SHALL 在页面加载时验证用户登录状态,未登录时重定向到登录页

### 需求 12: 模拟数据清理

**用户故事:** 作为开发者,我希望清除项目中的模拟数据,以便系统使用真实的数据库数据运行。

#### 验收标准

1. THE System SHALL 移除所有前端组件中的硬编码模拟数据
2. THE System SHALL 移除所有后端服务中的测试数据生成代码(保留种子脚本)
3. THE System SHALL 确保所有数据展示组件从API获取真实数据
4. THE System SHALL 在数据为空时显示友好的空状态提示
5. THE System SHALL 保留必要的示例数据用于开发环境测试
6. THE System SHALL 在生产环境配置中禁用所有模拟数据功能
7. THE System SHALL 更新相关文档说明真实数据的获取方式

### 需求 13: 文档更新

**用户故事:** 作为项目维护者,我希望所有文档能够反映最新的系统功能,以便用户和开发者能够正确理解和使用系统。

#### 验收标准

1. THE System SHALL 更新README.md文档,包含新的注册流程和学号规则说明
2. THE System SHALL 更新API_DOCUMENTATION.md文档,包含所有新增和修改的API接口
3. THE System SHALL 更新USER_MANUAL_ADMIN.md文档,包含用户管理、亲子关系管理、教材管理的新功能说明
4. THE System SHALL 更新USER_MANUAL_PARENT.md文档,包含个人中心、任务配置优化、添加学员流程的说明
5. THE System SHALL 更新USER_MANUAL_STUDENT.md文档,包含个人档案增强功能的说明
6. THE System SHALL 在文档中添加新功能的使用截图或流程图
7. THE System SHALL 确保所有文档使用中文编写且格式统一

### 需求 14: 年级选单标准化

**用户故事:** 作为系统设计者,我希望年级选单在整个系统中保持一致,以便用户能够准确选择年级信息。

#### 验收标准

1. THE System SHALL 定义标准的年级选单列表:一年级上、一年级下、二年级上、二年级下...高三上、高三下
2. THE System SHALL 在学员注册、管理员创建学员、家长添加学员、学员档案编辑等所有场景使用统一的年级选单
3. THE System SHALL 按照小学、初中、高中分组显示年级选项
4. THE System SHALL 在数据库中使用标准化的年级编码存储
5. THE System SHALL 在前端显示时使用友好的中文年级名称
6. THE System SHALL 支持根据年级自动推荐对应的教材版本

### 需求 15: 学习基础选单标准化

**用户故事:** 作为系统设计者,我希望学习基础选单在整个系统中保持一致,以便准确评估学员的学习水平。

#### 验收标准

1. THE System SHALL 定义标准的学习基础选单:薄弱、一般、良好、优秀
2. THE System SHALL 在学员注册、管理员创建学员、家长添加学员、学员档案编辑等所有场景使用统一的学习基础选单
3. THE System SHALL 支持为不同科目设置不同的学习基础等级
4. THE System SHALL 在任务配置时参考学员的学习基础调整难度
5. THE System SHALL 在AI训练舱中根据学习基础调整初始题目难度
6. THE System SHALL 在学习报告中展示学习基础的变化趋势

### 需求 16: 数据验证与错误处理增强

**用户故事:** 作为用户,我希望系统能够及时提示我输入错误,并提供清晰的错误信息,以便我能够正确完成操作。

#### 验收标准

1. THE System SHALL 对所有用户输入进行前端实时验证
2. THE System SHALL 在用户提交表单前进行完整性验证
3. WHEN 验证失败时,THE System SHALL 在对应字段下方显示红色错误提示
4. THE System SHALL 对邮箱格式、密码强度、手机号格式等进行正则表达式验证
5. THE System SHALL 在后端API层进行二次验证,防止恶意请求
6. WHEN 后端验证失败时,THE System SHALL 返回结构化的错误信息
7. THE System SHALL 在前端统一处理API错误并显示友好的中文提示
8. THE System SHALL 记录所有验证失败的日志用于问题排查

### 需求 17: 性能优化与用户体验提升

**用户故事:** 作为用户,我希望系统响应迅速,操作流畅,以便获得良好的使用体验。

#### 验收标准

1. THE System SHALL 在表单提交时显示加载状态,防止重复提交
2. THE System SHALL 对长列表数据实现分页或虚拟滚动
3. THE System SHALL 对频繁访问的数据实现前端缓存
4. THE System SHALL 在数据加载时显示骨架屏或加载动画
5. THE System SHALL 对图片资源实现懒加载
6. THE System SHALL 优化API响应时间,确保常用接口在500ms内响应
7. THE System SHALL 在网络请求失败时提供重试机制
8. THE System SHALL 在移动端优化触摸交互体验

### 需求 18: 安全性增强

**用户故事:** 作为系统管理员,我希望系统能够保护用户数据安全,防止未授权访问,以便维护平台的安全性。

#### 验收标准

1. THE System SHALL 对所有密码进行加密存储,使用bcrypt或类似算法
2. THE System SHALL 实现JWT令牌机制,设置合理的过期时间
3. THE System SHALL 在敏感操作(如删除用户、解绑关系)时要求二次确认
4. THE System SHALL 实现API请求频率限制,防止暴力攻击
5. THE System SHALL 对所有用户输入进行XSS和SQL注入防护
6. THE System SHALL 记录所有敏感操作的审计日志
7. THE System SHALL 在检测到异常登录时发送安全提醒
8. THE System SHALL 定期清理过期的会话和令牌
