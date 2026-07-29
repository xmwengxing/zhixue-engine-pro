import { PrismaClient, AIProviderType, LogStatus } from '@prisma/client';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { TokenBucketRateLimiter } from '../utils/rateLimiter';

const prisma = new PrismaClient();

// AI 服务调用选项
interface AIOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  timeout?: number; // 超时时间（毫秒），默认 30000
  maxRetries?: number; // 最大重试次数，默认 3
}

// AI 服务响应
interface AIResponse {
  text: string;
  tokens: {
    request: number;
    response: number;
  };
}

// AI 服务错误
export class AIServiceError extends Error {
  public readonly isTimeout: boolean;
  public readonly isQualityIssue: boolean;
  public readonly retryable: boolean;

  constructor(message: string, options?: { isTimeout?: boolean; isQualityIssue?: boolean; retryable?: boolean }) {
    super(message);
    this.name = 'AIServiceError';
    this.isTimeout = options?.isTimeout || false;
    this.isQualityIssue = options?.isQualityIssue || false;
    this.retryable = options?.retryable !== false; // 默认可重试
  }
}

// OpenAI 适配器
class OpenAIAdapter {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, endpoint: string, model: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: endpoint || undefined,
    });
    this.model = model;
  }

  async generate(prompt: string, options: AIOptions): Promise<AIResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: prompt,
    });

    // 部分「推理模型」（如 sensenova-*-flash-lite）在显式 max_tokens 偏小时，
    // 推理过程会耗尽预算、content 为空、答案落在 reasoning 字段。
    // 策略：首调用 options.maxTokens；若 content 为空，则最多再放大到 4096 重试一次
    // （不再继续放大——更大的 max_tokens 对这类慢模型会触发上层超时，得不偿失）。
    // 若仍为空，则回退到 reasoning_content / reasoning（思维链兜底，保证不整体失败）。
    const budgets = [options.maxTokens || 2000];
    if (budgets[0] < 4096) budgets.push(4096);

    let response: OpenAI.Chat.ChatCompletion;
    let text = '';
    for (const mt of budgets) {
      response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: mt,
        temperature: options.temperature || 0.7,
      });
      const rawMsg = response.choices[0]?.message as any;
      text =
        rawMsg?.content?.trim() ||
        rawMsg?.reasoning_content?.trim() ||
        rawMsg?.reasoning?.trim() ||
        '';
      // content 有实质内容即视为拿到最终答案，停止重试
      const contentHasAnswer = !!rawMsg?.content?.trim() && rawMsg.content.trim().length > 5;
      if (contentHasAnswer) break;
    }

    const requestTokens = response!.usage?.prompt_tokens || 0;
    const responseTokens = response!.usage?.completion_tokens || 0;

    return {
      text,
      tokens: {
        request: requestTokens,
        response: responseTokens,
      },
    };
  }
}

// Claude 适配器
class ClaudeAdapter {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, endpoint: string, model: string) {
    this.client = new Anthropic({
      apiKey,
      baseURL: endpoint || undefined,
    });
    this.model = model;
  }

  async generate(prompt: string, options: AIOptions): Promise<AIResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature || 0.7,
      system: options.systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const text = response.content[0]?.type === 'text' 
      ? response.content[0].text 
      : '';
    const requestTokens = response.usage.input_tokens;
    const responseTokens = response.usage.output_tokens;

    return {
      text,
      tokens: {
        request: requestTokens,
        response: responseTokens,
      },
    };
  }
}

// AI 服务管理器
export class AIServiceManager {
  private static instance: AIServiceManager;
  private rateLimiter: TokenBucketRateLimiter;

  private constructor() {
    // 初始化限流器
    // 配置：每秒最多 10 个请求，桶容量 20，最大队列 50
    this.rateLimiter = new TokenBucketRateLimiter({
      capacity: 20,
      refillRate: 10,
      maxQueueSize: 50,
    });
  }

  // 获取单例实例
  static getInstance(): AIServiceManager {
    if (!AIServiceManager.instance) {
      AIServiceManager.instance = new AIServiceManager();
    }
    return AIServiceManager.instance;
  }

  // 获取活跃的服务商列表（按优先级排序）
  private async getActiveProviders() {
    return await prisma.aIProvider.findMany({
      where: {
        status: 'ACTIVE',
      },
      orderBy: {
        priority: 'asc', // 优先级数字越小越高
      },
    });
  }

  // 创建适配器
  private createAdapter(provider: any) {
    switch (provider.type) {
      case AIProviderType.OPENAI:
        return new OpenAIAdapter(provider.apiKey, provider.endpoint, provider.model);
      case AIProviderType.CLAUDE:
        return new ClaudeAdapter(provider.apiKey, provider.endpoint, provider.model);
      default:
        throw new AIServiceError(`不支持的 AI 服务商类型: ${provider.type}`);
    }
  }

