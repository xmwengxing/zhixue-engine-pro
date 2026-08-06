import { PrismaClient, OcrMethod, ProviderStatus } from '@prisma/client';
import { callVisionApi, getTestImage } from './ocrVisionClient';

const prisma = new PrismaClient();

export interface OcrProviderInput {
  name: string;
  method: OcrMethod;
  endpoint: string;
  apiKey?: string;
  model?: string;
  extra?: Record<string, unknown>;
  isDefault?: boolean;
  enableForRecognition?: boolean;
  status?: ProviderStatus;
}

/** 云端识别方式（可勾选用于学员/家长识别） */
const CLOUD_METHODS: OcrMethod[] = ['CUSTOM_API', 'BAIDU_OCR', 'PADDLE_OCR_VL'];

function maskApiKey(key?: string | null): string {
  if (!key) return '';
  if (key.length > 12) return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
  if (key.length > 4) return `${key.substring(0, 4)}...`;
  return '***';
}

/** 返回给前端前脱敏（apiKey 与 extra.secretKey，防止明文泄露） */
function sanitizeProvider(p: any) {
  const extra = p.extra && typeof p.extra === 'object' ? { ...p.extra } : p.extra;
  if (extra && typeof extra.secretKey === 'string' && extra.secretKey) {
    extra.secretKey = maskApiKey(extra.secretKey);
  }
  return { ...p, apiKey: maskApiKey(p.apiKey), extra };
}

/**
 * 管理端 OCR / 视觉识别服务商配置服务。
 * 三种方式：LOCAL_SERVICE（Unlimited-OCR 服务）/ LOCAL_VISION（Ollama 本地视觉）/ CUSTOM_API（厂商视觉 API）。
 */
export class AdminOcrService {
  async getAllProviders() {
    const list = await prisma.ocrProvider.findMany({ orderBy: { createdAt: 'desc' } });
    return list.map((p) => sanitizeProvider(p));
  }

  async getProviderById(id: string) {
    const p = await prisma.ocrProvider.findUnique({ where: { id } });
    if (!p) return null;
    return sanitizeProvider(p);
  }

  /** 原始凭据（仅服务端内部使用：测试连通性等），不对外返回 */
  async getRawProviderById(id: string) {
    return prisma.ocrProvider.findUnique({ where: { id } });
  }

