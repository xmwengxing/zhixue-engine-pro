/**
 * 测试认证 API
 */

const API_BASE_URL = 'http://localhost:3000/api';

/**
 * 测试登录 API
 */
async function testLogin() {
  console.log('\n========== 测试登录 API ==========');

  try {
    // 测试成功登录
    console.log('\n1. 测试成功登录 (admin)...');
    const loginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'password123',
      }),
    });

    const loginData = await loginResponse.json();
    console.log('状态码:', loginResponse.status);
    console.log('响应:', JSON.stringify(loginData, null, 2));

    if (loginResponse.ok && loginData.success) {
      console.log('✅ 登录成功！');
      console.log('Token:', loginData.data.token.substring(0, 20) + '...');
      console.log('用户角色:', loginData.data.user.role);
    } else {
      console.log('❌ 登录失败！');
    }

    // 测试错误密码
    console.log('\n2. 测试错误密码...');
    const wrongPasswordResponse = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'wrongpassword',
      }),
    });

    const wrongPasswordData = await wrongPasswordResponse.json();
    console.log('状态码:', wrongPasswordResponse.status);
    console.log('响应:', JSON.stringify(wrongPasswordData, null, 2));

    if (wrongPasswordResponse.status === 401) {
      console.log('✅ 正确拒绝了错误密码！');
    } else {
      console.log('❌ 应该返回 401 状态码！');
    }

    // 测试不存在的用户
    console.log('\n3. 测试不存在的用户...');
    const nonExistentUserResponse = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'nonexistent',
        password: 'password123',
      }),
    });

    const nonExistentUserData = await nonExistentUserResponse.json();
    console.log('状态码:', nonExistentUserResponse.status);
    console.log('响应:', JSON.stringify(nonExistentUserData, null, 2));

    if (nonExistentUserResponse.status === 401) {
      console.log('✅ 正确拒绝了不存在的用户！');
    } else {
      console.log('❌ 应该返回 401 状态码！');
    }
  } catch (error) {
    console.error('❌ 测试登录 API 失败:', error);
  }
}

/**
 * 测试注册 API
 */
async function testRegister() {
  console.log('\n========== 测试注册 API ==========');

  try {
    // 测试成功注册
    console.log('\n1. 测试成功注册...');
    const timestamp = Date.now().toString().slice(-6); // 只取最后 6 位
    const registerResponse = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'new' + timestamp,
        password: 'password123',
        authCode: 'TEST-AUTH-CODE-NEW',
      }),
    });

    const registerData = await registerResponse.json();
    console.log('状态码:', registerResponse.status);
    console.log('响应:', JSON.stringify(registerData, null, 2));

    if (registerResponse.status === 201 && registerData.success) {
      console.log('✅ 注册成功！');
      console.log('新用户 ID:', registerData.data.userId);
    } else {
      console.log('❌ 注册失败！');
    }

    // 测试无效授权码
    console.log('\n2. 测试无效授权码...');
    const timestamp2 = Date.now().toString().slice(-6);
    const invalidAuthCodeResponse = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'new' + timestamp2,
        password: 'password123',
        authCode: 'INVALID-CODE',
      }),
    });

    const invalidAuthCodeData = await invalidAuthCodeResponse.json();
    console.log('状态码:', invalidAuthCodeResponse.status);
    console.log('响应:', JSON.stringify(invalidAuthCodeData, null, 2));

    if (invalidAuthCodeResponse.status === 400) {
      console.log('✅ 正确拒绝了无效授权码！');
    } else {
      console.log('❌ 应该返回 400 状态码！');
    }

    // 测试重复用户名
    console.log('\n3. 测试重复用户名...');
    const duplicateUsernameResponse = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'password123',
        authCode: 'TEST-AUTH-CODE-002',
      }),
    });

    const duplicateUsernameData = await duplicateUsernameResponse.json();
    console.log('状态码:', duplicateUsernameResponse.status);
    console.log('响应:', JSON.stringify(duplicateUsernameData, null, 2));

    if (duplicateUsernameResponse.status === 400) {
      console.log('✅ 正确拒绝了重复用户名！');
    } else {
      console.log('❌ 应该返回 400 状态码！');
    }
  } catch (error) {
    console.error('❌ 测试注册 API 失败:', error);
  }
}

/**
 * 运行所有测试
 */
async function runTests() {
  console.log('开始测试认证 API...');
  console.log('API 基础 URL:', API_BASE_URL);

  await testLogin();
  await testRegister();

  console.log('\n========== 测试完成 ==========');
}

runTests();
