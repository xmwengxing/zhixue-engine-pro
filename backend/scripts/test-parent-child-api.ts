/**
 * 测试家长端亲子关系管理 API
 * 
 * 测试流程：
 * 1. 创建测试用户（家长和学员）
 * 2. 测试获取子女列表（空列表）
 * 3. 测试通过学号绑定学员
 * 4. 测试获取子女列表（包含绑定的学员）
 * 5. 测试重复绑定（应该失败）
 * 6. 测试解绑学员
 * 7. 测试获取子女列表（空列表）
 * 8. 清理测试数据
 */

import axios from 'axios';
import { PrismaClient, Role, UserStatus, StudentIDStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const API_BASE_URL = 'http://localhost:3000/api';
const prisma = new PrismaClient();

// 测试数据
let parentToken: string;
let parentId: string;
let studentId: string;
let studentIdNumber: string;
let relationId: string;

/**
 * 创建测试用户
 */
async function createTestUsers() {
  console.log('\n📝 创建测试用户...');

  // 创建家长用户
  const parentPasswordHash = await bcrypt.hash('parent123', 10);
  const timestamp = Date.now().toString().slice(-8); // 只取最后8位
  const parent = await prisma.user.create({
    data: {
      username: `parent${timestamp}`,
      passwordHash: parentPasswordHash,
      role: Role.PARENT,
      status: UserStatus.ACTIVE,
    },
  });
  parentId = parent.id;
  console.log(`✅ 家长用户创建成功: ${parent.username} (ID: ${parentId})`);

  // 创建学员用户
  const studentPasswordHash = await bcrypt.hash('student123', 10);
  const student = await prisma.user.create({
    data: {
      username: `student${timestamp}`,
      passwordHash: studentPasswordHash,
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
    },
  });
  studentId = student.id;
  console.log(`✅ 学员用户创建成功: ${student.username} (ID: ${studentId})`);

  // 创建学号并分配给学员
  const studentIdRecord = await prisma.studentID.create({
    data: {
      studentIdNumber: `SID${Date.now()}`,
      status: StudentIDStatus.ASSIGNED,
      userId: studentId,
      assignedAt: new Date(),
    },
  });
  studentIdNumber = studentIdRecord.studentIdNumber;
  console.log(`✅ 学号创建并分配成功: ${studentIdNumber}`);

  // 创建学员档案
  await prisma.studentProfile.create({
    data: {
      userId: studentId,
      realName: '测试学员',
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
  console.log(`✅ 学员档案创建成功`);
}

/**
 * 家长登录获取 token
 */
async function loginParent() {
  console.log('\n🔐 家长登录...');

  const parent = await prisma.user.findUnique({
    where: { id: parentId },
  });

  const response = await axios.post(`${API_BASE_URL}/auth/login`, {
    username: parent!.username,
    password: 'parent123',
  });

  parentToken = response.data.data.token;
  console.log(`✅ 家长登录成功，获取 token`);
}

/**
 * 测试获取子女列表（空列表）
 */
async function testGetChildrenEmpty() {
  console.log('\n📋 测试获取子女列表（空列表）...');
  console.log(`   请求 URL: ${API_BASE_URL}/parent/children`);
  console.log(`   Token: ${parentToken.substring(0, 20)}...`);

  const response = await axios.get(`${API_BASE_URL}/parent/children`, {
    headers: {
      Authorization: `Bearer ${parentToken}`,
    },
  });

  console.log(`✅ 获取子女列表成功`);
  console.log(`   子女数量: ${response.data.data.children.length}`);

  if (response.data.data.children.length !== 0) {
    throw new Error('预期子女列表为空，但实际不为空');
  }
}

/**
 * 测试通过学号绑定学员
 */
async function testBindChildByStudentId() {
  console.log('\n🔗 测试通过学号绑定学员...');

  const response = await axios.post(
    `${API_BASE_URL}/parent/children/bind`,
    {
      studentIdNumber,
      relation: '父亲',
    },
    {
      headers: {
        Authorization: `Bearer ${parentToken}`,
      },
    }
  );

  console.log(`✅ 绑定学员成功`);
  console.log(`   关系 ID: ${response.data.data.relationId}`);
  console.log(`   学员用户名: ${response.data.data.student.username}`);
  console.log(`   学号: ${response.data.data.student.studentIdNumber}`);
  console.log(`   关系: ${response.data.data.relation}`);

  relationId = response.data.data.relationId;

  if (response.data.data.student.id !== studentId) {
    throw new Error('绑定的学员 ID 不匹配');
  }
}

/**
 * 测试获取子女列表（包含绑定的学员）
 */
async function testGetChildrenWithStudent() {
  console.log('\n📋 测试获取子女列表（包含绑定的学员）...');

  const response = await axios.get(`${API_BASE_URL}/parent/children`, {
    headers: {
      Authorization: `Bearer ${parentToken}`,
    },
  });

  console.log(`✅ 获取子女列表成功`);
  console.log(`   子女数量: ${response.data.data.children.length}`);

  if (response.data.data.children.length !== 1) {
    throw new Error('预期子女列表包含 1 个学员');
  }

  const child = response.data.data.children[0];
  console.log(`   学员用户名: ${child.student.username}`);
  console.log(`   学号: ${child.student.studentIdNumber}`);
  console.log(`   关系: ${child.relation}`);
  console.log(`   真实姓名: ${child.student.profile.realName}`);
  console.log(`   年级: ${child.student.profile.grade}`);
}

/**
 * 测试重复绑定（应该失败）
 */
async function testDuplicateBind() {
  console.log('\n❌ 测试重复绑定（应该失败）...');

  try {
    await axios.post(
      `${API_BASE_URL}/parent/children/bind`,
      {
        studentIdNumber,
        relation: '母亲',
      },
      {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      }
    );

    throw new Error('重复绑定应该失败，但实际成功了');
  } catch (error: any) {
    if (error.response && error.response.status === 409) {
      console.log(`✅ 重复绑定正确地被拒绝`);
      console.log(`   错误信息: ${error.response.data.error.message}`);
    } else {
      throw error;
    }
  }
}

/**
 * 测试解绑学员
 */
async function testUnbindChild() {
  console.log('\n🔓 测试解绑学员...');

  const response = await axios.delete(
    `${API_BASE_URL}/parent/children/${relationId}/unbind`,
    {
      headers: {
        Authorization: `Bearer ${parentToken}`,
      },
    }
  );

  console.log(`✅ 解绑学员成功`);
  console.log(`   关系 ID: ${response.data.data.relationId}`);
  console.log(`   状态: ${response.data.data.status}`);
}

/**
 * 测试解绑后获取子女列表（空列表）
 */
async function testGetChildrenAfterUnbind() {
  console.log('\n📋 测试解绑后获取子女列表（空列表）...');

  const response = await axios.get(`${API_BASE_URL}/parent/children`, {
    headers: {
      Authorization: `Bearer ${parentToken}`,
    },
  });

  console.log(`✅ 获取子女列表成功`);
  console.log(`   子女数量: ${response.data.data.children.length}`);

  if (response.data.data.children.length !== 0) {
    throw new Error('预期子女列表为空，但实际不为空');
  }
}

/**
 * 清理测试数据
 */
async function cleanup() {
  console.log('\n🧹 清理测试数据...');

  // 删除学员档案
  await prisma.studentProfile.deleteMany({
    where: { userId: studentId },
  });

  // 删除学号
  await prisma.studentID.deleteMany({
    where: { userId: studentId },
  });

  // 删除亲子关系
  await prisma.parentChildRelation.deleteMany({
    where: {
      OR: [{ parentId }, { studentId }],
    },
  });

  // 删除用户
  await prisma.user.deleteMany({
    where: {
      id: { in: [parentId, studentId] },
    },
  });

  console.log(`✅ 测试数据清理完成`);
}

/**
 * 主测试函数
 */
async function main() {
  try {
    console.log('🚀 开始测试家长端亲子关系管理 API\n');
    console.log('='.repeat(60));

    await createTestUsers();
    await loginParent();
    await testGetChildrenEmpty();
    await testBindChildByStudentId();
    await testGetChildrenWithStudent();
    await testDuplicateBind();
    await testUnbindChild();
    await testGetChildrenAfterUnbind();

    console.log('\n' + '='.repeat(60));
    console.log('✅ 所有测试通过！');
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   响应状态:', error.response.status);
      console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main();
