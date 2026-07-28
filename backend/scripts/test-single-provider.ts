/**
 * 测试单个 AI 服务商验证功能
 */

import axios from 'axios';

async function test() {
  try {
    // 登录
    const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
      username: 'admin',
      password: 'password123',
    });
    
    const token = loginRes.data.data.token;
    console.log('✅ 登录成功\n');
    
    // 测试 DeepSeek 配置
    console.log('测试 DeepSeek 配置验证...');
    const testRes = await axios.post(
      'http://localhost:3000/api/admin/ai-providers/test',
      {
        type: 'DEEPSEEK',
        apiKey: process.env.DEEPSEEK_API_KEY || 'sk-test',
        endpoint: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    console.log('✅ 响应状态:', testRes.status);
    console.log('📊 测试结果:', JSON.stringify(testRes.data, null, 2));
    
  } catch (error: any) {
    console.error('❌ 错误:', error.response?.status, error.response?.data || error.message);
  }
}

test();
