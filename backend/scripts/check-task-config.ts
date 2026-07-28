// 检查任务配置
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTaskConfig() {
  try {
    console.log('=== 检查任务配置 ===\n');

    // 查找最新创建的任务
    const task = await prisma.task.findFirst({
      where: {
        id: '0aa0f927-94cc-4f0a-b471-174f3be3f589',
      },
      include: {
        student: {
          select: {
            username: true,
          },
        },
        creator: {
          select: {
            username: true,
          },
        },
      },
    });

    if (!task) {
      console.log('❌ 任务不存在');
      return;
    }

    console.log('✅ 任务信息:');
    console.log(`   - ID: ${task.id}`);
    console.log(`   - 标题: ${task.title}`);
    console.log(`   - 学员: ${task.student.username}`);
    console.log(`   - 创建者: ${task.creator.username}`);
    console.log(`   - 状态: ${task.status}`);
    console.log(`   - 模式: ${task.mode || '未设置'}`);
    console.log(`   - 创建时间: ${task.createdAt}`);

    console.log('\n任务目标:');
    console.log(task.goal);

    console.log('\n任务配置:');
    console.log(JSON.stringify(task.config, null, 2));

  } catch (error) {
    console.error('检查过程中出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTaskConfig();
