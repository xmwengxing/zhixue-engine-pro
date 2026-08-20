#!/usr/bin/env node
/**
 * 统一词库管理工具
 *
 * 子命令:
 *   stats                          查看词库统计
 *   import <json> [stage]          从 seed JSON 导入（幂等 upsert）
 *   import-md <md> <stage>         从 Markdown 自动检测格式并导入
 *   export <stage> [out.json]      导出指定阶段的词库为 JSON
 *   check                          数据质量检查
 *
 * 示例:
 *   node scripts/words.mjs stats
 *   node scripts/words.mjs import seed-data/words-stage-初中.json
 *   node scripts/words.mjs import-md "E:/题库/初中英语单词表.md" 初中
 *   node scripts/words.mjs import-md "E:/题库/cet4-vocabulary.md" CET4
 *   node scripts/words.mjs export 初中 seed-data/words-stage-初中.json
 *   node scripts/words.mjs check
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();

// ──────────────────────── 解析器 ────────────────────────

/**
 * 解析编号列表格式 Markdown（初中词汇表）
 * 格式: `123 word/音标/ 词性 释义` 或 `123 word 词性 释义`
 */
function parseMdNumberedList(md) {
  const seen = new Set();
  const words = [];
  const POS_LIST = ['v.aux', 'phr.', 'v.a', 'vt', 'vi', 'adj', 'adv', 'prep', 'conj', 'pron', 'num', 'art', 'interj', 'v', 'n'];

  function extractPos(text) {
    const t = text.trimStart();
    const found = [];
    let rest = t;
    while (rest) {
      let matched = false;
      for (const p of POS_LIST) {
        if (rest.startsWith(p)) {
          const after = rest.slice(p.length);
          if (after.length === 0 || after[0] === ' ' || after[0] === '&' || after[0] === '/') {
            found.push(p);
            rest = after;
            matched = true;
            break;
          }
        }
      }
      if (!matched) break;
      if (rest.length > 0 && (rest[0] === '&' || rest[0] === '/')) {
        rest = rest.slice(1);
      } else {
        break;
      }
    }
    if (found.length > 0 && rest.length > 0 && rest[0] === ' ') {
      rest = rest.slice(1);
    }
    return { pos: found.join(' '), meaning: found.length > 0 ? rest : t };
  }

  const rawLines = md.split('\r\n').join('\n').split('\n');
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^\u7b2c/.test(line)) continue;

    let word = '', phonetic = '', rest = '';
    const m1 = line.match(/^(\d+)\s+(\S+?)\/([^/]*)\/\s*(.*)/);
    if (m1) {
      word = m1[2].toLowerCase();
      phonetic = '/' + m1[3].trim() + '/';
      rest = m1[4].trim();
    } else {
      const m2 = line.match(/^(\d+)\s+(\S+)\s+(.*)/);
      if (m2) {
        word = m2[2].toLowerCase();
        rest = m2[3].trim();
      } else {
        continue;
      }
    }

    word = word.replace(/\(.*?\)/g, '').toLowerCase();
    if (!word || seen.has(word)) continue;
    seen.add(word);

    if (phonetic) {
      phonetic = phonetic.replace(/\$[^$]*\$/g, '').trim();
      if (phonetic === '/' || phonetic === '//') phonetic = '';
    }

    const { pos, meaning } = extractPos(rest);
    words.push({ word, phonetic, pos, meaning });
  }
  return words;
}

/**
 * 解析 Markdown 表格格式（CET4 词汇表）
 * 格式: | word | phonetic | pos | meaning |
 */
