#!/usr/bin/env node
/**
 * 数学/物理 PDF 公式 OCR 脚本（v2）
 * 用法：node scripts/ocr-formulas.mjs --subject 数学 [--limit 10] [--retry-errors]
 * PaddleOCR-VL 识别公式 → LaTeX 替换乱码文本
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- 配置（支持环境变量和 CLI 参数） ----------
function findPython() {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py -3']
    : ['python3', 'python'];
  for (const c of candidates) {
    try {
      const bin = c.includes(' ') ? c.split(' ')[0] : c;
      execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
      return c.includes(' ') ? c.split(' ') : c;
    } catch { continue; }
  }
  console.error('[错误] 未找到 Python，请设置环境变量 PYTHON_PATH');
  process.exit(1);
}
const PY = findPython();

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SUBJECT = getArg('--subject', '数学');
const LIMIT = parseInt(getArg('--limit', '99999'), 10);
const RETRY_ERRORS = args.includes('--retry-errors');
const PROGRESS_DIR = getArg('--progress-dir', process.env.PROGRESS_DIR || path.resolve(__dirname, '../../开发文档/试卷转换产物'));
const PAPER_ROOT = getArg('--paper-root', process.env.PAPER_ROOT || 'E:/Projects/题库/八年级/试卷与习题');
const OCR_USAGE = getArg('--ocr-usage', process.env.OCR_USAGE || path.join(PROGRESS_DIR, 'ocr-usage.json'));
const OCR_LIMIT = parseInt(getArg('--ocr-limit', process.env.OCR_LIMIT || '20000'), 10);

/** 获取飞桨 token：优先环境变量 PADDLE_API_KEY，其次数据库查询 */
function getPaddleToken() {
  if (process.env.PADDLE_API_KEY) return process.env.PADDLE_API_KEY;
  try {
    return execFileSync('docker', ['exec', 'training-platform-db', 'psql', '-U', 'training_user',
      '-d', 'training_platform', '-t', '-c', "SELECT api_key FROM ocr_providers WHERE method='PADDLE_OCR_VL';"],
      { encoding: 'utf8' }).split('\n')[0].trim();
  } catch (e) { console.error('[OCR] token 失败:', String(e.message || e).slice(0, 120));
    console.error('  提示：可通过环境变量 PADDLE_API_KEY 或 DataWork/.env 配置');
    return ''; }
}

function ocrPdf(pdfPath, maxPages) {
  const token = getPaddleToken();
  if (!token) throw new Error('未配置飞桨 token');
  const outTxt = path.join(PROGRESS_DIR, '.ocr-formula-tmp.txt');
  const res = execFileSync(PY, ['scripts/ocr-papers.py', '--file', pdfPath, '--token', token,
    '--out', outTxt, '--max-pages', String(maxPages || 999), '--usage', OCR_USAGE, '--limit', String(OCR_LIMIT)],
    { encoding: 'utf8', timeout: 25 * 60 * 1000 });
  if (res.includes('QUOTA_EXCEED') || res.includes('QUOTA_EXHAUSTED')) throw new Error('QUOTA_EXHAUSTED');
  const text = fs.existsSync(outTxt) ? fs.readFileSync(outTxt, 'utf8') : '';
  try { fs.unlinkSync(outTxt); } catch {}
  return text;
}

/** 从 OCR markdown 中解析题目 */
function parseOcrQuestions(ocrText) {
  if (!ocrText) return [];
  // 合并连续空行，统一换行
  const text = ocrText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
  const lines = text.split('\n');
  const questions = [];
  let cur = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 新题检测：N．或 N. 开头
    const qm = line.match(/^(\d{1,3})\s*[．.]\s*/);
    if (qm) {
      if (cur) questions.push(cur);
      const rest = line.slice(qm[0].length);
      cur = { no: parseInt(qm[1], 10), stem: '', options: [], answer: '', analysis: '', phase: 'stem' };
      parseLineContent(cur, rest);
      continue;
    }
    if (!cur) continue;

    // 【答案】【详解】【分析】标记
    if (/^【答案】/.test(line)) { cur.answer = line.replace(/^【答案】\s*/, '').trim(); cur.phase = 'answer'; continue; }
    if (/^【详解】|^【解析】|^【分析】/.test(line)) { cur.analysis = line.replace(/^【[^\]]+】\s*/, '').trim(); cur.phase = 'analysis'; continue; }

    // 选项行（独立行或行内混合）：A. ... B. ... C. ... D. ...
    if (cur.phase !== 'analysis' && cur.phase !== 'answer') {
      // 检查是否包含多个选项（行内混合）
      const optMatches = [...line.matchAll(/([A-D])[．.、]\s*([^A-D]*?)(?=(?:[A-D][．.、])|$)/g)];
      if (optMatches.length >= 2) {
        for (const m of optMatches) {
          cur.options.push({ key: m[1], text: m[2].trim() });
        }
        cur.phase = 'options';
        continue;
      }
      // 单个选项
      const optSingle = line.match(/^([A-D])[．.、]\s*(.+)/);
      if (optSingle) {
        cur.options.push({ key: optSingle[1], text: optSingle[2].trim() });
        cur.phase = 'options';
        continue;
      }
    }

    // 追加到当前阶段
    if (cur.phase === 'stem') cur.stem += ' ' + line;
    else if (cur.phase === 'answer') cur.answer += ' ' + line;
    else if (cur.phase === 'analysis') cur.analysis += ' ' + line;
  }
  if (cur) questions.push(cur);
  return questions;
}

