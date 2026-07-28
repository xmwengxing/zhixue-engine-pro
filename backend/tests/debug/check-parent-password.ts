// 检查家长密码问题的调试脚本
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function checkParentPasswords() {
  console.log('=== 检查家长用户密码 ===\n');

  // 查询所有家长用户
  const parents = await prisma.user.findMany({
    where: {
      role: 'PARENT',
    },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      role: true,
      status: true,
      email: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  });

  console.log(`找到 ${parents.length} 个家长用户\n`);

  for (const parent of parents) {
    console.log(`用户名: ${parent.username}`);
    console.log(`用户ID: ${parent.id}`);
    console.log(`状态: ${parent.status}`);
    console.log(`邮箱: ${parent.email || '未设置'}`);
    console.log(`创建时间: ${parent.createdAt}`);
    console.log(`密码哈希: ${parent.passwordHash.substring(0, 20)}...`);
    console.log(`密码哈希长度: ${parent.passwordHash.length}`);
    
    // 检查密码哈希格式
    const isBcryptHash = parent.passwordHash.startsWith('$2a$') || 
                         parent.passwordHash.startsWith('$2b$') || 
                         parent.passwordHash.startsWith('$2y$');
    console.log(`是否为bcrypt哈希: ${isBcryptHash ? '是' : '否'}`);
    
    if (!isBcryptHash) {
      console.log('⚠️  警告：密码哈希格式不正确！');
    }
    
    // 尝试用常见测试密码验证
    const testPasswords = ['test123', 'test123456', '123456', 'password'];
    for (const pwd of testPasswords) {
      try {
        const isValid = await bcrypt.compare(pwd, parent.passwordHash);
        if (isValid) {
          console.log(`✓ 密码匹配: ${pwd}`);
          break;
        }
      } catch (error) {
        console.log(`✗ 密码验证失败: ${pwd} - ${error}`);
      }
    }
    
    console.log('---\n');
  }

  await prisma.$disconnect();
}

checkParentPasswords().catch(console.error);
