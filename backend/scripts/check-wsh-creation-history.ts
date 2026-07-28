import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkHistory() {
  try {
    // 查找 wsh 用户
    const user = await prisma.user.findUnique({
      where: { username: 'wsh' },
      include: {
        studentProfile: true,
        studentId: true,
        usedAuthCode: true,
        parentRelations: {
          include: {
            parent: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      console.log('未找到用户 wsh');
      return;
    }

    console.log('=== 用户 wsh 的完整信息 ===\n');
    
    console.log('基本信息:');
    console.log('- 创建时间:', user.createdAt);
    console.log('- 更新时间:', user.updatedAt);
    console.log('- 角色:', user.role);
    console.log('- 状态:', user.status);

    console.log('\n学号信息:');
    if (user.studentId) {
      console.log('- 学号:', user.studentId.studentIdNumber);
      console.log('- 分配时间:', user.studentId.assignedAt);
    } else {
      console.log('- 未分配学号');
    }

    console.log('\n授权码信息:');
    if (user.usedAuthCode) {
      console.log('- 授权码:', user.usedAuthCode.code);
      console.log('- 使用时间:', user.usedAuthCode.usedAt);
      console.log('- 授权码状态:', user.usedAuthCode.status);
    } else {
      console.log('- 未使用授权码');
    }

    console.log('\n家长绑定信息:');
    if (user.parentRelations.length > 0) {
      user.parentRelations.forEach((rel, index) => {
        console.log(`绑定 ${index + 1}:`);
        console.log('  - 家长用户名:', rel.parent.username);
        console.log('  - 关系:', rel.relation);
        console.log('  - 绑定时间:', rel.bindedAt);
        console.log('  - 状态:', rel.status);
      });
    } else {
      console.log('- 未绑定家长');
    }

    console.log('\n档案信息:');
    if (user.studentProfile) {
      console.log('- 档案创建时间:', user.studentProfile.createdAt);
      console.log('- 档案更新时间:', user.studentProfile.updatedAt);
      console.log('- 真实姓名:', user.studentProfile.realName || '(空)');
      console.log('- 性别:', user.studentProfile.gender || '(空)');
      console.log('- 出生日期:', user.studentProfile.birthDate || '(空)');
      console.log('- 年级:', user.studentProfile.grade || '(空)');
      console.log('- 学校:', user.studentProfile.school || '(空)');
      console.log('- 学习基础:', user.studentProfile.learningFoundation || '(空)');
      console.log('- 兴趣爱好:', user.studentProfile.interests || '(空)');
      console.log('- 教材版本:', user.studentProfile.materialVersion || '(空)');
      console.log('- 完整度:', user.studentProfile.completeness);
    } else {
      console.log('- 无档案信息');
    }

  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkHistory();