function parseMdTable(md) {
  const seen = new Set();
  const words = [];
  const lines = md.split('\n').filter((l) => /^\|\s*[a-zA-Z]/.test(l));
  for (const l of lines) {
    const m = l.match(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|$/);
    if (!m) continue;
    const word = m[1].trim().toLowerCase();
    const phonetic = m[2].trim().replace(/^\//, '').replace(/\/$/, '').trim();
    const pos = m[3].trim();
    const meaning = m[4].trim();
    if (!word || !meaning || seen.has(word)) continue;
    seen.add(word);
    const cleanMeaning = meaning.replace(/^(v|n|adj|adv|prep|conj|pron|num|art|int|abbr|vt|vi|aux|modal|det).?\s+/i, '');
    words.push({ word, phonetic, pos, meaning: cleanMeaning });
  }
  return words;
}

/** 自动检测 Markdown 格式 */
function parseMdAuto(md) {
  const tableLines = md.split('\n').filter((l) => /^\|\s*[a-zA-Z]/.test(l)).length;
  const numberedLines = md.split('\n').filter((l) => /^\d+\s+\S+/.test(l.trim())).length;
  if (tableLines > numberedLines) return { words: parseMdTable(md), format: 'table' };
  return { words: parseMdNumberedList(md), format: 'numbered-list' };
}

// ──────────────────────── 导入逻辑 ────────────────────────

/** 幂等 upsert 写入数据库 */
async function upsertWords(words, stage) {
  let created = 0, updated = 0, skipped = 0;
  const t0 = Date.now();
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    try {
      const existing = await prisma.word.findUnique({
        where: { stage_word: { stage, word: w.word } },
        select: { id: true, phonetic: true, pos: true, meaning: true },
      });
      if (existing) {
        const needUpdate = (w.phonetic && !existing.phonetic) || (w.pos && !existing.pos && w.pos !== '');
        if (needUpdate) {
          await prisma.word.update({
            where: { id: existing.id },
            data: {
              phonetic: w.phonetic || existing.phonetic,
              pos: w.pos || existing.pos,
              meaning: w.meaning || existing.meaning,
            },
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        await prisma.word.create({
          data: { stage, word: w.word, phonetic: w.phonetic || '', pos: w.pos || '', meaning: w.meaning },
        });
        created++;
      }
    } catch (e) {
      console.error(`  ✗ ${w.word}: ${e.message}`);
    }
    if ((i + 1) % 200 === 0) console.log(`  已处理 ${i + 1}/${words.length}...`);
  }
  const total = await prisma.word.count({ where: { stage } });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✅ 阶段=${stage} 新增=${created} 更新=${updated} 跳过=${skipped} 库内总数=${total} | 耗时 ${elapsed}s`);
  return { created, updated, skipped, total };
}

// ──────────────────────── 子命令 ────────────────────────

async function cmdStats() {
  const total = await prisma.word.count();
  const byStage = await prisma.word.groupBy({ by: ['stage'], _count: true });
  console.log(`\n📚 词库统计 (总计 ${total} 词)\n${'─'.repeat(30)}`);
  for (const s of byStage) {
    const withPhonetic = await prisma.word.count({ where: { stage: s.stage, phonetic: { not: '' } } });
    const withPos = await prisma.word.count({ where: { stage: s.stage, pos: { not: '' } } });
    console.log(`  ${s.stage.padEnd(8)} ${String(s._count).padStart(5)} 词  |  音标覆盖 ${withPhonetic}/${s._count}  |  词性覆盖 ${withPos}/${s._count}`);
  }
  console.log();
}

async function cmdImportJson(filePath, stageArg) {
  if (!fs.existsSync(filePath)) { console.error(`文件不存在: ${filePath}`); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const stage = stageArg || data.stage;
  if (!stage) { console.error('缺少 stage 参数，请指定: node scripts/words.mjs import <json> <stage>'); process.exit(1); }
  const words = Array.isArray(data) ? data : data.words;
  console.log(`📂 从 ${path.basename(filePath)} 导入 ${words.length} 词 → ${stage}`);
  await upsertWords(words, stage);
}

async function cmdImportMd(mdPath, stage) {
  if (!stage) { console.error('请指定阶段: node scripts/words.mjs import-md <md> <stage>'); process.exit(1); }
  if (!fs.existsSync(mdPath)) { console.error(`文件不存在: ${mdPath}`); process.exit(1); }
  const md = fs.readFileSync(mdPath, 'utf8');
  const { words, format } = parseMdAuto(md);
  if (words.length === 0) { console.error('解析 0 词，中止'); process.exit(1); }
  console.log(`📂 从 ${path.basename(mdPath)} 解析 ${words.length} 词 (格式: ${format}) → ${stage}`);
  await upsertWords(words, stage);
}

async function cmdExport(stage, outPath) {
  if (!stage) { console.error('请指定阶段: node scripts/words.mjs export <stage> [out.json]'); process.exit(1); }
  const words = await prisma.word.findMany({ where: { stage }, orderBy: { word: 'asc' } });
  if (words.length === 0) { console.error(`阶段 "${stage}" 无数据`); process.exit(1); }
  const payload = {
    stage,
    source: `exported from database`,
    count: words.length,
    words: words.map(w => ({ word: w.word, phonetic: w.phonetic || '', pos: w.pos || '', meaning: w.meaning })),
  };
  const defaultPath = `seed-data/words-stage-${stage}.json`;
  const target = outPath || defaultPath;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✅ 已导出 ${words.length} 词 → ${target}`);
}

async function cmdCheck() {
  const byStage = await prisma.word.groupBy({ by: ['stage'], _count: true });
  console.log(`\n🔍 词库质量检查\n${'─'.repeat(50)}`);
  for (const s of byStage) {
    const total = s._count;
    const emptyPhonetic = await prisma.word.count({ where: { stage: s.stage, phonetic: '' } });
    const emptyMeaning = await prisma.word.count({ where: { stage: s.stage, meaning: '' } });
    const shortMeaning = await prisma.word.count({ where: { stage: s.stage, meaning: { lt: '2' } } });
    const dupCheck = await prisma.$queryRaw`SELECT word, COUNT(*) as cnt FROM words WHERE stage = ${s.stage} GROUP BY word HAVING COUNT(*) > 1`;
    console.log(`\n  【${s.stage}】${total} 词`);
    console.log(`    空音标: ${emptyPhonetic}  ${emptyPhonetic > 0 ? '⚠️' : '✅'}`);
    console.log(`    空释义: ${emptyMeaning}  ${emptyMeaning > 0 ? '⚠️' : '✅'}`);
    console.log(`    极短释义(<2字符): ${shortMeaning}  ${shortMeaning > 0 ? '⚠️' : '✅'}`);
    console.log(`    重复词: ${dupCheck.length}  ${dupCheck.length > 0 ? '⚠️' : '✅'}`);
    if (dupCheck.length > 0 && dupCheck.length <= 10) {
      for (const d of dupCheck) console.log(`      - "${d.word}" x${d.cnt}`);
    }
  }
  console.log();
}

function printHelp() {
  console.log(`
📚 统一词库管理工具

用法: node scripts/words.mjs <子命令> [参数]

子命令:
  stats                                    查看词库统计
  import <json> [stage]                    从 seed JSON 导入（幂等 upsert）
  import-md <md文件> <阶段>                从 Markdown 自动检测格式并导入
  export <阶段> [out.json]                 导出指定阶段的词库为 JSON
  check                                    数据质量检查

示例:
  node scripts/words.mjs stats
  node scripts/words.mjs import seed-data/words-stage-初中.json
  node scripts/words.mjs import-md "E:/题库/初中英语单词表.md" 初中
  node scripts/words.mjs import-md "E:/题库/cet4-vocabulary.md" CET4
  node scripts/words.mjs export 初中 seed-data/words-stage-初中.json
  node scripts/words.mjs check
`);
}

// ──────────────────────── 入口 ────────────────────────

const [,, cmd, ...args] = process.argv;

try {
  switch (cmd) {
    case 'stats': await cmdStats(); break;
    case 'import': await cmdImportJson(args[0], args[1]); break;
    case 'import-md': await cmdImportMd(args[0], args[1]); break;
    case 'export': await cmdExport(args[0], args[1]); break;
    case 'check': await cmdCheck(); break;
    default: printHelp(); break;
  }
} catch (e) {
  console.error('❌ 错误:', e.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
