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
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let quotaStopped = false; // 额度耗尽全局中断

// ---------- 配置（支持环境变量和 CLI 参数） ----------
function findPython() {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
  // 尝试常见路径
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
  console.error('[错误] 未找到 Python，请设置环境变量 PYTHON_PATH 或确保 python3 在 PATH 中');
  process.exit(1);
}
const PY = findPython();

/** 获取飞桨 token：优先环境变量 PADDLE_API_KEY，其次数据库查询 */
function getPaddleToken() {
  if (process.env.PADDLE_API_KEY) {
    return process.env.PADDLE_API_KEY;
  }
  try {
    const out = execFileSync('docker', ['exec', 'training-platform-db', 'psql', '-U', 'training_user',
      '-d', 'training_platform', '-t', '-c', "SELECT api_key FROM ocr_providers WHERE method='PADDLE_OCR_VL';"],
      { encoding: 'utf8' });
    return out.split('\n')[0].trim();
  } catch (e) {
    console.error('[OCR] 读取飞桨 token 失败:', String(e.message || e).slice(0, 120));
    console.error('  提示：可通过环境变量 PADDLE_API_KEY 或 DataWork/.env 配置');
    return '';
  }
}

/** 扫描件 OCR：pymupdf 渲染 + 飞桨 PaddleOCR-VL → 文本（额度耗尽 exit 3 中断全量） */
function ocrPdf(abs) {
  const token = getPaddleToken();
  if (!token) throw new Error('未配置飞桨 PaddleOCR-VL token');
  const outTxt = path.join(OUT_DIR, '.ocr-tmp.txt');
  const res = execFileSync(PY, ['scripts/ocr-papers.py', '--file', abs, '--token', token,
    '--out', outTxt, '--usage', OCR_USAGE, '--limit', String(OCR_LIMIT)],
    { encoding: 'utf8', timeout: 25 * 60 * 1000 });
  if (res.includes('QUOTA_EXCEED') || res.includes('QUOTA_EXHAUSTED')) {
    quotaStopped = true;
    console.log('⚠️ 飞桨日额度耗尽，全量转换中断');
    throw new Error('QUOTA_EXHAUSTED');
  }
  const txt = fs.existsSync(outTxt) ? fs.readFileSync(outTxt, 'utf8') : '';
  try { fs.unlinkSync(outTxt); } catch { /* ignore */ }
  return txt;
}

/** 用 pymupdf 数 PDF 页数（超长册跳过 OCR：大册多为答案/练习合集，OCR 价值低且易超时） */
function countPdfPages(abs) {
  try {
    const out = execFileSync(PY, ['-c', `import fitz,sys; d=fitz.open(sys.argv[1]); print(len(d)); d.close()`, abs],
      { encoding: 'utf8', timeout: 30000 });
    return parseInt(out.split('\n').pop() || '0', 10);
  } catch { return 999; }
}

