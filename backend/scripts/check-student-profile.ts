import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStudentProfile() {
  try {
    // 查找用户名为 wsh 的学员
    const user = await prisma.user.findUnique({
      where: { username: 'wsh' },
      include: {
        studentProfile: true,
        studentId: true,
      },
    });

    if (!user) {
      console.log('未找到用户名为 wsh 的学员');
      return;
    }

    console.log('学员基本信息:');
    console.log('- ID:', user.id);
    console.log('- 用户名:', user.username);
    console.log('- 角色:', user.role);
    console.log('- 学号:', user.studentId?.studentIdNumber || '未分配');

    console.log('\n学员档案信息:');
    if (user.studentProfile) {
      console.log(JSON.stringify(user.studentProfile, null, 2));
    } else {
      console.log('该学员没有档案信息');
    }
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStudentProfile();
