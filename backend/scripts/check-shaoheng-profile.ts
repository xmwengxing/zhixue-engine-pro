// 检查学员 shaoheng 的档案数据
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProfile() {
  try {
    console.log('=== 检查学员 shaoheng 的档案数据 ===\n');

    // 查找学员
    const student = await prisma.user.findFirst({
      where: {
        username: 'shaoheng',
        role: 'STUDENT',
      },
      include: {
        studentProfile: true,
        studentId: true,
      },
    });

    if (!student) {
      console.log('❌ 学员 shaoheng 不存在');
      return;
    }

    console.log('✅ 学员信息:');
    console.log(`   - ID: ${student.id}`);
    console.log(`   - 用户名: ${student.username}`);
    console.log(`   - 学号: ${student.studentId?.studentIdNumber || '未设置'}`);
    console.log(`   - 角色: ${student.role}`);

    if (!student.studentProfile) {
      console.log('\n❌ 学员档案不存在');
      return;
    }

    console.log('\n✅ 档案信息:');
    console.log(`   - 档案ID: ${student.studentProfile.id}`);
    console.log(`   - 真实姓名: "${student.studentProfile.realName}"`);
    console.log(`   - 性别: "${student.studentProfile.gender}"`);
    console.log(`   - 出生日期: ${student.studentProfile.birthDate || '未填写'}`);
    console.log(`   - 年级: "${student.studentProfile.grade}"`);
    console.log(`   - 学校: "${student.studentProfile.school || ''}"`);
    console.log(`   - 教材版本: "${student.studentProfile.materialVersion}"`);
    console.log(`   - 学习基础: "${student.studentProfile.learningFoundation || ''}"`);
    console.log(`   - 兴趣爱好: "${student.studentProfile.interests || ''}"`);
    console.log(`   - 完整度: ${student.studentProfile.completeness}%`);
    console.log(`   - 创建时间: ${student.studentProfile.createdAt}`);
    console.log(`   - 更新时间: ${student.studentProfile.updatedAt}`);

    // 检查 materialVersion 字段的具体值
    console.log('\n=== 教材版本字段详细信息 ===');
    console.log(`   - 类型: ${typeof student.studentProfile.materialVersion}`);
    console.log(`   - 长度: ${student.studentProfile.materialVersion?.length || 0}`);
    console.log(`   - 是否为空字符串: ${student.studentProfile.materialVersion === ''}`);
    console.log(`   - 是否为 null: ${student.studentProfile.materialVersion === null}`);
    console.log(`   - 原始值: ${JSON.stringify(student.studentProfile.materialVersion)}`);

  } catch (error) {
    console.error('检查过程中出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProfile();
