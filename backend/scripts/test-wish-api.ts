/**
 * 测试愿望 API
 * 运行方式: npx ts-node backend/scripts/test-wish-api.ts
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
 * 测试提交愿望
 */
async function testCreateWish() {
  try {
    console.log('\n📝 测试提交愿望...');
    const wishData = {
      description: '我想要一个新的篮球',
      requiredPoints: 100,
      imageUrl: 'https://example.com/basketball.jpg',
    };

    const response = await axios.post(`${API_BASE_URL}/student/wishes`, wishData, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
    });

    console.log('✅ 提交愿望成功');
    console.log('愿望 ID:', response.data.data.wish.id);
    console.log('愿望描述:', response.data.data.wish.description);
    console.log('所需积分:', response.data.data.wish.requiredPoints);
    console.log('当前积分:', response.data.data.currentPoints);
    console.log('积分是否足够:', response.data.data.hasEnoughPoints);

    if (!response.data.data.hasEnoughPoints) {
      console.log('还需积分:', response.data.data.pointsNeeded);
    }

    return response.data.data.wish.id;
  } catch (error: any) {
    console.error('❌ 提交愿望失败:', error.response?.data || error.message);
    return null;
  }
}

/**
 * 测试获取愿望列表
 */
async function testGetWishes() {
  try {
    console.log('\n📋 测试获取愿望列表...');
    const response = await axios.get(`${API_BASE_URL}/student/wishes`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
    });

    console.log('✅ 获取愿望列表成功');
    console.log('愿望总数:', response.data.data.total);
    console.log('当前页:', response.data.data.page);
    console.log('总页数:', response.data.data.totalPages);

    if (response.data.data.wishes.length > 0) {
      console.log('\n愿望列表:');
      response.data.data.wishes.forEach((wish: any) => {
        console.log(`  - ${wish.description} (${wish.requiredPoints}积分) - ${wish.status}`);
      });
    }

    return true;
  } catch (error: any) {
    console.error('❌ 获取愿望列表失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 测试获取愿望详情
 */
async function testGetWish(wishId: string) {
  try {
    console.log('\n🔍 测试获取愿望详情...');
    const response = await axios.get(`${API_BASE_URL}/student/wishes/${wishId}`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
    });

    console.log('✅ 获取愿望详情成功');
    console.log('愿望描述:', response.data.data.description);
    console.log('所需积分:', response.data.data.requiredPoints);
    console.log('状态:', response.data.data.status);
    console.log('提交时间:', response.data.data.submittedAt);

    return true;
  } catch (error: any) {
    console.error('❌ 获取愿望详情失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 测试获取愿望统计
 */
async function testGetWishStats() {
  try {
    console.log('\n📊 测试获取愿望统计...');
    const response = await axios.get(`${API_BASE_URL}/student/wishes/stats`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
    });

    console.log('✅ 获取愿望统计成功');
    console.log('待审核:', response.data.data.pending);
    console.log('已同意:', response.data.data.approved);
    console.log('已拒绝:', response.data.data.rejected);
    console.log('已兑现:', response.data.data.fulfilled);
    console.log('总计:', response.data.data.total);

    return true;
  } catch (error: any) {
    console.error('❌ 获取愿望统计失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 测试愿望验证
 */
async function testWishValidation() {
  try {
    console.log('\n🔒 测试愿望验证...');

    // 测试空描述
    try {
      await axios.post(
        `${API_BASE_URL}/student/wishes`,
        {
          description: '',
          requiredPoints: 100,
        },
        {
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );
      console.log('❌ 应该拒绝空描述');
    } catch (error: any) {
      if (error.response?.status === 422) {
        console.log('✅ 正确拒绝空描述');
      }
    }

    // 测试负数积分
    try {
      await axios.post(
        `${API_BASE_URL}/student/wishes`,
        {
          description: '测试愿望',
          requiredPoints: -10,
        },
        {
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );
      console.log('❌ 应该拒绝负数积分');
    } catch (error: any) {
      if (error.response?.status === 422) {
        console.log('✅ 正确拒绝负数积分');
      }
    }

    return true;
  } catch (error: any) {
    console.error('❌ 愿望验证测试失败:', error.message);
    return false;
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('='.repeat(60));
  console.log('愿望 API 测试');
  console.log('='.repeat(60));

  // 1. 登录
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('\n❌ 测试失败：无法登录');
    return;
  }

  // 2. 测试提交愿望
  const wishId = await testCreateWish();

  // 3. 测试获取愿望列表
  await testGetWishes();

  // 4. 测试获取愿望详情
  if (wishId) {
    await testGetWish(wishId);
  }

  // 5. 测试获取愿望统计
  await testGetWishStats();

  // 6. 测试愿望验证
  await testWishValidation();

  console.log('\n' + '='.repeat(60));
  console.log('✅ 所有测试完成');
  console.log('='.repeat(60));
}

// 运行测试
main().catch(console.error);
