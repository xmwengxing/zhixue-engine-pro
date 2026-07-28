// 测试 AI 对话 API
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

async function testAIChat() {
  try {
    console.log('=== 测试 AI 对话 API ===\n');

    // 1. 登录获取 token
    console.log('1. 登录学员账户...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      username: 'student1',
      password: 'password123',
    });

    const token = loginResponse.data.token;
    console.log('✓ 登录成功\n');

    // 2. 获取当前任务
    console.log('2. 获取当前任务...');
    const taskResponse = await axios.get(
      `${API_BASE_URL}/api/student/tasks/current`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const task = taskResponse.data.task;
    if (!task) {
      console.log('✗ 没有可用的任务');
      return;
    }
    console.log(`✓ 找到任务: ${task.title}\n`);

    // 3. 开始训练会话
    console.log('3. 开始训练会话...');
    const sessionResponse = await axios.post(
      `${API_BASE_URL}/api/student/training/start/${task.id}`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const session = sessionResponse.data.session;
    console.log(`✓ 训练会话已创建: ${session.id}\n`);

    // 4. 测试 AI 对话
    console.log('4. 测试 AI 对话...');
    const chatResponse = await axios.post(
      `${API_BASE_URL}/api/student/ai/chat`,
      {
        sessionId: session.id,
        message: '这道题我不太理解，能给我一些提示吗？',
        context: {
          questionId: session.currentQuestion?.id,
        },
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const aiReply = chatResponse.data.reply;
    console.log('✓ AI 回复:');
    console.log(aiReply);
    console.log('\n');

    // 5. 再次对话
    console.log('5. 继续对话...');
    const chatResponse2 = await axios.post(
      `${API_BASE_URL}/api/student/ai/chat`,
      {
        sessionId: session.id,
        message: '我明白了，谢谢！',
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const aiReply2 = chatResponse2.data.reply;
    console.log('✓ AI 回复:');
    console.log(aiReply2);
    console.log('\n');

    console.log('=== 测试完成 ===');
  } catch (error: any) {
    console.error('✗ 测试失败:', error.response?.data || error.message);
  }
}

testAIChat();