// ---------- 参数 ----------
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const ROOT = getArg('--dir', process.env.PAPER_ROOT || 'E:/Projects/题库/八年级/试卷与习题');
const SUBJECT = getArg('--subject', '历史');
const LIMIT = parseInt(getArg('--limit', '20'), 10);
const OUT_DIR = getArg('--out', process.env.OUT_DIR || path.resolve(__dirname, '../../开发文档/试卷转换产物'));
const PROGRESS = getArg('--progress', path.join(OUT_DIR, `progress-${SUBJECT}.json`));
const OCR_USAGE = getArg('--ocr-usage', process.env.OCR_USAGE || path.join(OUT_DIR, 'ocr-usage.json'));
const OCR_LIMIT = parseInt(getArg('--ocr-limit', process.env.OCR_LIMIT || '20000'), 10);

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
    // 检测题号（新题开始）
    const qMatch = line.match(/^(\d+)[.．、]\s*(.+)$/);
    if (qMatch) {
      if (current) questions.push(current);
      current = {
        no: parseInt(qMatch[1], 10),
        type: '未知', // 稍后检测
        question: tidy(qMatch[2]), // 先保留原始文本，后面再清洗
        options: [],
        answer: '',
        difficulty: null,
        analysis: '',
      };
      continue;
    }
    
    if (!current) continue;
    
    // 检测选项（但限制最多6个，避免解析文本被误识别）
    const optMatch = line.match(/^([A-Z])[.．、]\s*(.+)$/);
    if (optMatch && current.options.length < 6) {
      current.options.push({ key: optMatch[1], text: tidy(optMatch[2]) });
      continue;
    }
    
    // 其他内容追加到 question（包含【答案】【分析】【详解】标记）
    current.question += ' ' + line;
  }
  if (current) questions.push(current);
  
  // 后处理：分离答案/解析，清洗题干，检测题型，去重选项
  return questions.map(q => {
    // 从文本中提取答案和解析
    const textAnswer = extractAnswerFromText(q.question);
    const analysis = extractAnalysisFromText(q.question);
    
    // 清洗题干（移除答案解析标记及其内容）
    const cleanStemText = cleanQuestionStem(q.question);
    
    // 检测题型
    const type = detectQuestionType(cleanStemText, q.options);
    
    // 去重选项
    const uniqueOptions = deduplicateOptions(q.options);
    
    // 答案：优先使用原始 answer 字段，其次从文本提取
    const answer = q.answer || textAnswer;
    
    return {
      no: q.no,
      type,
      question: cleanStemText,
      options: uniqueOptions,
      answer,
      difficulty: q.difficulty,
      analysis,
    };
  });
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
  console.log(`[抽样] ${pick.slice(0, LIMIT).length} 个（期中${byCat.期中.length}/期末${byCat.期末.length}/专项${byCat.专项.length}/单元${byCat.单元.length}/其他${byCat.其他.length}）`);

  // 断点续传
  const done = fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, 'utf8')) : {};

  // ---- 补跑模式：--retry-errors：只重试 progress 中 error/text-empty 的文件 ----
  // ---- OCR 模式：--ocr-only：只处理 progress 中 pending-ocr 的扫描件（页数≤20 才 OCR） ----
  let files = pick.slice(0, LIMIT);
  if (args.includes('--retry-errors')) {
    files = [];
    for (const [rel, rec] of Object.entries(done)) {
      if (rec.parseStatus === 'error' || rec.parseStatus === 'text-empty' || rec.parseStatus === 'pending-ocr' || rec.parseStatus === 'skip-large') {
        files.push({ abs: path.join(subjectRoot, rel), rel, dir: rec.dir || '' });
      }
    }
    console.log(`[补跑] ${files.length} 个失败/空文件待重试`);
  }
  if (args.includes('--ocr-only')) {
    files = [];
    for (const [rel, rec] of Object.entries(done)) {
      if (rec.parseStatus === 'pending-ocr' || rec.parseStatus === 'text-empty') {
        files.push({ abs: path.join(subjectRoot, rel), rel, dir: rec.dir || '' });
      }
    }
    console.log(`[OCR补跑] ${files.length} 个扫描件（页数≤20 才识别，大册跳过）`);
  }

  const results = { subject: SUBJECT, generatedAt: new Date().toISOString(), files: [] };
  let ok = 0, empty = 0, failed = 0;

  for (const f of files) {
    if (done[f.rel] && !args.includes('--retry-errors') && !args.includes('--ocr-only')) { console.log(`[跳过] ${f.rel}`); results.files.push(done[f.rel]); ok++; continue; }
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
      let text = await extractText(f.abs);
      let usedOcr = false;
      if (!text || text.trim().length < 50) {
        // 扫描件：默认标记 pending-ocr（主流程不阻塞，避免超长册卡死整批）
        // --ocr-only / --retry-errors：页数 ≤ 20 才跑飞桨 OCR（真实试卷扫描件）；大册跳过
        if (args.includes('--ocr-only') || args.includes('--retry-errors')) {
          const pages = countPdfPages(f.abs);
          if (pages > 100) {
            record.parseStatus = 'skip-large'; // 超长册（答案/练习合集）：OCR 价值低且易超时
            console.log(`[跳过] 超长册(${pages}页): ${name}`);
          } else {
            text = await ocrPdf(f.abs);
            usedOcr = true;
          }
        } else {
          record.parseStatus = 'pending-ocr';
          console.log(`[待OCR] ${name}`);
        }
      }
      if (!text || text.trim().length < 50) {
        record.parseStatus = 'text-empty';
        empty++;
        console.log(`[文本空] ${name}`);
      } else {
        const qs = text.includes('【') && /单选题|填空题|解答题/.test(text)
          ? parseSmartEduPdf(text)
          : parseGenericDocx(text);
        record.questions = qs;
        record.questionCount = qs.length;
        record.ocr = usedOcr;
        ok++;
        console.log(`[成功${usedOcr ? '+OCR' : ''}] ${name} -> ${qs.length} 题`);
      }
    } catch (e) {
      if (String(e.message || e).includes('QUOTA_EXHAUSTED')) {
        quotaStopped = true;
        break; // 额度耗尽立即中断
      }
      record.parseStatus = 'error';
      record.error = String(e.message || e).slice(0, 200);
      failed++;
      console.log(`[失败] ${name}: ${record.error}`);
    }
    results.files.push(record);
    done[f.rel] = record;
    fs.writeFileSync(PROGRESS, JSON.stringify(done, null, 1));
    fs.writeFileSync(path.join(OUT_DIR, `产物-${SUBJECT}-${Date.now()}.json`), JSON.stringify(record, null, 2), 'utf8');
    if (quotaStopped) break;
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

