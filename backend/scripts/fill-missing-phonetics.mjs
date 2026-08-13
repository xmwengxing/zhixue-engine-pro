/**
 * 补齐初中词库缺失音标（phonetic=''）
 * 来源优先级：跨库复制(CET4) → seed JSON → 在线词典(youdao → dictionaryapi.dev)
 * 音标格式与现有数据一致：无首尾斜杠（如 CET4 的 ˈeɪbl / 初中的 eibl）
 * 用法：node scripts/fill-missing-phonetics.mjs
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

// ---- .env：正则提取 DATABASE_URL（参照同目录其他 mjs 脚本）----
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) process.env.DATABASE_URL = m[1].trim().replace(/^"|"$/g, '');
  }
}

const prisma = new PrismaClient();
const STAGE = '初中';
const SEED_PATH = path.join(process.cwd(), 'seed-data', 'words-stage-初中.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 规范化音标：去掉首尾斜杠与空白，与库内现有格式（无斜杠）保持一致
const normalize = (s) => (s || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.youdao.com/' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 有道：ec.word[0].usphone / ukphone
async function fromYoudao(word) {
  const j = await fetchJson(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`);
  const ec = j && j.ec && j.ec.word && j.ec.word[0];
  return (ec && (normalize(ec.usphone) || normalize(ec.ukphone))) || null;
}

// dictionaryapi.dev：phonetic / phonetics[].text
async function fromDictapi(word) {
  const arr = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!Array.isArray(arr) || !arr.length) return null;
  let ph = normalize(arr[0].phonetic);
  if (!ph && Array.isArray(arr[0].phonetics)) {
    for (const p of arr[0].phonetics) {
      ph = normalize(p.text);
      if (ph) break;
    }
  }
  return ph || null;
}

// 在线抓取：有道优先，各来源重试 1 次，失败再换 dictionaryapi.dev
async function fetchOnline(word) {
  for (const fn of [fromYoudao, fromDictapi]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const ph = await fn(word);
        if (ph) return ph;
      } catch {
        /* 重试下一轮 */
      }
      await sleep(200);
    }
  }
  return null;
}

async function main() {
  const t0 = Date.now();

  // 1. 查初中缺失音标
  const missing = await prisma.word.findMany({
    where: { stage: STAGE, phonetic: '' },
    select: { id: true, word: true },
  });
  console.log(`初中缺失音标: ${missing.length} 个`);

  // 2. 跨库复制源：CET4（大小写不敏感）
  const cet4 = await prisma.word.findMany({
    where: { stage: 'CET4', phonetic: { not: '' } },
    select: { word: true, phonetic: true },
  });
  const cet4Map = new Map(cet4.map((r) => [r.word.toLowerCase(), r.phonetic]));
  console.log(`CET4 可复制源: ${cet4Map.size} 个`);

  // 3. seed 匹配源
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const seedWords = Array.isArray(seed) ? seed : seed.words;
  const seedMap = new Map(seedWords.map((w) => [w.word.toLowerCase(), normalize(w.phonetic)]));

  // 4. 逐词取音标
  const filled = []; // {id, word, phonetic}
  const stats = { cet4: 0, seed: 0, online: 0 };
  let online = true;
  let consecutiveFail = 0;
  for (const row of missing) {
    const key = row.word.toLowerCase();
    let ph = cet4Map.get(key);
    if (ph) {
      stats.cet4++;
    } else if (seedMap.get(key)) {
      ph = seedMap.get(key);
      stats.seed++;
    } else if (online) {
      ph = await fetchOnline(row.word);
      if (ph) {
        stats.online++;
        consecutiveFail = 0;
      } else {
        consecutiveFail++;
        if (consecutiveFail >= 8) {
          console.log(`  在线抓取连续失败 ${consecutiveFail} 次，中止在线兜底`);
          online = false;
        }
      }
      await sleep(200); // 请求间隔防封禁
    }
    if (ph) filled.push({ id: row.id, word: row.word, phonetic: normalize(ph) });
  }

  // 5. 批量写库（updateMany 按 stage+word 唯一约束，小批事务）
  const BATCH = 50;
  let written = 0;
  for (let i = 0; i < filled.length; i += BATCH) {
    const chunk = filled.slice(i, i + BATCH);
    await prisma.$transaction(
      chunk.map((u) =>
        prisma.word.updateMany({ where: { stage: STAGE, word: u.word }, data: { phonetic: u.phonetic } })
      )
    );
    written += chunk.length;
  }
  console.log(`已写库 ${written} 条`);

  // 6. 回写 seed 文件（保持 seed 为权威源）
  let seedUpdated = 0;
  const seedIdx = new Map(seedWords.map((w, i) => [w.word.toLowerCase(), i]));
  for (const u of filled) {
    const idx = seedIdx.get(u.word.toLowerCase());
    if (idx != null && seedWords[idx].phonetic !== u.phonetic) {
      seedWords[idx].phonetic = u.phonetic;
      seedUpdated++;
    }
  }
  if (seedUpdated) {
    fs.writeFileSync(SEED_PATH, JSON.stringify(seed, null, 1), 'utf8');
    console.log(`seed 文件已回写 ${seedUpdated} 个音标`);
  }

  // 7. 最终统计
  const after = await prisma.word.count({ where: { stage: STAGE, phonetic: '' } });
  console.log('\n===== 统计 =====');
  console.log(`补全总数: ${filled.length}`);
  console.log(`跨库复制(CET4): ${stats.cet4}`);
  console.log(`seed 匹配: ${stats.seed}`);
  console.log(`在线抓取: ${stats.online}`);
  console.log(`仍缺失: ${after}`);
  console.log(`耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main()
  .catch((e) => {
    console.error('执行失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
