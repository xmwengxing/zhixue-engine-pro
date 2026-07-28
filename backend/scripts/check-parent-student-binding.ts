import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkBinding() {
  try {
    // 查找家长
    const parent = await prisma.user.findUnique({
      where: { username: 'shijingtian' },
      select: {
        id: true,
        username: true,
        role: true,
      },
    });

    console.log('家长信息:', parent);

    if (!parent) {
      console.log('未找到家长 shijingtian');
      return;
    }

    // 查找绑定关系
    const relations = await prisma.parentChildRelation.findMany({
      where: {
        parentId: parent.id,
      },
      include: {
        student: {
          select: {
            username: true,
            studentProfile: {
              select: {
                realName: true,
              },
            },
          },
        },
      },
    });

    console.log('\n绑定的学员:');
    if (relations.length === 0) {
      console.log('- 无绑定学员');
    } else {
      relations.forEach((rel, index) => {
        console.log(`学员 ${index + 1}:`);
        console.log('  - 用户名:', rel.student.username);
        console.log('  - 姓名:', rel.student.studentProfile?.realName || '(无)');
        console.log('  - 关系:', rel.relation);
        console.log('  - 状态:', rel.status);
        console.log('  - 绑定时间:', rel.bindedAt);
      });
    }

    // 查找学员 wsh
    const student = await prisma.user.findUnique({
      where: { username: 'wsh' },
      select: {
        id: true,
        username: true,
      },
    });

    console.log('\n学员 wsh 信息:', student);

    if (student) {
      // 检查是否有绑定关系
      const binding = await prisma.parentChildRelation.findFirst({
        where: {
          parentId: parent.id,
          studentId: student.id,
        },
      });

      console.log('\nshijingtian 和 wsh 的绑定关系:', binding || '不存在');
    }

  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBinding();
