/**
 * 为任务管理功能创建测试数据
 * 
 * 使用方法:
 * npx ts-node backend/scripts/seed-task-test-data.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始创建任务管理测试数据...\n');

  try {
    // 1. 创建家长用户
    console.log('1️⃣  创建家长用户...');
    const parentPassword = await bcrypt.hash('password123', 10);
    
    const parent = await prisma.user.upsert({
      where: { username: 'parent1' },
      update: {},
      create: {
        username: 'parent1',
        passwordHash: parentPassword,
        role: 'PARENT',
        email: 'parent1@example.com',
        status: 'ACTIVE',
      },
    });
    console.log(`   ✅ 家长用户创建成功: ${parent.username} (ID: ${parent.id})`);

    // 2. 创建学员用户
    console.log('\n2️⃣  创建学员用户...');
    const studentPassword = await bcrypt.hash('password123', 10);
    
    const student = await prisma.user.upsert({
      where: { username: 'student1' },
      update: {},
      create: {
        username: 'student1',
        passwordHash: studentPassword,
        role: 'STUDENT',
        email: 'student1@example.com',
        status: 'ACTIVE',
      },
    });
    console.log(`   ✅ 学员用户创建成功: ${student.username} (ID: ${student.id})`);

    // 3. 创建学员档案
    console.log('\n3️⃣  创建学员档案...');
    const profile = await prisma.studentProfile.upsert({
      where: { userId: student.id },
      update: {},
      create: {
        userId: student.id,
        realName: '张小明',
        grade: '七年级',
        materialVersion: '人教版',
        subjectLevels: {
          语文: 'good',
          数学: 'average',
          英语: 'good',
          物理: 'weak',
          化学: 'average',
        },
        completeness: 100,
      },
    });
    console.log(`   ✅ 学员档案创建成功: ${profile.realName}`);

    // 4. 建立亲子关系
    console.log('\n4️⃣  建立亲子关系...');
    await prisma.parentChildRelation.upsert({
      where: {
        parentId_studentId: {
          parentId: parent.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        parentId: parent.id,
        studentId: student.id,
        relation: '父亲',
        status: 'ACTIVE',
      },
    });
    console.log(`   ✅ 亲子关系建立成功`);

    // 5. 创建教材体系（如果不存在）
    console.log('\n5️⃣  创建教材体系...');
    
    // 创建版本节点
    const version = await prisma.materialNode.upsert({
      where: { id: 'version-renjiao' },
      update: {},
      create: {
        id: 'version-renjiao',
        name: '人教版',
        type: 'VERSION',
        order: 1,
      },
    });
    console.log(`   ✅ 版本节点: ${version.name}`);

    // 创建年级节点
    const grade = await prisma.materialNode.upsert({
      where: { id: 'grade-7' },
      update: {},
      create: {
        id: 'grade-7',
        name: '七年级',
        type: 'GRADE',
        parentId: version.id,
        order: 1,
      },
    });
    console.log(`   ✅ 年级节点: ${grade.name}`);

    // 创建科目节点
    const subjects = [
      { id: 'subject-chinese', name: '语文', order: 1 },
      { id: 'subject-math', name: '数学', order: 2 },
      { id: 'subject-english', name: '英语', order: 3 },
    ];

    for (const subjectData of subjects) {
      const subject = await prisma.materialNode.upsert({
        where: { id: subjectData.id },
        update: {},
        create: {
          id: subjectData.id,
          name: subjectData.name,
          type: 'SUBJECT',
          parentId: grade.id,
          order: subjectData.order,
        },
      });
      console.log(`   ✅ 科目节点: ${subject.name}`);

      // 为每个科目创建单元
      for (let i = 1; i <= 3; i++) {
        const unit = await prisma.materialNode.upsert({
          where: { id: `${subjectData.id}-unit-${i}` },
          update: {},
          create: {
            id: `${subjectData.id}-unit-${i}`,
            name: `第${i}单元`,
            type: 'UNIT',
            parentId: subject.id,
            order: i,
          },
        });
        console.log(`      ✅ 单元节点: ${subject.name} - ${unit.name}`);

        // 为每个单元创建一些题目
        for (let j = 1; j <= 5; j++) {
          await prisma.question.upsert({
            where: { id: `${subjectData.id}-unit-${i}-q-${j}` },
            update: {},
            create: {
              id: `${subjectData.id}-unit-${i}-q-${j}`,
              materialNodeId: unit.id,
              type: 'CHOICE',
              content: {
                question: `${subject.name}第${i}单元题目${j}`,
                options: ['A选项', 'B选项', 'C选项', 'D选项'],
              },
              answer: 'A',
              difficulty: Math.floor(Math.random() * 5) + 1,
              knowledgePoints: [`知识点${j}`],
            },
          });
        }
      }
    }

    console.log('\n✅ 所有测试数据创建完成！');
    console.log('\n📝 测试账号信息:');
    console.log('   家长账号: parent1 / password123');
    console.log('   学员账号: student1 / password123');
    console.log(`   家长 ID: ${parent.id}`);
    console.log(`   学员 ID: ${student.id}`);
  } catch (error) {
    console.error('❌ 创建测试数据失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
