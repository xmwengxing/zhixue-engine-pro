/**
 * 试卷入库脚本（含 答案/解析配对合并 + 题级图片关联）
 * 用法：node scripts/import-papers-to-db.mjs --subjects 历史,语文 --dry
 * 流程：
 *   1. 读 progress-full-<学科>.json（ok 记录含题目）
 *   2. 卷组配对：原卷版 ↔ 答案版 ↔ 解析版（文件名去「版」字样匹配）
 *   3. 解析版 → parseAnswerFile → {题号: {answer, analysis}} 回填
 *   4. 图：uploads/questions/<卷ID>/map.json → {题号: image} 关联
 *   5. 写库（Question/QuestionPaper/QuestionPaperItem，sourceFile 幂等）
 * 断点：progress-import.json
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const prisma = new PrismaClient();
const PROGRESS_DIR = 'E:/Projects/zhixue-engine-pro/开发文档/试卷转换产物';
const IMG_DIR = 'E:/Projects/zhixue-engine-pro/backend/uploads/questions';
const PAPER_ROOT = 'E:/Projects/题库/试卷与习题';
const IMPORT_PROGRESS = path.join(PROGRESS_DIR, 'progress-import.json');

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SUBJECTS = (getArg('--subjects', '历史,语文,英语,数学,物理') || '').split(',').map((s) => s.trim());
const DRY = args.includes('--dry');

// ---------- 文本提取（解析版用） ----------
async function extractText(fp) {
  const ext = path.extname(fp).toLowerCase();
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    return (await pdfParse(fs.readFileSync(fp))).text || '';
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    return (await mammoth.extractRawText({ path: fp })).value || '';
  }
  return '';
}

// ---------- 解析版答案提取（复制自 import-real-papers） ----------
function parseAnswerFile(text) {
  const out = new Map();
  if (!text) return out;
  const t = String(text)
    .replace(/(\d+)\s*[．.、]\s*(?=【答案】|答案[：:])/g, '\n$1.')
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n');
  const blocks = t.split(/\n(?=\d+\s*[．.、])/);
  let seq = 0;
  for (const blk of blocks) {
    const line = blk.trim();
    if (!line) continue;
    const tm = line.match(/^(\d+)\s*[．.、]/);
    if (tm) seq = parseInt(tm[1], 10);
    else seq += 1;
    let answer = '';
    let analysis = '';
    const am = line.match(/【答案】\s*([\s\S]*?)(?=【|$)/);
    if (am) {
      answer = am[1].replace(/\s+/g, ' ').trim();
      const anm = line.match(/【解析】\s*([\s\S]*?)(?=【|$)/);
      if (anm) analysis = anm[1].replace(/\s+/g, ' ').trim();
    } else {
      const cm = line.match(/答案[：:]\s*([A-H0-9、.,\s]+)/);
      if (cm) {
        answer = cm[1].replace(/\s+/g, ' ').trim();
        const cn = line.match(/解析[：:]\s*([^\n]*)/);
        if (cn) analysis = cn[1].replace(/\s+/g, ' ').trim();
      } else {
        const bare = line.replace(/^\d+\s*[．.、]\s*/, '').trim();
        if (/^[A-H](?:、|\.)?/i.test(bare)) answer = bare.replace(/\s+/g, ' ').trim();
      }
    }
    if (answer && !out.has(seq)) out.set(seq, { answer: answer.replace(/[（(【\[]+/g, '').trim(), analysis });
  }
  return out;
}

// ---------- 映射 ----------
const DIFF_MAP = { 简单: 2, 容易: 2, 适中: 3, 中等: 3, 偏难: 4, 较难: 4, 困难: 5, 难: 5 };
function toDiff(s) { return DIFF_MAP[s] || 3; }
function toQType(rec, hasOpts) {
  const t = String(rec.type || '');
  if (t.includes('判断')) return 'JUDGE';
  if (t.includes('多选')) return 'MULTIPLE_CHOICE';
  if (hasOpts) return 'CHOICE';
  if (t.includes('填空')) return 'FILL';
  return 'ESSAY';
}
function toPaperType(cat) {
  if (cat === '期中') return 'MIDTERM';
  if (cat === '期末') return 'FINAL';
  return 'UNIT';
}
function stripVersion(name) {
  return String(name).replace(/[（(]\s*(原卷版|答案版|解析版)\s*[)）]/g, '').trim();
}
function volId(subject, rel) { return `${subject}-${Math.abs(hashStr(rel)) % 1000000}`; }
function hashStr(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

// ---------- 写库 ----------
async function ensureSubjectNode(subject) {
  let node = await prisma.materialNode.findFirst({ where: { name: subject, type: 'SUBJECT' } });
  if (node) return node;
  node = await prisma.materialNode.create({ data: { name: subject, type: 'SUBJECT' } });
  return node;
}
async function getAdminId() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('无管理员账户');
  return admin.id;
}

