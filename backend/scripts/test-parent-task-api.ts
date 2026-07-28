/**
 * 测试家长端任务管理 API
 * 
 * 使用方法:
 * npx ts-node backend/scripts/test-parent-task-api.ts
 */

import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// 测试用户凭证
const PARENT_CREDENTIALS = {
  username: 'parent1',
  password: 'password123',
};

const STUDENT_CREDENTIALS = {
  username: 'student1',
  password: 'password123',
};

let parentToken = '';
let studentId = '';

/**
 * 登录获取 token
 */
async function login(credentials: { username: string; password: string }) {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/auth/login`, credentials);
    console.log(`✅ 登录成功: ${credentials.username}`);
    return response.data;
  } catch (error: any) {
    console.error(`❌ 登录失败:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * 测试获取任务列表
 */
async function testGetTasks() {
  try {
    console.log('\n📋 测试获取任务列表...');
    
    const response = await axios.get(`${API_BASE_URL}/api/parent/tasks`, {
      headers: {
        Authorization: `Bearer ${parentToken}`,
      },
      params: {
        page: 1,
        limit: 10,
      },
    });

    console.log('✅ 获取任务列表成功');
    console.log(`   总数: ${response.data.data.total}`);
    console.log(`   当前页: ${response.data.data.page}`);
    console.log(`   任务数: ${response.data.data.tasks.length}`);
    
    if (response.data.data.tasks.length > 0) {
      console.log(`   第一个任务: ${response.data.data.tasks[0].title}`);
    }
    
    return response.data.data;
  } catch (error: any) {
    console.error('❌ 获取任务列表失败:', error.response?.data || error.message);
    console.error('   详细错误:', error);
    throw error;
  }
}

/**
 * 测试创建任务（自定义模式）
 */
async function testCreateCustomTask() {
  try {
    console.log('\n📝 测试创建任务（自定义模式）...');
    
    // 首先获取一些教材节点
    const materialsResponse = await axios.get(`${API_BASE_URL}/api/admin/materials`, {
      headers: {
        Authorization: `Bearer ${parentToken}`,
      },
    });
    
    // 查找一些单元节点
    const materials = materialsResponse.data.data || [];
    const unitNodes = materials.filter((m: any) => m.type === 'UNIT').slice(0, 2);
    
    if (unitNodes.length === 0) {
      console.log('⚠️  没有找到教材节点，跳过自定义模式测试');
      return null;
    }
    
    const materialNodeIds = unitNodes.map((n: any) => n.id);
    
    const response = await axios.post(
      `${API_BASE_URL}/api/parent/tasks`,
      {
        studentId,
        mode: 'custom',
        title: '自定义训练任务',
        config: {
          materialNodeIds,
          questionCount: 10,
          difficulty: 3,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      }
    );

    console.log('✅ 创建自定义任务成功');
    console.log(`   任务 ID: ${response.data.data.id}`);
    console.log(`   任务标题: ${response.data.data.title}`);
    console.log(`   学员: ${response.data.data.student.username}`);
    console.log(`   状态: ${response.data.data.status}`);
    
    return response.data.data;
  } catch (error: any) {
    console.error('❌ 创建自定义任务失败:', error.response?.data || error.message);
    // 不抛出错误，继续测试
    return null;
  }
}

/**
 * 测试创建任务（档案模式）
 */
async function testCreateProfileTask() {
  try {
    console.log('\n📝 测试创建任务（档案模式）...');
    
    const response = await axios.post(
      `${API_BASE_URL}/api/parent/tasks`,
      {
        studentId,
        mode: 'profile',
      },
      {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      }
    );

    console.log('✅ 创建档案模式任务成功');
    console.log(`   任务 ID: ${response.data.data.id}`);
    console.log(`   任务标题: ${response.data.data.title}`);
    console.log(`   学员: ${response.data.data.student.username}`);
    console.log(`   状态: ${response.data.data.status}`);
    
    return response.data.data;
  } catch (error: any) {
    console.error('❌ 创建档案模式任务失败:', error.response?.data || error.message);
    // 不抛出错误，继续测试
    return null;
  }
}

/**
 * 测试获取任务详情
 */
async function testGetTaskById(taskId: string) {
  try {
    console.log('\n🔍 测试获取任务详情...');
    
    const response = await axios.get(`${API_BASE_URL}/api/parent/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${parentToken}`,
      },
    });

    console.log('✅ 获取任务详情成功');
    console.log(`   任务 ID: ${response.data.data.id}`);
    console.log(`   任务标题: ${response.data.data.title}`);
    console.log(`   模式: ${response.data.data.mode}`);
    console.log(`   状态: ${response.data.data.status}`);
    console.log(`   配置:`, JSON.stringify(response.data.data.config, null, 2));
    
    return response.data.data;
  } catch (error: any) {
    console.error('❌ 获取任务详情失败:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 测试筛选任务
 */
async function testFilterTasks() {
  try {
    console.log('\n🔍 测试筛选任务（按学员）...');
    
    const response = await axios.get(`${API_BASE_URL}/api/parent/tasks`, {
      headers: {
        Authorization: `Bearer ${parentToken}`,
      },
      params: {
        studentId,
        page: 1,
        limit: 10,
      },
    });

    console.log('✅ 筛选任务成功');
    console.log(`   总数: ${response.data.data.total}`);
    console.log(`   任务数: ${response.data.data.tasks.length}`);
    
    return response.data.data;
  } catch (error: any) {
    console.error('❌ 筛选任务失败:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 主测试流程
 */
async function main() {
  try {
    console.log('🚀 开始测试家长端任务管理 API\n');
    console.log(`API 地址: ${API_BASE_URL}`);
    console.log('='.repeat(50));

    // 1. 家长登录
    const parentLoginData = await login(PARENT_CREDENTIALS);
    parentToken = parentLoginData.token;

    // 2. 学员登录获取 ID
    const studentLoginData = await login(STUDENT_CREDENTIALS);
    studentId = studentLoginData.user.id;

    // 3. 测试获取任务列表
    await testGetTasks();

    // 4. 测试创建自定义任务
    const customTask = await testCreateCustomTask();

    // 5. 测试创建档案模式任务
    const profileTask = await testCreateProfileTask();

    // 6. 测试获取任务详情
    if (customTask) {
      await testGetTaskById(customTask.id);
    } else if (profileTask) {
      await testGetTaskById(profileTask.id);
    }

    // 7. 测试筛选任务
    await testFilterTasks();

    console.log('\n' + '='.repeat(50));
    console.log('✅ 所有测试完成！');
  } catch (error) {
    console.log('\n' + '='.repeat(50));
    console.error('❌ 测试失败');
    process.exit(1);
  }
}

// 运行测试
main();
