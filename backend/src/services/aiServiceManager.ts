import { PrismaClient, AIProviderType, LogStatus } from '@prisma/client';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { TokenBucketRateLimiter } from '../utils/rateLimiter';

const prisma = new PrismaClient();

// ============ 类型定义 ============

// AI 服务调用选项
interface AIOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  timeout?: number; // 单次调用超时时间（毫秒），默认按端点自适应
  maxRetries?: number; // 最大重试次数，默认 3
  // 单个服务商上的总时间预算（毫秒）。默认 max(timeout*2, 45000)。
  maxTotalMs?: number;
  // 指定使用某个具名 provider（按 AIProvider.name 精确匹配），不走故障转移。
  providerName?: string;
  // —— 新增：模型级能力协商 ——
  stream?: boolean; // 是否流式返回（仅 manager.streamAI 使用）
  contextWindow?: number; // 模型上下文长度，用于约束 max_tokens 与注入 Ollama num_ctx
  supportsReasoning?: boolean; // 推理模型（输出可能落在 reasoning 字段）
  signal?: AbortSignal; // 用于真正取消底层请求（超时/用户取消）
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

// ============ 工具函数 ============

// 本地端点嗅探（localhost / 127.0.0.1 / 0.0.0.0 / ollama）
function isLocalEndpoint(url?: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|ollama/i.test(url || '');
}

// 把 max_tokens 限制在上下文窗口内（预留 1024 token 给输出与安全边界）
function capToContext(maxTokens: number, contextWindow?: number): number {
  if (contextWindow && maxTokens > contextWindow - 1024) {
    return Math.max(256, contextWindow - 1024);
  }
  return maxTokens;
}

// ============ 适配器 ============

// OpenAI 兼容适配器（OpenAI / DeepSeek / Qwen / 智谱 / 豆包 / 文心 / Gemini / 自定义）
class OpenAIAdapter {
  private client: OpenAI;
  private model: string;
  private reasoningEffort?: string; // 推理模型可设 'none' 关思维链直出 content（如 sensenova-6.7-flash-lite）

  constructor(apiKey: string, endpoint: string, model: string, reasoningEffort?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: endpoint || undefined,
    });
    this.model = model;
    this.reasoningEffort = reasoningEffort;
  }

  async generate(prompt: string, options: AIOptions): Promise<AIResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const baseMax = options.maxTokens || 2000;
    const maxTokens = capToContext(baseMax, options.contextWindow);

    // 推理模型在 max_tokens 偏小时可能把预算耗在思维链上、content 为空。
    // 策略：首调用用 maxTokens；若 content 为空，至多再放大到 4096 重试一次。
    const budgets = [maxTokens];
    if (maxTokens < 4096 && (!options.contextWindow || options.contextWindow > 4096)) {
      budgets.push(4096);
    }

    let response: OpenAI.Chat.ChatCompletion;
    let text = '';
    for (const mt of budgets) {
      response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages,
          max_tokens: mt,
          temperature: options.temperature || 0.7,
          // 推理模型关闭思维链（extra.reasoningEffort='none' 时直出 content，速度与稳定性最佳）
          ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort as any } : {}),
        },
        { signal: options.signal }
      );
      const rawMsg = response.choices[0]?.message as any;
      text =
        rawMsg?.content?.trim() ||
        rawMsg?.reasoning_content?.trim() ||
        rawMsg?.reasoning?.trim() ||
        '';
      const contentHasAnswer = !!rawMsg?.content?.trim() && rawMsg.content.trim().length > 5;
      if (contentHasAnswer) break;
    }

    const requestTokens = response!.usage?.prompt_tokens || 0;
    const responseTokens = response!.usage?.completion_tokens || 0;

    return { text, tokens: { request: requestTokens, response: responseTokens } };
  }

  async *generateStream(prompt: string, options: AIOptions): AsyncGenerator<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const maxTokens = capToContext(options.maxTokens || 2000, options.contextWindow);

    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages,
        max_tokens: maxTokens,
        temperature: options.temperature || 0.7,
        stream: true,
      },
      { signal: options.signal }
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}

