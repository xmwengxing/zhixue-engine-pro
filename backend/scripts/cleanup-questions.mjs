/**
 * 题目数据质量清洗脚本
 * 用法：
 *   node scripts/cleanup-questions.mjs --dry          # 预览变更，不写库
 *   node scripts/cleanup-questions.mjs --apply         # 执行清洗
 *   node scripts/cleanup-questions.mjs --dry --subjects 物理  # 只处理物理
 *
 * 清洗内容：
 *   1. 删除垃圾题（stem过短/为表格碎片/纯数字等）
 *   2. 清洗选择题选项文本（移除混入的解析/下一选项/答案标记）
 *   3. 尝试从选项文本恢复答案（"故B符合题意" → answer=B）
 *   4. 尝试从题干恢复答案/解析
 *   5. 修正题型标记（有选项但标记为ESSAY→改为CHOICE）
 */
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ---------- 参数 ----------
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const getArg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const SUBJECTS = (getArg('--subjects', '历史,语文,英语,数学,物理') || '').split(',').map(s => s.trim());

// ---------- 统计 ----------
const stats = { deleted: 0, cleanedOptions: 0, recoveredAnswer: 0, recoveredAnalysis: 0, fixedType: 0, total: 0, errors: [] };

// =====================================================
// 清洗函数
// =====================================================

/** 判断 stem 是否为垃圾（表格碎片/纯数字/过短） */
function isGarbageStem(stem) {
  if (!stem || stem.length < 3) return true;
  // 纯数字或数字+小数点 (如 "7", "24.00.4", "21.61.0")
  if (/^[\d\s.,]+$/.test(stem)) return true;
  // 单位碎片 (如 "7kg。", "5s通过的距离是6m" 这种需要保留)
  // 只有数字+单位无实际意义
  if (/^\d+[\.\d]*\s*[a-zA-Z\u4e00-\u9fff]{0,3}[。.]?\s*$/.test(stem) && stem.length < 10) return true;
  // 表格行数据 (如 "21.01.6", "22.00.8", "24.00.4")
  if (/^\d+[\.\d\s]+$/.test(stem)) return true;
  return false;
}

/** 清洗选项文本：移除混入的解析/下一选项/答案 */
function cleanOptionText(text) {
  if (!text) return text;
  let cleaned = text;

  // 移除解析残留（"故X不符合题意..."、"解：..."、"答案：..."）
  cleaned = cleaned
    .replace(/[,，]?\s*故\s*[A-Z]\s*不符合题意.*$/s, '')
    .replace(/[,，]?\s*故\s*[A-Z]\s*符合题意.*$/s, '')
    .replace(/\s*解[：:].*$/s, '')
    .replace(/\s*答案[：:].*$/s, '')
    .replace(/\s*解析[：:].*$/s, '')
    .replace(/\s*【详解】.*$/s, '')
    .replace(/\s*【解析】.*$/s, '')
    .replace(/\s*【分析】.*$/s, '')
    .replace(/\s*【答案】.*$/s, '')
    .trim();

  // 移除混入的下一选项标记（如 "看露珠下的叶脉B．雨后彩虹"）
  // 匹配：文本后跟一个选项字母标记 (如 "B．xxx" 或 "D．xxx")
  cleaned = cleaned.replace(/([。.？?！!）)])\s*([A-Z])[.．、]\s*.+$/, '$1');
  // 如果选项文本很长且包含选项字母，可能是在中间混入了
  // 例如 "手影游戏D．湖中倒影解：..." → "手影游戏"
  if (cleaned.length > 30) {
    const midOptMatch = cleaned.match(/^(.+?)([A-Z])[.．、]\s*(?:解[：:]|故|答案)/);
    if (midOptMatch) {
      cleaned = midOptMatch[1].trim();
    }
  }

  // 移除教辅水印文本
  cleaned = cleaned
    .replace(/学科网.*$/s, '')
    .replace(/教辅资源.*$/s, '')
    .replace(/全科 AA\+.*$/s, '')
    .replace(/关注公众号.*$/s, '')
    .trim();

  return cleaned;
}

/** 从选项文本中推断答案（"故B符合题意" → B） */
function inferAnswerFromOptions(options, currentAnswer) {
  if (currentAnswer && currentAnswer.length <= 4) return currentAnswer; // 已有答案不覆盖

  // 扫描所有选项文本寻找答案线索
  for (const opt of options) {
    const text = typeof opt === 'string' ? opt : (opt.text || '');
    // "故B符合题意" / "故选：B" / "答案是C"
    let m = text.match(/故\s*选[：:]\s*([A-Ha-h])/);
    if (m) return m[1].toUpperCase();
    m = text.match(/故\s*选\s*([A-Ha-h])/);
    if (m) return m[1].toUpperCase();
    m = text.match(/答案[是为：:]\s*([A-Ha-h])/);
    if (m) return m[1].toUpperCase();
    m = text.match(/故\s*([A-Ha-h])\s*符合题意/);
    if (m) return m[1].toUpperCase();
  }
  return currentAnswer || '';
}

