/**
 * 导入 CET-4 词汇（英语四级词汇表 完整版）→ Word 表 stage='CET4'
 * 数据源：cet4vocabularymemory skill 的 references/cet4-vocabulary.md
 * 用法：node scripts/import-cet4-words.mjs [md路径] [--json-only]
 *   - 默认从 skill 目录读取并导入（幂等 upsert）
 *   - --json-only：仅生成 seed-data/words-stage-CET4.json 不写库
 *   - 生成的 seed JSON 一并入库（保持 seed-data 为权威原生数据）
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const MD_PATH = process.argv[2] || 'C:/Users/wxgo8/.workbuddy/skills/cet4vocabularymemory__skillhub/references/cet4-vocabulary.md';
const JSON_ONLY = process.argv.includes('--json-only');
const OUT_JSON = path.join(process.cwd(), 'seed-data', 'words-stage-CET4.json');
const STAGE = 'CET4';

function parseWords(md) {
  const lines = md.split('\n').filter((l) => /^\|\s*[a-zA-Z]/.test(l));
  const seen = new Set();
  const words = [];
  for (const l of lines) {
    const m = l.match(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|$/);
    if (!m) continue;
    const word = m[1].trim().toLowerCase();
    const phonetic = m[2].trim().replace(/^\//, '').replace(/\/$/, '').trim();
    const pos = m[3].trim();
    const meaning = m[4].trim();
    if (!word || !meaning || seen.has(word)) continue;
    seen.add(word);
    words.push({ word, phonetic, meaning: (pos ? pos + ' ' : '') + meaning });
  }
  return words;
}

async function main() {
  if (!fs.existsSync(MD_PATH)) {
    console.error(`词汇文件不存在: ${MD_PATH}`);
    process.exit(1);
  }
  const md = fs.readFileSync(MD_PATH, 'utf8');
  const words = parseWords(md);
  if (words.length === 0) {
    console.error('解析 0 词，中止');
    process.exit(1);
  }
  // 生成 seed JSON（原生数据备份）
  const payload = { stage: STAGE, source: 'cet4vocabularymemory skill: 大学英语四级词汇表 (CET-4) 完整版', count: words.length, words };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`seed 已生成: ${OUT_JSON}（${words.length} 词）`);

  if (JSON_ONLY) return;

  // 幂等 upsert 入库
  let created = 0;
  let updated = 0;
  const t0 = Date.now();
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const existing = await prisma.word.findUnique({
      where: { stage_word: { stage: STAGE, word: w.word } },
      select: { id: true },
    });
    if (existing) {
      await prisma.word.update({ where: { id: existing.id }, data: { phonetic: w.phonetic, meaning: w.meaning } });
      updated++;
    } else {
      await prisma.word.create({ data: { stage: STAGE, word: w.word, phonetic: w.phonetic, meaning: w.meaning } });
      created++;
    }
    if ((i + 1) % 500 === 0) console.log(`  已处理 ${i + 1}/${words.length}...`);
  }
  const total = await prisma.word.count({ where: { stage: STAGE } });
  console.log(`导入完成: 新建 ${created} / 更新 ${updated} / 库内总数 ${total} | 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main()
  .catch((e) => {
    console.error('导入失败:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
