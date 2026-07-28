import { PrismaClient } from '@prisma/client';
import { studentIdService } from '../src/services/studentIdService';

const prisma = new PrismaClient();

async function fixStudentId() {
  try {
    // 查找 wsh 用户
    const user = await prisma.user.findUnique({
      where: { username: 'wsh' },
      include: {
        studentId: true,
      },
    });

    if (!user) {
      console.log('未找到用户 wsh');
      return;
    }

    if (user.studentId) {
      console.log('学员已有学号:', user.studentId.studentIdNumber);
      return;
    }

    console.log('为学员 wsh 生成学号...');

    // 生成并分配学号
    const studentIdNumber = await studentIdService.generateStudentId();
    
    await prisma.studentID.create({
      data: {
        studentIdNumber,
        userId: user.id,
        status: 'ASSIGNED',
        assignedAt: new Date(),
      },
    });

    console.log('学号生成成功:', studentIdNumber);

  } catch (error) {
    console.error('修复失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixStudentId();
