/**
 * 基础架构健康检查脚本
 * 验证数据库连接、Redis连接和核心配置
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    await prisma.$connect();
    console.log('✅ 数据库连接成功');
    
    // 检查数据库表是否存在
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log(`✅ 数据库表数量: ${(tables as any[]).length}`);
    
    await prisma.$disconnect();
    return true;
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    return false;
  }
}

async function checkRedis() {
  try {
    const redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    
    await redisClient.connect();
    await redisClient.set('health_check', 'ok');
    const value = await redisClient.get('health_check');
    
    if (value === 'ok') {
      console.log('✅ Redis 连接成功');
      await redisClient.disconnect();
      return true;
    }
    
    await redisClient.disconnect();
    return false;
  } catch (error) {
    console.error('❌ Redis 连接失败:', error);
    return false;
  }
}

async function checkEnvironment() {
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'PORT',
  ];
  
  let allPresent = true;
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`❌ 缺少环境变量: ${envVar}`);
      allPresent = false;
    }
  }
  
  if (allPresent) {
    console.log('✅ 所有必需的环境变量已配置');
  }
  
  return allPresent;
}

async function main() {
  console.log('🔍 开始基础架构健康检查...\n');
  
  const envCheck = await checkEnvironment();
  console.log('');
  
  const dbCheck = await checkDatabase();
  console.log('');
  
  const redisCheck = await checkRedis();
  console.log('');
  
  if (envCheck && dbCheck && redisCheck) {
    console.log('✅ 所有基础架构检查通过！');
    process.exit(0);
  } else {
    console.log('❌ 部分基础架构检查失败');
    process.exit(1);
  }
}

main();
