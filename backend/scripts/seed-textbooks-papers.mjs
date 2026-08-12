// 教材体系 初始数据种子脚本（全量：人教版 小学+初中 全年级全科目）
// 1) 重建教材树（TEXTBOOK/UNIT；保留 SUBJECT 节点——题库题引用 SUBJECT，不清题库）
// 2) 重建 八年级下 数学/英语 各 1 套试卷（冒烟回归依赖）
// 用法：node scripts/seed-textbooks-papers.mjs

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { PEP_TEXTBOOKS } from './data/pep-textbooks.mjs';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) process.env.DATABASE_URL = m[1].trim().replace(/^"|"$/g, '');
  }
}

const prisma = new PrismaClient();

const G = { 1: '一年级', 2: '二年级', 3: '三年级', 4: '四年级', 5: '五年级', 6: '六年级', 7: '七年级', 8: '八年级', 9: '九年级', 10: '高一', 11: '高二', 12: '高三' };
const TL = { UP: '上', DOWN: '下' };
const tbName = (version, grade, term, subject, title) =>
  grade && ['10','11','12'].includes(String(grade)) && title
    ? `${version} 高中${G[grade]} ${subject}·${title}`
    : `${version} ${G[grade]}${TL[term]} ${subject}`;

const TEXTBOOKS = PEP_TEXTBOOKS;

// ============ 工具 ============
function unitIdsOf(tb, seqs) {
  return tb.units.filter((u) => seqs.includes(u.seq)).map((u) => u.nodeId);
}

async function createTextbookNode(def) {
  const node = await prisma.materialNode.create({
    data: {
      name: tbName(def.version, def.grade, def.term, def.subject, def.title),
      type: 'TEXTBOOK',
      order: 0,
      metadata: {
        subject: def.subject,
        version: def.version,
        grade: def.grade,
        term: def.term,
        description: def.description,
        notes: '',
        keywords: [],
      },
    },
  });
  const units = [];
  for (const u of def.units || []) {
    const un = await prisma.materialNode.create({
      data: {
        name: `${u.seq}. ${u.name}`,
        type: 'UNIT',
        parentId: node.id,
        order: u.seq,
        metadata: {
          seq: u.seq,
          name: u.name,
          subject: def.subject,
          version: def.version,
          grade: def.grade,
          term: def.term,
        },
      },
    });
    units.push({ seq: u.seq, nodeId: un.id });
  }
  return { ...node, units, subject: def.subject, version: def.version, grade: def.grade, term: def.term };
}

// 题库题目的 materialNodeId 必须指向 SUBJECT 类型节点
async function ensureSubjectNode(subject) {
  let node = await prisma.materialNode.findFirst({ where: { type: 'SUBJECT', name: subject } });
  if (!node) {
    node = await prisma.materialNode.create({
      data: { name: subject, type: 'SUBJECT', order: 0, metadata: { subject } },
    });
  }
  return node.id;
}

async function makeQuestion(paperId, materialNodeId, q) {
  const question = await prisma.question.create({
    data: {
      materialNodeId,
      type: q.type,
      content: { stem: q.stem },
      answer: q.answer,
      difficulty: q.difficulty,
      knowledgePoints: q.kps,
      answerType: q.type,
      answerConfig: {},
      grade: q.grade,
      term: q.term,
      version: q.version,
      unitIds: q.unitIds,
    },
  });
  await prisma.questionPaperItem.create({
    data: { paperId, questionId: question.id, order: q.order, score: q.score },
  });
  return question.id;
}

