# AI 服务商配置指南

## 概述

本系统支持多个主流 AI 服务商，可以配置多个服务商实现负载均衡和故障转移。

## 支持的服务商

### 1. OpenAI

**类型**: `OPENAI`

**API Endpoint**: `https://api.openai.com/v1`

**推荐模型**:
- `gpt-4o` - 最新旗舰模型，性能最强
- `gpt-4o-mini` - 轻量级版本，性价比高
- `gpt-4-turbo` - GPT-4 Turbo 版本
- `gpt-3.5-turbo` - 经典模型，速度快

**API Key 格式**: `sk-...`

**获取方式**: https://platform.openai.com/api-keys

---

### 2. Anthropic Claude

**类型**: `CLAUDE`

**API Endpoint**: `https://api.anthropic.com/v1`

**推荐模型**:
- `claude-3-5-sonnet-20241022` - 最新 Sonnet 版本
- `claude-3-opus-20240229` - 最强大的模型
- `claude-3-sonnet-20240229` - 平衡性能和成本
- `claude-3-haiku-20240307` - 最快速的模型

**API Key 格式**: `sk-ant-...`

**获取方式**: https://console.anthropic.com/

**注意事项**: 
- 需要在请求头中添加 `anthropic-version: 2023-06-01`
- API 格式与 OpenAI 略有不同

---

### 3. DeepSeek

**类型**: `DEEPSEEK`

**API Endpoint**: `https://api.deepseek.com/v1`

**推荐模型**:
- `deepseek-chat` - 通用对话模型
- `deepseek-coder` - 代码专用模型

**API Key 格式**: `sk-...`

**获取方式**: https://platform.deepseek.com/

**特点**: 
- 兼容 OpenAI API 格式
- 性价比极高
- 中文支持优秀

---

### 4. 通义千问 (Qwen)

**类型**: `QWEN`

**API Endpoint**: `https://dashscope.aliyuncs.com/compatible-mode/v1`

**推荐模型**:
- `qwen-max` - 最强大的模型
- `qwen-plus` - 平衡版本
- `qwen-turbo` - 快速版本
- `qwen-long` - 长文本版本

**API Key 格式**: `sk-...`

**获取方式**: https://dashscope.aliyun.com/

**特点**:
- 阿里云出品
- 中文能力强
- 支持超长上下文

---

### 5. Google Gemini

**类型**: `GEMINI`

**API Endpoint**: `https://generativelanguage.googleapis.com/v1beta`

**推荐模型**:
- `gemini-2.0-flash-exp` - 最新实验版本
- `gemini-1.5-pro` - Pro 版本
- `gemini-1.5-flash` - 快速版本

**API Key 格式**: 标准 Google API Key

**获取方式**: https://makersuite.google.com/app/apikey

**注意事项**:
- API 格式与 OpenAI 不同
- API Key 直接作为 URL 参数传递

---

### 6. 智谱 AI (GLM)

**类型**: `ZHIPU`

**API Endpoint**: `https://open.bigmodel.cn/api/paas/v4`

**推荐模型**:
- `glm-4-plus` - 增强版本
- `glm-4-0520` - 标准版本
- `glm-4-air` - 轻量版本
- `glm-4-flash` - 快速版本

**API Key 格式**: 标准 API Key

**获取方式**: https://open.bigmodel.cn/

**特点**:
- 清华大学出品
- 中文能力优秀
- 支持多模态

---

### 7. 豆包 (Doubao)

**类型**: `DOUBAO`

**API Endpoint**: `https://ark.cn-beijing.volces.com/api/v3`

**推荐模型**:
- `doubao-pro-32k` - Pro 版本
- `doubao-lite-32k` - 轻量版本

**API Key 格式**: 标准 API Key

**获取方式**: https://console.volcengine.com/ark

**特点**:
- 字节跳动出品
- 兼容 OpenAI API 格式

---

### 8. 文心一言 (ERNIE)

**类型**: `WENXIN`

**API Endpoint**: `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop`

**推荐模型**:
- `ernie-4.0-turbo-8k` - 最新 Turbo 版本
- `ernie-3.5-8k` - 3.5 版本
- `ernie-speed-128k` - 快速版本，支持长文本