  async createProvider(data: OcrProviderInput) {
    if (data.enableForRecognition && !CLOUD_METHODS.includes(data.method)) {
      throw new Error('仅云端识别方式（自定义厂商视觉 / 百度智能云 OCR / 飞桨 PaddleOCR-VL）可勾选用于学员/家长识别');
    }
    if (data.method === 'BAIDU_OCR' && (!data.apiKey || !data.extra?.secretKey)) {
      throw new Error('百度智能云 OCR 需要填写 API Key 与 Secret Key（百度智能云控制台创建应用获取）');
    }
    if (data.method === 'PADDLE_OCR_VL' && !data.apiKey) {
      throw new Error('飞桨 PaddleOCR-VL 需要填写 Token');
    }
    if (data.isDefault) {
      await prisma.ocrProvider.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    const created = await prisma.ocrProvider.create({
      data: {
        name: data.name,
        method: data.method,
        endpoint: data.endpoint,
        apiKey: data.apiKey || null,
        model: data.model || null,
        extra: (data.extra as any) || null,
        isDefault: data.isDefault || false,
        enableForRecognition: data.enableForRecognition || false,
        status: data.status || ProviderStatus.ACTIVE,
      },
    });
    return sanitizeProvider(created);
  }

  async updateProvider(id: string, data: Partial<OcrProviderInput>) {
    if (data.enableForRecognition && data.method && !CLOUD_METHODS.includes(data.method)) {
      throw new Error('仅云端识别方式（自定义厂商视觉 / 百度智能云 OCR / 飞桨 PaddleOCR-VL）可勾选用于学员/家长识别');
    }
    if (data.method === 'BAIDU_OCR' && !data.apiKey && !data.extra?.secretKey) {
      // 编辑场景可能沿用原密钥（apiKey 未改动不回传），secretKey 同理
      const cur = await prisma.ocrProvider.findUnique({ where: { id } });
      if (!cur || (!cur.apiKey && !(cur.extra as any)?.secretKey)) {
        throw new Error('百度智能云 OCR 需要填写 API Key 与 Secret Key');
      }
    }
    const updateData: any = { ...data };
    if (data.extra !== undefined) updateData.extra = data.extra as any;
    if (data.method === 'BAIDU_OCR') {
      // 编辑时 secretKey 若未改动则不覆盖
      const cur = await prisma.ocrProvider.findUnique({ where: { id } });
      if (cur) {
        const mergedExtra = { ...((cur.extra as any) || {}), ...(data.extra || {}) };
        updateData.extra = mergedExtra;
      }
    }
    if (data.isDefault) {
      await prisma.ocrProvider.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    const updated = await prisma.ocrProvider.update({ where: { id }, data: updateData });
    return sanitizeProvider(updated);
  }

  async deleteProvider(id: string) {
    return prisma.ocrProvider.delete({ where: { id } });
  }

  /** 管理端导入默认使用的 provider（isDefault + ACTIVE） */
  async getDefaultProvider() {
    return prisma.ocrProvider.findFirst({
      where: { isDefault: true, status: ProviderStatus.ACTIVE },
    });
  }

  /** 学员/家长识别通道：云端方式（CUSTOM_API / BAIDU_OCR / PADDLE_OCR_VL）+ ACTIVE */
  async getRecognitionProvider() {
    return prisma.ocrProvider.findFirst({
      where: { enableForRecognition: true, method: { in: CLOUD_METHODS }, status: ProviderStatus.ACTIVE },
    });
  }

  /** 导入管线解析：优先指定 id，否则默认；无则返回 null（由调用方按 env 回退或报错） */
  async resolveForImport(ocrProviderId?: string) {
    if (ocrProviderId) {
      const p = await prisma.ocrProvider.findUnique({ where: { id: ocrProviderId } });
      if (p && p.status === ProviderStatus.ACTIVE) return p;
    }
    return this.getDefaultProvider();
  }

  /** 连通性测试：视觉类送测试图验证返回文本；LOCAL_SERVICE 查 /health */
  async testConnection(provider: {
    method: OcrMethod;
    endpoint: string;
    apiKey?: string;
    model?: string;
    extra?: any;
  }): Promise<{ ok: boolean; latency: number; error?: string; sample?: string }> {
    const start = Date.now();
    try {
      if (provider.method === 'LOCAL_SERVICE') {
        const url = provider.endpoint.replace(/\/$/, '') + '/health';
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error(`服务返回 ${res.status}`);
        return { ok: true, latency: Date.now() - start };
      }
      if (provider.method === 'BAIDU_OCR') {
        // 百度：仅验证凭据有效（换 token 成功即视为连通），不消耗文档解析额度
        const { getBaiduAccessToken } = await import('./ocrVisionClient');
        await getBaiduAccessToken(provider.apiKey || '', provider.extra?.secretKey || '');
        return { ok: true, latency: Date.now() - start, sample: '凭据有效，access_token 获取成功' };
      }
      if (provider.method === 'PADDLE_OCR_VL') {
        // 飞桨：仅验证鉴权（提交 job 成功即视为连通），不等待识别完成
        const { testPaddleAuth } = await import('./ocrVisionClient');
        await testPaddleAuth(provider.apiKey || '');
        return { ok: true, latency: Date.now() - start, sample: 'Token 有效，任务提交成功' };
      }
      const { buffer, mime } = getTestImage();
      const text = await callVisionApi(
        provider as VisionProviderLike,
        buffer,
        mime,
        '请简单描述这张图片的内容。',
        60000
      );
      return { ok: true, latency: Date.now() - start, sample: text.slice(0, 80) };
    } catch (e: any) {
      return { ok: false, latency: Date.now() - start, error: e.message || String(e) };
    }
  }
}

interface VisionProviderLike {
  method: OcrMethod;
  endpoint: string;
  apiKey?: string;
  model?: string;
}

export const adminOcrService = new AdminOcrService();
