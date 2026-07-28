import { PrismaClient, AIProviderType, ProviderStatus } from '@prisma/client';
import { safeJsonParse } from '../utils/aiJson';

const prisma = new PrismaClient();

// AI 服务商服务
export class AdminAIService {
  // 获取所有 AI 服务商
  async getAllProviders() {
    return await prisma.aIProvider.findMany({
      orderBy: {
        priority: 'asc',
      },
    });
  }

  // 获取单个 AI 服务商
  async getProviderById(id: string) {
    return await prisma.aIProvider.findUnique({
      where: { id },
    });
  }

  // 创建 AI 服务商
  async createProvider(data: {
    name: string;
    type: AIProviderType;
    apiKey: string;
    endpoint: string;
    model: string;
    priority?: number;
    status?: ProviderStatus;
  }) {
    // 如果没有指定优先级，设置为当前最大优先级 + 1
    if (data.priority === undefined) {
      const maxPriority = await prisma.aIProvider.findFirst({
        orderBy: {
          priority: 'desc',
        },
        select: {
          priority: true,
        },
      });
      data.priority = (maxPriority?.priority || 0) + 1;
    }

    return await prisma.aIProvider.create({
      data: {
        name: data.name,
        type: data.type,
        apiKey: data.apiKey,
        endpoint: data.endpoint,
        model: data.model,
        priority: data.priority,
        status: data.status || ProviderStatus.ACTIVE,
      },
    });
  }

  // 更新 AI 服务商
  async updateProvider(
    id: string,
    data: {
      name?: string;
      type?: AIProviderType;
      apiKey?: string;
      endpoint?: string;
      model?: string;
      priority?: number;
      status?: ProviderStatus;
    }
  ) {
    return await prisma.aIProvider.update({
      where: { id },
      data,
    });
  }

  // 删除 AI 服务商
  async deleteProvider(id: string) {
    return await prisma.aIProvider.delete({
      where: { id },
    });
  }

  // 测试所有 AI 服务商连通性
  async testAllProviders() {
    const providers = await this.getAllProviders();
    const results = [];

    for (const provider of providers) {
      const result = await this.testSingleProvider(provider);
      results.push(result);
    }

    return results;
  }

