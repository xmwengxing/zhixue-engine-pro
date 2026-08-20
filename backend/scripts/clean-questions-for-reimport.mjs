/**
 * 清理题目数据脚本
 * 用于清空已入库的题目数据，为重新转换导入做准备
 * 
 * 用法：node scripts/clean-questions-for-reimport.mjs [--confirm]
 * 
 * ⚠️ 警告：此操作会删除所有题目数据，不可恢复！
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');

async function main() {
  console.log('⚠️  警告：此操作将清空以下数据：');
  console.log('  - questions（题目表）');
  console.log('  - question_papers（试卷表）');
  console.log('  - question_paper_items（题卷关联表）');
  console.log('');
  
  // 统计当前数据
  const questionCount = await prisma.question.count();
  const paperCount = await prisma.questionPaper.count();
  const itemCount = await prisma.questionPaperItem.count();
  
  console.log('当前数据量：');
  console.log(`  题目: ${questionCount}`);
  console.log(`  试卷: ${paperCount}`);
  console.log(`  题卷关联: ${itemCount}`);
  console.log('');
  
  if (!CONFIRM) {
    console.log('❌ 未确认，操作取消');
    console.log('   如需执行，请添加 --confirm 参数');
    await prisma.$disconnect();
    return;
  }
  
  console.log('🔄 开始清理...');
  
  // 按顺序删除（先删关联，再删主体）
  console.log('  删除 question_paper_items...');
  const deletedItems = await prisma.questionPaperItem.deleteMany();
  console.log(`    已删除 ${deletedItems.count} 条`);
  
  console.log('  删除 questions...');
  const deletedQuestions = await prisma.question.deleteMany();
  console.log(`    已删除 ${deletedQuestions.count} 条`);
  
  console.log('  删除 question_papers...');
  const deletedPapers = await prisma.questionPaper.deleteMany();
  console.log(`    已删除 ${deletedPapers.count} 条`);
  
  console.log('');
  console.log('✅ 清理完成');
  console.log('');
  console.log('下一步：');
  console.log('  1. 重新运行转换脚本');
  console.log('  2. 运行入库脚本');
  
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 清理失败:', e);
  prisma.$disconnect();
  process.exit(1);
});
