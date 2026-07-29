/**
 * P6 配置脚本（幂等）：写入一个 OpenAI 兼容协议的测试大模型服务商。
 * 仅用于本地回归验证，密钥通过环境变量传入，不落盘到仓库。
 *
 * 用法（backend 目录下）：
 *   TEST_AI_API_KEY=sk-xxx [TEST_AI_ENDPOINT=...] [TEST_AI_MODEL=...] \
 *     npx tsx scripts/configure-test-ai-provider.ts
 */
import { PrismaClient, AIProviderType, ProviderStatus } from '@prisma/client';

const prisma = new PrismaClient();

const apiKey = process.env.TEST_AI_API_KEY;
if (!apiKey) {
  console.error('[cfg] 缺少环境变量 TEST_AI_API_KEY（测试大模型的 API Key），已退出。');
  process.exit(1);
}

const PROVIDER_NAME = 'Sensenova-Test (P6)';
const CFG = {
  type: AIProviderType.OPENAI,
  apiKey,
  endpoint: process.env.TEST_AI_ENDPOINT || 'https://token.sensenova.cn/v1',
  model: process.env.TEST_AI_MODEL || 'sensenova-6.7-flash-lite',
  priority: 0,
  status: ProviderStatus.ACTIVE,
};

async function main() {
  const existing = await prisma.aIProvider.findFirst({ where: { name: PROVIDER_NAME } });
  if (existing) {
    const updated = await prisma.aIProvider.update({
      where: { id: existing.id },
      data: CFG,
      select: { id: true, name: true, type: true, model: true, status: true, endpoint: true },
    });
    console.log('[cfg] 已更新测试服务商:', JSON.stringify(updated));
  } else {
    const created = await prisma.aIProvider.create({
      data: { name: PROVIDER_NAME, ...CFG },
      select: { id: true, name: true, type: true, model: true, status: true, endpoint: true },
    });
    console.log('[cfg] 已新建测试服务商:', JSON.stringify(created));
  }
  const total = await prisma.aIProvider.count({ where: { status: ProviderStatus.ACTIVE } });
  console.log(`[cfg] 当前 ACTIVE 服务商总数=${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('[cfg] 失败:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