// Ollama 原生适配器（本地 Ollama 服务，走 /api/chat 以支持 think:false）
class OllamaNativeAdapter {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(apiKey: string, endpoint: string, model: string) {
    this.apiKey = apiKey;
    this.baseURL = endpoint.replace(/\/v1\/?$/, '').replace(/\/$/, '');
    this.model = model;
  }

  private buildBody(prompt: string, options: AIOptions, stream: boolean) {
    const body: any = {
      model: this.model,
      messages: [] as any[],
      think: false, // 关闭思维链，直接输出 content
      stream,
    };
    if (options.systemPrompt) {
      body.messages.push({ role: 'system', content: options.systemPrompt });
    }
    body.messages.push({ role: 'user', content: prompt });

    const opts: any = {};
    if (options.temperature != null) opts.temperature = options.temperature;
    if (options.maxTokens != null) opts.num_predict = options.maxTokens;
    if (options.contextWindow != null) opts.num_ctx = options.contextWindow;
    if (Object.keys(opts).length) body.options = opts;
    return body;
  }

  private headers() {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey && this.apiKey !== 'ollama') headers['Authorization'] = `Bearer ${this.apiKey}`;
    return headers;
  }

  async generate(prompt: string, options: AIOptions): Promise<AIResponse> {
    const res = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(prompt, options, false)),
      signal: options.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new AIServiceError(`Ollama 调用失败 ${res.status}: ${txt.slice(0, 200)}`, { retryable: true });
    }
    const data: any = await res.json();
    const text = data?.message?.content?.trim() || '';

    // 部分 Qwen3 系列不认 think:false，输出全进 thinking，content 为空串。
    if (!text) {
      const thinking = String(data?.message?.thinking || data?.message?.reasoning || '').trim();
      const doneReason = data?.done_reason || '';
      if (thinking) {
        throw new AIServiceError(
          `模型输出为空：思考未结束即被截断（done_reason=${doneReason}，num_predict=${options.maxTokens ?? '默认'}）。` +
            `该模型未遵守 think:false，请调高 maxTokens 或更换非推理模型。`,
          { retryable: true }
        );
      }
      throw new AIServiceError(`模型返回空内容（done_reason=${doneReason}）`, { retryable: true });
    }

    const usage = data?.prompt_eval_count || data?.eval_count
      ? { request: data.prompt_eval_count || 0, response: data.eval_count || 0 }
      : { request: 0, response: 0 };
    return { text, tokens: usage };
  }

  async *generateStream(prompt: string, options: AIOptions): AsyncGenerator<string> {
    const res = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(prompt, options, true)),
      signal: options.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new AIServiceError(`Ollama 流式调用失败 ${res.status}: ${txt.slice(0, 200)}`, { retryable: true });
    }
    const reader = res.body?.getReader();
    if (!reader) throw new AIServiceError('Ollama 流式响应不可读', { retryable: false });
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const data = JSON.parse(payload);
          const delta = data?.message?.content;
          if (delta) yield delta;
        } catch {
          /* 忽略不完整行 */
        }
      }
    }
  }
}

// Claude 适配器（Anthropic 官方 SDK）
class ClaudeAdapter {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, endpoint: string, model: string) {
    this.client = new Anthropic({ apiKey, baseURL: endpoint || undefined });
    this.model = model;
  }

  async generate(prompt: string, options: AIOptions): Promise<AIResponse> {
    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: capToContext(options.maxTokens || 2000, options.contextWindow),
        temperature: options.temperature || 0.7,
        system: options.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: options.signal as any }
    );

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    return {
      text,
      tokens: { request: response.usage.input_tokens, response: response.usage.output_tokens },
    };
  }

  async *generateStream(prompt: string, options: AIOptions): AsyncGenerator<string> {
    const stream = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: capToContext(options.maxTokens || 2000, options.contextWindow),
        temperature: options.temperature || 0.7,
        system: options.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      },
      { signal: options.signal as any }
    );
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}

