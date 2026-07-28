// 测试特定用户的密码
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authService } from '../../src/services/authService';

const prisma = new PrismaClient();

async function testUser() {
  // 从命令行获取用户名和密码
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.log('用法: npx tsx tests/debug/test-specific-user.ts <用户名> <密码>');
    console.log('示例: npx tsx tests/debug/test-specific-user.ts parent1 123456');
    process.exit(1);
  }

  console.log('=== 测试用户登录 ===\n');
  console.log(`用户名: ${username}`);
  console.log(`密码: ${password}\n`);

  // 1. 查询用户
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      role: true,
      status: true,
      email: true,
      createdAt: true,
    },
  });

  if (!user) {
    console.log('❌ 用户不存在');
    await prisma.$disconnect();
    return;
  }

  console.log('✓ 找到用户');
  console.log(`  用户ID: ${user.id}`);
  console.log(`  角色: ${user.role}`);
  console.log(`  状态: ${user.status}`);
  console.log(`  邮箱: ${user.email || '未设置'}`);
  console.log(`  创建时间: ${user.createdAt}`);
  console.log(`  密码哈希: ${user.passwordHash.substring(0, 30)}...`);
  console.log(`  密码哈希长度: ${user.passwordHash.length}\n`);

  // 2. 检查密码哈希格式
  const isBcryptHash = user.passwordHash.startsWith('$2a$') || 
                       user.passwordHash.startsWith('$2b$') || 
                       user.passwordHash.startsWith('$2y$');
  console.log(`密码哈希格式: ${isBcryptHash ? '✓ bcrypt格式正确' : '❌ 格式错误'}\n`);

  // 3. 直接使用bcrypt验证密码
  console.log('--- 直接bcrypt验证 ---');
  try {
    const isValid = await bcrypt.compare(password, user.passwordHash);
    console.log(`bcrypt.compare结果: ${isValid ? '✓ 密码正确' : '❌ 密码错误'}\n`);
  } catch (error) {
    console.log(`❌ bcrypt验证失败: ${error}\n`);
  }

  // 4. 使用authService登录
  console.log('--- 使用authService登录 ---');
  try {
    const result = await authService.login(username, password);
    console.log('✓ 登录成功');
    console.log(`  Token: ${result.token.substring(0, 30)}...`);
    console.log(`  用户: ${result.user.username}`);
    console.log(`  角色: ${result.user.role}\n`);
  } catch (error) {
    console.log(`❌ 登录失败: ${error}\n`);
  }

  // 5. 测试重新哈希密码
  console.log('--- 测试重新哈希 ---');
  const newHash = await bcrypt.hash(password, 10);
  console.log(`新密码哈希: ${newHash.substring(0, 30)}...`);
  const newHashValid = await bcrypt.compare(password, newHash);
  console.log(`新哈希验证: ${newHashValid ? '✓ 正确' : '❌ 错误'}\n`);

  await prisma.$disconnect();
}

testUser().catch(console.error);
