import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * 创建愿望测试数据
 */
async function seedWishTestData() {
  try {
    console.log('开始创建愿望测试数据...\n');

    // 1. 确保测试用户存在
    const passwordHash = await bcrypt.hash('password123', 10);

    const parentUser = await prisma.user.upsert({
      where: { username: 'parent1' },
      update: {},
      create: {
        username: 'parent1',
        passwordHash,
        role: 'PARENT',
        email: 'parent1@example.com',
        status: 'ACTIVE',
      },
    });
    console.log('✅ 家长用户:', parentUser.username);

    const studentUser = await prisma.user.upsert({
      where: { username: 'student1' },
      update: {},
      create: {
        username: 'student1',
        passwordHash,
        role: 'STUDENT',
        email: 'student1@example.com',
        status: 'ACTIVE',
      },
    });
    console.log('✅ 学员用户:', studentUser.username);

    // 2. 创建学员档案
    const studentProfile = await prisma.studentProfile.upsert({
      where: { userId: studentUser.id },
      update: {},
      create: {
        userId: studentUser.id,
        realName: '张小明',
        grade: '初一',
        materialVersion: '人教版',
        subjectLevels: {
          数学: 'good',
          语文: 'average',
          英语: 'excellent',
        },
        completeness: 80,
      },
    });
    console.log('✅ 学员档案:', studentProfile.realName);

    // 3. 创建亲子关系
    const relation = await prisma.parentChildRelation.upsert({
      where: {
        parentId_studentId: {
          parentId: parentUser.id,
          studentId: studentUser.id,
        },
      },
      update: {},
      create: {
        parentId: parentUser.id,
        studentId: studentUser.id,
        relation: '父亲',
        status: 'ACTIVE',
      },
    });
    console.log('✅ 亲子关系已建立');

    // 4. 给学员添加初始积分
    const existingTransaction = await prisma.pointsTransaction.findFirst({
      where: { studentId: studentUser.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!existingTransaction) {
      await prisma.pointsTransaction.create({
        data: {
          studentId: studentUser.id,
          amount: 200,
          type: 'TASK_COMPLETE',
          balance: 200,
        },
      });
      console.log('✅ 初始积分: 200');
    } else {
      console.log('✅ 当前积分:', existingTransaction.balance);
    }

    // 5. 创建测试愿望
    const wish1 = await prisma.wish.create({
      data: {
        studentId: studentUser.id,
        description: '我想要一个新的篮球',
        requiredPoints: 50,
        imageUrl: 'https://example.com/basketball.jpg',
        status: 'PENDING',
      },
    });
    console.log('✅ 创建愿望 1:', wish1.description);

    const wish2 = await prisma.wish.create({
      data: {
        studentId: studentUser.id,
        description: '我想去游乐园玩一天',
        requiredPoints: 80,
        status: 'PENDING',
      },
    });
    console.log('✅ 创建愿望 2:', wish2.description);

    const wish3 = await prisma.wish.create({
      data: {
        studentId: studentUser.id,
        description: '我想要一套新的文具',
        requiredPoints: 30,
        status: 'PENDING',
      },
    });
    console.log('✅ 创建愿望 3:', wish3.description);

    console.log('\n✅ 愿望测试数据创建完成！');
    console.log('\n测试账户信息:');
    console.log('家长: parent1 / password123');
    console.log('学员: student1 / password123');
    console.log(`\n学员 ID: ${studentUser.id}`);
    console.log(`家长 ID: ${parentUser.id}`);
    console.log('\n待审批愿望:');
    console.log(`- ${wish1.description} (${wish1.requiredPoints} 积分)`);
    console.log(`- ${wish2.description} (${wish2.requiredPoints} 积分)`);
    console.log(`- ${wish3.description} (${wish3.requiredPoints} 积分)`);
  } catch (error) {
    console.error('❌ 创建测试数据失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedWishTestData();