async function main() {
  const adminId = await getAdminId();
  const doneMap = fs.existsSync(IMPORT_PROGRESS) ? JSON.parse(fs.readFileSync(IMPORT_PROGRESS, 'utf8')) : {};
  let qTotal = 0, pTotal = 0;

  for (const subject of SUBJECTS) {
    const progPath = path.join(PROGRESS_DIR, `progress-full-${subject}.json`);
    if (!fs.existsSync(progPath)) { console.log(`[跳过] 无进度: ${subject}`); continue; }
    const prog = JSON.parse(fs.readFileSync(progPath, 'utf8'));

    // 卷组配对：按「去版后缀」名分组（组内取 ok 卷为主卷）
    const groups = new Map();
    for (const [rel, rec] of Object.entries(prog)) {
      if (rec.parseStatus !== 'ok') continue;
      const base = path.basename(rel);
      const key = `${rec.dir}\\${stripVersion(base)}`;
      if (!groups.has(key)) groups.set(key, { subject, dir: rec.dir, files: [] });
      groups.get(key).files.push({ rel, rec });
    }
    console.log(`[${subject}] 卷组 ${groups.size} 个（ok 卷）`);

    const node = await ensureSubjectNode(subject);
    const catCache = new Map();
    const getCat = async (catName) => {
      if (catName === '其他') catName = '通用与其他';
      const k = `${subject}|${catName}`;
      if (catCache.has(k)) return catCache.get(k);
      const cat = await prisma.paperCategory.findFirst({ where: { subject, name: catName, parentId: null } });
      catCache.set(k, cat?.id || null);
      return cat?.id || null;
    };

    for (const [key, g] of groups) {
      if (doneMap[key]) { qTotal += doneMap[key].q; pTotal += 1; continue; }
      // 主卷：原卷版优先，否则第一个
      const main = g.files.find((f) => f.rec.parseStatus === 'ok' && /原卷版/.test(f.rel)) || g.files[0];
      const questions = main.rec.questions || [];

      // 配对解析版（同组内 skipped-doc 的解析版文件）→ 答案/解析
      const ansMap = new Map();
      for (const f of g.files) {
        if (!/解析版/.test(f.rel) || f.rec.parseStatus !== 'skipped-doc') continue;
        try {
          const text = await extractText(path.join(PAPER_ROOT, subject, f.rel));
          const m = parseAnswerFile(text);
          for (const [qno, v] of m) ansMap.set(qno, v);
        } catch { /* 解析失败忽略 */ }
      }

      // 题级图（extract-question-images.py 产物）
      const mapPath = path.join(IMG_DIR, volId(subject, main.rel), 'map.json');
      const imgMap = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, 'utf8')).images || {} : {};

      // 试卷入库（sourceFile 幂等：已存在则跳过该卷；空题卷跳过）
      const title = stripVersion(main.rec.name || path.basename(main.rel));
      if (!questions.length) {
        doneMap[key] = { q: 0, skipped: 'empty' };
        console.log(`  [空题跳过] ${title}`);
        fs.writeFileSync(IMPORT_PROGRESS, JSON.stringify(doneMap, null, 1));
        continue;
      }
      const existPaper = await prisma.questionPaper.findFirst({ where: { sourceFile: main.rel } });
      if (existPaper) {
        doneMap[key] = { q: questions.length, paper: existPaper.id, skipped: true };
        qTotal += questions.length; pTotal += 1;
        console.log(`  [已存在] ${title}`);
        fs.writeFileSync(IMPORT_PROGRESS, JSON.stringify(doneMap, null, 1));
        continue;
      }
      const paper = await prisma.questionPaper.create({
        data: {
          subject, title,
          sourceFile: main.rel,
          status: 'PUBLISHED',
          createdBy: adminId,
          paperType: toPaperType(main.rec.category),
          categoryId: await getCat(main.rec.category),
        },
      });

      // 题目入库
      let qn = 0;
      for (const q of questions) {
        const hasOpts = Array.isArray(q.options) && q.options.length > 0;
        const qtype = toQType(q, hasOpts);
        const paired = ansMap.get(q.no) || {};
        const content = {
          stem: q.question || '',
          image: imgMap[q.no] ? `/uploads/questions/${imgMap[q.no]}` : '',
          options: hasOpts ? q.options.map((o) => ({ key: o.key, text: o.text })) : [],
          correctAnswer: paired.answer || q.answer || '',
          explanation: paired.analysis || q.analysis || '',
        };
        const created = await prisma.question.create({
          data: {
            materialNodeId: node.id,
            type: qtype,
            content,
            answer: content.correctAnswer,
            analysis: content.explanation || null,
            difficulty: toDiff(q.difficulty),
            knowledgePoints: [],
            answerType: qtype === 'CHOICE' ? 'single_choice' : qtype === 'FILL' ? 'fill_blank' : 'short_answer',
            answerConfig: content.correctAnswer ? { correctAnswer: content.correctAnswer } : {},
          },
        });
        await prisma.questionPaperItem.create({
          data: { paperId: paper.id, questionId: created.id, order: qn++ },
        });
      }
      qTotal += questions.length; pTotal += 1;
      doneMap[key] = { q: questions.length, paper: paper.id };
      if (qn === 0) console.log(`  [空题] ${title}`);
      if (!DRY && qn > 0) console.log(`  [入] ${title} -> ${qn} 题（配对答案 ${ansMap.size} 题/图 ${Object.keys(imgMap).length} 张）`);
      fs.writeFileSync(IMPORT_PROGRESS, JSON.stringify(doneMap, null, 1));
    }
  }
  console.log(`\n=== 入库完成：${pTotal} 卷 / ${qTotal} 题${DRY ? '（DRY 未写库）' : ''} ===`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
