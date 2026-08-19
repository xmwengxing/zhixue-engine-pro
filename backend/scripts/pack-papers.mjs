/**
 * 离线数据包打包脚本：从转换进度生成标准化数据包（含答案配对 + 题图）
 * 用法：node scripts/pack-papers.mjs --out <包目录>
 * 产物：
 *   <out>/metadata.json   版本/学科/卷数/题数/生成时间
 *   <out>/papers/<学科>/<卷ID>.json   每卷最终形态（题目+答案+解析+图引用）
 *   <out>/images/         题图（扁平复制）
 *   <out>/import.sh       一键导入脚本（分发到目标环境执行）
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const PROGRESS_DIR = 'E:/Projects/zhixue-engine-pro/开发文档/试卷转换产物';
const IMG_DIR = 'E:/Projects/zhixue-engine-pro/backend/uploads/questions';
const PAPER_ROOT = 'E:/Projects/题库/八年级/试卷与习题';
const OUT = getArg('--out', 'E:/Projects/zhixue-engine-pro/开发文档/试卷转换产物/papers-package-v1');
const SUBJECTS = (getArg('--subjects', '历史,语文,英语,数学,物理') || '').split(',').map((s) => s.trim());

function stripVersion(name) {
  return String(name).replace(/[（(]\s*(原卷版|答案版|解析版)\s*[)）]/g, '').replace(/\s+/g, '').trim();
}
async function extractText(fp) {
  const ext = path.extname(fp).toLowerCase();
  if (ext === '.pdf') return (await require('pdf-parse')(fs.readFileSync(fp))).text || '';
  if (ext === '.docx') return (await require('mammoth').extractRawText({ path: fp })).value || '';
  return '';
}
function parseAnswerFile(text) {
  const out = new Map();
  if (!text) return out;
  const t = String(text).replace(/(\d+)\s*[．.、]\s*(?=【答案】|答案[：:])/g, '\n$1.').replace(/\r/g, '').replace(/\n{2,}/g, '\n');
  const blocks = t.split(/\n(?=\d+\s*[．.、])/);
  let seq = 0;
  for (const blk of blocks) {
    const line = blk.trim(); if (!line) continue;
    const tm = line.match(/^(\d+)\s*[．.、]/); if (tm) seq = parseInt(tm[1], 10); else seq += 1;
    let answer = '', analysis = '';
    const am = line.match(/【答案】\s*([\s\S]*?)(?=【|$)/);
    if (am) {
      answer = am[1].replace(/\s+/g, ' ').trim();
      const anm = line.match(/【解析】\s*([\s\S]*?)(?=【|$)/);
      if (anm) analysis = anm[1].replace(/\s+/g, ' ').trim();
    } else {
      const cm = line.match(/答案[：:]\s*([A-H0-9、.,\s]+)/);
      if (cm) { answer = cm[1].replace(/\s+/g, ' ').trim(); }
    }
    if (answer && !out.has(seq)) out.set(seq, { answer: answer.replace(/[（(【\[]+/g, '').trim(), analysis });
  }
  return out;
}

async function main() {
  const papersDir = path.join(OUT, 'papers');
  const imagesDir = path.join(OUT, 'images');
  fs.mkdirSync(papersDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });

  let totalPapers = 0, totalQuestions = 0;
  const stats = {};
  const imgMapAll = new Map(); // sourceFile -> images（图索引，跨卷复制）

  // 图索引
  if (fs.existsSync(IMG_DIR)) {
    for (const vol of fs.readdirSync(IMG_DIR)) {
      const mp = path.join(IMG_DIR, vol, 'map.json');
      if (!fs.existsSync(mp)) continue;
      try {
        const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
        if (m.sourceFile && m.images) imgMapAll.set(m.sourceFile, m.images);
      } catch { /* ignore */ }
    }
  }

  for (const subject of SUBJECTS) {
    const progPath = path.join(PROGRESS_DIR, `progress-full2-${subject}.json`);
    if (!fs.existsSync(progPath)) { console.log(`[跳过] 无进度: ${subject}`); continue; }
    const prog = JSON.parse(fs.readFileSync(progPath, 'utf8'));
    // 配对索引
    const pairIndex = new Map();
    for (const [rel, rec] of Object.entries(prog)) {
      if (/解析版/.test(rel) && rec.parseStatus === 'skipped-doc') {
        const k = stripVersion(path.basename(rel));
        if (!pairIndex.has(k)) pairIndex.set(k, []);
        pairIndex.get(k).push({ rel, rec });
      }
    }
    const subjDir = path.join(papersDir, subject);
    fs.mkdirSync(subjDir, { recursive: true });
    let qCount = 0, pCount = 0;

    for (const [rel, rec] of Object.entries(prog)) {
      if (rec.parseStatus !== 'ok' || !rec.questions?.length) continue;
      // 配对答案
      const ansMap = new Map();
      const pairKey = stripVersion(path.basename(rel));
      for (const f of pairIndex.get(pairKey) || []) {
        try {
          const text = await extractText(path.join(PAPER_ROOT, subject, f.rel));
          for (const [qno, v] of parseAnswerFile(text)) ansMap.set(qno, v);
        } catch { /* ignore */ }
      }
      const ansList = [...ansMap.values()];
      const imgMap = imgMapAll.get(rel) || {};
      const questions = rec.questions.map((q, i) => {
        const paired = ansMap.get(q.no) || ansList[i] || {};
        const hasOpts = Array.isArray(q.options) && q.options.length > 0;
        return {
          no: q.no, type: q.type || '未知',
          question: q.question || '',
          options: hasOpts ? q.options : [],
          answer: paired.answer || q.answer || '',
          analysis: paired.analysis || q.analysis || '',
          image: imgMap[q.no] ? `/uploads/questions/${imgMap[q.no]}` : '',
        };
      });
      const volId = `${subject}-${Math.abs(hashStr(rel)) % 1000000}`;
      const paperJson = {
        name: stripVersion(rec.name || path.basename(rel)),
        subject, category: rec.category || '其他', dir: rec.dir, sourceFile: rel,
        paperType: rec.category === '期中' ? 'MIDTERM' : rec.category === '期末' ? 'FINAL' : 'UNIT',
        questions,
      };
      fs.writeFileSync(path.join(subjDir, `${volId}.json`), JSON.stringify(paperJson, null, 1), 'utf8');
      qCount += questions.length; pCount++;
    }
    stats[subject] = { papers: pCount, questions: qCount };
    totalPapers += pCount; totalQuestions += qCount;
    console.log(`[${subject}] ${pCount} 卷 / ${qCount} 题`);
  }

  // 复制题图（去重）
  let imgCount = 0;
  const seen = new Set();
  for (const [rel, images] of imgMapAll) {
    for (const img of Object.values(images)) {
      if (seen.has(img)) continue;
      seen.add(img);
      const src = path.join(IMG_DIR, img);
      if (fs.existsSync(src)) {
        const dest = path.join(imagesDir, img.replace(/[/\\]/g, '_'));
        fs.copyFileSync(src, dest);
        imgCount++;
      }
    }
  }

  const metadata = {
    format: 'papers-package-v1',
    generatedAt: new Date().toISOString(),
    subjects: SUBJECTS, papers: totalPapers, questions: totalQuestions, images: imgCount,
    perSubject: stats,
  };
  fs.writeFileSync(path.join(OUT, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');

  // import.sh 模板
  fs.writeFileSync(path.join(OUT, 'import.sh'), `#!/usr/bin/env bash
# 试卷离线数据包一键导入（目标环境：后端容器或本机 backend 目录执行）
# 用法：bash import.sh <backend目录>
set -e
BACKEND="\${1:-\$(pwd)}"
cd "\$BACKEND"
echo "[1/2] 校验 metadata..."
node -e "const m=require('./metadata.json'); console.log('  包:', m.format, '| 卷:', m.papers, '| 题:', m.questions, '| 图:', m.images)"
echo "[2/2] 导入题库..."
node scripts/import-papers-to-db.mjs --package "\$(dirname "\$0")"
echo "导入完成 ✅"
`, 'utf8');

  console.log(`\n=== 打包完成：${totalPapers} 卷 / ${totalQuestions} 题 / ${imgCount} 图 ===`);
  console.log('包目录:', OUT);
  console.log('分发：tar -czf papers-package-v1.tar.gz -C <父目录> papers-package-v1');
}

function hashStr(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

main().catch((e) => { console.error(e); process.exit(1); });