/** 解析题干行中内联的选项 */
function parseLineContent(cur, text) {
  // 检测行内选项：A. ... B. ... C. ... D. ...
  // 分割不需要空格，只要 A-D 后跟全角/半角句号即可
  const parts = text.split(/(?=[A-D][．.、])/);
  let stemParts = [];
  let foundOpts = false;
  for (const seg of parts) {
    const om = seg.match(/^([A-D])[．.、]\s*(.+)/);
    if (om) {
      cur.options.push({ key: om[1], text: om[2].trim() });
      foundOpts = true;
    } else if (!foundOpts) {
      stemParts.push(seg);
    }
  }
  cur.stem = stemParts.join(' ').trim() || text;
  if (cur.options.length >= 2) cur.phase = 'options';
}

async function main() {
  const subjectRoot = path.join(PAPER_ROOT, SUBJECT);
  if (!fs.existsSync(subjectRoot)) { console.error('目录不存在:', subjectRoot); process.exit(1); }
  const progPath = path.join(PROGRESS_DIR, `progress-v2-${SUBJECT}.json`);
  if (!fs.existsSync(progPath)) { console.error('无进度文件:', progPath); process.exit(1); }
  const prog = JSON.parse(fs.readFileSync(progPath, 'utf8'));
  const formulaProgressPath = path.join(PROGRESS_DIR, `progress-formula-${SUBJECT}.json`);
  const formulaDone = fs.existsSync(formulaProgressPath) ? JSON.parse(fs.readFileSync(formulaProgressPath, 'utf8')) : {};

  const targets = [];
  for (const [rel, rec] of Object.entries(prog)) {
    if (rec.parseStatus !== 'ok' || !rec.questions?.length) continue;
    if (!/\.pdf$/i.test(rel)) continue;
    if (formulaDone[rel]?.status === 'ok' && !RETRY_ERRORS) continue;
    targets.push({ rel, rec });
  }
  console.log(`[${SUBJECT}] 需要 OCR: ${targets.length} 个PDF（限制 ${LIMIT}）`);
  let processed = 0, updated = 0;

  for (const { rel, rec } of targets.slice(0, LIMIT)) {
    const absPath = path.join(subjectRoot, rel);
    if (!fs.existsSync(absPath)) continue;
    process.stdout.write(`  [OCR] ${(rec.name || path.basename(rel)).slice(0, 40)}...`);
    try {
      const ocrText = ocrPdf(absPath, 20);
      const ocrQs = parseOcrQuestions(ocrText);
      if (ocrQs.length === 0) { console.log(' 0题'); formulaDone[rel] = { status: 'no-questions' }; processed++; continue; }

      const ocrMap = new Map();
      for (const oq of ocrQs) { if (!ocrMap.has(oq.no)) ocrMap.set(oq.no, oq); }

      let changed = 0;
      for (const q of rec.questions) {
        const oq = ocrMap.get(q.no);
        if (!oq) continue;
        // 替换题干
        if (oq.stem && oq.stem.length > 5) { q.question = oq.stem; changed++; }
        // 替换选项
        if (oq.options.length >= 2 && oq.options.length <= 6) { q.options = oq.options; }
        // 替换答案
        if (oq.answer) { q.answer = oq.answer; }
        // 替换解析（更长的才替换）
        if (oq.analysis && oq.analysis.length > (q.analysis || '').length) { q.analysis = oq.analysis; }
      }

      prog[rel] = rec;
      formulaDone[rel] = { status: 'ok', ocrQs: ocrQs.length, changed };
      console.log(` ${ocrQs.length}题 ${changed}更新`);
      if (changed > 0) updated++;
      processed++;
    } catch (e) {
      if (String(e.message || e).includes('QUOTA_EXHAUSTED')) { console.log(' 额度耗尽'); break; }
      console.log(` 失败: ${String(e.message || e).slice(0, 60)}`);
      formulaDone[rel] = { status: 'error', error: String(e.message || e).slice(0, 200) };
      processed++;
    }
    fs.writeFileSync(formulaProgressPath, JSON.stringify(formulaDone, null, 1));
    fs.writeFileSync(progPath, JSON.stringify(prog, null, 1));
  }
  console.log(`\n=== 完成：${SUBJECT} | 处理:${processed} 更新:${updated} ===`);
}

main().catch((e) => { console.error(e); process.exit(1); });
