/**
 * 学号管理 API 测试脚本
 * 
 * 使用方法:
 * npx ts-node backend/scripts/test-student-id-api.ts
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

// 测试用的管理员 token（需要先登录获取）
let adminToken = '';

// 测试数据
let testStudentIdId = '';
let testUserId = '';

/**
 * 管理员登录
 */
async function adminLogin() {
  try {
    console.log('\n=== 1. 管理员登录 ===');
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      username: 'admin',
      password: 'password123',
    });

    adminToken = response.data.data.token;
    console.log('✓ 登录成功');
    console.log('Token:', adminToken ? adminToken.substring(0, 20) + '...' : 'N/A');
  } catch (error: any) {
    console.error('✗ 登录失败:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 创建测试用户
 */
async function createTestUser() {
  try {
    console.log('\n=== 2. 创建测试用户 ===');
    const timestamp = Date.now().toString().slice(-6); // 只取最后 6 位
    const response = await axios.post(
      `${API_BASE_URL}/admin/users`,
      {
        username: `stu${timestamp}`,
        password: 'test123',
        role: 'STUDENT',
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    testUserId = response.data.data.user.id;
    console.log('✓ 用户创建成功');
    console.log('用户 ID:', testUserId);
    console.log('用户名:', response.data.data.user.username);
  } catch (error: any) {
    console.error('✗ 创建用户失败:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 创建测试学号
 */
async function createTestStudentId() {
  try {
    console.log('\n=== 3. 创建测试学号 ===');
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const studentId = await prisma.studentID.create({
      data: {
        studentIdNumber: `SID${Date.now()}`,
        status: 'AVAILABLE',
      },
    });

    testStudentIdId = studentId.id;
    console.log('✓ 学号创建成功');
    console.log('学号 ID:', testStudentIdId);
    console.log('学号:', studentId.studentIdNumber);

    await prisma.$disconnect();
  } catch (error: any) {
    console.error('✗ 创建学号失败:', error.message);
    throw error;
  }
}

/**
 * 测试获取学号统计
 */
async function testGetStudentIdStats() {
  try {
    console.log('\n=== 4. 获取学号统计 ===');
    const response = await axios.get(`${API_BASE_URL}/admin/student-ids/stats`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    console.log('✓ 获取统计成功');
    console.log('统计数据:', JSON.stringify(response.data.data, null, 2));
  } catch (error: any) {
    console.error('✗ 获取统计失败:', error.response?.data || error.message);
  }
}

/**
 * 测试获取学号列表
 */
async function testGetStudentIds() {
  try {
    console.log('\n=== 5. 获取学号列表 ===');
    const response = await axios.get(`${API_BASE_URL}/admin/student-ids`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      params: {
        page: 1,
        limit: 10,
      },
    });

    console.log('✓ 获取列表成功');
    console.log('总数:', response.data.data.total);
    console.log('当前页:', response.data.data.page);
    console.log('学号数量:', response.data.data.studentIds.length);
  } catch (error: any) {
    console.error('✗ 获取列表失败:', error.response?.data || error.message);
  }
}

/**
 * 测试获取学号详情
 */
async function testGetStudentIdById() {
  try {
    console.log('\n=== 6. 获取学号详情 ===');
    const response = await axios.get(
      `${API_BASE_URL}/admin/student-ids/${testStudentIdId}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    console.log('✓ 获取详情成功');
    console.log('学号:', response.data.data.studentId.studentIdNumber);
    console.log('状态:', response.data.data.studentId.status);
  } catch (error: any) {
    console.error('✗ 获取详情失败:', error.response?.data || error.message);
  }
}

/**
 * 测试分配学号
 */
async function testAssignStudentId() {
  try {
    console.log('\n=== 7. 分配学号 ===');
    const response = await axios.post(
      `${API_BASE_URL}/admin/student-ids/assign`,
      {
        studentIdId: testStudentIdId,
        userId: testUserId,
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    console.log('✓ 分配成功');
    console.log('学号:', response.data.data.studentId.studentIdNumber);
    console.log('用户:', response.data.data.studentId.user.username);
    console.log('状态:', response.data.data.studentId.status);
  } catch (error: any) {
    console.error('✗ 分配失败:', error.response?.data || error.message);
  }
}

/**
 * 测试锁定学号
 */
async function testLockStudentId() {
  try {
    console.log('\n=== 8. 锁定学号 ===');
    const response = await axios.put(
      `${API_BASE_URL}/admin/student-ids/${testStudentIdId}/lock`,
      {},
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    console.log('✓ 锁定成功');
    console.log('学号:', response.data.data.studentId.studentIdNumber);
    console.log('状态:', response.data.data.studentId.status);
  } catch (error: any) {
    console.error('✗ 锁定失败:', error.response?.data || error.message);
  }
}

/**
 * 测试解锁学号
 */
async function testUnlockStudentId() {
  try {
    console.log('\n=== 9. 解锁学号 ===');
    const response = await axios.put(
      `${API_BASE_URL}/admin/student-ids/${testStudentIdId}/unlock`,
      {},
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    console.log('✓ 解锁成功');
    console.log('学号:', response.data.data.studentId.studentIdNumber);
    console.log('状态:', response.data.data.studentId.status);
  } catch (error: any) {
    console.error('✗ 解锁失败:', error.response?.data || error.message);
  }
}

/**
 * 测试解绑学号
 */
async function testUnbindStudentId() {
  try {
    console.log('\n=== 10. 解绑学号 ===');
    const response = await axios.put(
      `${API_BASE_URL}/admin/student-ids/${testStudentIdId}/unbind`,
      {},
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    console.log('✓ 解绑成功');
    console.log('学号:', response.data.data.studentId.studentIdNumber);
    console.log('状态:', response.data.data.studentId.status);
  } catch (error: any) {
    console.error('✗ 解绑失败:', error.response?.data || error.message);
  }
}

/**
 * 测试按状态筛选
 */
async function testFilterByStatus() {
  try {
    console.log('\n=== 11. 按状态筛选学号 ===');
    const response = await axios.get(`${API_BASE_URL}/admin/student-ids`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      params: {
        status: 'AVAILABLE',
        page: 1,
        limit: 5,
      },
    });

    console.log('✓ 筛选成功');
    console.log('可用学号数量:', response.data.data.total);
  } catch (error: any) {
    console.error('✗ 筛选失败:', error.response?.data || error.message);
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('========================================');
  console.log('学号管理 API 测试');
  console.log('========================================');

  try {
    await adminLogin();
    await createTestUser();
    await createTestStudentId();
    await testGetStudentIdStats();
    await testGetStudentIds();
    await testGetStudentIdById();
    await testAssignStudentId();
    await testLockStudentId();
    await testUnlockStudentId();
    await testUnbindStudentId();
    await testFilterByStatus();

    console.log('\n========================================');
    console.log('✓ 所有测试完成');
    console.log('========================================\n');
  } catch (error) {
    console.log('\n========================================');
    console.log('✗ 测试中断');
    console.log('========================================\n');
    process.exit(1);
  }
}

// 运行测试
runTests();
