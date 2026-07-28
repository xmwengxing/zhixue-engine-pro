/**
 * 测试环境变量验证功能
 */

import dotenv from 'dotenv';
import { validateEnv, printEnvInfo } from '../utils/envValidator';

// 加载环境变量
dotenv.config();

console.log('='.repeat(60));
console.log('环境变量验证测试');
console.log('='.repeat(60));
console.log('');

try {
  // 验证环境变量
  const envConfig = validateEnv();
  
  console.log('✅ 环境变量验证通过！');
  console.log('');
  
  // 打印环境配置信息
  printEnvInfo(envConfig);
  
  console.log('');
  console.log('='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));
  
  process.exit(0);
} catch (error) {
  console.error('');
  console.error('='.repeat(60));
  console.error('测试失败');
  console.error('='.repeat(60));
  
  if (error instanceof Error) {
    console.error(error.message);
  }
  
  process.exit(1);
}