/** 从题干/文本中提取解析 */
function extractAnalysisFromStem(stem) {
  if (!stem) return '';
  let analysis = '';

  // 【详解】【解析】【分析】标记
  const markers = ['详解', '解析', '分析'];
  for (const marker of markers) {
    const idx = stem.indexOf(`【${marker}】`);
    if (idx >= 0) {
      analysis = stem.slice(idx + marker.length + 2).trim();
      break;
    }
  }

  // 答案：xxx 后面跟解析
  if (!analysis) {
    const m = stem.match(/答案[：:]\s*[^\n]+\n([\s\S]+)$/);
    if (m) analysis = m[1].trim();
  }

  return analysis.slice(0, 500); // 截断
}

/** 从题干中提取答案 */
function extractAnswerFromStem(stem) {
  if (!stem) return '';

  // 【答案】X
  let m = stem.match(/【答案】\s*([A-Ha-h0-9]+)/);
  if (m) return m[1].replace(/[、，,]/g, '').trim();

  // 答案：X / 答案是X
  m = stem.match(/答案[是为：:]\s*([A-Ha-h0-9]+)/);
  if (m) return m[1].replace(/[、，,]/g, '').trim();

  // 故选：X
  m = stem.match(/故\s*选[：:]\s*([A-Ha-h])/);
  if (m) return m[1].toUpperCase();

  return '';
}

/** 检查并修正题型：有选项但标为ESSAY → 改为CHOICE */
function fixQuestionType(q) {
  const hasOpts = Array.isArray(q.options) && q.options.length >= 2;
  if (hasOpts && q.type !== 'CHOICE' && q.type !== 'MULTIPLE_CHOICE') {
    return 'CHOICE';
  }
  if (!hasOpts && q.type === 'CHOICE') {
    // 选择题没有选项了——可能是清理选项后变空的
    return 'ESSAY';
  }
  return q.type;
}

