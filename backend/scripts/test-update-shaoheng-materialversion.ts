// 测试更新学员 shaoheng 的教材版本
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testUpdate() {
  try {
    console.log('=== 测试更新学员 shaoheng 的教材版本 ===\n');

    // 查找学员
    const student = await prisma.user.findFirst({
      where: {
        username: 'shaoheng',
        role: 'STUDENT',
      },
    });

    if (!student) {
      console.log('❌ 学员 shaoheng 不存在');
      return;
    }

    console.log('1. 更新前的档案数据:');
    const beforeProfile = await prisma.studentProfile.findUnique({
      where: { userId: student.id },
    });
    console.log(`   - 教材版本: "${beforeProfile?.materialVersion}"`);
    console.log(`   - 年级: "${beforeProfile?.grade}"`);
    console.log(`   - 学校: "${beforeProfile?.school}"`);

    // 模拟前端发送的数据
    const updateData = {
      grade: beforeProfile?.grade || '',
      school: beforeProfile?.school || '',
      materialVersion: '人教版', // 测试值
      learningFoundation: beforeProfile?.learningFoundation || '',
      interests: beforeProfile?.interests || '',
    };

    console.log('\n2. 准备更新的数据:');
    console.log(JSON.stringify(updateData, null, 2));

    // 执行更新
    console.log('\n3. 执行更新...');
    const updatedProfile = await prisma.studentProfile.update({
      where: { userId: student.id },
      data: {
        ...(updateData.grade && { grade: updateData.grade }),
        ...(updateData.school !== undefined && { school: updateData.school }),
        ...(updateData.learningFoundation && { learningFoundation: updateData.learningFoundation }),
        ...(updateData.interests !== undefined && { interests: updateData.interests }),
        ...(updateData.materialVersion !== undefined && { materialVersion: updateData.materialVersion }),
      },
    });

    console.log('✅ 更新成功');

    console.log('\n4. 更新后的档案数据:');
    console.log(`   - 教材版本: "${updatedProfile.materialVersion}"`);
    console.log(`   - 年级: "${updatedProfile.grade}"`);
    console.log(`   - 学校: "${updatedProfile.school}"`);

    // 验证数据是否真的保存了
    console.log('\n5. 重新查询验证:');
    const verifyProfile = await prisma.studentProfile.findUnique({
      where: { userId: student.id },
    });
    console.log(`   - 教材版本: "${verifyProfile?.materialVersion}"`);

  } catch (error) {
    console.error('测试过程中出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testUpdate();
