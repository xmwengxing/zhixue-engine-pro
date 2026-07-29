// 教材体系 + 题库 测试数据种子脚本
// 1) 清理测试用教材数据（MaterialNode 整树）与冒烟测试产生的试卷/题目
// 2) 生成 八年级(上/下) 人教版 数学/英语 共 4 套教材（真实单元名 + 简介）
// 3) 生成 八年级下 数学 / 英语 各 1 套试卷（含若干题目，关联对应教材单元）
//
// 用法：在 backend 目录下用 node 运行（自动读取 .env 的 DATABASE_URL）
//   node scripts/seed-textbooks-papers.mjs

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// ---- 读取 .env 的 DATABASE_URL ----
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) process.env.DATABASE_URL = m[1].trim().replace(/^"|"$/g, '');
  }
}

const prisma = new PrismaClient();

const G = { 7: '七年级', 8: '八年级', 9: '九年级' };
const TL = { UP: '上', DOWN: '下' };
const tbName = (version, grade, term, subject) =>
  `${version} ${G[grade]}${TL[term]} ${subject}`;

// ============ 教材定义 ============
const MATH_UP_UNITS = [
  { seq: 1, name: '第十一章 三角形' },
  { seq: 2, name: '第十二章 全等三角形' },
  { seq: 3, name: '第十三章 轴对称' },
  { seq: 4, name: '第十四章 整式乘法与因式分解' },
  { seq: 5, name: '第十五章 分式' },
];
const MATH_DOWN_UNITS = [
  { seq: 1, name: '第十六章 二次根式' },
  { seq: 2, name: '第十七章 勾股定理' },
  { seq: 3, name: '第十八章 平行四边形' },
  { seq: 4, name: '第十九章 一次函数' },
  { seq: 5, name: '第二十章 数据的分析' },
];
const ENG_UP_UNITS = [
  'Where did you go on vacation?',
  'How often do you exercise?',
  "I'm more outgoing than my sister.",
  'What’s the best movie theater?',
  'Do you want to watch a game show?',
  'I’m going to study computer science.',
  'Will people have robots?',
  'How do you make a banana milk shake?',
  'Can you come to my party?',
  'If you go to the party, we’ll have a great time!',
].map((name, i) => ({ seq: i + 1, name: `Unit ${i + 1} ${name}` }));
const ENG_DOWN_UNITS = [
  "What’s the matter?",
  "I’ll help to clean up the city parks.",
  'Could you please clean your room?',
  "Why don’t you talk to your parents?",
  'What were you doing when the rainstorm came?',
  'An old man tried to move the mountains.',
  "What’s the highest mountain in the world?",
  'Have you read Treasure Island yet?',
  'Have you ever been to a museum?',
  "I’ve had this bike for three years.",
].map((name, i) => ({ seq: i + 1, name: `Unit ${i + 1} ${name}` }));

const TEXTBOOKS = [
  {
    subject: '数学', version: '人教版', grade: '8', term: 'UP',
    description: '人教版八年级上册数学，涵盖三角形、全等三角形、轴对称、整式乘法与因式分解、分式等内容，侧重几何推理与代数运算基础。',
    units: MATH_UP_UNITS,
  },
  {
    subject: '数学', version: '人教版', grade: '8', term: 'DOWN',
    description: '人教版八年级下册数学，涵盖二次根式、勾股定理、平行四边形、一次函数、数据的分析，承接上册并引入函数与数据分析思想。',
    units: MATH_DOWN_UNITS,
  },
  {
    subject: '英语', version: '人教版', grade: '8', term: 'UP',
    description: '人教版（Go for it!）八年级上册英语，围绕假期经历、频率表达、比较级、未来计划等话题，训练听说读写与比较级、将来时等语法。',
    units: ENG_UP_UNITS,
  },
  {
    subject: '英语', version: '人教版', grade: '8', term: 'DOWN',
    description: '人教版（Go for it!）八年级下册英语，围绕健康建议、志愿服务、家务请求、故事阅读等话题，强化情态动词、现在完成时等语法。',
    units: ENG_DOWN_UNITS,
  },
];

// ============ 工具 ============
function unitIdsOf(tb, seqs) {
  return tb.units.filter((u) => seqs.includes(u.seq)).map((u) => u.nodeId);
}

