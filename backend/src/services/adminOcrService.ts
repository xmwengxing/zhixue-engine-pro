import { PrismaClient, OcrMethod, ProviderStatus } from '@prisma/client';
import { callVisionApi, getTestImage } from './ocrVisionClient';

const prisma = new PrismaClient();

export interface OcrProviderInput {
  name: string;
  method: OcrMethod;
  endpoint: string;
  apiKey?: string;
  model?: string;
  isDefault?: boolean;
  enableForRecognition?: boolean;
  status?: ProviderStatus;
}

function maskApiKey(key?: string | null): string {
  if (!key) return '';
  if (key.length > 12) return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
  if (key.length > 4) return `${key.substring(0, 4)}...`;
  return '***';
}

/**
 * 管理端 OCR / 视觉识别服务商配置服务。
 * 三种方式：LOCAL_SERVICE（Unlimited-OCR 服务）/ LOCAL_VISION（Ollama 本地视觉）/ CUSTOM_API（厂商视觉 API）。
 */
export class AdminOcrService {
  async getAllProviders() {
    const list = await prisma.ocrProvider.findMany({ orderBy: { createdAt: 'desc' } });
    return list.map((p) => ({ ...p, apiKey: maskApiKey(p.apiKey) }));
  }

  async getProviderById(id: string) {
    const p = await prisma.ocrProvider.findUnique({ where: { id } });
    if (!p) return null;
    return { ...p, apiKey: maskApiKey(p.apiKey) };
  }

  async createProvider(data: OcrProviderInput) {
    if (data.enableForRecognition && data.method !== 'CUSTOM_API') {
      throw new Error('仅「自定义厂商视觉模型」(CUSTOM_API) 可勾选用于学员/家长识别（需非本地）');
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
        isDefault: data.isDefault || false,
        enableForRecognition: data.enableForRecognition || false,
        status: data.status || ProviderStatus.ACTIVE,
      },
    });
    return { ...created, apiKey: maskApiKey(created.apiKey) };
  }

  async updateProvider(id: string, data: Partial<OcrProviderInput>) {
    if (data.enableForRecognition && data.method && data.method !== 'CUSTOM_API') {
      throw new Error('仅「自定义厂商视觉模型」(CUSTOM_API) 可勾选用于学员/家长识别（需非本地）');
    }
    if (data.isDefault) {
      await prisma.ocrProvider.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    const updated = await prisma.ocrProvider.update({ where: { id }, data });
    return { ...updated, apiKey: maskApiKey(updated.apiKey) };
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

  /** 学员/家长识别通道：enableForRecognition=true 且 CUSTOM_API + ACTIVE */
  async getRecognitionProvider() {
    return prisma.ocrProvider.findFirst({
      where: { enableForRecognition: true, method: 'CUSTOM_API', status: ProviderStatus.ACTIVE },
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
