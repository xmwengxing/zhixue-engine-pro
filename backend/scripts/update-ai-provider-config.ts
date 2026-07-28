/**
 * 更新 AI 服务商配置
 * 确保 endpoint 和模型名称正确
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateProviderConfig() {
  try {
    console.log('🔧 开始更新 AI 服务商配置...\n');

    // 查找 DeepSeek 服务商
    const deepseekProvider = await prisma.aIProvider.findFirst({
      where: { type: 'DEEPSEEK' },
    });

    if (deepseekProvider) {
      console.log('📝 找到 DeepSeek 服务商，检查配置...');
      console.log(`   当前 endpoint: ${deepseekProvider.endpoint}`);
      console.log(`   当前 model: ${deepseekProvider.model}`);

      // DeepSeek 的正确配置
      const correctEndpoint = 'https://api.deepseek.com/v1';
      const correctModel = 'deepseek-chat';

      if (deepseekProvider.endpoint !== correctEndpoint || deepseekProvider.model !== correctModel) {
        console.log('\n⚠️  配置需要更新');
        
        await prisma.aIProvider.update({
          where: { id: deepseekProvider.id },
          data: {
            endpoint: correctEndpoint,
            model: correctModel,
          },
        });

        console.log('✅ DeepSeek 配置已更新');
        console.log(`   新 endpoint: ${correctEndpoint}`);
        console.log(`   新 model: ${correctModel}`);
      } else {
        console.log('✅ DeepSeek 配置正确，无需更新');
      }
    } else {
      console.log('⚠️  未找到 DeepSeek 服务商');
    }

    console.log('\n📋 当前所有服务商配置：\n');
    const allProviders = await prisma.aIProvider.findMany({
      orderBy: { priority: 'asc' },
    });

    allProviders.forEach((provider, index) => {
      console.log(`${index + 1}. ${provider.name} (${provider.type})`);
      console.log(`   Endpoint: ${provider.endpoint}`);
      console.log(`   Model: ${provider.model}`);
      console.log(`   Status: ${provider.status}`);
      console.log('');
    });

    console.log('✅ 配置检查完成！');

  } catch (error) {
    console.error('❌ 更新失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateProviderConfig();
