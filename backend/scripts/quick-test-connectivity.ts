/**
 * 快速测试连通性端点
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
    console.log('✅ 登录成功');
    
    // 测试连通性
    console.log('\n测试 POST /api/admin/ai-providers/test-all...');
    const testRes = await axios.post(
      'http://localhost:3000/api/admin/ai-providers/test-all',
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    console.log('✅ 响应状态:', testRes.status);
    console.log('📊 响应数据:', JSON.stringify(testRes.data, null, 2));
    
  } catch (error: any) {
    console.error('❌ 错误:', error.response?.status, error.response?.data || error.message);
  }
}

test();