  // 记录 API 调用日志
  private async logAPICall(
    providerId: string,
    endpoint: string,
    status: LogStatus,
    requestTokens: number,
    responseTokens: number,
    responseTime: number,
    errorMessage?: string
  ) {
    try {
      await prisma.aPILog.create({
        data: {
          providerId,
          endpoint,
          requestTokens,
          responseTokens,
          responseTime,
          status,
          errorMessage,
        },
      });
    } catch (error) {
      console.error('记录 API 日志失败:', error);
    }
  }

  /**
   * 带超时控制的 Promise 包装
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new AIServiceError('AI 服务调用超时，请稍后重试', { isTimeout: true, retryable: true }));
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * 指数退避延迟
   */
  private async exponentialBackoff(retryCount: number): Promise<void> {
    const delayMs = Math.min(1000 * Math.pow(2, retryCount), 8000); // 最大 8 秒
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * 检查 AI 响应质量
   */
  private checkResponseQuality(text: string): { valid: boolean; reason?: string } {
    // 检查响应是否为空
    if (!text || text.trim().length === 0) {
      return { valid: false, reason: '响应内容为空' };
    }

    // 检查响应长度是否过短（可能是错误信息）
    if (text.trim().length < 10) {
      return { valid: false, reason: '响应内容过短' };
    }

    // 检查是否包含常见的错误标识
    const errorPatterns = [
      /error/i,
      /failed/i,
      /无法/,
      /失败/,
      /错误/,
      /抱歉/,
      /sorry/i,
    ];

    const hasErrorPattern = errorPatterns.some(pattern => pattern.test(text.substring(0, 100)));
    if (hasErrorPattern && text.length < 200) {
      return { valid: false, reason: '响应可能包含错误信息' };
    }

    return { valid: true };
  }

  /**
   * 生成友好的错误提示
   */
  private getFriendlyErrorMessage(error: any, retryCount: number): string {
    if (error instanceof AIServiceError) {
      if (error.isTimeout) {
        return retryCount >= 3 
          ? 'AI 服务响应超时，请检查网络连接后重试'
          : 'AI 服务响应较慢，正在重试...';
      }
      if (error.isQualityIssue) {
        return 'AI 生成的内容质量异常，正在重新生成...';
      }
      return error.message;
    }

    // 网络错误
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return '无法连接到 AI 服务，请检查网络设置';
    }

    // API 错误
    if (error.status === 401) {
      return 'AI 服务认证失败，请检查 API 密钥配置';
    }
    if (error.status === 429) {
      return 'AI 服务请求过于频繁，请稍后再试';
    }
    if (error.status === 500 || error.status === 503) {
      return 'AI 服务暂时不可用，请稍后再试';
    }

    return `AI 服务调用失败：${error.message || '未知错误'}`;
  }

  /**
   * 调用单个 AI 服务商（带重试）
   */
  private async callProviderWithRetry(
    provider: any,
    prompt: string,
    options: AIOptions
  ): Promise<AIResponse> {
    const maxRetries = options.maxRetries ?? 3;
    const timeout = options.timeout ?? 30000; // 默认 30 秒
    let lastError: any = null;

    for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
      const startTime = Date.now();

      try {
        // 如果是重试，先等待（指数退避）
        if (retryCount > 0) {
          console.log(`重试第 ${retryCount} 次，使用服务商 ${provider.name}...`);
          await this.exponentialBackoff(retryCount - 1);
        }

        // 创建适配器并调用
        const adapter = this.createAdapter(provider);
        const generatePromise = adapter.generate(prompt, options);
        
        // 添加超时控制
        const result = await this.withTimeout(generatePromise, timeout);
        const responseTime = Date.now() - startTime;

        // 检查响应质量
        const qualityCheck = this.checkResponseQuality(result.text);
        if (!qualityCheck.valid) {
          throw new AIServiceError(
            `响应质量检查失败：${qualityCheck.reason}`,
            { isQualityIssue: true, retryable: true }
          );
        }

        // 记录成功调用
        await this.logAPICall(
          provider.id,
          provider.endpoint,
          LogStatus.SUCCESS,
          result.tokens.request,
          result.tokens.response,
          responseTime
        );

        return result;
      } catch (error: any) {
        const responseTime = Date.now() - startTime;
        lastError = error;

        // 记录失败调用
        await this.logAPICall(
          provider.id,
          provider.endpoint,
          LogStatus.ERROR,
          0,
          0,
          responseTime,
          this.getFriendlyErrorMessage(error, retryCount)
        );

        // 如果是不可重试的错误，直接抛出
        if (error instanceof AIServiceError && !error.retryable) {
          throw error;
        }

        // 如果已达到最大重试次数，抛出错误
        if (retryCount >= maxRetries) {
          const friendlyMessage = this.getFriendlyErrorMessage(error, retryCount);
          throw new AIServiceError(friendlyMessage, { retryable: false });
        }

        // 否则继续重试
        console.warn(
          `AI 服务商 ${provider.name} 调用失败 (尝试 ${retryCount + 1}/${maxRetries + 1}):`,
          this.getFriendlyErrorMessage(error, retryCount)
        );
      }
    }

