/**
 * 测试积分 API
 * 运行方式: npx ts-node backend/scripts/test-points-api.ts
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

// 测试用户凭证
const STUDENT_CREDENTIALS = {
  username: 'student1',
  password: 'password123',
};

let studentToken = '';

/**
 * 登录获取 token
 */
async function login(): Promise<boolean> {
  try {
    console.log('🔐 正在登录学员账户...');
    const response = await axios.post(`${API_BASE_URL}/auth/login`, STUDENT_CREDENTIALS);

    if (response.data.token) {
      studentToken = response.data.token;
      console.log('✅ 登录成功');
      console.log('用户信息:', response.data.user);
      return true;
    }
    return false;
  } catch (error: any) {
    console.error('❌ 登录失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 测试获取积分信息
 */
async function testGetPoints() {
  try {
    console.log('\n📊 测试获取积分信息...');
    const response = await axios.get(`${API_BASE_URL}/student/points`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
    });

    console.log('✅ 获取积分信息成功');
    console.log('可用积分:', response.data.data.available);
    console.log('累计积分:', response.data.data.total);
    console.log('积分历史记录数:', response.data.data.history.length);

    if (response.data.data.history.length > 0) {
      console.log('\n最近的积分记录:');
      response.data.data.history.slice(0, 5).forEach((record: any) => {
        console.log(`  - ${record.type}: ${record.amount > 0 ? '+' : ''}${record.amount} (余额: ${record.balance})`);
      });
    }

    return true;
  } catch (error: any) {
    console.error('❌ 获取积分信息失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('='.repeat(60));
  console.log('积分 API 测试');
  console.log('='.repeat(60));

  // 1. 登录
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('\n❌ 测试失败：无法登录');
    return;
  }

  // 2. 测试获取积分信息
  await testGetPoints();

  console.log('\n' + '='.repeat(60));
  console.log('✅ 所有测试完成');
  console.log('='.repeat(60));
}

// 运行测试
main().catch(console.error);
