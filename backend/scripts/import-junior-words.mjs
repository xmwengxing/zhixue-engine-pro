/**
 * Import junior English words into Word table (stage=初中)
 * Usage: node scripts/import-junior-words.mjs [mdPath] [--json-only]
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const prisma = new PrismaClient();
const JSON_ONLY = process.argv.includes('--json-only');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const MD_PATH = args[0] || 'E:/Projects/题库/初中英语单词表2182个(带音标).md';
const STAGE = '初中';

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
    // skip separator between POS keywords
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

function parseWords(md) {
  const seen = new Set();
  const words = [];
  const rawLines = md.split('\r\n').join('\n').split('\n');
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^\u7b2c/.test(line)) continue;

    let word = '', phonetic = '', rest = '';
    // Pattern with phonetics: number word/phonetic/ rest
    const m1 = line.match(/^(\d+)\s+(\S+?)\/([^/]*)\/\s*(.*)/);
    if (m1) {
      word = m1[2].toLowerCase();
      phonetic = '/' + m1[3].trim() + '/';
      rest = m1[4].trim();
    } else {
      // Pattern without phonetics: number word pos meaning
      const m2 = line.match(/^(\d+)\s+(\S+)\s+(.*)/);
      if (m2) {
        word = m2[2].toLowerCase();
        rest = m2[3].trim();
      } else {
        continue;
      }
    }

    // Remove parenthesized alt forms like (h)wot -> wot
    word = word.replace(/\(.*?\)/g, '').toLowerCase();
    if (!word || seen.has(word)) continue;
    seen.add(word);

    // Clean LaTeX artifacts from phonetic
    if (phonetic) {
      phonetic = phonetic.replace(/\$[^$]*\$/g, '').trim();
      if (phonetic === '/' || phonetic === '//') phonetic = '';
    }

    const { pos, meaning } = extractPos(rest);
    words.push({ word, phonetic, pos, meaning });
  }
  return words;
}

async function main() {
  if (!fs.existsSync(MD_PATH)) {
    console.error('词汇文件不存在: ' + MD_PATH);
    process.exit(1);
  }
  const md = fs.readFileSync(MD_PATH, 'utf8');
  const words = parseWords(md);
  console.log('解析完成: ' + words.length + ' 词');
  console.log('前5:', JSON.stringify(words.slice(0, 5)));
  console.log('后5:', JSON.stringify(words.slice(-5)));
  if (words.length === 0) { console.error('解析 0 词'); process.exit(1); }
  if (JSON_ONLY) { console.log('json-only 模式'); return; }

  let created = 0, skipped = 0, updated = 0;
  const t0 = Date.now();
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    try {
      const existing = await prisma.word.findUnique({
        where: { stage_word: { stage: STAGE, word: w.word } },
        select: { id: true, phonetic: true, pos: true, meaning: true },
      });
      if (existing) {
        const needUpdate = (w.phonetic && !existing.phonetic) || (w.pos && !existing.pos);
        if (needUpdate) {
          await prisma.word.update({
            where: { id: existing.id },
            data: { phonetic: w.phonetic || existing.phonetic, pos: w.pos || existing.pos, meaning: w.meaning },
          });
          updated++;
        } else { skipped++; }
      } else {
        await prisma.word.create({
          data: { stage: STAGE, word: w.word, phonetic: w.phonetic, pos: w.pos, meaning: w.meaning },
        });
        created++;
      }
    } catch (e) { console.error('Error ' + w.word + ': ' + e.message); }
    if ((i + 1) % 200 === 0) console.log('  已处理 ' + (i + 1) + '/' + words.length);
  }
  const total = await prisma.word.count({ where: { stage: STAGE } });
  console.log('\n新建 ' + created + ' / 更新 ' + updated + ' / 跳过 ' + skipped + ' / 初中总数 ' + total + ' | 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
main().catch(e => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