// =====================================================
// 主流程
// =====================================================
async function main() {
  console.log(`[清洗] 学科: ${SUBJECTS.join(', ')} | 模式: ${DRY ? 'DRY-RUN（不写库）' : 'APPLY（写库）'}`);

  for (const subject of SUBJECTS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[清洗] ${subject}`);
    console.log('='.repeat(60));

    // 获取该学科所有题目（带 content）
    const node = await prisma.materialNode.findFirst({ where: { name: subject, type: 'SUBJECT' } });
    if (!node) { console.log(`  [跳过] 无 ${subject} 节点`); continue; }

    const questions = await prisma.question.findMany({
      where: { materialNodeId: node.id },
      select: { id: true, type: true, content: true, answer: true, analysis: true, answerType: true },
    });
    console.log(`  总题数: ${questions.length}`);
    stats.total += questions.length;

    const toDelete = [];
    const toUpdate = [];
    let subDeleted = 0, subCleaned = 0, subRecovered = 0, subTypeFixed = 0;

    for (const q of questions) {
      const content = typeof q.content === 'string' ? JSON.parse(q.content) : (q.content || {});
      let dirty = false;
      const newContent = { ...content };
      let newAnswer = q.answer;
      let newAnalysis = q.analysis;
      let newType = q.type;

      // === 1. 垃圾题检测 ===
      if (isGarbageStem(content.stem)) {
        toDelete.push(q.id);
        subDeleted++;
        continue;
      }

      // === 2. 清洗选项文本 ===
      if (Array.isArray(newContent.options) && newContent.options.length > 0) {
        let optsCleaned = false;
        const cleanedOpts = newContent.options.map(opt => {
          const raw = typeof opt === 'string' ? opt : (opt.text || '');
          const cleaned = cleanOptionText(raw);
          if (cleaned !== raw) {
            optsCleaned = true;
            return typeof opt === 'string' ? cleaned : { ...opt, text: cleaned };
          }
          return opt;
        });
        if (optsCleaned) {
          newContent.options = cleanedOpts;
          dirty = true;
          subCleaned++;
        }

        // 去重选项（按 key 去重，保留首次出现的）
        const seen = new Set();
        const dedupOpts = cleanedOpts.filter(opt => {
          const key = typeof opt === 'object' ? opt.key : '';
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (dedupOpts.length < cleanedOpts.length) {
          newContent.options = dedupOpts;
          dirty = true;
        }

        // === 3. 从选项推断答案 ===
        const recoveredAnswer = inferAnswerFromOptions(newContent.options, newAnswer);
        if (recoveredAnswer && recoveredAnswer !== newAnswer) {
          newAnswer = recoveredAnswer;
          newContent.correctAnswer = recoveredAnswer;
          dirty = true;
          subRecovered++;
        }
      }

      // === 4. 从题干提取答案/解析 ===
      if (!newAnswer || newAnswer.length > 10) {
        const extractedAnswer = extractAnswerFromStem(content.stem || '');
        if (extractedAnswer && (!newAnswer || newAnswer.length > 10)) {
          newAnswer = extractedAnswer;
          newContent.correctAnswer = extractedAnswer;
          dirty = true;
          subRecovered++;
        }
      }

      if (!newAnalysis || newAnalysis.length === 0) {
        const extractedAnalysis = extractAnalysisFromStem(content.stem || '');
        if (extractedAnalysis) {
          newAnalysis = extractedAnalysis;
          newContent.explanation = extractedAnalysis;
          dirty = true;
        }
      }

      // === 5. 修正题型 ===
      newType = fixQuestionType({ type: q.type, options: newContent.options });
      if (newType !== q.type) {
        dirty = true;
        subTypeFixed++;
      }

      // 清洗题干中的教辅水印
      if (newContent.stem) {
        const cleanedStem = newContent.stem
          .replace(/学科网.*?股份有限公司/g, '')
          .replace(/教辅资源.*?全科 AA\+/g, '')
          .replace(/关注公众号.*$/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        if (cleanedStem !== newContent.stem) {
          newContent.stem = cleanedStem;
          dirty = true;
        }
      }

      if (dirty) {
        toUpdate.push({
          id: q.id,
          type: newType,
          content: newContent,
          answer: newAnswer,
          analysis: newAnalysis || null,
        });
      }
    }

    // === 执行操作 ===
    if (toDelete.length > 0) {
      console.log(`  [删除] ${toDelete.length} 道垃圾题`);
      if (!DRY) {
        await prisma.question.deleteMany({ where: { id: { in: toDelete } } });
      }
    }
    if (toUpdate.length > 0) {
      console.log(`  [更新] ${toUpdate.length} 道题`);
      if (!DRY) {
        // 批量更新（逐条更新以避免超大 payload）
        let updateCount = 0;
        for (const u of toUpdate) {
          await prisma.question.update({
            where: { id: u.id },
            data: { type: u.type, content: u.content, answer: u.answer, analysis: u.analysis || null },
          });
          updateCount++;
          if (updateCount % 500 === 0) process.stdout.write(`    ${updateCount}/${toUpdate.length}...`);
        }
        console.log(`    完成 ${updateCount}/${toUpdate.length}`);
      }
    }

    stats.deleted += subDeleted;
    stats.cleanedOptions += subCleaned;
    stats.recoveredAnswer += subRecovered;
    stats.fixedType += subTypeFixed;

    console.log(`  [${subject}结果] 删除: ${subDeleted} | 清洗选项: ${subCleaned} | 恢复答案: ${subRecovered} | 修正题型: ${subTypeFixed}`);
  }

  // === 汇总 ===
  console.log(`\n${'='.repeat(60)}`);
  console.log('=== 清洗汇总 ===');
  console.log(`总处理: ${stats.total} 题`);
  console.log(`删除垃圾题: ${stats.deleted}`);
  console.log(`清洗选项文本: ${stats.cleanedOptions} 题`);
  console.log(`恢复答案: ${stats.recoveredAnswer} 题`);
  console.log(`修正题型: ${stats.fixedType} 题`);
  console.log(`模式: ${DRY ? 'DRY-RUN（未写库）' : 'APPLY（已写库）'}`);

  // === 清洗后质量报告 ===
  console.log(`\n=== 清洗后质量报告 ===`);
  for (const subject of SUBJECTS) {
    const node = await prisma.materialNode.findFirst({ where: { name: subject, type: 'SUBJECT' } });
    if (!node) continue;
    const count = await prisma.question.count({ where: { materialNodeId: node.id } });
    const noAnswer = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as cnt FROM questions WHERE material_node_id = $1 AND (answer = '' OR answer IS NULL)
    `, node.id);
    const noAnalysis = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as cnt FROM questions WHERE material_node_id = $1 AND (analysis = '' OR analysis IS NULL)
    `, node.id);
    const noOpts = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as cnt FROM questions q
      WHERE q.material_node_id = $1 AND q.type = 'CHOICE'
      AND (q.content->>'options' = '[]' OR q.content->>'options' IS NULL)
    `, node.id);
    const na = noAnswer[0]?.cnt || 0;
    const nan = noAnalysis[0]?.cnt || 0;
    console.log(`  ${subject}: ${count}题 | 无答案:${na}(${((na/count)*100).toFixed(1)}%) | 无解析:${nan}(${((nan/count)*100).toFixed(1)}%) | 选择题无选项:${noOpts[0]?.cnt || 0}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