**API Key 格式**: 百度 Access Token

**获取方式**: https://console.bce.baidu.com/qianfan/

**注意事项**:
- 需要先获取 Access Token
- API 格式与 OpenAI 不同

---

### 9. 自定义服务商

**类型**: `CUSTOM`

**API Endpoint**: 自定义

**模型**: 自定义

**用途**: 用于接入其他兼容 OpenAI API 格式的服务商

---

## 配置步骤

### 1. 添加服务商

1. 进入管理后台 → AI 服务配置
2. 点击"添加新服务商"
3. 填写配置信息：
   - 服务商名称：自定义名称，便于识别
   - 服务商类型：从下拉列表选择
   - API Key：从服务商平台获取
   - API Endpoint：系统会自动填充默认值
   - 模型名称：选择或输入模型名称
   - 优先级：数字越小优先级越高
   - 状态：启用或停用

### 2. 测试连接

在保存之前，点击"测试 API 连接"按钮验证配置是否正确：

- ✅ **连接成功**: 显示绿色提示和响应时间
- ⚠️ **响应较慢**: 显示橙色提示（响应时间 > 800ms）
- ❌ **连接失败**: 显示红色提示和错误信息

### 3. 保存配置

测试成功后，点击"保存"按钮保存配置。

### 4. 验证运行

保存后可以在列表中看到新添加的服务商，可以：
- 查看服务商状态
- 编辑配置
- 启用/停用服务商
- 删除服务商

---

## 常见问题

### Q1: 测试连接失败怎么办？

**可能原因**:
1. API Key 错误或已过期
2. API Endpoint 配置错误
3. 模型名称不正确
4. 网络连接问题
5. 服务商 API 限流

**解决方法**:
1. 检查 API Key 是否正确
2. 确认 Endpoint 地址是否正确
3. 验证模型名称是否存在
4. 检查服务器网络连接
5. 查看服务商控制台的使用情况

### Q2: 如何配置多个服务商？

系统支持配置多个服务商，会按照优先级自动选择：
1. 优先使用优先级最高（数字最小）的服务商
2. 如果该服务商失败，自动切换到下一个
3. 实现负载均衡和故障转移

### Q3: 如何查看 API 使用情况？

进入管理后台 → API 监控，可以查看：
- 总调用次数
- Token 消耗统计
- 平均响应时间
- 错误率
- 各服务商的使用分布

### Q4: DeepSeek 显示连接失败？

DeepSeek 的正确配置：
- Endpoint: `https://api.deepseek.com/v1`
- Model: `deepseek-chat` 或 `deepseek-coder`
- API Key: 从 https://platform.deepseek.com/ 获取

如果仍然失败，请检查：
1. API Key 是否有效
2. 账户余额是否充足
3. 是否有 API 调用限制

### Q5: 如何获取各服务商的 API Key？

请访问各服务商的官方网站：
- OpenAI: https://platform.openai.com/
- Claude: https://console.anthropic.com/
- DeepSeek: https://platform.deepseek.com/
- 通义千问: https://dashscope.aliyun.com/
- Gemini: https://makersuite.google.com/
- 智谱 AI: https://open.bigmodel.cn/
- 豆包: https://console.volcengine.com/ark
- 文心一言: https://console.bce.baidu.com/qianfan/

---

## 最佳实践

### 1. 配置多个服务商

建议配置 2-3 个服务商作为备份：
- 主服务商：优先级 0
- 备用服务商 1：优先级 1
- 备用服务商 2：优先级 2

### 2. 定期测试

定期使用"连通性一键测试"功能检查所有服务商的状态。

### 3. 监控使用情况

定期查看 API 监控页面，了解：
- 各服务商的使用频率
- 响应时间趋势
- 错误率变化

### 4. 成本优化

根据使用情况选择合适的模型：
- 简单任务：使用轻量级模型（如 gpt-4o-mini）
- 复杂任务：使用旗舰模型（如 gpt-4o）
- 代码相关：使用专用模型（如 deepseek-coder）

---

## 技术支持

如有问题，请查看：
1. 系统日志：`backend/logs/`
2. API 监控页面
3. 各服务商的官方文档

---

**最后更新**: 2026-01-21
