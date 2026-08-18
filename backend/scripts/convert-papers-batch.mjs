/**
 * 试卷批量转换脚本（常态化工作流试点版）
 * 用法：node scripts/convert-papers-batch.mjs --dir <试卷根> --subject 历史 --limit 20 --out <产物目录>
 *
 * 流程：扫描学科目录 → 去双后缀命名 → 文本层提取（pdf-parse/mammoth，零 OCR）→
 *       结构化解析（智慧中小学 / 通用 DOCX 格式）→ JSON 产物 + 质量统计
 * 说明：试点阶段只出 JSON 产物（不入库）；全量阶段再入库。
 * 断点：--progress <file> 记录已完成文件；--resume 跳过已完成。
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- 参数 ----------
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const ROOT = getArg('--dir', 'E:/Projects/题库/试卷与习题');
const SUBJECT = getArg('--subject', '历史');
const LIMIT = parseInt(getArg('--limit', '20'), 10);
const OUT_DIR = getArg('--out', path.resolve(__dirname, '../../开发文档/试卷转换产物'));
const PROGRESS = getArg('--progress', path.join(OUT_DIR, `progress-${SUBJECT}.json`));

// ---------- 文本提取 ----------
async function extractText(fp) {
  const ext = path.extname(fp).toLowerCase();
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fs.readFileSync(fp));
    return data.text || '';
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const { value } = await mammoth.extractRawText({ path: fp });
    return value;
  }
  throw new Error('不支持的类型: ' + ext);
}

// ---------- 通用清洗 ----------
function tidy(s) {
  return String(s || '')
    .replace(/【智慧中小学APP扫码查看完整解析】/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function joinBrokenLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const next = (lines[i + 1] || '').trim();
    // 块起始判定（覆盖「逐字断行」PDF：如 6\n．\n（24-25... / A\n．分封制）
    const isQuestionNo = /^\d+[.．、]/.test(line) || (/^\d+$/.test(line) && /^[.．、]|^（|^\(/.test(next));
    const isOption = /^[A-Z][.．、]/.test(line) || (/^[A-Z]$/.test(line) && /^[.．、]/.test(next));
    const isMark = /^【/.test(line);
    if (isQuestionNo || isOption || isMark || out.length === 0) out.push(line);
    else out[out.length - 1] += line;
  }
  return out;
}

// ---------- 解析器 1：智慧中小学 PDF（【题型】标记式） ----------
function parseSmartEduPdf(text) {
  const lines = joinBrokenLines(tidy(text).split('\n'));
  const questions = [];
  let current = null;
  const TYPES = ['单选题', '多选题', '判断题', '填空题', '解答题', '简答题', '计算题', '阅读理解', '作文'];
  for (const line of lines) {
    const m = line.match(/^(\d+)[.．]\s*【([^】]+)】(.*)$/);
    if (m) {
      if (current) questions.push(current);
      const qtype = TYPES.find((t) => m[2].includes(t)) || '未知';
      current = { no: parseInt(m[1], 10), type: qtype, question: tidy(m[3]), options: [], answer: '', difficulty: null, analysis: '' };
      continue;
    }
    if (!current) continue;
    const opt = line.match(/^([A-Z])[.．、]\s*(.+)$/);
    if (opt && current.options.length < 6) { current.options.push({ key: opt[1], text: tidy(opt[2]) }); continue; }
    const ans = line.match(/【正确答案】\s*([A-Za-z、，,\s]+)/);
    if (ans) { current.answer = ans[1].replace(/[、，,\s]/g, ''); continue; }
    const diff = line.match(/难易度[:：]\s*(\S+)/);
    if (diff) { current.difficulty = diff[1]; continue; }
    const ana = line.match(/解析[:：](.+)/);
    if (ana) { current.analysis = tidy(ana[1]); continue; }
    if (current.question) current.question += ' ' + tidy(line);
  }
  if (current) questions.push(current);
  return questions;
}

// ---------- 解析器 2：通用 DOCX/试卷（N．题干 A．x B．x 正确答案：X / 【答案】X） ----------
function parseGenericDocx(text) {
  const lines = joinBrokenLines(tidy(text).split('\n'));
  const questions = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^(\d+)[.．、]\s*(.+)$/);
    if (m) {
      if (current) questions.push(current);
      current = { no: parseInt(m[1], 10), type: '未知', question: tidy(m[2]), options: [], answer: '', difficulty: null, analysis: '' };
      continue;
    }
    if (!current) continue;
    // 行内多选项拆分（PDF 排版把「B．xxx」拼进「A．yyy」行尾：A．甲B．乙）
    if (/[A-Z][.．、]/.test(line)) {
      const segs = line.split(/(?=[A-Z][.．、])/);
      let matched = false;
      for (const s of segs) {
        const o = s.match(/^([A-Z])[.．、]\s*(.+)$/);
        if (o && current.options.length < 6) { current.options.push({ key: o[1], text: tidy(o[2]) }); matched = true; }
      }
      if (matched) continue;
    }
    const opt = line.match(/^([A-Z])[.．、]\s*(.+)$/);
    if (opt && current.options.length < 6) { current.options.push({ key: opt[1], text: tidy(opt[2]) }); continue; }
    const ans = line.match(/【答案】\s*([A-Za-z、，,\s]+)/) || line.match(/答案[:：]?\s*([A-Za-z、，,\s]+)/);
    if (ans) { current.answer = ans[1].replace(/[、，,\s]/g, ''); continue; }
    const ana = line.match(/【解析】\s*(.+)/) || line.match(/解析[:：](.+)/);
    if (ana) { current.analysis = tidy(ana[1]); continue; }
    if (current.question) current.question += ' ' + tidy(line);
  }
  if (current) questions.push(current);
  return questions;
}

/** 去双后缀命名：循环剥掉 .pdf/.docx/.doc */
function stripSuffixes(fname) {
  let n = fname;
  for (let i = 0; i < 4; i++) {
    const m = n.match(/^(.*)\.(pdf|docx|doc)$/i);
    if (!m) break;
    n = m[1];
  }
  return n.trim();
}

