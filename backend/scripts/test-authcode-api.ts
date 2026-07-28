/**
 * 授权码管理 API 测试脚本
 * 
 * 使用方法:
 * npx ts-node backend/scripts/test-authcode-api.ts
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const API_BASE_URL = 'http://localhost:3000/api';

// 测试用的管理员 token（需要先登录获取）
let adminToken = '';

// 测试数据
let testAuthCodeIds: string[] = [];

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
 * 测试获取授权码统计
 */
async function testGetAuthCodeStats() {
  try {
    console.log('\n=== 2. 获取授权码统计 ===');
    const response = await axios.get(`${API_BASE_URL}/admin/auth-codes/stats`, {
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
 * 测试批量生成授权码
 */
async function testGenerateAuthCodes() {
  try {
    console.log('\n=== 3. 批量生成授权码 ===');
    const response = await axios.post(
      `${API_BASE_URL}/admin/auth-codes/generate`,
      {
        count: 5,
        expiryDays: 30,
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    console.log('✓ 生成成功');
    console.log('生成数量:', response.data.data.count);
    console.log('授权码示例:', response.data.data.authCodes.slice(0, 3).map((ac: any) => ac.code));
    
    // 保存授权码 ID 用于后续测试
    testAuthCodeIds = response.data.data.authCodes.map((ac: any) => ac.id);
  } catch (error: any) {
    console.error('✗ 生成失败:', error.response?.data || error.message);
  }
}

/**
 * 测试获取授权码列表
 */
async function testGetAuthCodes() {
  try {
    console.log('\n=== 4. 获取授权码列表 ===');
    const response = await axios.get(`${API_BASE_URL}/admin/auth-codes`, {
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
    console.log('授权码数量:', response.data.data.authCodes.length);
  } catch (error: any) {
    console.error('✗ 获取列表失败:', error.response?.data || error.message);
  }
}

/**
 * 测试获取授权码详情
 */
async function testGetAuthCodeById() {
  try {
    console.log('\n=== 5. 获取授权码详情 ===');
    if (testAuthCodeIds.length === 0) {
      console.log('⚠ 跳过：没有可用的授权码 ID');
      return;
    }

    const response = await axios.get(
      `${API_BASE_URL}/admin/auth-codes/${testAuthCodeIds[0]}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    console.log('✓ 获取详情成功');
    console.log('授权码:', response.data.data.authCode.code);
    console.log('状态:', response.data.data.authCode.status);
    console.log('过期时间:', response.data.data.authCode.expiryDate);
  } catch (error: any) {
    console.error('✗ 获取详情失败:', error.response?.data || error.message);
  }
}

/**
 * 测试按状态筛选
 */
async function testFilterByStatus() {
  try {
    console.log('\n=== 6. 按状态筛选授权码 ===');
    const response = await axios.get(`${API_BASE_URL}/admin/auth-codes`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      params: {
        status: 'UNUSED',
        page: 1,
        limit: 5,
      },
    });

    console.log('✓ 筛选成功');
    console.log('未使用授权码数量:', response.data.data.total);
  } catch (error: any) {
    console.error('✗ 筛选失败:', error.response?.data || error.message);
  }
}

/**
 * 测试导出授权码
 */
async function testExportAuthCodes() {
  try {
    console.log('\n=== 7. 导出授权码为 CSV ===');
    const response = await axios.get(`${API_BASE_URL}/admin/auth-codes/export`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      params: {
        status: 'UNUSED',
      },
      maxRedirects: 0,
      validateStatus: () => true, // 接受所有状态码
    });

    if (response.status === 200 && response.data) {
      console.log('✓ 导出成功');
      console.log('响应状态:', response.status);
      console.log('内容类型:', response.headers['content-type']);
      console.log('数据长度:', response.data.length);
      
      // 尝试保存文件
      try {
        const outputPath = path.join(__dirname, 'auth-codes-export.csv');
        fs.writeFileSync(outputPath, response.data);
        console.log('文件保存至:', outputPath);
      } catch (e) {
        console.log('文件保存失败，但导出功能正常');
      }
    } else {
      console.log('✗ 导出失败，状态码:', response.status);
    }
  } catch (error: any) {
    console.error('✗ 导出失败:', error.message);
  }
}

/**
 * 测试删除授权码
 */
async function testDeleteAuthCode() {
  try {
    console.log('\n=== 8. 删除授权码 ===');
    if (testAuthCodeIds.length === 0) {
      console.log('⚠ 跳过：没有可用的授权码 ID');
      return;
    }

    const response = await axios.delete(
      `${API_BASE_URL}/admin/auth-codes/${testAuthCodeIds[0]}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    console.log('✓ 删除成功');
    console.log('结果:', response.data.message);
  } catch (error: any) {
    console.error('✗ 删除失败:', error.response?.data || error.message);
  }
}

/**
 * 测试参数验证
 */
async function testParameterValidation() {
  try {
    console.log('\n=== 9. 测试参数验证 ===');
    
    // 测试无效的生成数量
    try {
      await axios.post(
        `${API_BASE_URL}/admin/auth-codes/generate`,
        {
          count: 2000, // 超过最大值
          expiryDays: 30,
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );
      console.log('✗ 应该拒绝无效的生成数量');
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('✓ 正确拒绝无效的生成数量');
      }
    }

    // 测试无效的有效期
    try {
      await axios.post(
        `${API_BASE_URL}/admin/auth-codes/generate`,
        {
          count: 5,
          expiryDays: 500, // 超过最大值
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );
      console.log('✗ 应该拒绝无效的有效期');
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('✓ 正确拒绝无效的有效期');
      }
    }
  } catch (error: any) {
    console.error('✗ 参数验证测试失败:', error.message);
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('========================================');
  console.log('授权码管理 API 测试');
  console.log('========================================');

  try {
    await adminLogin();
    await testGetAuthCodeStats();
    await testGenerateAuthCodes();
    await testGetAuthCodes();
    await testGetAuthCodeById();
    await testFilterByStatus();
    await testExportAuthCodes();
    await testDeleteAuthCode();
    await testParameterValidation();

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
