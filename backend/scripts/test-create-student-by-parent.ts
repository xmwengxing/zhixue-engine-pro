import { PrismaClient } from '@prisma/client';
import { parentChildService } from '../src/services/parentChildService';

const prisma = new PrismaClient();

async function testCreateStudent() {
  try {
    // 查找家长
    const parent = await prisma.user.findUnique({
      where: { username: 'shijingtian' },
    });

    if (!parent) {
      console.log('未找到家长 shijingtian');
      return;
    }

    console.log('家长 ID:', parent.id);

    // 查找一个未使用的授权码
    let authCode = await prisma.authCode.findFirst({
      where: {
        status: 'UNUSED',
        expiryDate: {
          gt: new Date(),
        },
      },
    });

    // 如果没有可用的授权码，创建一个新的
    if (!authCode) {
      authCode = await prisma.authCode.create({
        data: {
          code: 'TEST-' + Date.now(),
          status: 'UNUSED',
          expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后过期
        },
      });
    }

    console.log('使用授权码:', authCode.code);

    // 测试创建学员
    console.log('\n开始创建测试学员...');
    const result = await parentChildService.createStudentByParent({
      parentId: parent.id,
      authCode: authCode.code,
      username: 'test_student_' + Date.now(),
      password: 'Test123456',
      profile: {
        name: '测试学员',
        gender: '男',
        birthDate: '2012-06-15',
        grade: 'GRADE_5',
        school: '测试小学',
        learningFoundation: 'GOOD',
        interests: '数学、科学',
        materialVersion: '人教版',
        subjectLevels: {
          数学: '优秀',
          语文: '良好',
        },
      },
      relation: '父亲',
    });

    console.log('\n创建成功！');
    console.log('学员 ID:', result.studentId);
    console.log('用户名:', result.username);
    console.log('学号:', result.studentIdNumber);

    // 验证数据
    const student = await prisma.user.findUnique({
      where: { id: result.studentId },
      include: {
        studentProfile: true,
        studentId: true,
        parentRelations: true,
      },
    });

    console.log('\n验证数据:');
    console.log('档案信息:', student?.studentProfile);
    console.log('学号信息:', student?.studentId);
    console.log('绑定关系数量:', student?.parentRelations.length);

  } catch (error) {
    console.error('测试失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCreateStudent();
