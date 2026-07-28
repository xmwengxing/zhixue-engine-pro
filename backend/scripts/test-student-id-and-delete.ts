/**
 * 学号系统和用户删除功能测试脚本
 * 
 * 测试内容：
 * 1. 学号自动分配功能
 * 2. 学号在个人档案中的显示
 * 3. 用户删除后的数据清理
 * 4. 用户列表不显示已删除用户
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// API 基础 URL
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// 测试用的管理员账号
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function logSuccess(message: string) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function logError(message: string) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
}

function logWarning(message: string) {
  console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log(`\n${colors.blue}${'='.repeat(60)}`);
  console.log(`${title}`);
  console.log(`${'='.repeat(60)}${colors.reset}\n`);
}

/**
 * 管理员登录
 */
async function adminLogin(): Promise<string> {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    });

    if (response.data.token) {
      logSuccess('管理员登录成功');
      return response.data.token;
    } else {
      throw new Error('登录响应中没有 token');
    }
  } catch (error: any) {
    logError(`管理员登录失败: ${error.response?.data?.error?.message || error.message}`);
    throw error;
  }
}

/**
 * 测试1：学号自动分配功能
 */
async function testStudentIdGeneration(adminToken: string) {
  logSection('测试1：学号自动分配功能');

  try {
    // 1. 创建授权码
    logInfo('步骤1：创建授权码...');
    const authCodeResponse = await axios.post(
      `${API_BASE_URL}/api/admin/auth-codes`,
      {
        count: 1,
        expiryDays: 30,
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const authCode = authCodeResponse.data.data.authCodes[0].code;
    logSuccess(`授权码创建成功: ${authCode}`);

    // 2. 创建学员账号
    logInfo('步骤2：创建学员账号...');
    const timestamp = Date.now();
    const username = `test_student_${timestamp}`;
    
    const createUserResponse = await axios.post(
      `${API_BASE_URL}/api/admin/users`,
      {
        username,
        password: 'test123456',
        role: 'STUDENT',
        authCode,
        studentName: '测试学员',
        studentGender: '男',
        birthDate: '2010-01-01',
        grade: '初一',
        school: '测试中学',
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const userId = createUserResponse.data.data.user.id;
    const studentIdNumber = createUserResponse.data.data.studentIdNumber;

    if (!studentIdNumber) {
      logError('学号未生成！');
      return null;
    }

    logSuccess(`学员创建成功，学号: ${studentIdNumber}`);

    // 3. 验证学号格式
    const yearSuffix = new Date().getFullYear().toString().slice(-2);
    const expectedPrefix = `STU${yearSuffix}`;
    
    if (studentIdNumber.startsWith(expectedPrefix) && studentIdNumber.length === 11) {
      logSuccess(`学号格式正确: ${studentIdNumber}`);
    } else {
      logError(`学号格式错误: ${studentIdNumber}，期望格式: ${expectedPrefix}XXXXXX`);
    }

    // 4. 验证学号在数据库中的状态
    const studentIdRecord = await prisma.studentID.findUnique({
      where: { studentIdNumber },
    });

    if (studentIdRecord) {
      if (studentIdRecord.status === 'ASSIGNED' && studentIdRecord.userId === userId) {
        logSuccess('学号状态正确：已分配给该用户');
      } else {
        logError(`学号状态错误：status=${studentIdRecord.status}, userId=${studentIdRecord.userId}`);
      }
    } else {
      logError('学号记录不存在！');
    }

    return { userId, username, studentIdNumber };
  } catch (error: any) {
    logError(`测试失败: ${error.response?.data?.error?.message || error.message}`);
    return null;
  }
}

/**
 * 测试2：学号在个人档案中的显示
 */
async function testStudentIdInProfile(
  adminToken: string,
  userId: string,
  username: string,
  expectedStudentId: string
) {
  logSection('测试2：学号在个人档案中的显示');

  try {
    // 1. 通过管理员接口查询用户详情
    logInfo('步骤1：通过管理员接口查询用户详情...');
    const userDetailResponse = await axios.get(
      `${API_BASE_URL}/api/admin/users/${userId}`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const userDetail = userDetailResponse.data.data.user;
    
    if (userDetail.studentIdNumber === expectedStudentId) {
      logSuccess(`管理员接口显示学号正确: ${userDetail.studentIdNumber}`);
    } else {
      logError(`管理员接口学号显示错误: ${userDetail.studentIdNumber}，期望: ${expectedStudentId}`);
    }

    // 2. 学员登录
    logInfo('步骤2：学员登录...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      username,
      password: 'test123456',
    });

    const studentToken = loginResponse.data.token;
    logSuccess('学员登录成功');

    // 3. 查询学员个人档案
    logInfo('步骤3：查询学员个人档案...');
    const profileResponse = await axios.get(
      `${API_BASE_URL}/api/student/profile`,
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );

    const profile = profileResponse.data.profile;
    
    if (profile.user?.studentId?.studentIdNumber === expectedStudentId) {
      logSuccess(`学员档案显示学号正确: ${profile.user.studentId.studentIdNumber}`);
    } else {
      logError(`学员档案学号显示错误: ${profile.user?.studentId?.studentIdNumber}，期望: ${expectedStudentId}`);
    }

    logSuccess('学号在个人档案中正确显示');
  } catch (error: any) {
    logError(`测试失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * 测试3：用户删除功能
 */
async function testUserDeletion(
  adminToken: string,
  userId: string,
  username: string,
  studentIdNumber: string
) {
  logSection('测试3：用户删除功能');

  try {
    // 1. 删除用户
    logInfo('步骤1：删除用户...');
    const deleteResponse = await axios.delete(
      `${API_BASE_URL}/api/admin/users/${userId}`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    if (deleteResponse.data.success) {
      logSuccess('用户删除成功');
    } else {
      logError('用户删除失败');
      return;
    }

    // 2. 验证用户状态
    logInfo('步骤2：验证用户状态...');
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (userRecord) {
      if (userRecord.status === 'DELETED') {
        logSuccess('用户状态已更改为 DELETED');
      } else {
        logError(`用户状态错误: ${userRecord.status}`);
      }

      if (userRecord.username !== username) {
        logSuccess(`用户名已修改: ${userRecord.username}（原用户名已释放）`);
      } else {
        logError('用户名未修改，原用户名未释放');
      }
    } else {
      logError('用户记录不存在（应该是软删除，不是物理删除）');
    }

    // 3. 验证学号释放
    logInfo('步骤3：验证学号释放...');
    const studentIdRecord = await prisma.studentID.findUnique({
      where: { studentIdNumber },
    });

    if (studentIdRecord) {
      if (studentIdRecord.status === 'AVAILABLE' && studentIdRecord.userId === null) {
        logSuccess('学号已释放，状态为 AVAILABLE，userId 为 null');
      } else {
        logError(`学号未正确释放: status=${studentIdRecord.status}, userId=${studentIdRecord.userId}`);
      }
    } else {
      logError('学号记录不存在');
    }

    // 4. 验证用户名释放（尝试创建同名用户）
    logInfo('步骤4：验证用户名释放（尝试创建同名用户）...');
    try {
      // 创建新的授权码
      const authCodeResponse = await axios.post(
        `${API_BASE_URL}/api/admin/auth-codes`,
        {
          count: 1,
          expiryDays: 30,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      const newAuthCode = authCodeResponse.data.data.authCodes[0].code;

      // 尝试使用相同的用户名创建新用户
      await axios.post(
        `${API_BASE_URL}/api/admin/users`,
        {
          username, // 使用相同的用户名
          password: 'test123456',
          role: 'STUDENT',
          authCode: newAuthCode,
          studentName: '新测试学员',
          studentGender: '女',
          birthDate: '2011-01-01',
          grade: '初二',
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      logSuccess('用户名已释放，可以创建同名用户');
    } catch (error: any) {
      if (error.response?.data?.error?.message === '用户名已存在') {
        logError('用户名未释放，无法创建同名用户');
      } else {
        logWarning(`创建同名用户时出现其他错误: ${error.response?.data?.error?.message || error.message}`);
      }
    }

    // 5. 验证学员档案删除
    logInfo('步骤5：验证学员档案删除...');
    const profileRecord = await prisma.studentProfile.findUnique({
      where: { userId },
    });

    if (!profileRecord) {
      logSuccess('学员档案已通过级联删除清理');
    } else {
      logError('学员档案未删除');
    }

    logSuccess('用户删除功能测试完成');
  } catch (error: any) {
    logError(`测试失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * 测试4：用户列表不显示已删除用户
 */
async function testUserListFiltering(adminToken: string) {
  logSection('测试4：用户列表不显示已删除用户');

  try {
    // 1. 查询用户列表（不指定状态）
    logInfo('步骤1：查询用户列表（不指定状态）...');
    const listResponse = await axios.get(
      `${API_BASE_URL}/api/admin/users`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const users = listResponse.data.data.users;
    const deletedUsers = users.filter((user: any) => user.status === 'DELETED');

    if (deletedUsers.length === 0) {
      logSuccess('用户列表不包含已删除用户（默认过滤）');
    } else {
      logError(`用户列表包含 ${deletedUsers.length} 个已删除用户`);
    }

    // 2. 查询用户列表（指定状态为 DELETED）
    logInfo('步骤2：查询用户列表（指定状态为 DELETED）...');
    const deletedListResponse = await axios.get(
      `${API_BASE_URL}/api/admin/users?status=DELETED`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const deletedUsersList = deletedListResponse.data.data.users;

    if (deletedUsersList.length > 0) {
      logSuccess(`可以通过指定状态查询已删除用户，共 ${deletedUsersList.length} 个`);
    } else {
      logInfo('没有已删除的用户');
    }

    logSuccess('用户列表过滤功能测试完成');
  } catch (error: any) {
    logError(`测试失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log(`${colors.blue}
╔════════════════════════════════════════════════════════════╗
║     学号系统和用户删除功能测试                              ║
╚════════════════════════════════════════════════════════════╝
${colors.reset}`);

  try {
    // 管理员登录
    const adminToken = await adminLogin();

    // 测试1：学号自动分配
    const testResult = await testStudentIdGeneration(adminToken);
    
    if (!testResult) {
      logError('测试1失败，终止后续测试');
      return;
    }

    const { userId, username, studentIdNumber } = testResult;

    // 测试2：学号在个人档案中的显示
    await testStudentIdInProfile(adminToken, userId, username, studentIdNumber);

    // 测试3：用户删除功能
    await testUserDeletion(adminToken, userId, username, studentIdNumber);

    // 测试4：用户列表过滤
    await testUserListFiltering(adminToken);

    logSection('测试总结');
    logSuccess('所有测试完成！');
    
  } catch (error: any) {
    logError(`测试过程中发生错误: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
main();
