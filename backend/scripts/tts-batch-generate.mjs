// TTS 离线数据包批量生成脚本
// 遍历词库全部单词 → edge-tts 微服务批量生成 → 存 backend/tts_data/{voice}/{word}.mp3
// 断点续跑：已存在的文件自动跳过；生产部署时把 tts_data 目录打包（zip）放网盘，
// 部署后在 backend/ 下解压即可生效（后端 ttsWord 本地文件优先读取，零生成零延迟）。
//
// 用法（backend 目录）：
//   node scripts/tts-batch-generate.mjs                 # 全量生成（默认 en-US-AriaNeural）
//   node scripts/tts-batch-generate.mjs --voice en-GB-SoniaNeural
//   node scripts/tts-batch-generate.mjs --limit 200     # 只生成前 200 个（试跑）
//   node scripts/tts-batch-generate.mjs --batch 20 --workers 3
// 依赖：word-tts 微服务运行中（uvicorn app:app --port 8010）

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) process.env.DATABASE_URL = m[1].trim().replace(/^"|"$/g, '');
  }
}

const args = process.argv.slice(2);
const getArg = (key, def) => {
  const i = args.indexOf(key);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const eq = args.find((a) => a.startsWith(key + '='));
  return eq ? eq.split('=')[1] : def;
};
const voice = getArg('--voice', 'en-US-AriaNeural');
const limit = Number(getArg('--limit', '0')) || 0;
const batchSize = Number(getArg('--batch', '20')) || 20;
const workers = Number(getArg('--workers', '3')) || 3;

const TTS_SERVICE_URL = process.env.WORD_TTS_URL || 'http://localhost:8010';
const OUT_DIR = path.resolve(process.cwd(), 'tts_data', voice);
const OUT_SUB = (w) => path.join(OUT_DIR, `${w.toLowerCase()}.mp3`);

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function batchTts(texts) {
  try {
    const res = await fetch(`${TTS_SERVICE_URL}/tts/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, voice }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    return await res.json(); // { data: { text: base64 } }
  } catch {
    return null;
  }
}

async function main() {
  const words = await prisma.word.findMany({ select: { word: true } });
  const unique = [...new Set(words.map((w) => w.word.trim()))];
  // 断点续跑：跳过已生成 + 仅纯单词
  const todo = unique.filter((w) => /^[a-zA-Z'-]+$/.test(w) && !fs.existsSync(OUT_SUB(w)));
  const target = limit > 0 ? todo.slice(0, limit) : todo;
  console.log(`词库 ${unique.length} 词 | 待生成 ${target.length} 词（已存在 ${unique.length - todo.length} 跳过）| voice=${voice} workers=${workers}`);
  if (target.length === 0) { console.log('全部已生成，无需处理'); await prisma.$disconnect(); return; }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let done = 0;
  const start = Date.now();
  async function worker() {
    while (true) {
      const batch = target.splice(0, batchSize);
      if (batch.length === 0) break;
      const data = await batchTts(batch);
      if (data && data.data) {
        for (const w of batch) {
          const b64 = data.data[w];
          if (b64) {
            fs.writeFileSync(OUT_SUB(w), Buffer.from(b64, 'base64'));
          }
        }
      } else {
        // batch 失败 → 逐词重试一次
        for (const w of batch) {
          try {
            const res = await fetch(`${TTS_SERVICE_URL}/tts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: w, voice }),
              signal: AbortSignal.timeout(30000),
            });
            if (res.ok) fs.writeFileSync(OUT_SUB(w), Buffer.from(await res.arrayBuffer()));
          } catch { /* 跳过 */ }
          await sleep(50);
        }
      }
      done += batch.length;
      const rate = done / ((Date.now() - start) / 1000);
      console.log(`  进度 ${done}/${target.length + done} 词 | 约剩 ${Math.round((target.length / rate) / 60)} 分钟`);
      await sleep(200);
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  console.log(`=== 完成：${done} 词 → ${OUT_DIR} ===`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error('💥', e.message); process.exit(1); });
