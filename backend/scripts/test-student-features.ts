/**
 * 学员端核心功能综合测试
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

// 测试用户凭证
const STUDENT_CREDENTIALS = {
  username: 'student1',
  password: 'password123',
};

let studentToken = '';
let studentUserId = '';

/**
 * 登录获取 token
 */
async function login(): Promise<boolean> {
  try {
    console.log('🔐 正在登录学员账户...');
    const response = await axios.post(`${API_BASE_URL}/auth/login`, STUDENT_CREDENTIALS);

    if (response.data.data.token) {
      studentToken = response.data.data.token;
      studentUserId = response.data.data.user.id;
      console.log('✅ 登录成功');
      console.log('   用户ID:', studentUserId);
      console.log('   用户名:', response.data.data.user.username);
      console.log('   角色:', response.data.data.user.role);
      return true;
    }
    return false;
  } catch (error: any) {
    console.error('❌ 登录失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 测试个人档案功能
 */
async function testProfile() {
  try {
    console.log('\n📋 测试个人档案功能...');
    
    // 获取档案
    const getResponse = await axios.get(`${API_BASE_URL}/student/profile`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    if (getResponse.data.success) {
      console.log('✅ 获取档案成功');
      const profile = getResponse.data.data;
      if (profile) {
        console.log('   档案完整度:', (profile.completeness || 0) + '%');
        console.log('   年级:', profile.grade || '未设置');
        console.log('   教材版本:', profile.materialVersion || '未设置');
      } else {
        console.log('   档案尚未创建');
      }
    }

    return true;
  } catch (error: any) {
    console.error('❌ 档案测试失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 测试积分功能
 */
async function testPoints() {
  try {
    console.log('\n💰 测试积分功能...');
    
    const response = await axios.get(`${API_BASE_URL}/student/points`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    if (response.data.success) {
      console.log('✅ 获取积分成功');
      console.log('   可用积分:', response.data.data.available);
      console.log('   累计积分:', response.data.data.total);
      console.log('   历史记录数:', response.data.data.history.length);
    }

    return true;
  } catch (error: any) {
    console.error('❌ 积分测试失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 测试愿望功能
 */
async function testWishes() {
  try {
    console.log('\n🎁 测试愿望功能...');
    
    // 获取愿望列表
    const listResponse = await axios.get(`${API_BASE_URL}/student/wishes`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    if (listResponse.data.success) {
      console.log('✅ 获取愿望列表成功');
      console.log('   愿望总数:', listResponse.data.data.total);
      console.log('   当前页愿望数:', listResponse.data.data.wishes.length);
    }

    return true;
  } catch (error: any) {
    console.error('❌ 愿望测试失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 测试错题本功能
 */
async function testErrorBook() {
  try {
    console.log('\n📚 测试错题本功能...');
    
    const response = await axios.get(`${API_BASE_URL}/student/errors`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    if (response.data.success) {
      console.log('✅ 获取错题本成功');
      console.log('   错题总数:', response.data.data.total);
      console.log('   当前页错题数:', response.data.data.errors.length);
    }

    return true;
  } catch (error: any) {
    console.error('❌ 错题本测试失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 测试训练舱功能
 */
async function testTraining() {
  try {
    console.log('\n🎯 测试训练舱功能...');
    
    // 获取当前任务
    const response = await axios.get(`${API_BASE_URL}/student/tasks/current`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    if (response.data.success) {
      console.log('✅ 获取当前任务成功');
      if (response.data.data) {
        console.log('   任务ID:', response.data.data.id);
        console.log('   任务标题:', response.data.data.title);
        console.log('   任务状态:', response.data.data.status);
      } else {
        console.log('   当前无进行中的任务');
      }
    }

    return true;
  } catch (error: any) {
    console.error('❌ 训练舱测试失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('='.repeat(60));
  console.log('学员端核心功能综合测试');
  console.log('='.repeat(60));

  // 1. 登录
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('\n❌ 测试失败：无法登录');
    process.exit(1);
  }

  // 2. 测试各个功能模块
  const results = {
    profile: await testProfile(),
    points: await testPoints(),
    wishes: await testWishes(),
    errorBook: await testErrorBook(),
    training: await testTraining(),
  };

  // 3. 汇总结果
  console.log('\n' + '='.repeat(60));
  console.log('测试结果汇总');
  console.log('='.repeat(60));
  
  const testResults = [
    { name: '个人档案', passed: results.profile },
    { name: '积分系统', passed: results.points },
    { name: '愿望系统', passed: results.wishes },
    { name: '错题本', passed: results.errorBook },
    { name: '训练舱', passed: results.training },
  ];

  testResults.forEach(result => {
    console.log(`${result.passed ? '✅' : '❌'} ${result.name}`);
  });

  const passedCount = testResults.filter(r => r.passed).length;
  const totalCount = testResults.length;

  console.log('\n' + '='.repeat(60));
  console.log(`测试通过: ${passedCount}/${totalCount}`);
  console.log('='.repeat(60));

  if (passedCount === totalCount) {
    console.log('\n🎉 所有学员端核心功能测试通过！');
    process.exit(0);
  } else {
    console.log('\n⚠️  部分功能测试失败，请检查日志');
    process.exit(1);
  }
}

// 运行测试
main().catch(error => {
  console.error('测试执行出错:', error);
  process.exit(1);
});
