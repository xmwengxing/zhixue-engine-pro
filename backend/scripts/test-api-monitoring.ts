/**
 * 测试 API 监控功能
 * 用于验证 API 监控端点是否正常工作
 */

import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// 测试用的管理员凭证
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'password123',
};

async function testAPIMonitoring() {
  console.log('🔍 开始测试 API 监控功能...\n');

  try {
    // 1. 管理员登录
    console.log('1️⃣ 管理员登录...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, ADMIN_CREDENTIALS);
    
    if (!loginResponse.data.success) {
      throw new Error('管理员登录失败');
    }

    const token = loginResponse.data.data.token;
    console.log('✅ 管理员登录成功\n');

    // 设置请求头
    const headers = {
      Authorization: `Bearer ${token}`,
    };

    // 2. 测试获取 API 指标
    console.log('2️⃣ 测试获取 API 指标...');
    try {
      const metricsResponse = await axios.get(`${API_BASE_URL}/admin/api-metrics`, { headers });
      
      if (metricsResponse.data.success) {
        console.log('✅ API 指标获取成功');
        console.log('📊 指标摘要:', JSON.stringify(metricsResponse.data.data.summary, null, 2));
        console.log('📊 服务商统计数量:', metricsResponse.data.data.providerStats?.length || 0);
        console.log('📊 时间序列数据点:', metricsResponse.data.data.timeSeriesData?.length || 0);
      } else {
        console.log('❌ API 指标获取失败:', metricsResponse.data.message);
      }
    } catch (error: any) {
      console.log('❌ API 指标请求失败:', error.response?.status, error.response?.data?.message || error.message);
    }
    console.log('');

    // 3. 测试获取 AI 服务商列表
    console.log('3️⃣ 测试获取 AI 服务商列表...');
    try {
      const providersResponse = await axios.get(`${API_BASE_URL}/admin/ai-providers`, { headers });
      
      if (providersResponse.data.success) {
        console.log('✅ AI 服务商列表获取成功');
        console.log('📋 服务商数量:', providersResponse.data.data?.length || 0);
        
        if (providersResponse.data.data?.length > 0) {
          console.log('📋 服务商列表:');
          providersResponse.data.data.forEach((provider: any) => {
            console.log(`   - ${provider.name} (${provider.type}) - 状态: ${provider.status}`);
          });
        }
      } else {
        console.log('❌ AI 服务商列表获取失败:', providersResponse.data.message);
      }
    } catch (error: any) {
      console.log('❌ AI 服务商列表请求失败:', error.response?.status, error.response?.data?.message || error.message);
    }
    console.log('');

    // 4. 测试连通性测试
    console.log('4️⃣ 测试 AI 服务商连通性测试...');
    try {
      const testResponse = await axios.post(`${API_BASE_URL}/admin/ai-providers/test-all`, {}, { headers });
      
      if (testResponse.data.success) {
        console.log('✅ 连通性测试完成');
        console.log('🔗 测试结果:');
        testResponse.data.data.forEach((result: any) => {
          const statusIcon = result.status === 'healthy' ? '✅' : result.status === 'degraded' ? '⚠️' : '❌';
          console.log(`   ${statusIcon} ${result.name}: ${result.status} (延迟: ${result.latency}ms)`);
          if (result.error) {
            console.log(`      错误: ${result.error}`);
          }
        });
      } else {
        console.log('❌ 连通性测试失败:', testResponse.data.message);
      }
    } catch (error: any) {
      console.log('❌ 连通性测试请求失败:', error.response?.status, error.response?.data?.message || error.message);
    }
    console.log('');

    // 5. 测试错误率告警
    console.log('5️⃣ 测试错误率告警...');
    try {
      const alertResponse = await axios.get(`${API_BASE_URL}/admin/api-metrics/alert`, { headers });
      
      if (alertResponse.data.success) {
        console.log('✅ 错误率告警检查成功');
        console.log('⚠️ 告警信息:', JSON.stringify(alertResponse.data.data, null, 2));
      } else {
        console.log('❌ 错误率告警检查失败:', alertResponse.data.message);
      }
    } catch (error: any) {
      console.log('❌ 错误率告警请求失败:', error.response?.status, error.response?.data?.message || error.message);
    }
    console.log('');

    // 6. 测试限流器状态
    console.log('6️⃣ 测试限流器状态...');
    try {
      const rateLimiterResponse = await axios.get(`${API_BASE_URL}/admin/rate-limiter/status`, { headers });
      
      if (rateLimiterResponse.data.success) {
        console.log('✅ 限流器状态获取成功');
        console.log('🚦 限流器状态:', JSON.stringify(rateLimiterResponse.data.data, null, 2));
      } else {
        console.log('❌ 限流器状态获取失败:', rateLimiterResponse.data.message);
      }
    } catch (error: any) {
      console.log('❌ 限流器状态请求失败:', error.response?.status, error.response?.data?.message || error.message);
    }
    console.log('');

    console.log('✅ API 监控功能测试完成！');

  } catch (error: any) {
    console.error('❌ 测试过程中发生错误:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
    process.exit(1);
  }
}

// 运行测试
testAPIMonitoring();