// ============ AI 服务管理器 ============

export class AIServiceManager {
  private static instance: AIServiceManager;
  private rateLimiter: TokenBucketRateLimiter;

  // 适配器实例缓存（按 provider.id，复用 HTTP client 连接）
  private adapterCache = new Map<string, { adapter: any; updatedAt: number }>();
  // provider 列表缓存（避免每次调用都打 DB）
  private providerCache: { data: any[]; expiresAt: number } | null = null;
  private readonly PROVIDER_CACHE_TTL = 30_000;
  // 健康度（熔断）：连续失败计数 + 冷却截止时间
  private health = new Map<string, { failures: number; cooldownUntil: number }>();
  private readonly COOLDOWN_MS = 60_000;
  private readonly FAILURE_THRESHOLD = 3;

  private constructor() {
    this.rateLimiter = new TokenBucketRateLimiter({
      capacity: 20,
      refillRate: 10,
      maxQueueSize: 50,
    });
  }

  static getInstance(): AIServiceManager {
    if (!AIServiceManager.instance) {
      AIServiceManager.instance = new AIServiceManager();
    }
    return AIServiceManager.instance;
  }

  // 配置变更后清空缓存（由管理端 CRUD 调用）
  clearCaches() {
    this.adapterCache.clear();
    this.providerCache = null;
  }

