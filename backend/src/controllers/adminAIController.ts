import { Request, Response } from 'express';
import { adminAIService } from '../services/adminAIService';
import { AIProviderType, ProviderStatus } from '@prisma/client';

// 获取所有 AI 服务商
export const getAllProviders = async (_req: Request, res: Response) => {
  try {
    const providers = await adminAIService.getAllProviders();
    
    // 隐藏 API 密钥的敏感部分
    const sanitizedProviders = providers.map(provider => {
      // 处理短 API Key 的情况
      let maskedApiKey = provider.apiKey;
      if (provider.apiKey.length > 12) {
        maskedApiKey = `${provider.apiKey.substring(0, 8)}...${provider.apiKey.substring(provider.apiKey.length - 4)}`;
      } else if (provider.apiKey.length > 4) {
        maskedApiKey = `${provider.apiKey.substring(0, 4)}...`;
      } else {
        maskedApiKey = '***';
      }
      
      return {
        ...provider,
        apiKey: maskedApiKey,
      };
    });

    return res.json({
      success: true,
      data: sanitizedProviders,
    });
  } catch (error: any) {
    console.error('获取 AI 服务商列表失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取 AI 服务商列表失败',
      error: error.message,
    });
  }
};

// 获取单个 AI 服务商
export const getProviderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'ID 参数无效',
      });
    }
    
    const provider = await adminAIService.getProviderById(id);

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'AI 服务商不存在',
      });
    }

    // 隐藏 API 密钥的敏感部分
    let maskedApiKey = provider.apiKey;
    if (provider.apiKey.length > 12) {
      maskedApiKey = `${provider.apiKey.substring(0, 8)}...${provider.apiKey.substring(provider.apiKey.length - 4)}`;
    } else if (provider.apiKey.length > 4) {
      maskedApiKey = `${provider.apiKey.substring(0, 4)}...`;
    } else {
      maskedApiKey = '***';
    }

    const sanitizedProvider = {
      ...provider,
      apiKey: maskedApiKey,
    };

    return res.json({
      success: true,
      data: sanitizedProvider,
    });
  } catch (error: any) {
    console.error('获取 AI 服务商失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取 AI 服务商失败',
      error: error.message,
    });
  }
};

// 创建 AI 服务商
export const createProvider = async (req: Request, res: Response) => {
  try {
    const { name, type, apiKey, endpoint, model, priority, status, contextWindow, maxTokens, streamEnabled, supportsReasoning } = req.body;

    // 验证必填字段
    if (!name || !type || !apiKey || !endpoint || !model) {
      return res.status(400).json({
        success: false,
        message: '缺少必填字段',
      });
    }

    // 验证类型
    if (!Object.values(AIProviderType).includes(type)) {
      return res.status(400).json({
        success: false,
        message: '无效的服务商类型',
      });
    }

    const provider = await adminAIService.createProvider({
      name,
      type,
      apiKey,
      endpoint,
      model,
      priority,
      status,
      contextWindow: contextWindow ?? null,
      maxTokens: maxTokens ?? null,
      streamEnabled: !!streamEnabled,
      supportsReasoning: supportsReasoning ?? undefined,
    });

    return res.status(201).json({
      success: true,
      message: 'AI 服务商创建成功',
      data: provider,
    });
  } catch (error: any) {
    console.error('创建 AI 服务商失败:', error);
    return res.status(500).json({
      success: false,
      message: '创建 AI 服务商失败',
      error: error.message,
    });
  }
};

// 更新 AI 服务商
export const updateProvider = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'ID 参数无效',
      });
    }
    
    const { name, type, apiKey, endpoint, model, priority, status, contextWindow, maxTokens, streamEnabled, supportsReasoning } = req.body;

    // 验证类型（如果提供）
    if (type && !Object.values(AIProviderType).includes(type)) {
      return res.status(400).json({
        success: false,
        message: '无效的服务商类型',
      });
    }

    // 验证状态（如果提供）
    if (status && !Object.values(ProviderStatus).includes(status)) {
      return res.status(400).json({
        success: false,
        message: '无效的服务商状态',
      });
    }

    const updateData: any = { name, type, apiKey, endpoint, model, priority, status };
    if (contextWindow !== undefined) updateData.contextWindow = contextWindow;
    if (maxTokens !== undefined) updateData.maxTokens = maxTokens;
    if (streamEnabled !== undefined) updateData.streamEnabled = !!streamEnabled;
    if (supportsReasoning !== undefined) updateData.supportsReasoning = !!supportsReasoning;

    const provider = await adminAIService.updateProvider(id, updateData);

    return res.json({
      success: true,
      message: 'AI 服务商更新成功',
      data: provider,
    });
  } catch (error: any) {
    console.error('更新 AI 服务商失败:', error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'AI 服务商不存在',
      });
    }

    return res.status(500).json({
      success: false,
      message: '更新 AI 服务商失败',
      error: error.message,
    });
  }
};