async function createTextbookNode(def) {
  const node = await prisma.materialNode.create({
    data: {
      name: tbName(def.version, def.grade, def.term, def.subject),
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
  for (const u of def.units) {
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
// （listQuestions/getBankSummary/pickRandomQuestions 均按 materialNode: { name, type:'SUBJECT' } 过滤）
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
      content: { stem: q.stem } ,
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
    data: { paperId, questionId: question.id, order: q.order, score: q.score ?? 0 },
  });
  return question.id;
}

async function main() {
  console.log('=== 1) 清理测试数据 ===');
  await prisma.questionPaperItem.deleteMany({});
  try { await prisma.answer.deleteMany({}); } catch (e) { /* 可能无该表或无可删 */ }
  try { await prisma.errorQuestion.deleteMany({}); } catch (e) { /* 可选 */ }
  await prisma.question.deleteMany({});
  await prisma.questionPaper.deleteMany({});
  await prisma.questionImportJob.deleteMany({});
  // 清空整个教材树（TEXTBOOK + 其子 UNIT 均在此删除，因为子节点 parentId 指向 TEXTBOOK）
  await prisma.materialNode.deleteMany({});
  console.log('   已清理试卷/题目/教材树。');

  console.log('=== 2) 生成 4 套教材 ===');
  const created = {};
  for (const def of TEXTBOOKS) {
    const tb = await createTextbookNode(def);
    created[`${def.subject}_${def.grade}_${def.term}`] = tb;
    console.log(`   ✓ ${tb.name}（${tb.units.length} 个单元）`);
  }

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
  const mathSubjectNodeId = await ensureSubjectNode('数学'); // 题目 materialNodeId 必须指向 SUBJECT 节点
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
      order: 3, type: 'FORMULA', difficulty: 3,
      stem: '已知直角三角形两直角边分别为 3 和 4，则斜边 c = ______。',
      answer: '5',
      kps: ['勾股定理'], score: 6,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: mUnitIds,
    },
    {
      order: 4, type: 'JUDGE', difficulty: 1,
      stem: '一次函数 y = kx + b 中，比例系数 k 必须不为 0。',
      answer: 'true',
      kps: ['一次函数', '函数定义'], score: 4,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: mUnitIds,
    },
    {
      order: 5, type: 'ESSAY', difficulty: 4,
      stem: '用勾股定理证明：直角三角形斜边上的中线等于斜边的一半。（写出主要步骤）',
      answer: '设直角三角形 ABC，∠C=90°，斜边 AB。取 AB 中点 M，连接 CM。由直角三角形斜边中线定理（或坐标法可证）得 CM = AB/2。',
      kps: ['勾股定理', '直角三角形性质'], score: 10,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: mUnitIds,
    },
    {
      order: 6, type: 'CHOICE', difficulty: 3,
      stem: '一次函数 y = 2x − 1 的图象不经过（ ）\nA. 第一象限  B. 第二象限  C. 第三象限  D. 第四象限',
      answer: 'B',
      kps: ['一次函数', '函数图象'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: mUnitIds,
    },
  ];
  for (const q of mathQuestions) {
    await makeQuestion(mathPaper.id, mathSubjectNodeId, q);
  }
  console.log(`   ✓ 八下数学卷「${mathPaper.title}」（${mathQuestions.length} 题，期末）`);

  // ---- 八下 英语：单元练习卷 ----
  const engDown = created['英语_8_DOWN'];
  const eUnitIds = unitIdsOf(engDown, [1, 3, 10]); // What's the matter / clean your room / had this bike
  const engPaper = await prisma.questionPaper.create({
    data: {
      subject: '英语',
      title: '八年级下册英语 Unit 1/3/10 单元练习',
      grade: '8',
      term: 'DOWN',
      version: '人教版',
      textbookId: engDown.id,
      paperType: 'UNIT',
      unitIds: eUnitIds,
      status: 'PUBLISHED',
      createdBy: 'seed',
    },
  });
  const engSubjectNodeId = await ensureSubjectNode('英语'); // 题目 materialNodeId 必须指向 SUBJECT 节点
  const engQuestions = [
    {
      order: 1, type: 'CHOICE', difficulty: 2,
      stem: '— What’s the matter?\n— I have a _____.\nA. toothache  B. happy  C. book  D. apple',
      answer: 'A',
      kps: ['健康表达', '看病用语'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: eUnitIds,
    },
    {
      order: 2, type: 'FILL', difficulty: 2,
      stem: "I’ve _____ (have) this bike for three years.",
      answer: 'had',
      kps: ['现在完成时', '延续性动词'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: eUnitIds,
    },
    {
      order: 3, type: 'JUDGE', difficulty: 1,
      stem: '“Could you please clean your room?” 的恰当回答可以是 “Sure, I can.”',
      answer: 'true',
      kps: ['礼貌请求', '情态动词'], score: 4,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: eUnitIds,
    },
    {
      order: 4, type: 'ESSAY', difficulty: 3,
      stem: 'Write a short passage (about 60 words) about your favorite volunteer activity.',
      answer: 'I like volunteering at the animal hospital. Every weekend I help feed the cats and clean their rooms. It makes me happy to see them healthy. I think helping others is meaningful.',
      kps: ['写作', '志愿服务'], score: 10,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: eUnitIds,
    },
    {
      order: 5, type: 'CHOICE', difficulty: 3,
      stem: '— Why don’t you talk to your parents?\n— _____.\nA. Because they are busy  B. Good idea  C. I’m fine  D. Thank you',
      answer: 'A',
      kps: ['建议表达', '情境交际'], score: 5,
      grade: '8', term: 'DOWN', version: '人教版', unitIds: eUnitIds,
    },
  ];
  for (const q of engQuestions) {
    await makeQuestion(engPaper.id, engSubjectNodeId, q);
  }
  console.log(`   ✓ 八下英语卷「${engPaper.title}」（${engQuestions.length} 题，单元练习）`);

  console.log('\n=== 完成 ===');
  const counts = {
    textbooks: await prisma.materialNode.count({ where: { type: 'TEXTBOOK' } }),
    units: await prisma.materialNode.count({ where: { type: 'UNIT' } }),
    papers: await prisma.questionPaper.count(),
    questions: await prisma.question.count(),
  };
  console.log('统计：', JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error('种子失败：', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
