// 测试档案提取模式创建任务的完整流程
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testProfileExtractionMode() {
  console.log('=== 测试档案提取模式创建任务流程 ===\n');

  try {
    // 1. 检查学员 wsh 的档案信息
    console.log('1. 检查学员 wsh 的档案信息...');
    const student = await prisma.user.findFirst({
      where: {
        username: 'wsh',
        role: 'STUDENT',
      },
      include: {
        studentProfile: true,
        studentId: true,
      },
    });

    if (!student) {
      console.error('❌ 学员 wsh 不存在');
      return;
    }

    console.log('✅ 学员信息:');
    console.log(`   - 用户名: ${student.username}`);
    console.log(`   - 学号: ${student.studentId?.studentIdNumber || '未设置'}`);
    console.log(`   - 档案ID: ${student.studentProfile?.id || '未创建'}`);

    if (!student.studentProfile) {
      console.error('❌ 学员档案不存在');
      return;
    }

    console.log('\n   档案详情:');
    console.log(`   - 真实姓名: ${student.studentProfile.realName || '未填写'}`);
    console.log(`   - 性别: ${student.studentProfile.gender || '未填写'}`);
    console.log(`   - 年级: ${student.studentProfile.grade || '未填写'}`);
    console.log(`   - 教材版本: ${student.studentProfile.materialVersion || '未填写'}`);
    console.log(`   - 学校: ${student.studentProfile.school || '未填写'}`);
    console.log(`   - 学习基础: ${student.studentProfile.learningFoundation || '未填写'}`);
    console.log(`   - 兴趣爱好: ${student.studentProfile.interests || '未填写'}`);
    console.log(`   - 完整度: ${student.studentProfile.completeness}%`);

    // 2. 检查必填字段
    console.log('\n2. 检查档案提取模式必填字段...');
    const requiredFields = {
      realName: student.studentProfile.realName,
      grade: student.studentProfile.grade,
      materialVersion: student.studentProfile.materialVersion,
    };

    let allFieldsFilled = true;
    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value || value.trim() === '') {
        console.log(`   ❌ ${field}: 未填写`);
        allFieldsFilled = false;
      } else {
        console.log(`   ✅ ${field}: ${value}`);
      }
    }

    if (!allFieldsFilled) {
      console.error('\n❌ 档案信息不完整，无法使用档案提取模式');
      return;
    }

    // 3. 检查家长绑定关系
    console.log('\n3. 检查家长绑定关系...');
    const bindings = await prisma.parentStudentBinding.findMany({
      where: {
        studentId: student.id,
      },
      include: {
        parent: {
          select: {
            username: true,
          },
        },
      },
    });

    if (bindings.length === 0) {
      console.error('❌ 学员未绑定任何家长');
      return;
    }

    console.log('✅ 家长绑定关系正常');
    bindings.forEach((binding) => {
      console.log(`   - 家长用户名: ${binding.parent.username}`);
      console.log(`   - 绑定状态: ${binding.status}`);
    });

    // 4. 检查 AI 科目老师
    console.log('\n4. 检查 AI 科目老师...');
    const aiTeachers = await prisma.subjectInstruction.findMany({
      select: {
        id: true,
        subject: true,
      },
    });

    if (aiTeachers.length === 0) {
      console.error('❌ 没有可用的 AI 科目老师');
      return;
    }

    console.log(`✅ 找到 ${aiTeachers.length} 个 AI 科目老师:`);
    aiTeachers.forEach((teacher) => {
      console.log(`   - ${teacher.subject} (ID: ${teacher.id})`);
    });

    console.log('\n=== 测试结果 ===');
    console.log('✅ 所有检查通过，档案提取模式可以正常使用');
    console.log('\n建议测试步骤:');
    console.log('1. 使用家长账号 shijingtian 登录');
    console.log('2. 进入任务管理 -> 创建任务');
    console.log('3. 选择"档案提取模式"');
    console.log('4. 选择学员 wsh');
    console.log('5. 选择 AI 科目老师');
    console.log('6. 填写训练目标');
    console.log('7. 点击创建任务');

  } catch (error) {
    console.error('测试过程中出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testProfileExtractionMode();
