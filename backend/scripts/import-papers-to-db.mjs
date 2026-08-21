/**
 * 试卷入库脚本（含 答案/解析配对合并 + 题级图片关联）
 * 用法：node scripts/import-papers-to-db.mjs --subjects 历史,语文 --dry
 * 流程：
 *   1. 读 progress-full2-<学科>.json（ok 记录含题目）
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
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

// ---------- 配置（支持环境变量和 CLI 参数） ----------
const args = process.argv.slice(2);
function getArgVal(n, d) { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; }
const PROGRESS_DIR = getArgVal('--progress-dir', process.env.PROGRESS_DIR || path.resolve(__dirname, '../../开发文档/试卷转换产物'));
const IMG_DIR = getArgVal('--img-dir', process.env.IMG_DIR || path.resolve(__dirname, '../../uploads/questions'));
const PAPER_ROOT = getArgVal('--paper-root', process.env.PAPER_ROOT || 'E:/Projects/题库/八年级/试卷与习题');
const IMPORT_PROGRESS = path.join(PROGRESS_DIR, 'progress-import.json');
const SUBJECTS = (getArgVal('--subjects', '历史,语文,英语,数学,物理') || '').split(',').map((s) => s.trim());
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

// ---------- 解析版答案提取（v2：适配实际格式） ----------
function parseAnswerFile(text) {
  const out = new Map();
  if (!text) return out;
  const t = String(text).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');
  
  // ===== 策略1：从答案表格提取 =====
  // 格式：题号12621222627313246  答案BDDDDDDCDD
  const tableRegex = /题号\s*([\d\s]+)\s*\n?\s*答案\s*([A-Ha-h0-9\s]+)/g;
  let tableMatch;
  while ((tableMatch = tableRegex.exec(t)) !== null) {
    const nums = tableMatch[1].trim().split(/\s+/).map(Number);
    const answers = tableMatch[2].trim().split(/\s+/);
    for (let i = 0; i < nums.length && i < answers.length; i++) {
      if (!out.has(nums[i])) {
        if (nums[i] <= 200) out.set(nums[i], { answer: answers[i], analysis: '' });
      }
    }
  }
  
  // ===== 策略2：从逐题格式提取 =====
  // 格式：N．答案【详解】解：... 或 N．答案【解析】...
  // 也兼容：N．答案\n【详解】解：...
  const qBlocks = t.split(/\n(?=\d+\s*[．.、])/);
  for (const blk of qBlocks) {
    const block = blk.trim();
    if (!block) continue;
    const numMatch = block.match(/^(\d+)\s*[．.、]\s*/);
    if (!numMatch) continue;
    const qno = parseInt(numMatch[1], 10);
    const rest = block.slice(numMatch[0].length).trim();
    
    // 提取答案：答案在【详解】/【解析】/【分析】之前
    let answer = '';
    let analysis = '';
    
    // 匹配：答案【详解】... 或 答案【解析】...
    const ansMatch = rest.match(/^([^\s【]+)\s*【/);
    if (ansMatch) {
      answer = ansMatch[1].trim();
    } else {
      // 没有【标记，取第一行非空内容作为答案
      const firstLine = rest.split('\n')[0].trim();
      if (firstLine && firstLine.length < 20) {
        answer = firstLine;
      }
    }
    
    // 提取解析
    const anaMatch = rest.match(/【详解】\s*([\s\S]*?)$/);
    const anaMatch2 = rest.match(/【解析】\s*([\s\S]*?)$/);
    const anaMatch3 = rest.match(/【分析】\s*([\s\S]*?)$/);
    analysis = (anaMatch || anaMatch2 || anaMatch3 || [])[1] || '';
    analysis = analysis.replace(/\s+/g, ' ').trim().slice(0, 500); // 截断过长解析
    
    if (answer && !out.has(qno)) {
      // 清理答案：移除括号等
      answer = answer.replace(/[（(【\[]+/g, '').replace(/[）)】\]]+/g, '').trim();
      if (qno <= 200) out.set(qno, { answer, analysis });
    }
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
  // 去「版」字样 + 折叠并去除全部空格（用户整理时的空格差异：`概念（分层作业）` vs `概念 （分层作业）`）
  return String(name).replace(/[（(]\s*(原卷版|答案版|解析版)\s*[)）]/g, '').replace(/\s+/g, '').trim();
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

  // ---- 离线数据包导入模式：--package <包目录>（读 papers/**/*.json 写库，图片路径已在包内）----
  if (args.includes('--package')) {
    const pkgDir = getArg('--package', '');
    const papersRoot = path.join(pkgDir, 'papers');
    if (!fs.existsSync(papersRoot)) { console.error('包目录无 papers/:', pkgDir); process.exit(1); }
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.json')) files.push(p); } };
    walk(papersRoot);
    let qTotal = 0, pTotal = 0;
    for (const fp of files) {
      const paper = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const subject = paper.subject;
      if (!subject || !paper.questions?.length) continue;
      const node = await ensureSubjectNode(subject);
      const existPaper = await prisma.questionPaper.findFirst({ where: { sourceFile: paper.sourceFile || paper.name } });
      if (existPaper) { pTotal++; qTotal += paper.questions.length; continue; }
      const cat = paper.category === '其他' ? '通用与其他' : paper.category;
      const catNode = await prisma.paperCategory.findFirst({ where: { subject, name: cat, parentId: null } });
      const createdPaper = await prisma.questionPaper.create({
        data: { subject, title: paper.name, sourceFile: paper.sourceFile || paper.name, status: 'PUBLISHED',
          createdBy: adminId, paperType: paper.paperType || 'UNIT', categoryId: catNode?.id || null },
      });
      let qn = 0;
      for (const q of paper.questions) {
        const hasOpts = Array.isArray(q.options) && q.options.length > 0;
        const qtype = toQType(q, hasOpts);
        const content = { stem: q.question || '', image: q.image || '', options: hasOpts ? q.options : [], correctAnswer: q.answer || '', explanation: q.analysis || '' };
        const created = await prisma.question.create({
          data: { materialNodeId: node.id, type: qtype, content, answer: content.correctAnswer,
            analysis: content.explanation || null, difficulty: toDiff(q.difficulty), knowledgePoints: [],
            answerType: qtype === 'CHOICE' ? 'single_choice' : qtype === 'FILL' ? 'fill_blank' : 'short_answer',
            answerConfig: content.correctAnswer ? { correctAnswer: content.correctAnswer } : {} },
        });
        await prisma.questionPaperItem.create({ data: { paperId: createdPaper.id, questionId: created.id, order: qn++ } });
      }
      qTotal += paper.questions.length; pTotal++;
      if (!DRY) fs.writeFileSync(IMPORT_PROGRESS, JSON.stringify(doneMap, null, 1));
      console.log(`  [包导入] ${subject}/${paper.name.slice(0, 40)} -> ${paper.questions.length} 题`);
    }
    console.log(`\n=== 数据包导入完成：${pTotal} 卷 / ${qTotal} 题${DRY ? '（DRY）' : ''} ===`);
    await prisma.$disconnect();
    return;
  }

  // 图索引：遍历 uploads/questions/*/map.json → {sourceFile: {题号: 图路径}}（ID 无关）
  const imgIndex = new Map();
  if (fs.existsSync(IMG_DIR)) {
    for (const vol of fs.readdirSync(IMG_DIR)) {
      const mp = path.join(IMG_DIR, vol, 'map.json');
      if (!fs.existsSync(mp)) continue;
      try {
        const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
        if (m.sourceFile && m.images) imgIndex.set(m.sourceFile, m.images);
      } catch { /* 忽略坏 map */ }
    }
  }
  console.log(`[图索引] ${imgIndex.size} 卷有题图`);
  let qTotal = 0, pTotal = 0;

  for (const subject of SUBJECTS) {
    const progPath = path.join(PROGRESS_DIR, `progress-v2-${subject}.json`);
    if (!fs.existsSync(progPath)) { console.log(`[跳过] 无进度: ${subject}`); continue; }
    const prog = JSON.parse(fs.readFileSync(progPath, 'utf8'));

    // 卷组配对：按「目录 + 去版后缀名」分组（同名不同目录各自成组——不丢卷）
    const groups = new Map();
    for (const [rel, rec] of Object.entries(prog)) {
      if (rec.parseStatus !== 'ok') continue;
      const base = path.basename(rel);
      const key = `${rec.dir}\\${stripVersion(base)}`;
      if (!groups.has(key)) groups.set(key, { subject, dir: rec.dir, files: [] });
      groups.get(key).files.push({ rel, rec });
    }
    // 配对索引：全局按「去版后缀文件名」找解析版（解析版常在专项顶层，与原卷版跨目录）
    const pairIndex = new Map();
    for (const [rel, rec] of Object.entries(prog)) {
      if (/解析版/.test(rel) && rec.parseStatus === 'skipped-doc') {
        const k = stripVersion(path.basename(rel));
        if (!pairIndex.has(k)) pairIndex.set(k, []);
        pairIndex.get(k).push({ rel, rec });
      }
    }
    console.log(`[${subject}] 卷组 ${groups.size} 个（ok 卷）/ 解析版索引 ${pairIndex.size} 个`);

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

      // 配对解析版（全局索引，跨目录按去版名匹配）→ 答案/解析
      const ansMap = new Map();
      const pairKey = stripVersion(path.basename(main.rel));
      for (const f of pairIndex.get(pairKey) || []) {
        try {
          const text = await extractText(path.join(PAPER_ROOT, subject, f.rel));
          const m = parseAnswerFile(text);
          for (const [qno, v] of m) ansMap.set(qno, v);
        } catch (e) { console.log(`    [配对失败] ${f.rel.slice(0, 50)}: ${String(e.message || e).slice(0, 60)}`); }
      }
      if (ansMap.size > 0) console.log(`  [配对源] ${main.rec.name || ''}: ${ansMap.size} 题答案`);

      // 题级图（extract-question-images.py 产物；按 sourceFile 匹配，避免目录 ID 算法差异）
      const imgMap = imgIndex.get(main.rel) || {};

      // 试卷入库（sourceFile 幂等：已存在则跳过该卷；空题卷跳过）
      const title = stripVersion(main.rec.name || path.basename(main.rel));
      if (!questions.length) {
        doneMap[key] = { q: 0, skipped: 'empty' };
        console.log(`  [空题跳过] ${title}`);
        if (!DRY) fs.writeFileSync(IMPORT_PROGRESS, JSON.stringify(doneMap, null, 1));
        continue;
      }
      const existPaper = await prisma.questionPaper.findFirst({ where: { sourceFile: main.rel } });
      if (existPaper) {
        doneMap[key] = { q: questions.length, paper: existPaper.id, skipped: true };
        qTotal += questions.length; pTotal += 1;
        console.log(`  [已存在] ${title}`);
        if (!DRY) fs.writeFileSync(IMPORT_PROGRESS, JSON.stringify(doneMap, null, 1));
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
      const ansList = [...ansMap.values()]; // 顺序兜底：解析版通常与题目同序
      for (const q of questions) {
        const hasOpts = Array.isArray(q.options) && q.options.length > 0;
        const qtype = toQType(q, hasOpts);
        // 配对：题号优先，题号不匹配时按题目顺序兜底
        const paired = ansMap.get(q.no) || ansList[qn] || {};
        const content = {
          stem: q.question || '',
          image: imgMap[q.no] ? `/uploads/questions/${imgMap[q.no]}` : '',
          options: hasOpts ? q.options.map((o) => ({ key: o.key, text: o.text })) : [],
          correctAnswer: (q.answer && q.answer.length < 20 ? q.answer : paired.answer) || q.answer || '',
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
      if (qn > 0) console.log(`  [入] ${title} -> ${qn} 题（配对答案 ${ansMap.size} 题/图 ${Object.keys(imgMap).length} 张）`);
      if (!DRY) fs.writeFileSync(IMPORT_PROGRESS, JSON.stringify(doneMap, null, 1));
    }
  }
  console.log(`\n=== 入库完成：${pTotal} 卷 / ${qTotal} 题${DRY ? '（DRY 未写库）' : ''} ===`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