/** 相对目录 → 分类（期中/期末/专项/单元/其他） */
function categorize(relDir) {
  if (/期中/.test(relDir)) return '期中';
  if (/期末/.test(relDir)) return '期末';
  if (/专项/.test(relDir)) return '专项';
  if (/单元/.test(relDir)) return '单元';
  return '其他';
}

async function main() {
  const subjectRoot = path.join(ROOT, SUBJECT);
  if (!fs.existsSync(subjectRoot)) { console.error('目录不存在:', subjectRoot); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 扫描全部 PDF/DOCX
  const all = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, path.join(rel, e.name));
      else if (/\.(pdf|docx|doc)$/i.test(e.name)) all.push({ abs: p, rel: path.join(rel, e.name), dir: rel });
    }
  };
  walk(subjectRoot, '');
  console.log(`[扫描] ${SUBJECT}: 共 ${all.length} 个文件`);

  // 按分类分层抽样：四分类目录优先，其余兜底
  const byCat = { 期中: [], 期末: [], 专项: [], 单元: [], 其他: [] };
  for (const f of all) byCat[categorize(f.dir)].push(f);
  const pick = [];
  const per = Math.max(1, Math.floor(LIMIT / 5));
  for (const k of Object.keys(byCat)) pick.push(...byCat[k].slice(0, per));
  const files = pick.slice(0, LIMIT);
  console.log(`[抽样] ${files.length} 个（期中${byCat.期中.length}/期末${byCat.期末.length}/专项${byCat.专项.length}/单元${byCat.单元.length}/其他${byCat.其他.length}）`);

  // 断点续传
  const done = fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, 'utf8')) : {};
  const results = { subject: SUBJECT, generatedAt: new Date().toISOString(), files: [] };
  let ok = 0, empty = 0, failed = 0;

  for (const f of files) {
    if (done[f.rel]) { console.log(`[跳过] ${f.rel}`); results.files.push(done[f.rel]); ok++; continue; }
    const name = stripSuffixes(path.basename(f.abs));
    // 「解析版」文档跳过（非试卷本体，仅答案/解析汇总）
    if (/解析版/.test(path.basename(f.abs))) {
      const rec = { name, category: categorize(f.dir), dir: f.dir, sourceFile: f.rel, questionCount: 0, parseStatus: 'skipped-doc' };
      results.files.push(rec); done[f.rel] = rec;
      console.log(`[跳过] 解析版文档: ${name}`);
      continue;
    }
    const record = {
      name, category: categorize(f.dir), dir: f.dir, sourceFile: f.rel,
      questionCount: 0, parseStatus: 'ok', questions: [],
    };
    try {
      const text = await extractText(f.abs);
      if (!text || text.trim().length < 50) {
        record.parseStatus = 'text-empty'; // 扫描件：无文本层，需 OCR（试点不计入 OK）
        empty++;
        console.log(`[文本空] ${name}`);
      } else {
        const qs = text.includes('【') && /单选题|填空题|解答题/.test(text)
          ? parseSmartEduPdf(text)
          : parseGenericDocx(text);
        record.questions = qs;
        record.questionCount = qs.length;
        ok++;
        console.log(`[成功] ${name} -> ${qs.length} 题`);
      }
    } catch (e) {
      record.parseStatus = 'error';
      record.error = String(e.message || e).slice(0, 200);
      failed++;
      console.log(`[失败] ${name}: ${record.error}`);
    }
    results.files.push(record);
    done[f.rel] = record;
    fs.writeFileSync(PROGRESS, JSON.stringify(done, null, 1));
    fs.writeFileSync(path.join(OUT_DIR, `产物-${SUBJECT}-${Date.now()}.json`), JSON.stringify(record, null, 2), 'utf8');
  }

  const report = {
    subject: SUBJECT, files: files.length, ok, textEmpty: empty, failed,
    okRate: files.length ? ((ok / files.length) * 100).toFixed(1) + '%' : '0%',
    totalQuestions: results.files.reduce((s, r) => s + (r.questionCount || 0), 0),
  };
  fs.writeFileSync(path.join(OUT_DIR, `报告-${SUBJECT}-${Date.now()}.json`), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n=== 转换完成：${SUBJECT} ===`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`产物目录: ${OUT_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