// 删除 AI 服务商
export const deleteProvider = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'ID 参数无效',
      });
    }

    await adminAIService.deleteProvider(id);

    return res.json({
      success: true,
      message: 'AI 服务商删除成功',
    });
  } catch (error: any) {
    console.error('删除 AI 服务商失败:', error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'AI 服务商不存在',
      });
    }

    return res.status(500).json({
      success: false,
      message: '删除 AI 服务商失败',
      error: error.message,
    });
  }
};

// 测试所有 AI 服务商连通性
export const testAllProviders = async (_req: Request, res: Response) => {
  try {
    const results = await adminAIService.testAllProviders();

    return res.json({
      success: true,
      message: '连通性测试完成',
      data: results,
    });
  } catch (error: any) {
    console.error('测试 AI 服务商连通性失败:', error);
    return res.status(500).json({
      success: false,
      message: '测试 AI 服务商连通性失败',
      error: error.message,
    });
  }
};

// 测试单个 AI 服务商连通性（不保存到数据库）
export const testProvider = async (req: Request, res: Response) => {
  try {
    const { type, apiKey, endpoint, model } = req.body;

    // 验证必填字段
    if (!type || !apiKey || !endpoint || !model) {
      return res.status(400).json({
        success: false,
        message: '缺少必填字段',
      });
    }

    // 构造临时服务商对象进行测试
    const tempProvider = {
      id: 'temp',
      name: 'Test Provider',
      type,
      apiKey,
      endpoint,
      model,
      priority: 0,
      status: 'ACTIVE' as const,
    };

    const result = await adminAIService.testSingleProvider(tempProvider);

    return res.json({
      success: true,
      message: '连通性测试完成',
      data: result,
    });
  } catch (error: any) {
    console.error('测试 AI 服务商连通性失败:', error);
    return res.status(500).json({
      success: false,
      message: '测试 AI 服务商连通性失败',
      error: error.message,
    });
  }
};

// 列出指定端点上的可用模型（识别模型按钮）
export const listModels = async (req: Request, res: Response) => {
  try {
    const { type, apiKey, endpoint } = req.body;

    if (!type || !endpoint) {
      return res.status(400).json({
        success: false,
        message: '缺少必填字段：type / endpoint',
      });
    }

    const result = await adminAIService.fetchProviderModels({ type, apiKey, endpoint });

    return res.json({
      success: true,
      message: '模型列表获取成功',
      data: result.models,
    });
  } catch (error: any) {
    console.error('获取模型列表失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取模型列表失败',
      error: error.message,
    });
  }
};

// 获取所有科目教学指令
export const getAllInstructions = async (req: Request, res: Response) => {
  try {
    const { subject } = req.query;

    if (subject && typeof subject === 'string') {
      // 获取单个科目
      const instruction = await adminAIService.getInstructionBySubject(subject);
      
      if (!instruction) {
        return res.status(404).json({
          success: false,
          message: '科目教学指令不存在',
        });
      }

      return res.json({
        success: true,
        data: instruction,
      });
    }

    // 获取所有科目
    const instructions = await adminAIService.getAllInstructions();

    return res.json({
      success: true,
      data: instructions,
    });
  } catch (error: any) {
    console.error('获取科目教学指令失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取科目教学指令失败',
      error: error.message,
    });
  }
};

// 更新科目教学指令
export const updateInstruction = async (req: Request, res: Response) => {
  try {
    const { subject } = req.params;
    if (!subject || typeof subject !== 'string') {
      return res.status(400).json({
        success: false,
        message: '科目参数无效',
      });
    }
    
    const { systemPrompt, examples, providerId } = req.body;

    // 验证必填字段
    if (!systemPrompt) {
      return res.status(400).json({
        success: false,
        message: '缺少必填字段: systemPrompt',
      });
    }

    const instruction = await adminAIService.upsertInstruction({
      subject,
      systemPrompt,
      examples,
      providerId: providerId || null,
    });

    return res.json({
      success: true,
      message: '科目教学指令更新成功',
      data: instruction,
    });
  } catch (error: any) {
    console.error('更新科目教学指令失败:', error);
    return res.status(500).json({
      success: false,
      message: '更新科目教学指令失败',
      error: error.message,
    });
  }
};

