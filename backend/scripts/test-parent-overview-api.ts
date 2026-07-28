/**
 * 测试家长端学情概览 API
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

// 测试用户凭证
const PARENT_CREDENTIALS = {
  username: 'parent1',
  password: 'password123',
};

let parentToken = '';
let studentId = '';

/**
 * 家长登录
 */
async function loginAsParent() {
  try {
    console.log('\n=== 1. 家长登录 ===');
    const response = await axios.post(
      `${API_BASE_URL}/auth/login`,
      PARENT_CREDENTIALS,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.data && response.data.data.token) {
      parentToken = response.data.data.token;
      console.log('✓ 家长登录成功');
      console.log('Token:', parentToken.substring(0, 20) + '...');
      return true;
    }
    console.log('✗ 响应中没有 token');
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    return false;
  } catch (error: any) {
    console.error('✗ 家长登录失败:');
    if (error.response) {
      console.error('  状态码:', error.response.status);
      console.error('  响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('  没有收到响应');
      console.error('  请求:', error.request);
    } else {
      console.error('  错误信息:', error.message);
    }
    return false;
  }
}

/**
 * 获取子女列表
 */
async function getChildren() {
  try {
    console.log('\n=== 2. 获取子女列表 ===');
    const response = await axios.get(`${API_BASE_URL}/parent/children`, {
      headers: {
        Authorization: `Bearer ${parentToken}`,
      },
    });

    if (response.data.success && response.data.data.children.length > 0) {
      studentId = response.data.data.children[0].student.id;
      console.log('✓ 获取子女列表成功');
      console.log('子女数量:', response.data.data.children.length);
      console.log('第一个学员 ID:', studentId);
      return true;
    } else {
      console.log('✗ 没有绑定的子女');
      return false;
    }
  } catch (error: any) {
    console.error('✗ 获取子女列表失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 获取学情概览
 */
async function getStudentOverview() {
  try {
    console.log('\n=== 3. 获取学情概览 ===');
    const response = await axios.get(`${API_BASE_URL}/parent/overview/${studentId}`, {
      headers: {
        Authorization: `Bearer ${parentToken}`,
      },
    });

    if (response.data.success) {
      console.log('✓ 获取学情概览成功');
      console.log('\n能力雷达图数据:');
      console.log('  科目:', response.data.data.abilityRadar.subjects);
      console.log('  分数:', response.data.data.abilityRadar.scores);
      console.log('\n错题统计:');
      console.log('  未掌握:', response.data.data.errorStats.unmastered);
      console.log('  攻克中:', response.data.data.errorStats.mastering);
      console.log('  已掌握:', response.data.data.errorStats.mastered);
      console.log('\n学习连续性:');
      console.log('  连续天数:', response.data.data.learningStreak.days);
      console.log('  本周时长:', response.data.data.learningStreak.weeklyHours, '小时');
      return true;
    }
    return false;
  } catch (error: any) {
    console.error('✗ 获取学情概览失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 测试无权访问其他学员数据
 */
async function testUnauthorizedAccess() {
  try {
    console.log('\n=== 4. 测试无权访问其他学员数据 ===');
    const fakeStudentId = '00000000-0000-0000-0000-000000000000';
    await axios.get(`${API_BASE_URL}/parent/overview/${fakeStudentId}`, {
      headers: {
        Authorization: `Bearer ${parentToken}`,
      },
    });
    console.log('✗ 应该返回 403 错误');
    return false;
  } catch (error: any) {
    if (error.response?.status === 403) {
      console.log('✓ 正确返回 403 禁止访问');
      return true;
    }
    console.error('✗ 返回了错误的状态码:', error.response?.status);
    return false;
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('开始测试家长端学情概览 API...\n');

  const results = {
    login: false,
    getChildren: false,
    getOverview: false,
    unauthorized: false,
  };

  // 1. 家长登录
  results.login = await loginAsParent();
  if (!results.login) {
    console.log('\n测试终止：家长登录失败');
    return;
  }

  // 2. 获取子女列表
  results.getChildren = await getChildren();
  if (!results.getChildren) {
    console.log('\n测试终止：没有绑定的子女');
    return;
  }

  // 3. 获取学情概览
  results.getOverview = await getStudentOverview();

  // 4. 测试无权访问
  results.unauthorized = await testUnauthorizedAccess();

  // 输出测试结果
  console.log('\n=== 测试结果汇总 ===');
  console.log('家长登录:', results.login ? '✓ 通过' : '✗ 失败');
  console.log('获取子女列表:', results.getChildren ? '✓ 通过' : '✗ 失败');
  console.log('获取学情概览:', results.getOverview ? '✓ 通过' : '✗ 失败');
  console.log('权限验证:', results.unauthorized ? '✓ 通过' : '✗ 失败');

  const allPassed = Object.values(results).every((r) => r);
  console.log('\n总体结果:', allPassed ? '✓ 全部通过' : '✗ 部分失败');
}

main().catch(console.error);
