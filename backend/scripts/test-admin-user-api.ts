/**
 * 测试管理员用户管理 API
 * 
 * 测试流程：
 * 1. 使用管理员账户登录
 * 2. 获取用户列表
 * 3. 创建新用户
 * 4. 获取用户详情
 * 5. 更新用户信息
 * 6. 删除用户
 * 7. 获取用户统计信息
 */

const API_BASE_URL = 'http://localhost:3000/api';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, 'cyan');
}

function logStep(step: number, message: string) {
  log(`\n📍 步骤 ${step}: ${message}`, 'yellow');
}

// HTTP 请求辅助函数
async function request(
  method: string,
  path: string,
  data?: any,
  token?: string
): Promise<any> {
  const url = `${API_BASE_URL}${path}`;
  const headers: any = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(
        responseData.error?.message || `HTTP ${response.status}: ${response.statusText}`
      );
    }

    return responseData;
  } catch (error: any) {
    throw new Error(`请求失败: ${error.message}`);
  }
}

async function main() {
  log('\n🚀 开始测试管理员用户管理 API\n', 'blue');

  let adminToken: string;
  let createdUserId: string;

  try {
    // ============ 步骤 1: 管理员登录 ============
    logStep(1, '管理员登录');
    const loginResponse = await request('POST', '/auth/login', {
      username: 'admin',
      password: 'password123',
    });

    if (!loginResponse.data?.token) {
      throw new Error('登录失败：未返回 token');
    }

    adminToken = loginResponse.data.token;
    logSuccess(`登录成功，获得 token: ${adminToken.substring(0, 20)}...`);
    logInfo(`用户角色: ${loginResponse.data.user.role}`);

    // ============ 步骤 2: 获取用户列表 ============
    logStep(2, '获取用户列表');
    const usersListResponse = await request(
      'GET',
      '/admin/users?page=1&limit=10',
      null,
      adminToken
    );

    logSuccess(`获取用户列表成功`);
    logInfo(`总用户数: ${usersListResponse.data.total}`);
    logInfo(`当前页: ${usersListResponse.data.page}/${usersListResponse.data.totalPages}`);
    logInfo(`用户列表:`);
    usersListResponse.data.users.forEach((user: any, index: number) => {
      console.log(
        `  ${index + 1}. ${user.username} (${user.role}) - ${user.status}`
      );
    });

    // ============ 步骤 3: 获取用户统计信息 ============
    logStep(3, '获取用户统计信息');
    const statsResponse = await request(
      'GET',
      '/admin/users/stats',
      null,
      adminToken
    );

    logSuccess(`获取用户统计成功`);
    logInfo(`总用户数: ${statsResponse.data.totalUsers}`);
    logInfo(`按角色统计:`);
    console.log(`  - 管理员: ${statsResponse.data.byRole.admin}`);
    console.log(`  - 家长: ${statsResponse.data.byRole.parent}`);
    console.log(`  - 学员: ${statsResponse.data.byRole.student}`);
    logInfo(`按状态统计:`);
    console.log(`  - 活跃: ${statsResponse.data.byStatus.active}`);
    console.log(`  - 锁定: ${statsResponse.data.byStatus.locked}`);

    // ============ 步骤 4: 创建新用户 ============
    logStep(4, '创建新用户');
    const timestamp = Date.now().toString().slice(-6); // 只取最后6位
    const newUserData = {
      username: `test${timestamp}`,
      password: 'test123456',
      role: 'STUDENT',
      email: `test${timestamp}@example.com`,
      phone: '13800138000',
    };

    const createUserResponse = await request(
      'POST',
      '/admin/users',
      newUserData,
      adminToken
    );

    if (!createUserResponse.data.user.id) {
      throw new Error('创建用户失败：未返回用户 ID');
    }

    createdUserId = createUserResponse.data.user.id;
    logSuccess(`创建用户成功`);
    logInfo(`用户 ID: ${createdUserId}`);
    logInfo(`用户名: ${createUserResponse.data.user.username}`);
    logInfo(`角色: ${createUserResponse.data.user.role}`);

    // ============ 步骤 5: 获取用户详情 ============
    logStep(5, '获取用户详情');
    const userDetailResponse = await request(
      'GET',
      `/admin/users/${createdUserId}`,
      null,
      adminToken
    );

    logSuccess(`获取用户详情成功`);
    logInfo(`用户名: ${userDetailResponse.data.user.username}`);
    logInfo(`邮箱: ${userDetailResponse.data.user.email}`);
    logInfo(`手机: ${userDetailResponse.data.user.phone}`);
    logInfo(`状态: ${userDetailResponse.data.user.status}`);

    // ============ 步骤 6: 更新用户信息 ============
    logStep(6, '更新用户信息');
    const updateTimestamp = Date.now().toString().slice(-6);
    const updateData = {
      email: `upd${updateTimestamp}@example.com`,
      phone: '13900139000',
    };

    const updateUserResponse = await request(
      'PUT',
      `/admin/users/${createdUserId}`,
      updateData,
      adminToken
    );

    logSuccess(`更新用户成功`);
    logInfo(`新邮箱: ${updateUserResponse.data.user.email}`);
    logInfo(`新手机: ${updateUserResponse.data.user.phone}`);

    // ============ 步骤 7: 按角色筛选用户 ============
    logStep(7, '按角色筛选用户（STUDENT）');
    const filteredUsersResponse = await request(
      'GET',
      '/admin/users?role=STUDENT&limit=5',
      null,
      adminToken
    );

    logSuccess(`筛选用户成功`);
    logInfo(`学员用户数: ${filteredUsersResponse.data.total}`);
    logInfo(`返回 ${filteredUsersResponse.data.users.length} 条记录`);

    // ============ 步骤 8: 搜索用户 ============
    logStep(8, '搜索用户');
    const searchResponse = await request(
      'GET',
      `/admin/users?search=${newUserData.username}`,
      null,
      adminToken
    );

    logSuccess(`搜索用户成功`);
    logInfo(`找到 ${searchResponse.data.total} 个匹配的用户`);

    // ============ 步骤 9: 删除用户 ============
    logStep(9, '删除用户（软删除）');
    const deleteUserResponse = await request(
      'DELETE',
      `/admin/users/${createdUserId}`,
      null,
      adminToken
    );

    logSuccess(`删除用户成功`);
    logInfo(`用户状态: ${deleteUserResponse.data.user.status}`);

    // ============ 步骤 10: 验证用户已被删除 ============
    logStep(10, '验证用户已被删除');
    const deletedUserResponse = await request(
      'GET',
      `/admin/users/${createdUserId}`,
      null,
      adminToken
    );

    if (deletedUserResponse.data.user.status === 'DELETED') {
      logSuccess(`验证成功：用户状态为 DELETED`);
    } else {
      logError(`验证失败：用户状态不是 DELETED`);
    }

    // ============ 测试完成 ============
    log('\n✨ 所有测试通过！\n', 'green');
  } catch (error: any) {
    logError(`测试失败: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
main();