  // 获取活跃服务商（带进程内缓存 + TTL）
  private async getActiveProviders() {
    const now = Date.now();
    if (this.providerCache && this.providerCache.expiresAt > now) {
      return this.providerCache.data;
    }
    const data = await prisma.aIProvider.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { priority: 'asc' },
    });
    this.providerCache = { data, expiresAt: now + this.PROVIDER_CACHE_TTL };
    return data;
  }

  // 显式按 type 分派；并对历史配置（endpoint 为 localhost 的 Ollama）做兼容回退
  private createAdapter(provider: any): any {
    // 显式 OLLAMA 类型 → 原生适配器（支持 think:false 关闭思维链）
    if (provider.type === AIProviderType.OLLAMA) {
      return new OllamaNativeAdapter(provider.apiKey, provider.endpoint, provider.model);
    }
    // 兼容历史配置：endpoint 显式为本地 Ollama 时仍走原生适配器
    if (isLocalEndpoint(provider.endpoint)) {
      return new OllamaNativeAdapter(provider.apiKey, provider.endpoint, provider.model);
    }
    if (provider.type === AIProviderType.CLAUDE) {
      return new ClaudeAdapter(provider.apiKey, provider.endpoint, provider.model);
    }
    // 其余（OPENAI / DEEPSEEK / QWEN / ZHIPU / DOUBAO / WENXIN / GEMINI / CUSTOM …）走 OpenAI 兼容
    if (provider.type !== AIProviderType.OPENAI && !provider.endpoint) {
      throw new AIServiceError(
        `AI 服务商「${provider.name}」类型为 ${provider.type} 但未配置 endpoint，无法调用`,
        { retryable: false }
      );
    }
    return new OpenAIAdapter(provider.apiKey, provider.endpoint, provider.model, provider.extra?.reasoningEffort);
  }

  // 取缓存的适配器（provider 配置变更后由 clearCaches 失效）
  private getCachedOrBuildAdapter(provider: any): any {
    const cached = this.adapterCache.get(provider.id);
    const updatedAt = provider.updatedAt ? new Date(provider.updatedAt).getTime() : 0;
    if (cached && cached.updatedAt === updatedAt) return cached.adapter;
    const adapter = this.createAdapter(provider);
    this.adapterCache.set(provider.id, { adapter, updatedAt });
    return adapter;
  }

  private isProviderLocal(provider: any): boolean {
    return provider.type === AIProviderType.OLLAMA || isLocalEndpoint(provider.endpoint) || !!provider.isLocal;
  }

  // 排序：优先级升序；同优先级下联网端点优先于本地（满足"生产优先联网"）
  private buildOrder(providers: any[]): any[] {
    return [...providers].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const la = this.isProviderLocal(a) ? 1 : 0;
      const lb = this.isProviderLocal(b) ? 1 : 0;
      return la - lb;
    });
  }

  private isInCooldown(id: string): boolean {
    const h = this.health.get(id);
    return !!h && h.cooldownUntil > Date.now();
  }
  private recordSuccess(id: string) {
    this.health.delete(id);
  }
  private recordFailure(id: string) {
    const h = this.health.get(id) || { failures: 0, cooldownUntil: 0 };
    h.failures += 1;
    if (h.failures >= this.FAILURE_THRESHOLD) {
      h.cooldownUntil = Date.now() + this.COOLDOWN_MS;
    }
    this.health.set(id, h);
  }

  // 记录 API 调用日志（fire-and-forget，不阻塞关键路径）
  private logAPICall(
    providerId: string,
    endpoint: string,
    status: LogStatus,
    requestTokens: number,
    responseTokens: number,
    responseTime: number,
    errorMessage?: string
  ) {
    void prisma.aPILog
      .create({
        data: { providerId, endpoint, requestTokens, responseTokens, responseTime, status, errorMessage },
      })
      .catch((e) => console.error('记录 API 日志失败:', e));
  }

  private async exponentialBackoff(retryCount: number): Promise<void> {
    const delayMs = Math.min(1000 * Math.pow(2, retryCount), 8000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private checkResponseQuality(text: string): { valid: boolean; reason?: string } {
    if (!text || text.trim().length === 0) return { valid: false, reason: '响应内容为空' };
    if (text.trim().length < 10) return { valid: false, reason: '响应内容过短' };

    const errorPatterns = [/error/i, /failed/i, /无法/, /失败/, /错误/, /抱歉/, /sorry/i];
    const looksStructured = /[{[]/.test(text) && /[}\]]/.test(text);
    if (!looksStructured && text.length < 200) {
      const hasErrorPattern = errorPatterns.some((p) => p.test(text.substring(0, 100)));
      if (hasErrorPattern) return { valid: false, reason: '响应可能包含错误信息' };
    }
    return { valid: true };
  }

  private getFriendlyErrorMessage(error: any, retryCount: number): string {
    if (error instanceof AIServiceError) {
      if (error.isTimeout) {
        return retryCount >= 3 ? 'AI 服务响应超时，请检查网络连接后重试' : 'AI 服务响应较慢，正在重试...';
      }
      if (error.isQualityIssue) return 'AI 生成的内容质量异常，正在重新生成...';
      return error.message;
    }
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') return '无法连接到 AI 服务，请检查网络设置';
    if (error?.status === 401) return 'AI 服务认证失败，请检查 API 密钥配置';
    if (error?.status === 429) return 'AI 服务请求过于频繁，请稍后再试';
    if (error?.status === 500 || error?.status === 503) return 'AI 服务暂时不可用，请稍后再试';
    if (error?.name === 'AbortError') return 'AI 服务调用超时，请稍后重试';
    return `AI 服务调用失败：${error?.message || '未知错误'}`;
  }

  // 调用单个服务商（带重试 + 真正的请求取消）
  private async callProviderWithRetry(
    provider: any,
    prompt: string,
    options: AIOptions
  ): Promise<AIResponse> {
    const maxRetries = options.maxRetries ?? 3;
    const isLocal = this.isProviderLocal(provider);
    const timeout = options.timeout ?? (isLocal ? 120000 : 30000);
    const budgetMs = options.maxTotalMs ?? Math.max(timeout * 2, 45000);
    const overallStart = Date.now();
    let lastError: any = null;

    for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
      if (retryCount > 0) {
        console.log(`重试第 ${retryCount} 次，使用服务商 ${provider.name}...`);
        await this.exponentialBackoff(retryCount - 1);
      }
      const startTime = Date.now();

      // 每次尝试用独立的 AbortController，超时即真正取消底层请求（释放本地 GPU）
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeout);
      const attemptOptions: AIOptions = { ...options, signal: ac.signal };

      try {
        const adapter = this.getCachedOrBuildAdapter(provider);
        const result = await adapter.generate(prompt, attemptOptions);
        clearTimeout(timer);
        const responseTime = Date.now() - startTime;

        const qualityCheck = this.checkResponseQuality(result.text);
        if (!qualityCheck.valid) {
          throw new AIServiceError(`响应质量检查失败：${qualityCheck.reason}`, {
            isQualityIssue: true,
            retryable: true,
          });
        }

        this.logAPICall(provider.id, provider.endpoint, LogStatus.SUCCESS, result.tokens.request, result.tokens.response, responseTime);
        this.recordSuccess(provider.id);
        return result;
      } catch (error: any) {
        clearTimeout(timer);
        const responseTime = Date.now() - startTime;
        lastError = error;
        this.recordFailure(provider.id);

        this.logAPICall(provider.id, provider.endpoint, LogStatus.ERROR, 0, 0, responseTime, this.getFriendlyErrorMessage(error, retryCount));

        if (error instanceof AIServiceError && !error.retryable) throw error;
        if (retryCount >= maxRetries) {
          throw new AIServiceError(this.getFriendlyErrorMessage(error, retryCount), { retryable: false });
        }
        if (Date.now() - overallStart >= budgetMs) {
          console.warn(`AI 服务商 ${provider.name} 已耗尽时间预算 ${budgetMs}ms，停止重试`);
          throw new AIServiceError(this.getFriendlyErrorMessage(error, retryCount), { retryable: false });
        }
        console.warn(
          `AI 服务商 ${provider.name} 调用失败 (尝试 ${retryCount + 1}/${maxRetries + 1}):`,
          this.getFriendlyErrorMessage(error, retryCount)
        );
      }
    }
    throw new AIServiceError(this.getFriendlyErrorMessage(lastError, maxRetries), { retryable: false });
  }

  // 调用 AI 服务（多厂商优先级轮询 + 健康熔断 + 限流）
  async callAI(prompt: string, options: AIOptions = {}): Promise<string> {
    return this.rateLimiter.execute(async () => {
      // 具名路由：精确打到专用模型，不走轮询
      if (options.providerName) {
        const provider = await prisma.aIProvider.findFirst({
          where: { name: options.providerName, status: 'ACTIVE' },
        });
        if (!provider) {
          throw new AIServiceError(`找不到指定的 AI 服务商: ${options.providerName}`, { retryable: false });
        }
        const result = await this.callProviderWithRetry(provider, prompt, options);
        return result.text;
      }

      const providers = this.buildOrder(await this.getActiveProviders());
      if (providers.length === 0) {
        throw new AIServiceError('没有可用的 AI 服务商，请联系管理员配置', { retryable: false });
      }

      let lastError: Error | null = null;
      for (const provider of providers) {
        // 熔断：冷却期内跳过，直接尝试下一个厂商
        if (this.isInCooldown(provider.id)) {
          console.warn(`AI 服务商 ${provider.name} 处于冷却期，跳过`);
          continue;
        }
        try {
          const result = await this.callProviderWithRetry(provider, prompt, options);
          return result.text;
        } catch (error: any) {
          lastError = error;
          console.warn(`AI 服务商 ${provider.name} 最终失败:`, error.message);
          // 继续尝试下一个厂商（故障转移）
        }
      }

      throw new AIServiceError(
        `所有 AI 服务商均不可用。${lastError?.message || '请稍后重试'}`,
        { retryable: false }
      );
    });
  }

  // 流式调用（返回文本增量生成器；优先健康厂商，失败则故障转移到下一个）
  async *streamAI(prompt: string, options: AIOptions = {}): AsyncGenerator<string> {
    const providers = this.buildOrder(await this.getActiveProviders());
    if (providers.length === 0) {
      throw new AIServiceError('没有可用的 AI 服务商，请联系管理员配置', { retryable: false });
    }
    const tried = new Set<string>();
    let lastError: any = null;
    for (const provider of providers) {
      if (tried.has(provider.id) || this.isInCooldown(provider.id)) continue;
      tried.add(provider.id);
      try {
        const adapter = this.getCachedOrBuildAdapter(provider);
        if (typeof adapter.generateStream !== 'function') {
          throw new AIServiceError(`服务商 ${provider.name} 不支持流式输出`, { retryable: false });
        }
        let firstChunk = true;
        for await (const delta of adapter.generateStream(prompt, options)) {
          if (firstChunk) {
            this.recordSuccess(provider.id);
            firstChunk = false;
          }
          yield delta;
        }
        return;
      } catch (error: any) {
        this.recordFailure(provider.id);
        lastError = error;
        if (tried.size >= providers.length) break;
      }
    }
    throw new AIServiceError(`所有 AI 服务商流式输出均失败。${lastError?.message || ''}`, { retryable: false });
  }

  // 获取科目教学指令
  async getSubjectInstruction(subject: string): Promise<string | null> {
    const instruction = await prisma.subjectInstruction.findUnique({ where: { subject } });
    return instruction?.systemPrompt || null;
  }

  async getSubjectInstructionById(id: string): Promise<string | null> {
    const instruction = await prisma.subjectInstruction.findUnique({ where: { id } });
    return instruction?.systemPrompt || null;
  }

  async assembleAIInstruction(subjectInstructionId: string, taskConfig: any): Promise<string> {
    const systemPrompt = await this.getSubjectInstructionById(subjectInstructionId);
    if (!systemPrompt) throw new AIServiceError('科目指令不存在');

    let instruction = systemPrompt;
    if (taskConfig.goal) instruction += `\n\n## 任务目标\n${taskConfig.goal}`;
    if (taskConfig.personality) instruction += `\n\n## 学员性格特征\n${taskConfig.personality}`;
    if (taskConfig.learningFoundation) instruction += `\n\n## 学习基础\n${taskConfig.learningFoundation}`;
    if (taskConfig.grade) instruction += `\n\n## 年级\n${taskConfig.grade}`;
    if (taskConfig.subject) instruction += `\n\n## 科目\n${taskConfig.subject}`;
    if (taskConfig.difficulty) instruction += `\n\n## 难度等级\n${taskConfig.difficulty}/5`;
    return instruction;
  }

  async callAIWithSubject(subject: string, prompt: string, options: AIOptions = {}): Promise<string> {
    const systemPrompt = await this.getSubjectInstruction(subject);
    return this.callAI(prompt, {
      timeout: 30000,
      maxRetries: 3,
      ...options,
      systemPrompt: systemPrompt || options.systemPrompt,
    });
  }

  async callAIWithTaskConfig(taskConfig: any, prompt: string, options: AIOptions = {}): Promise<string> {
    const systemPrompt = taskConfig.aiInstruction || options.systemPrompt;
    return this.callAI(prompt, {
      timeout: 30000,
      maxRetries: 3,
      ...options,
      systemPrompt,
    });
  }

  getRateLimiterStatus() {
    return this.rateLimiter.getStatus();
  }

  clearRequestQueue() {
    this.rateLimiter.clearQueue();
  }
}

// 导出单例实例
export const aiServiceManager = AIServiceManager.getInstance();

// 供管理端在 provider 配置变更后清空缓存
export function clearAICaches() {
  aiServiceManager.clearCaches();
}