// 删除科目教学指令
export const deleteInstruction = async (req: Request, res: Response) => {
  try {
    const { subject } = req.params;
    if (!subject || typeof subject !== 'string') {
      return res.status(400).json({
        success: false,
        message: '科目参数无效',
      });
    }

    await adminAIService.deleteInstruction(subject);

    return res.json({
      success: true,
      message: '科目教学指令删除成功',
    });
  } catch (error: any) {
    console.error('删除科目教学指令失败:', error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: '科目教学指令不存在',
      });
    }

    return res.status(500).json({
      success: false,
      message: '删除科目教学指令失败',
      error: error.message,
    });
  }
};

// 获取 API 监控指标
export const getAPIMetrics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    let start: Date | undefined;
    let end: Date | undefined;

    if (startDate && typeof startDate === 'string') {
      start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return res.status(400).json({
          success: false,
          message: '无效的开始日期',
        });
      }
    }

    if (endDate && typeof endDate === 'string') {
      end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: '无效的结束日期',
        });
      }
    }

    const metrics = await adminAIService.getAPIMetrics(start, end);

    return res.json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    console.error('获取 API 监控指标失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取 API 监控指标失败',
      error: error.message,
    });
  }
};

// 检查错误率告警
export const checkErrorRateAlert = async (req: Request, res: Response) => {
  try {
    const { threshold } = req.query;
    const thresholdValue = threshold && typeof threshold === 'string' ? parseFloat(threshold) : 10;

    if (isNaN(thresholdValue) || thresholdValue < 0 || thresholdValue > 100) {
      return res.status(400).json({
        success: false,
        message: '无效的阈值（应为 0-100 之间的数字）',
      });
    }

    const alert = await adminAIService.checkErrorRateAlert(thresholdValue);

    return res.json({
      success: true,
      data: alert,
    });
  } catch (error: any) {
    console.error('检查错误率告警失败:', error);
    return res.status(500).json({
      success: false,
      message: '检查错误率告警失败',
      error: error.message,
    });
  }
};

// 获取限流器状态
export const getRateLimiterStatus = async (_req: Request, res: Response) => {
  try {
    const { aiServiceManager } = await import('../services/aiServiceManager');
    const status = aiServiceManager.getRateLimiterStatus();

    return res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error('获取限流器状态失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取限流器状态失败',
      error: error.message,
    });
  }
};

// 清空请求队列
export const clearRequestQueue = async (_req: Request, res: Response) => {
  try {
    const { aiServiceManager } = await import('../services/aiServiceManager');
    aiServiceManager.clearRequestQueue();

    return res.json({
      success: true,
      message: '请求队列已清空',
    });
  } catch (error: any) {
    console.error('清空请求队列失败:', error);
    return res.status(500).json({
      success: false,
      message: '清空请求队列失败',
      error: error.message,
    });
  }
};

// 导出 API 监控数据
export const exportAPIMetrics = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    let start: Date | undefined;
    let end: Date | undefined;

    if (startDate && typeof startDate === 'string') {
      start = new Date(startDate);
    }

    if (endDate && typeof endDate === 'string') {
      end = new Date(endDate);
    }

    const metrics = await adminAIService.getAPIMetrics(start, end);

    // 生成 CSV 数据
    const csvRows: string[] = [];
    
    // CSV 头部
    csvRows.push('时间,总调用次数,成功次数,失败次数,总Token数,平均响应时间(ms)');
    
    // 添加时间序列数据
    if (metrics.timeSeriesData && Array.isArray(metrics.timeSeriesData)) {
      metrics.timeSeriesData.forEach((data: any) => {
        csvRows.push([
          new Date(data.timestamp).toLocaleString('zh-CN'),
          data.totalCalls,
          data.successCalls,
          data.errorCalls,
          data.totalTokens,
          Math.round(data.avgResponseTime),
        ].join(','));
      });
    }

    // 添加服务商统计
    csvRows.push('');
    csvRows.push('服务商统计');
    csvRows.push('服务商名称,服务商类型,总调用次数,成功次数,失败次数,错误率(%),平均响应时间(ms)');
    
    if (metrics.providerStats && Array.isArray(metrics.providerStats)) {
      metrics.providerStats.forEach((stat: any) => {
        csvRows.push([
          stat.providerName,
          stat.providerType,
          stat.totalCalls,
          stat.successCalls,
          stat.errorCalls,
          stat.errorRate.toFixed(2),
          Math.round(stat.avgResponseTime),
        ].join(','));
      });
    }

    const csvContent = csvRows.join('\n');
    
    // 设置响应头
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=api-metrics-${Date.now()}.csv`);
    
    // 添加 BOM 以支持 Excel 正确显示中文
    res.write('\ufeff');
    res.write(csvContent);
    return res.end();
  } catch (error: any) {
    console.error('导出 API 监控数据失败:', error);
    return res.status(500).json({
      success: false,
      message: '导出 API 监控数据失败',
      error: error.message,
    });
  }
};
