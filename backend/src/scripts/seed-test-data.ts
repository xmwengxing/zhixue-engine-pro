/**
 * 测试数据种子脚本
 *
 * 用法：npm run db:seed
 *
 * 创建的测试账户：
 * - 管理员: admin / admin
 * - 家长:   parent1 / password123
 * - 学员:   student1 / password123（已与 parent1 绑定亲子关系）
 *
 * 脚本可重复执行（upsert 幂等）。
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 10;

async function main() {
  console.log('开始灌入测试数据...\n');

  // ========== 1. 管理员 ==========
  const adminHash = await bcrypt.hash('admin', BCRYPT_ROUNDS);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminHash, role: 'ADMIN', status: 'ACTIVE' },
    create: {
      username: 'admin',
      passwordHash: adminHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      realName: '系统管理员',
    },
  });
  console.log(`✅ 管理员: admin / admin (id=${admin.id})`);

  // ========== 2. 家长 ==========
  const parentHash = await bcrypt.hash('password123', BCRYPT_ROUNDS);
  const parent = await prisma.user.upsert({
    where: { username: 'parent1' },
    update: { passwordHash: parentHash, role: 'PARENT', status: 'ACTIVE' },
    create: {
      username: 'parent1',
      passwordHash: parentHash,
      role: 'PARENT',
      status: 'ACTIVE',
      realName: '测试家长',
      gender: '男',
    },
  });
  console.log(`✅ 家长: parent1 / password123 (id=${parent.id})`);

  // ========== 3. 学员 ==========
  const studentHash = await bcrypt.hash('password123', BCRYPT_ROUNDS);
  const student = await prisma.user.upsert({
    where: { username: 'student1' },
    update: { passwordHash: studentHash, role: 'STUDENT', status: 'ACTIVE' },
    create: {
      username: 'student1',
      passwordHash: studentHash,
      role: 'STUDENT',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ 学员: student1 / password123 (id=${student.id})`);

  // 学员档案
  await prisma.studentProfile.upsert({
    where: { userId: student.id },
    update: {},
    create: {
      userId: student.id,
      realName: '测试学员',
      gender: '男',
      grade: '五年级',
      school: '实验小学',
      materialVersion: '人教版',
      learningFoundation: '基础扎实，计算能力较强，应用题稍弱',
      interests: '数学、科学实验',
      subjectLevels: { 数学: 'good', 语文: 'average', 英语: 'average' },
      completeness: 90,
    },
  });
  console.log('   └─ 学员档案已创建（五年级/人教版）');

  // 学号（分配给 student1）
  const studentIdNumber = 'S2026001';
  const existingSid = await prisma.studentID.findUnique({
    where: { studentIdNumber },
  });
  if (!existingSid) {
    await prisma.studentID.create({
      data: {
        studentIdNumber,
        status: 'ASSIGNED',
        userId: student.id,
        assignedAt: new Date(),
      },
    });
    console.log(`   └─ 学号 ${studentIdNumber} 已分配`);
  } else {
    console.log(`   └─ 学号 ${studentIdNumber} 已存在，跳过`);
  }

  // ========== 4. 亲子关系绑定 ==========
  await prisma.parentChildRelation.upsert({
    where: {
      parentId_studentId: { parentId: parent.id, studentId: student.id },
    },
    update: { status: 'ACTIVE' },
    create: {
      parentId: parent.id,
      studentId: student.id,
      relation: '父亲',
      status: 'ACTIVE',
    },
  });
  console.log('✅ 亲子关系: parent1 ↔ student1 已绑定\n');

  console.log('测试数据灌入完成！');
  console.log('┌──────────────────────────────────┐');
  console.log('│ 管理员: admin    / admin         │');
  console.log('│ 家长:   parent1  / password123   │');
  console.log('│ 学员:   student1 / password123   │');
  console.log('└──────────────────────────────────┘');
}

main()
  .catch((e) => {
    console.error('灌入测试数据失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
