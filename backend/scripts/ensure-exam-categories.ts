// 一次性脚本：为所有已有目录的学科补齐 期中/期末/专项/单元 系统目录（幂等）
import { PrismaClient } from '@prisma/client';
import { ensureExamCategories } from '../src/services/paperCategoryService';

const prisma = new PrismaClient();

async function main() {
  const subjects = await prisma.paperCategory.findMany({ distinct: ['subject'], select: { subject: true } });
  for (const { subject } of subjects) await ensureExamCategories(subject);
  console.log(`已为 ${subjects.length} 个学科确保系统目录（期中/期末/专项/单元）`);
  const rows = await prisma.paperCategory.findMany({
    where: { parentId: null, system: true },
    select: { name: true, subject: true, sortOrder: true },
    orderBy: [{ subject: 'asc' }, { sortOrder: 'asc' }],
  });
  for (const r of rows) console.log(`  ${r.subject} | ${r.name} | sort=${r.sortOrder}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
