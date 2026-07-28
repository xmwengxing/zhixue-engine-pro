import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateProfile() {
  try {
    // 更新 wsh 学员的档案信息
    const updated = await prisma.studentProfile.updateMany({
      where: {
        user: {
          username: 'wsh',
        },
      },
      data: {
        realName: '王小华',
        gender: '男',
        birthDate: new Date('2010-05-15'),
        grade: 'GRADE_6',
        school: '实验小学',
        learningFoundation: 'MEDIUM',
        interests: '数学、编程、阅读',
        materialVersion: '人教版',
        subjectLevels: {
          数学: '良好',
          语文: '优秀',
          英语: '中等',
        },
        completeness: 80,
      },
    });

    console.log('更新成功，影响行数:', updated.count);

    // 验证更新结果
    const user = await prisma.user.findUnique({
      where: { username: 'wsh' },
      include: {
        studentProfile: true,
      },
    });

    console.log('\n更新后的档案信息:');
    console.log(JSON.stringify(user?.studentProfile, null, 2));
  } catch (error) {
    console.error('更新失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateProfile();
