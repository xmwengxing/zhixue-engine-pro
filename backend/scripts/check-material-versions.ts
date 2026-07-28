// 检查数据库中的教材版本数据
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkMaterialVersions() {
  try {
    console.log('=== 检查教材版本数据 ===\n');

    // 查询所有版本类型的节点
    const versionNodes = await prisma.materialNode.findMany({
      where: {
        type: 'VERSION',
      },
      orderBy: {
        name: 'asc',
      },
    });

    if (versionNodes.length === 0) {
      console.log('❌ 数据库中没有教材版本数据');
      console.log('\n建议：需要初始化教材版本数据');
      console.log('常见教材版本：人教版、苏教版、北师大版、沪教版等');
    } else {
      console.log(`✅ 找到 ${versionNodes.length} 个教材版本:\n`);
      versionNodes.forEach((node, index) => {
        console.log(`${index + 1}. ${node.name}`);
        console.log(`   - ID: ${node.id}`);
        console.log(`   - 路径: ${node.path}`);
        console.log(`   - 创建时间: ${node.createdAt}`);
        console.log('');
      });
    }

    // 检查所有类型的节点统计
    console.log('\n=== 教材节点类型统计 ===');
    const nodeTypes = await prisma.materialNode.groupBy({
      by: ['type'],
      _count: true,
    });

    if (nodeTypes.length === 0) {
      console.log('❌ 数据库中没有任何教材节点数据');
    } else {
      nodeTypes.forEach((item) => {
        console.log(`${item.type}: ${item._count} 个节点`);
      });
    }

  } catch (error) {
    console.error('检查过程中出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMaterialVersions();