    // 理论上不会到达这里，但为了类型安全
    throw new AIServiceError(
      this.getFriendlyErrorMessage(lastError, maxRetries),
      { retryable: false }
    );
  }

  /**
   * 调用 AI 服务（带故障转移、重试和限流）
   */
  async callAI(prompt: string, options: AIOptions = {}): Promise<string> {
    // 使用限流器包装 AI 调用
    return this.rateLimiter.execute(async () => {
      const providers = await this.getActiveProviders();

      if (providers.length === 0) {
        throw new AIServiceError('没有可用的 AI 服务商，请联系管理员配置', { retryable: false });
      }

      let lastError: Error | null = null;

      // 尝试每个服务商
      for (const provider of providers) {
        try {
          const result = await this.callProviderWithRetry(provider, prompt, options);
          return result.text;
        } catch (error: any) {
          lastError = error;

          console.warn(`AI 服务商 ${provider.name} 最终失败:`, error.message);

          // 如果是最后一个服务商，抛出错误
          if (provider === providers[providers.length - 1]) {
            throw new AIServiceError(
              `所有 AI 服务商均不可用。${error.message || '请稍后重试'}`,
              { retryable: false }
            );
          }

          // 否则尝试下一个服务商
          console.log(`切换到备用服务商 ${providers[providers.indexOf(provider) + 1]?.name}...`);
          continue;
        }
      }

      // 理论上不会到达这里
      throw new AIServiceError(
        `所有 AI 服务商均不可用。${lastError?.message || '请稍后重试'}`,
        { retryable: false }
      );
    });
  }

  // 获取科目教学指令
  async getSubjectInstruction(subject: string): Promise<string | null> {
    const instruction = await prisma.subjectInstruction.findUnique({
      where: { subject },
    });

    return instruction?.systemPrompt || null;
  }

  // 根据 ID 获取科目教学指令
  async getSubjectInstructionById(id: string): Promise<string | null> {
    const instruction = await prisma.subjectInstruction.findUnique({
      where: { id },
    });

    return instruction?.systemPrompt || null;
  }

  /**
   * 组装 AI 指令
   * 第一级: 管理员配置的科目指令
   * 第二级: 家长的任务配置
   * @param subjectInstructionId 科目指令 ID
   * @param taskConfig 任务配置
   * @returns 组装好的完整 AI 指令
   */
  async assembleAIInstruction(subjectInstructionId: string, taskConfig: any): Promise<string> {
    // 获取科目指令(第一级)
    const systemPrompt = await this.getSubjectInstructionById(subjectInstructionId);
    
    if (!systemPrompt) {
      throw new AIServiceError('科目指令不存在');
    }

    // 第一级: 管理员配置的科目指令
    let instruction = systemPrompt;

    // 第二级: 家长的任务配置
    if (taskConfig.goal) {
      instruction += `\n\n## 任务目标\n${taskConfig.goal}`;
    }

    if (taskConfig.personality) {
      instruction += `\n\n## 学员性格特征\n${taskConfig.personality}`;
    }

    if (taskConfig.learningFoundation) {
      instruction += `\n\n## 学习基础\n${taskConfig.learningFoundation}`;
    }

    if (taskConfig.grade) {
      instruction += `\n\n## 年级\n${taskConfig.grade}`;
    }

    if (taskConfig.subject) {
      instruction += `\n\n## 科目\n${taskConfig.subject}`;
    }

    if (taskConfig.difficulty) {
      instruction += `\n\n## 难度等级\n${taskConfig.difficulty}/5`;
    }

    return instruction;
  }

  // 调用 AI 服务（带科目指令）
  async callAIWithSubject(
    subject: string,
    prompt: string,
    options: AIOptions = {}
  ): Promise<string> {
    const systemPrompt = await this.getSubjectInstruction(subject);
    
    return this.callAI(prompt, {
      timeout: 30000, // 30 秒超时
      maxRetries: 3, // 最多重试 3 次
      ...options,
      systemPrompt: systemPrompt || options.systemPrompt,
    });
  }

  /**
   * 调用 AI 服务（使用任务配置）
   * @param taskConfig 任务配置(包含 aiInstruction)
   * @param prompt 用户提示
   * @param options AI 选项
   * @returns AI 响应文本
   */
  async callAIWithTaskConfig(
    taskConfig: any,
    prompt: string,
    options: AIOptions = {}
  ): Promise<string> {
    // 使用任务配置中预先组装好的 AI 指令
    const systemPrompt = taskConfig.aiInstruction || options.systemPrompt;
    
    return this.callAI(prompt, {
      timeout: 30000, // 30 秒超时
      maxRetries: 3, // 最多重试 3 次
      ...options,
      systemPrompt,
    });
  }

  /**
   * 获取限流器状态
   */
  getRateLimiterStatus() {
    return this.rateLimiter.getStatus();
  }

  /**
   * 清空请求队列
   */
  clearRequestQueue() {
    this.rateLimiter.clearQueue();
  }
}

// 导出单例实例
export const aiServiceManager = AIServiceManager.getInstance();
