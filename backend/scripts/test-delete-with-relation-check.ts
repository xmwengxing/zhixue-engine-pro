/**
 * 测试删除用户时的亲子关系检查功能
 * 
 * 测试场景：
 * 1. 创建家长和学员账户
 * 2. 建立亲子绑定关系
 * 3. 尝试删除有绑定关系的家长（应该失败）
 * 4. 尝试删除有绑定关系的学员（应该失败）
 * 5. 解绑亲子关系
 * 6. 再次尝试删除（应该成功）
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
 * 创建测试用户
 */
async function createTestUsers(adminToken: string) {
  logSection('步骤1：创建测试用户');

  try {
    const timestamp = Date.now();

    // 1. 创建家长账户
    logInfo('创建家长账户...');
    const parentUsername = `test_parent_${timestamp}`;
    const parentResponse = await axios.post(
      `${API_BASE_URL}/api/admin/users`,
      {
        username: parentUsername,
        password: 'test123456',
        role: 'PARENT',
        email: `parent_${timestamp}@test.com`,
        realName: '测试家长',
        gender: '男',
        phone: '13800138000',
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const parentId = parentResponse.data.data.user.id;
    logSuccess(`家长账户创建成功: ${parentUsername} (ID: ${parentId})`);

    // 2. 创建授权码
    logInfo('创建授权码...');
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

    // 3. 创建学员账户
    logInfo('创建学员账户...');
    const studentUsername = `test_student_${timestamp}`;
    const studentResponse = await axios.post(
      `${API_BASE_URL}/api/admin/users`,
      {
        username: studentUsername,
        password: 'test123456',
        role: 'STUDENT',
        authCode,
        studentName: '测试学员',
        studentGender: '女',
        birthDate: '2010-01-01',
        grade: '初一',
        school: '测试中学',
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const studentId = studentResponse.data.data.user.id;
    const studentIdNumber = studentResponse.data.data.studentIdNumber;
    logSuccess(`学员账户创建成功: ${studentUsername} (ID: ${studentId}, 学号: ${studentIdNumber})`);

    return {
      parentId,
      parentUsername,
      studentId,
      studentUsername,
      studentIdNumber,
    };
  } catch (error: any) {
    logError(`创建测试用户失败: ${error.response?.data?.error?.message || error.message}`);
    throw error;
  }
}

/**
 * 建立亲子绑定关系
 */
async function createRelation(
  adminToken: string,
  parentId: string,
  studentId: string
): Promise<string> {
  logSection('步骤2：建立亲子绑定关系');

  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/admin/relations`,
      {
        parentId,
        studentId,
        relation: '父亲',
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const relationId = response.data.data.relation.id;
    logSuccess(`亲子关系绑定成功 (关系ID: ${relationId})`);
    return relationId;
  } catch (error: any) {
    logError(`建立亲子关系失败: ${error.response?.data?.error?.message || error.message}`);
    throw error;
  }
}

/**
 * 测试删除有绑定关系的用户（应该失败）
 */
async function testDeleteWithRelation(
  adminToken: string,
  userId: string,
  username: string,
  userType: string
) {
  logSection(`步骤3：尝试删除有绑定关系的${userType}（应该失败）`);

  try {
    await axios.delete(`${API_BASE_URL}/api/admin/users/${userId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // 如果没有抛出错误，说明测试失败
    logError(`删除成功了，但应该失败！${userType}有活跃的亲子绑定关系`);
    return false;
  } catch (error: any) {
    const errorMessage = error.response?.data?.error?.message || '';
    const errorCode = error.response?.data?.error?.code || '';

    if (errorCode === 'HAS_ACTIVE_RELATIONS' && errorMessage.includes('亲子绑定关系')) {
      logSuccess(`✓ 正确阻止删除：${errorMessage}`);
      return true;
    } else {
      logError(`错误类型不正确: ${errorCode} - ${errorMessage}`);
      return false;
    }
  }
}

/**
 * 解绑亲子关系
 */
async function unbindRelation(adminToken: string, relationId: string) {
  logSection('步骤4：解绑亲子关系');

  try {
    await axios.delete(`${API_BASE_URL}/api/admin/relations/${relationId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    logSuccess('亲子关系解绑成功');

    // 验证关系状态
    const relation = await prisma.parentChildRelation.findUnique({
      where: { id: relationId },
    });

    if (relation && relation.status === 'UNBOUND') {
      logSuccess('关系状态已更新为 UNBOUND');
    } else {
      logWarning('关系状态验证失败');
    }
  } catch (error: any) {
    logError(`解绑亲子关系失败: ${error.response?.data?.error?.message || error.message}`);
    throw error;
  }
}

/**
 * 测试删除已解绑的用户（应该成功）
 */
async function testDeleteAfterUnbind(
  adminToken: string,
  userId: string,
  username: string,
  userType: string
) {
  logSection(`步骤5：删除已解绑的${userType}（应该成功）`);

  try {
    const response = await axios.delete(
      `${API_BASE_URL}/api/admin/users/${userId}`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    if (response.data.success) {
      logSuccess(`${userType}删除成功`);

      // 验证用户状态
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (user && user.status === 'DELETED') {
        logSuccess(`用户状态已更新为 DELETED`);
      } else {
        logWarning('用户状态验证失败');
      }

      return true;
    } else {
      logError('删除失败');
      return false;
    }
  } catch (error: any) {
    logError(`删除失败: ${error.response?.data?.error?.message || error.message}`);
    return false;
  }
}

/**
 * 清理测试数据
 */
async function cleanup(
  adminToken: string,
  parentId: string,
  studentId: string
) {
  logSection('清理测试数据');

  try {
    // 检查用户是否已删除
    const parent = await prisma.user.findUnique({ where: { id: parentId } });
    const student = await prisma.user.findUnique({ where: { id: studentId } });

    // 如果用户未删除，尝试删除
    if (parent && parent.status !== 'DELETED') {
      try {
        await axios.delete(`${API_BASE_URL}/api/admin/users/${parentId}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        logInfo('清理家长账户');
      } catch (error) {
        // 忽略错误
      }
    }

    if (student && student.status !== 'DELETED') {
      try {
        await axios.delete(`${API_BASE_URL}/api/admin/users/${studentId}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        logInfo('清理学员账户');
      } catch (error) {
        // 忽略错误
      }
    }

    logSuccess('测试数据清理完成');
  } catch (error) {
    logWarning('清理测试数据时出现错误（可忽略）');
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log(`${colors.blue}
╔════════════════════════════════════════════════════════════╗
║     删除用户时的亲子关系检查功能测试                        ║
╚════════════════════════════════════════════════════════════╝
${colors.reset}`);

  let parentId = '';
  let studentId = '';

  try {
    // 管理员登录
    const adminToken = await adminLogin();

    // 创建测试用户
    const users = await createTestUsers(adminToken);
    parentId = users.parentId;
    studentId = users.studentId;

    // 建立亲子绑定关系
    const relationId = await createRelation(adminToken, parentId, studentId);

    // 测试删除有绑定关系的家长（应该失败）
    const parentDeleteBlocked = await testDeleteWithRelation(
      adminToken,
      parentId,
      users.parentUsername,
      '家长'
    );

    // 测试删除有绑定关系的学员（应该失败）
    const studentDeleteBlocked = await testDeleteWithRelation(
      adminToken,
      studentId,
      users.studentUsername,
      '学员'
    );

    // 解绑亲子关系
    await unbindRelation(adminToken, relationId);

    // 测试删除已解绑的家长（应该成功）
    const parentDeleteSuccess = await testDeleteAfterUnbind(
      adminToken,
      parentId,
      users.parentUsername,
      '家长'
    );

    // 测试删除已解绑的学员（应该成功）
    const studentDeleteSuccess = await testDeleteAfterUnbind(
      adminToken,
      studentId,
      users.studentUsername,
      '学员'
    );

    // 测试总结
    logSection('测试总结');

    const allTestsPassed =
      parentDeleteBlocked &&
      studentDeleteBlocked &&
      parentDeleteSuccess &&
      studentDeleteSuccess;

    if (allTestsPassed) {
      logSuccess('✓ 所有测试通过！');
      console.log(`
${colors.green}测试结果：
  ✓ 有绑定关系的家长无法删除
  ✓ 有绑定关系的学员无法删除
  ✓ 解绑后的家长可以删除
  ✓ 解绑后的学员可以删除${colors.reset}
      `);
    } else {
      logError('部分测试失败');
    }
  } catch (error: any) {
    logError(`测试过程中发生错误: ${error.message}`);
    
    // 尝试清理
    if (parentId || studentId) {
      try {
        const adminToken = await adminLogin();
        await cleanup(adminToken, parentId, studentId);
      } catch (cleanupError) {
        // 忽略清理错误
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
main();
