/**
 * 清理题目数据脚本
 * 支持按学科清理（--subjects 物理,数学）或清空所有（不传 --subjects）
 *
 * 用法：
 *   node scripts/clean-questions-for-reimport.mjs --subjects 物理 --confirm
 *   node scripts/clean-questions-for-reimport.mjs --confirm            # 清空所有
 *   node scripts/clean-questions-for-reimport.mjs --subjects 物理      # dry-run 预览
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS_DIR = path.resolve(__dirname, '../../开发文档/试卷转换产物');
const IMPORT_PROGRESS = path.join(PROGRESS_DIR, 'progress-import.json');

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');

function getArgVal(n, d) {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
}
const SUBJECTS_RAW = getArgVal('--subjects', '');
const SUBJECTS = SUBJECTS_RAW ? SUBJECTS_RAW.split(',').map(s => s.trim()) : [];

async function main() {
  if (SUBJECTS.length > 0) {
    console.log(`⚠️  即将清理以下学科的题目数据：${SUBJECTS.join(', ')}`);
  } else {
    console.log('⚠️  警告：未指定学科，将清空所有题目数据！');
    console.log('  建议使用 --subjects 参数指定学科，如：--subjects 物理');
  }
  console.log('');
  console.log('  涉及表：questions / question_papers / question_paper_items');
  console.log('');

  // 查找要清理的学科节点
  const subjectNodes = await prisma.materialNode.findMany({
    where: SUBJECTS.length > 0
      ? { name: { in: SUBJECTS }, type: 'SUBJECT' }
      : { type: 'SUBJECT' },
    select: { id: true, name: true },
  });

  if (subjectNodes.length === 0) {
    console.log('❌ 未找到匹配的学科节点');
    await prisma.$disconnect();
    return;
  }

  // 统计
  let totalQ = 0, totalP = 0, totalI = 0;
  const nodeIds = subjectNodes.map(n => n.id);

  if (SUBJECTS.length > 0) {
    for (const node of subjectNodes) {
      const qCount = await prisma.question.count({ where: { materialNodeId: node.id } });
      const pIds = (await prisma.questionPaper.findMany({
        where: { items: { some: { question: { materialNodeId: node.id } } } },
        select: { id: true },
      })).map(p => p.id);
      console.log(`  ${node.name}: ${qCount} 题, ${pIds.length} 卷`);
      totalQ += qCount;
      totalP += pIds.length;
    }
    // paper items count
    totalI = await prisma.questionPaperItem.count({
      where: { question: { materialNodeId: { in: nodeIds } } },
    });
  } else {
    totalQ = await prisma.question.count();
    totalP = await prisma.questionPaper.count();
    totalI = await prisma.questionPaperItem.count();
    console.log(`  所有学科: ${totalQ} 题, ${totalP} 卷, ${totalI} 关联`);
  }

  console.log(`\n  总计: ${totalQ} 题 / ${totalP} 卷 / ${totalI} 关联`);
  console.log('');

  if (!CONFIRM) {
    console.log('❌ 未确认，操作取消（dry-run）');
    console.log('   如需执行，请添加 --confirm 参数');
    await prisma.$disconnect();
    return;
  }

  console.log('🔄 开始清理...');

  if (SUBJECTS.length > 0) {
    // 按学科清理
    // 1. 删除关联（question_paper_items）
    console.log('  删除 question_paper_items...');
    const deletedItems = await prisma.questionPaperItem.deleteMany({
      where: { question: { materialNodeId: { in: nodeIds } } },
    });
    console.log(`    已删除 ${deletedItems.count} 条`);

    // 2. 删除题目
    console.log('  删除 questions...');
    const deletedQ = await prisma.question.deleteMany({
      where: { materialNodeId: { in: nodeIds } },
    });
    console.log(`    已删除 ${deletedQ.count} 条`);

    // 3. 删除试卷（仅删除没有其他学科题目的空试卷）
    console.log('  删除空试卷...');
    const emptyPapers = await prisma.questionPaper.findMany({
      where: {
        items: { none: {} },
        subject: { in: SUBJECTS },
      },
      select: { id: true },
    });
    if (emptyPapers.length > 0) {
      const deletedP = await prisma.questionPaper.deleteMany({
        where: { id: { in: emptyPapers.map(p => p.id) } },
      });
      console.log(`    已删除 ${deletedP.count} 条空试卷`);
    }

    // 4. 重置 progress-import.json 中对应学科的检查点
    if (fs.existsSync(IMPORT_PROGRESS)) {
      const doneMap = JSON.parse(fs.readFileSync(IMPORT_PROGRESS, 'utf8'));
      let removed = 0;
      for (const key of Object.keys(doneMap)) {
        // progress-import.json 的 key 格式包含学科目录名
        if (SUBJECTS.some(s => key.includes(`\\\\${s}\\\\`) || key.startsWith(`${s}\\`) || key.includes(`/${s}/`))) {
          delete doneMap[key];
          removed++;
        }
      }
      if (removed > 0) {
        fs.writeFileSync(IMPORT_PROGRESS, JSON.stringify(doneMap, null, 1));
        console.log(`  重置 progress-import.json: 移除 ${removed} 条检查点`);
      }
    }
  } else {
    // 清空所有
    console.log('  删除 question_paper_items...');
    const deletedItems = await prisma.questionPaperItem.deleteMany();
    console.log(`    已删除 ${deletedItems.count} 条`);

    console.log('  删除 questions...');
    const deletedQ = await prisma.question.deleteMany();
    console.log(`    已删除 ${deletedQ.count} 条`);

    console.log('  删除 question_papers...');
    const deletedP = await prisma.questionPaper.deleteMany();
    console.log(`    已删除 ${deletedP.count} 条`);

    // 清空 progress-import.json
    if (fs.existsSync(IMPORT_PROGRESS)) {
      fs.writeFileSync(IMPORT_PROGRESS, '{}');
      console.log('  已重置 progress-import.json');
    }
  }

  console.log('\n✅ 清理完成');
  console.log('\n下一步：');
  console.log('  node scripts/import-papers-to-db.mjs --subjects 物理');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('❌ 清理失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});
