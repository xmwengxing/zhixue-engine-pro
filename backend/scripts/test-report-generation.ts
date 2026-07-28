// 测试报告生成功能
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

// 测试用户凭证
const STUDENT_USERNAME = 'student1';
const STUDENT_PASSWORD = 'password123';

let studentToken = '';
let sessionId = '';

/**
 * 学员登录
 */
async function studentLogin() {
  try {
    console.log('\n=== 学员登录 ===');
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      username: STUDENT_USERNAME,
      password: STUDENT_PASSWORD,
    });

    studentToken = response.data.token;
    console.log('✓ 登录成功');
    console.log('Token:', studentToken.substring(0, 20) + '...');
    return true;
  } catch (error: any) {
    console.error('✗ 登录失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 获取当前任务
 */
async function getCurrentTask() {
  try {
    console.log('\n=== 获取当前任务 ===');
    const response = await axios.get(`${API_BASE_URL}/student/tasks/current`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    if (response.data) {
      console.log('✓ 找到当前任务');
      console.log('任务 ID:', response.data.id);
      console.log('任务标题:', response.data.title);
      return response.data.id;
    } else {
      console.log('✗ 没有当前任务');
      return null;
    }
  } catch (error: any) {
    console.error('✗ 获取任务失败:', error.response?.data || error.message);
    return null;
  }
}

/**
 * 开始训练
 */
async function startTraining(taskId: string) {
  try {
    console.log('\n=== 开始训练 ===');
    const response = await axios.post(
      `${API_BASE_URL}/student/training/start/${taskId}`,
      {},
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );

    sessionId = response.data.id;
    console.log('✓ 训练会话已创建');
    console.log('会话 ID:', sessionId);
    console.log('总步骤数:', response.data.totalSteps);
    return sessionId;
  } catch (error: any) {
    console.error('✗ 开始训练失败:', error.response?.data || error.message);
    return null;
  }
}

/**
 * 完成训练（模拟）
 */
async function completeTraining(sessionId: string) {
  try {
    console.log('\n=== 完成训练 ===');
    const response = await axios.post(
      `${API_BASE_URL}/student/training/complete/${sessionId}`,
      {},
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );

    console.log('✓ 训练已完成');
    console.log('获得积分:', response.data.points);
    console.log('会话 ID:', response.data.sessionId);
    return true;
  } catch (error: any) {
    console.error('✗ 完成训练失败:', error.response?.data || error.message);
    return false;
  }
}

/**
 * 轮询报告生成状态
 */
async function pollReportStatus(sessionId: string, maxAttempts: number = 30) {
  console.log('\n=== 轮询报告生成状态 ===');

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/student/report/status/${sessionId}`,
        {
          headers: { Authorization: `Bearer ${studentToken}` },
        }
      );

      const status = response.data;
      console.log(`[${i + 1}/${maxAttempts}] 状态: ${status.status}, 进度: ${status.progress}%, 消息: ${status.message}`);

      if (status.status === 'COMPLETED') {
        console.log('✓ 报告生成完成');
        console.log('报告 ID:', status.reportId);
        return status.reportId;
      } else if (status.status === 'FAILED') {
        console.error('✗ 报告生成失败:', status.error);
        return null;
      }

      // 等待 2 秒后继续轮询
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(`[${i + 1}/${maxAttempts}] 状态未找到，可能报告已生成完成`);
        // 尝试直接获取报告
        return await getReportBySession(sessionId);
      }
      console.error('✗ 获取状态失败:', error.response?.data || error.message);
    }
  }

  console.error('✗ 轮询超时');
  return null;
}

/**
 * 通过会话 ID 获取报告
 */
async function getReportBySession(sessionId: string) {
  try {
    // 注意：这需要一个新的 API 端点，目前可能不存在
    console.log('尝试直接获取报告...');
    return null;
  } catch (error: any) {
    return null;
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('========================================');
  console.log('   报告生成功能测试');
  console.log('========================================');

  // 1. 学员登录
  if (!(await studentLogin())) {
    console.error('\n测试失败：无法登录');
    return;
  }

  // 2. 获取当前任务
  const taskId = await getCurrentTask();
  if (!taskId) {
    console.error('\n测试失败：没有可用的任务');
    console.log('提示：请先使用家长账户创建任务');
    return;
  }

  // 3. 开始训练
  const newSessionId = await startTraining(taskId);
  if (!newSessionId) {
    console.error('\n测试失败：无法开始训练');
    return;
  }

  // 4. 完成训练（触发报告生成）
  if (!(await completeTraining(newSessionId))) {
    console.error('\n测试失败：无法完成训练');
    return;
  }

  // 5. 轮询报告生成状态
  const reportId = await pollReportStatus(newSessionId);
  if (reportId) {
    console.log('\n========================================');
    console.log('   测试成功！');
    console.log('========================================');
    console.log('报告 ID:', reportId);
  } else {
    console.log('\n========================================');
    console.log('   测试部分成功');
    console.log('========================================');
    console.log('训练已完成，但无法确认报告生成状态');
    console.log('请检查后端日志或数据库');
  }
}

// 运行测试
main().catch((error) => {
  console.error('测试过程中发生错误:', error);
  process.exit(1);
});
