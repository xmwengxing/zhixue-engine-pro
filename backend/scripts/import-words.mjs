/**
 * 导入单词词表（幂等 upsert）
 * 用法：node scripts/import-words.mjs <seed-json> [stage]
 * 例：node scripts/import-words.mjs seed-data/words-stage-初中.json
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const prisma = new PrismaClient();
const file = process.argv[2];
const stageArg = process.argv[3];
if (!file) {
  console.error('usage: node scripts/import-words.mjs <seed-json> [stage]');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const stage = stageArg || data.stage;
if (!stage) {
  console.error('缺少 stage');
  process.exit(1);
}

const words = Array.isArray(data) ? data : data.words;
let created = 0;
let updated = 0;
for (const w of words) {
  const existing = await prisma.word.findUnique({
    where: { stage_word: { stage, word: w.word } },
    select: { id: true },
  });
  if (existing) {
    await prisma.word.update({
      where: { id: existing.id },
      data: { phonetic: w.phonetic || '', meaning: w.meaning },
    });
    updated++;
  } else {
    await prisma.word.create({
      data: { stage, word: w.word, phonetic: w.phonetic || '', meaning: w.meaning },
    });
    created++;
  }
}
console.log(`✅ 阶段=${stage} 新增=${created} 更新=${updated} 总数=${await prisma.word.count()}`);
await prisma.$disconnect();