  // 测试单个服务商连接
  async testSingleProvider(provider: any) {
    const startTime = Date.now();
    let status: 'healthy' | 'degraded' | 'down' = 'down';
    let latency: number | null = null;
    let error: string | null = null;
    let responseData: any = null;

    try {
      const testResult = await this.testProviderConnection(provider);
      latency = Date.now() - startTime;
      
      if (testResult.success) {
        status = latency > 800 ? 'degraded' : 'healthy';
        responseData = testResult.data;
      } else {
        status = 'down';
        error = testResult.error || '连接失败';
      }
    } catch (err: any) {
      latency = Date.now() - startTime;
      status = 'down';
      error = err.message || '连接失败';
    }

    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      status,
      latency,
      error,
      responseData,
      testedAt: new Date().toISOString(),
    };
  }

  // 测试单个服务商连接
  private async testProviderConnection(provider: any): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      // 使用 Node.js 内置的 fetch API 进行测试
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      // 根据不同的服务商类型构建不同的请求
      let url = provider.endpoint;
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      let body: any = {
        model: provider.model,
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 10,
      };

      // 根据服务商类型调整请求格式
      switch (provider.type) {
        case 'OPENAI':
        case 'DEEPSEEK':
          url = `${provider.endpoint}/chat/completions`;
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
          break;
        
        case 'CLAUDE':
          url = `${provider.endpoint}/messages`;
          headers['x-api-key'] = provider.apiKey;
          headers['anthropic-version'] = '2023-06-01';
          body = {
            model: provider.model,
            messages: [{ role: 'user', content: '你好' }],
            max_tokens: 10,
          };
          break;
        
        case 'QWEN':
          url = `${provider.endpoint}/chat/completions`;
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
          break;
        
        case 'GEMINI':
          // Gemini 使用不同的 API 格式
          url = `${provider.endpoint}/models/${provider.model}:generateContent?key=${provider.apiKey}`;
          body = {
            contents: [{ parts: [{ text: '你好' }] }],
          };
          delete headers['Authorization'];
          break;
        
        case 'ZHIPU':
          url = `${provider.endpoint}/chat/completions`;
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
          break;
        
        case 'DOUBAO':
        case 'WENXIN':
          url = `${provider.endpoint}/chat/completions`;
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
          break;
        
        default:
          // 自定义或其他类型，使用通用格式
          url = `${provider.endpoint}/chat/completions`;
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
      }
      
      // 构建测试请求
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let responseJson: any = null;

      // 安全解析上游 provider 的 JSON 响应（解析失败保留 null，不抛异常）
      responseJson = safeJsonParse(responseText);

      if (response.ok) {
        // 请求成功
        return { success: true, data: responseJson };
      } else if (response.status === 400 || response.status === 401) {
        // 400/401 可能是参数问题或认证问题，但服务可达
        const errorMsg = responseJson?.error?.message || responseJson?.message || `HTTP ${response.status}`;
        return { success: false, error: errorMsg };
      } else {
        return { success: false, error: `HTTP ${response.status}: ${responseText.substring(0, 100)}` };
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, error: '请求超时（10秒）' };
      }
      return { success: false, error: err.message };
    }
  }

  // 获取所有科目教学指令
  async getAllInstructions() {
    return await prisma.subjectInstruction.findMany({
      orderBy: {
        subject: 'asc',
      },
    });
  }

  // 获取单个科目教学指令
  async getInstructionBySubject(subject: string) {
    return await prisma.subjectInstruction.findUnique({
      where: { subject },
    });
  }

  // 创建或更新科目教学指令
  async upsertInstruction(data: {
    subject: string;
    systemPrompt: string;
    examples?: Array<{ question: string; response: string }>;
    providerId?: string | null;
  }) {
    return await prisma.subjectInstruction.upsert({
      where: { subject: data.subject },
      update: {
        systemPrompt: data.systemPrompt,
        examples: data.examples || [],
        providerId: data.providerId || null,
      },
      create: {
        subject: data.subject,
        systemPrompt: data.systemPrompt,
        examples: data.examples || [],
        providerId: data.providerId || null,
      },
    });
  }

  // 删除科目教学指令
  async deleteInstruction(subject: string) {
    return await prisma.subjectInstruction.delete({
      where: { subject },
    });
  }

  // 各供应商 Token 单价估算（元 / 1K tokens，输入/输出分开）
  // 用于成本看板估算，非精确账单
  private static readonly TOKEN_PRICING: Record<
    string,
    { input: number; output: number }
  > = {
    OPENAI: { input: 0.018, output: 0.072 },
    CLAUDE: { input: 0.022, output: 0.11 },
    DEEPSEEK: { input: 0.002, output: 0.008 },
    QWEN: { input: 0.004, output: 0.012 },
    GEMINI: { input: 0.009, output: 0.036 },
    ZHIPU: { input: 0.005, output: 0.005 },
    DOUBAO: { input: 0.0008, output: 0.002 },
    WENXIN: { input: 0.004, output: 0.016 },
    CUSTOM: { input: 0.01, output: 0.03 },
  };

  // 估算单条日志成本（元）
  private estimateCost(providerType: string, requestTokens: number, responseTokens: number): number {
    const pricing =
      AdminAIService.TOKEN_PRICING[providerType] || AdminAIService.TOKEN_PRICING.CUSTOM;
    return (requestTokens / 1000) * pricing.input + (responseTokens / 1000) * pricing.output;
  }

  // 获取 API 指标统计
  async getAPIMetrics(startDate?: Date, endDate?: Date) {
    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    // 获取所有日志
    const logs = await prisma.aPILog.findMany({
      where,
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 计算总体指标
    const totalCalls = logs.length;
    const successCalls = logs.filter(log => log.status === 'SUCCESS').length;
    const errorCalls = logs.filter(log => log.status === 'ERROR').length;
    const errorRate = totalCalls > 0 ? (errorCalls / totalCalls) * 100 : 0;

    const totalRequestTokens = logs.reduce((sum, log) => sum + log.requestTokens, 0);
    const totalResponseTokens = logs.reduce((sum, log) => sum + log.responseTokens, 0);
    const totalTokens = totalRequestTokens + totalResponseTokens;

    const avgResponseTime = totalCalls > 0
      ? logs.reduce((sum, log) => sum + log.responseTime, 0) / totalCalls
      : 0;

    // P95 响应延迟
    const sortedTimes = logs.map(log => log.responseTime).sort((a, b) => a - b);
    const p95ResponseTime = sortedTimes.length > 0
      ? sortedTimes[Math.min(sortedTimes.length - 1, Math.floor(sortedTimes.length * 0.95))]
      : 0;

    // 总成本估算（元）
    const totalCost = logs.reduce(
      (sum, log) => sum + this.estimateCost(log.provider.type, log.requestTokens, log.responseTokens),
      0
    );

    // 今日 vs 昨日同期对比（独立于筛选区间，始终按自然日统计）
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    // 昨日同期截止点：昨天的"现在时刻"
    const yesterdaySameTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [todayAgg, yesterdayAgg, lastHourErrors] = await Promise.all([
      prisma.aPILog.aggregate({
        where: { createdAt: { gte: todayStart } },
        _count: { id: true },
        _sum: { requestTokens: true, responseTokens: true },
      }),
      prisma.aPILog.aggregate({
        where: { createdAt: { gte: yesterdayStart, lte: yesterdaySameTime } },
        _count: { id: true },
        _sum: { requestTokens: true, responseTokens: true },
      }),
      prisma.aPILog.count({
        where: {
          createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
          status: 'ERROR',
        },
      }),
    ]);

    const todayCalls = todayAgg._count.id;
    const todayTokens =
      (todayAgg._sum.requestTokens || 0) + (todayAgg._sum.responseTokens || 0);
    const yesterdayCalls = yesterdayAgg._count.id;
    const yesterdayTokens =
      (yesterdayAgg._sum.requestTokens || 0) + (yesterdayAgg._sum.responseTokens || 0);

    // 按服务商分组统计
    const providerStats = logs.reduce((acc: any, log) => {
      const providerId = log.provider.id;
      if (!acc[providerId]) {
        acc[providerId] = {
          providerId,
          providerName: log.provider.name,
          providerType: log.provider.type,
          totalCalls: 0,
          successCalls: 0,
          errorCalls: 0,
          errorRate: 0,
          totalTokens: 0,
          requestTokens: 0,
          responseTokens: 0,
          estimatedCost: 0,
          avgResponseTime: 0,
        };
      }

      acc[providerId].totalCalls++;
      if (log.status === 'SUCCESS') {
        acc[providerId].successCalls++;
      } else {
        acc[providerId].errorCalls++;
      }
      acc[providerId].totalTokens += log.requestTokens + log.responseTokens;
      acc[providerId].requestTokens += log.requestTokens;
      acc[providerId].responseTokens += log.responseTokens;
      acc[providerId].estimatedCost += this.estimateCost(
        log.provider.type,
        log.requestTokens,
        log.responseTokens
      );
      acc[providerId].avgResponseTime += log.responseTime;

      return acc;
    }, {});

    // 计算每个服务商的平均值和错误率
    Object.values(providerStats).forEach((stats: any) => {
      stats.errorRate = stats.totalCalls > 0
        ? (stats.errorCalls / stats.totalCalls) * 100
        : 0;
      stats.avgResponseTime = stats.totalCalls > 0
        ? stats.avgResponseTime / stats.totalCalls
        : 0;
      stats.estimatedCost = Math.round(stats.estimatedCost * 100) / 100;
    });

    // 按时间分组统计（按小时）
    const timeSeriesData = logs.reduce((acc: any, log) => {
      const hour = new Date(log.createdAt);
      hour.setMinutes(0, 0, 0);
      const hourKey = hour.toISOString();

      if (!acc[hourKey]) {
        acc[hourKey] = {
          timestamp: hourKey,
          totalCalls: 0,
          successCalls: 0,
          errorCalls: 0,
          totalTokens: 0,
          avgResponseTime: 0,
        };
      }

      acc[hourKey].totalCalls++;
      if (log.status === 'SUCCESS') {
        acc[hourKey].successCalls++;
      } else {
        acc[hourKey].errorCalls++;
      }
      acc[hourKey].totalTokens += log.requestTokens + log.responseTokens;
      acc[hourKey].avgResponseTime += log.responseTime;

      return acc;
    }, {});

    // 计算时间序列的平均值
    Object.values(timeSeriesData).forEach((data: any) => {
      data.avgResponseTime = data.totalCalls > 0
        ? data.avgResponseTime / data.totalCalls
        : 0;
    });

    return {
      summary: {
        totalCalls,
        successCalls,
        errorCalls,
        errorRate: Math.round(errorRate * 100) / 100,
        totalTokens,
        totalRequestTokens,
        totalResponseTokens,
        avgResponseTime: Math.round(avgResponseTime),
        p95ResponseTime,
        estimatedCost: Math.round(totalCost * 100) / 100,
        lastHourErrors,
        todayCalls,
        todayTokens,
        yesterdayCalls,
        yesterdayTokens,
      },
      providerStats: Object.values(providerStats),
      timeSeriesData: Object.values(timeSeriesData).sort((a: any, b: any) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ),
      recentLogs: logs.slice(0, 50), // 最近 50 条日志
    };
  }

  // 检查错误率告警
  async checkErrorRateAlert(threshold: number = 10) {
    // 获取最近 1 小时的日志
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const logs = await prisma.aPILog.findMany({
      where: {
        createdAt: {
          gte: oneHourAgo,
        },
      },
    });

    if (logs.length === 0) {
      return {
        alert: false,
        errorRate: 0,
        message: '暂无数据',
      };
    }

    const errorCount = logs.filter(log => log.status === 'ERROR').length;
    const errorRate = (errorCount / logs.length) * 100;

    return {
      alert: errorRate > threshold,
      errorRate: Math.round(errorRate * 100) / 100,
      threshold,
      totalCalls: logs.length,
      errorCalls: errorCount,
      message: errorRate > threshold
        ? `错误率 ${Math.round(errorRate * 100) / 100}% 超过阈值 ${threshold}%`
        : '错误率正常',
    };
  }
}

export const adminAIService = new AdminAIService();