async function main() {
  console.log('=== 1) 重建教材树（保留 SUBJECT 节点与题库题）===');
  await prisma.questionPaperItem.deleteMany({});
  await prisma.questionPaper.deleteMany({});
  // 记录旧 UNIT（id→name），重建后按名称迁移题库题 unitIds
  const oldUnits = await prisma.materialNode.findMany({
    where: { type: 'UNIT' },
    select: { id: true, name: true },
  });
  // 先删 UNIT（子节点），再删 TEXTBOOK；保留 SUBJECT（题库题 materialNodeId 引用）
  await prisma.materialNode.deleteMany({ where: { type: 'UNIT' } });
  await prisma.materialNode.deleteMany({ where: { type: 'TEXTBOOK' } });
  console.log('   已清理旧 TEXTBOOK/UNIT（SUBJECT 与题库保留）。');

  console.log(`=== 2) 生成 ${TEXTBOOKS.length} 套教材 ===`);
  const created = {};
  let totalUnits = 0;
  for (const def of TEXTBOOKS) {
    const tb = await createTextbookNode(def);
    created[`${def.subject}_${def.grade}_${def.term}`] = tb;
    totalUnits += tb.units.length;
    console.log(`   ✓ ${tb.name}（${tb.units.length} 个单元）`);
  }
  console.log(`   合计 ${TEXTBOOKS.length} 套教材 / ${totalUnits} 个单元`);

  // ---- 题库题 unitIds 迁移（旧单元 id → 新单元 id，按名称匹配；匹配不到则剔除）----
  const newUnits = await prisma.materialNode.findMany({
    where: { type: 'UNIT' },
    select: { id: true, name: true },
  });
  const nameToNewId = new Map(newUnits.map((nu) => [nu.name, nu.id]));
  const oldToNew = new Map(
    oldUnits.filter((ou) => nameToNewId.has(ou.name)).map((ou) => [ou.id, nameToNewId.get(ou.name)])
  );
  const questions = await prisma.question.findMany({ where: { unitIds: { isEmpty: false } }, select: { id: true, unitIds: true } });
  let migrated = 0;
  for (const q of questions) {
    const next = q.unitIds.map((id) => oldToNew.get(id)).filter((id) => !!id);
    if (next.join() !== q.unitIds.join()) {
      await prisma.question.update({ where: { id: q.id }, data: { unitIds: next } });
      migrated++;
    }
  }
  if (migrated > 0) console.log(`   ↻ 题库题 unitIds 迁移：${migrated} 题已按单元名映射到新教材树`);

  console.log('=== 3) 生成 八年级下 数学 / 英语 试卷 ===');

  // ---- 八下 数学：期末模拟卷 ----
  const mathDown = created['数学_8_DOWN'];
  const mUnitIds = unitIdsOf(mathDown, [1, 2, 4]); // 二次根式、勾股定理、一次函数
  const mathPaper = await prisma.questionPaper.create({
    data: {
      subject: '数学',
      title: '八年级下册数学期末模拟卷',
      grade: '8',
      term: 'DOWN',
      version: '人教版',
      textbookId: mathDown.id,
      paperType: 'FINAL',
      unitIds: mUnitIds,
      status: 'PUBLISHED',
      createdBy: 'seed',
    },
  });
  const mathSubjectNodeId = await ensureSubjectNode('数学');
  const mathQuestions = [
    {
      order: 1, type: 'CHOICE', difficulty: 2,
      stem: '下列各式中，一定是二次根式的是（ ）\nA. √-3  B. ³√5  C. √a (a≥0)  D. ¹⁄x',
      answer: 'C',
      kps: ['二次根式', '二次根式定义'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: mUnitIds,
    },
    {
      order: 2, type: 'FILL', difficulty: 2,
      stem: '计算：√12 − √3 = ______。',
      answer: '√3',
      kps: ['二次根式', '二次根式化简'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: mUnitIds,
    },
    {
      order: 3, type: 'CHOICE', difficulty: 3,
      stem: '在△ABC 中，∠C=90°，AC=3，BC=4，则 AB 的长为（ ）\nA. 5  B. 6  C. 7  D. √7',
      answer: 'A',
      kps: ['勾股定理'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: mUnitIds,
    },
    {
      order: 4, type: 'FILL', difficulty: 3,
      stem: '一次函数 y = 2x − 1 的图象经过点 (0, ______)。',
      answer: '-1',
      kps: ['一次函数', '一次函数图象与性质'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: mUnitIds,
    },
    {
      order: 5, type: 'CHOICE', difficulty: 4,
      stem: '下列四边形中，既是轴对称图形又是中心对称图形的是（ ）\nA. 等腰梯形  B. 平行四边形  C. 矩形  D. 等边三角形',
      answer: 'C',
      kps: ['平行四边形', '中心对称图形'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: mUnitIds,
    },
    {
      order: 6, type: 'FILL', difficulty: 3,
      stem: '数据 1、2、3、4、5 的方差是 ______。',
      answer: '2',
      kps: ['数据的分析', '方差'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: mUnitIds,
    },
  ];
  for (const q of mathQuestions) await makeQuestion(mathPaper.id, mathSubjectNodeId, q);
  console.log(`   ✓ ${mathPaper.title}（${mathQuestions.length} 题）`);

  // ---- 八下 英语：期末模拟卷 ----
  const engDown = created['英语_8_DOWN'];
  const eUnitIds = unitIdsOf(engDown, [1, 5, 8]);
  const engPaper = await prisma.questionPaper.create({
    data: {
      subject: '英语',
      title: '八年级下册英语期末模拟卷',
      grade: '8',
      term: 'DOWN',
      version: '人教版',
      textbookId: engDown.id,
      paperType: 'FINAL',
      unitIds: eUnitIds,
      status: 'PUBLISHED',
      createdBy: 'seed',
    },
  });
  const engSubjectNodeId = await ensureSubjectNode('英语');
  const engQuestions = [
    {
      order: 1, type: 'CHOICE', difficulty: 2,
      stem: '— What\'s the ______ with you?\n— I have a headache.',
      answer: 'matter',
      kps: ['Unit 1 健康建议', 'What\'s the matter'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: eUnitIds,
    },
    {
      order: 2, type: 'FILL', difficulty: 2,
      stem: 'I ______ (visit) the Great Wall last summer.',
      answer: 'visited',
      kps: ['Unit 5 一般过去时'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: eUnitIds,
    },
    {
      order: 3, type: 'CHOICE', difficulty: 3,
      stem: 'Have you ever ______ to a museum?\nA. been  B. gone  C. went  D. goes',
      answer: 'A',
      kps: ['Unit 8 现在完成时', 'have been to'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: eUnitIds,
    },
    {
      order: 4, type: 'FILL', difficulty: 3,
      stem: 'I\'ve had this bike ______ three years.',
      answer: 'for',
      kps: ['Unit 10 现在完成时', 'for + 时间段'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: eUnitIds,
    },
  ];
  for (const q of engQuestions) await makeQuestion(engPaper.id, engSubjectNodeId, q);
  console.log(`   ✓ ${engPaper.title}（${engQuestions.length} 题）`);

  console.log('=== 完成 ===');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('💥', e.message); await prisma.$disconnect(); process.exit(1); });
