/**
 * 检查当前配置的 AI 服务商
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProviders() {
  try {
    const providers = await prisma.aIProvider.findMany({
      orderBy: { priority: 'asc' },
    });

    console.log('📋 当前配置的 AI 服务商:\n');
    
    if (providers.length === 0) {
      console.log('⚠️  没有配置任何 AI 服务商');
    } else {
      providers.forEach((provider, index) => {
        console.log(`${index + 1}. ${provider.name}`);
        console.log(`   类型: ${provider.type}`);
        console.log(`   端点: ${provider.endpoint}`);
        console.log(`   模型: ${provider.model}`);
        console.log(`   状态: ${provider.status}`);
        console.log(`   优先级: ${provider.priority}`);
        console.log(`   API Key: ${provider.apiKey.substring(0, 8)}...`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('❌ 查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProviders();
