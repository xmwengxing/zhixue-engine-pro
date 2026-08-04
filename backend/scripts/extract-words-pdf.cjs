/**
 * 从单词 PDF 提取词条 → 清洗 → 输出 seed-data/words-stage-初中.json
 * 用法：node scripts/extract-words-pdf.mjs <pdf路径> <阶段> <输出json路径>
 * 清洗规则：
 *  - word：小写，仅 a-z'-
 *  - phonetic：白名单字符过滤；出现 ≥4 连续 ASCII 字母（音标粘连，如 camelkæməl）→ 置空
 *  - meaning：仅保留中文字符
 */
const pdfParse = require('pdf-parse');
const fs = require('fs');

const [pdfPath, stage, outPath] = process.argv.slice(2);
if (!pdfPath || !stage || !outPath) {
  console.error('usage: node extract-words-pdf.mjs <pdf> <stage> <out.json>');
  process.exit(1);
}

async function main() {
const buf = fs.readFileSync(pdfPath);
const r = await pdfParse(buf);
const text = r.text
  // 只合并「换行后紧跟 [ 音标开头 或 音标符号」的续行（避免把相邻词条粘连）
  .replace(/\n(?=[[\]əɔæʌɪʊɑːɒɛˈ´ˌ])/g, '')
  .replace(/\n+/g, '\n');

// 词条：word[音标]释义（释义到下一个 word[ 前）
const re = /([a-zA-Z][a-zA-Z'-]*)\s*\[([^\]]*)\]\s*([^[]*?)(?=(?:[a-zA-Z][a-zA-Z'-]*\s*\[)|$)/g;
const PHONETIC_RE = /[^a-zA-Zəɔæʌɪʊɑːɒɛˈ´ˌ0-9:]/g;

function cleanPhonetic(raw) {
  const ph = raw.replace(PHONETIC_RE, '').trim();
  if (!ph) return '';
  // 音标粘连检测：≥4 个连续 ASCII 字母且含音标符号（如 camelkæməl）
  if (/[a-zA-Z]{4,}/.test(ph) && /[əɔæʌɪʊɑːɒɛ]/.test(ph)) return '';
  if (ph.length > 30) return '';
  return ph;
}

const seen = new Map();
let m;
while ((m = re.exec(text))) {
  const word = m[1].toLowerCase().trim();
  if (!/^[a-z][a-z'-]{0,29}$/.test(word) || word.length < 2) continue;
  const phonetic = cleanPhonetic(m[2]);
  const meaning = (m[3] || '')
    .replace(/[^\u4e00-\u9fff，；、（）·、。]/g, ' ')
    .replace(/\s+/g, '')
    .trim();
  if (!meaning) continue;
  if (!seen.has(word)) seen.set(word, { word, phonetic, meaning });
}

const words = [...seen.values()].sort((a, b) => a.word.localeCompare(b.word));
const missingPh = words.filter((w) => !w.phonetic).length;
fs.writeFileSync(outPath, JSON.stringify({ stage, source: pdfPath.split(/[\/]/).pop(), count: words.length, words }, null, 1));
console.log(`✅ 阶段=${stage} 去重词=${words.length} 音标置空=${missingPh} → ${outPath}`);
}
main().catch(e => { console.error(e); process.exit(1); });