// ---------- 修复版：答案/解析分离 + 题型检测 ----------

/** 题型自动检测 */
function detectQuestionType(stem, options) {
  const text = String(stem || '');
  // 判断题（通常只有2个选项，且题干含"正确"/"错误"）
  if (options.length === 2 && /正确|错误|对错|是.*否/.test(text)) {
    return 'JUDGE';
  }
  // 选择题（有选项）
  if (options.length >= 2 && options.length <= 6) {
    return 'CHOICE';
  }
  // 填空题
  if (/_{2,}|（\s*）|______|填空|计算.*=|求解/.test(text)) {
    return 'FILL';
  }
  // 计算题/解答题
  if (/计算|解答|证明|求解|化简|求值/.test(text)) {
    return 'ESSAY';
  }
  return 'ESSAY'; // 默认
}

/** 清洗题干：移除答案解析标记及其内容 */
function cleanQuestionStem(text) {
  if (!text) return '';
  // 移除【答案】及其后内容
  let cleaned = text.replace(/【答案】[\s\S]*$/, '').trim();
  // 移除【分析】及其后内容
  cleaned = cleaned.replace(/【分析】[\s\S]*$/, '').trim();
  // 移除【详解】及其后内容
  cleaned = cleaned.replace(/【详解】[\s\S]*$/, '').trim();
  // 移除答案：xxx 格式
  cleaned = cleaned.replace(/答案[：:]\s*[\s\S]*$/, '').trim();
  return cleaned;
}

/** 从文本中提取答案 */
function extractAnswerFromText(text) {
  if (!text) return '';
  // 【答案】标记
  const m1 = text.match(/【答案】\s*([\s\S]*?)(?=【|$)/);
  if (m1) return m1[1].replace(/\s+/g, ' ').trim();
  // 答案：xxx 格式
  const m2 = text.match(/答案[：:]\s*([A-H0-9、.,\s]+)/);
  if (m2) return m2[1].replace(/\s+/g, ' ').trim();
  return '';
}

/** 从文本中提取解析 */
function extractAnalysisFromText(text) {
  if (!text) return '';
  let analysis = '';
  // 【分析】
  const m1 = text.match(/【分析】\s*([\s\S]*?)(?=【|$)/);
  if (m1) analysis += m1[1].trim();
  // 【详解】
  const m2 = text.match(/【详解】\s*([\s\S]*?)(?=【|$)/);
  if (m2) analysis += (analysis ? '\n' : '') + m2[1].trim();
  // 【解析】
  const m3 = text.match(/【解析】\s*([\s\S]*?)(?=【|$)/);
  if (m3) analysis += (analysis ? '\n' : '') + m3[1].trim();
  return analysis;
}

/** 去重选项（按 key 去重） */
function deduplicateOptions(options) {
  const seen = new Set();
  return options.filter(opt => {
    const key = opt.key || '';
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

