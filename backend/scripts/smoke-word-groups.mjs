/**
 * 多组循环冒烟：wordCount=20 groupSize=5 → 4 组；每组 5 词→短语填空→下一组→最后一组完成
 */
const base = `http://127.0.0.1:${process.env.SMOKE_PORT || 3000}/api`;
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
let PASS = 0;
let FAIL = 0;
const ok = (n, x = '') => { PASS++; console.log(`  ✅ ${n}${x ? ' — ' + x : ''}`); };
const bad = (n, x = '') => { FAIL++; console.log(`  ❌ ${n}${x ? ' — ' + x : ''}`); };

async function login(u, p) {
  const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  return (await r.json()).data.token;
}
async function api(token, method, path, body) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* 空 */ }
  return { status: r.status, body: j };
}

async function main() {
  console.log('\n════════ R. 多组循环（词组数量分组） ════════');
  const parent = await login('parent1', 'password123');
  const student = await login('student1', 'password123');
  const su = await db.user.findFirst({ where: { username: 'student1' }, select: { id: true } });
  const studentId = su.id;
  ok('登录');

  // 创建：wordCount=20, groupSize=5 → 4 组
  const task = await api(parent, 'POST', '/parent/tasks/special', {
    studentId, subject: '英语', title: '冒烟R-多组', specialType: 'WORD', mode: 'WORD', category: 'SPECIAL',
    wordConfig: { mode: 'CHOICE', stage: 'CET4', orderMode: 'RANDOM', wordCount: 20, groupSize: 5, intervalSec: 3 },
  });
  const taskId = task.body.data.id;
  const cfg = task.body.data.config;
  if (cfg.roundSize === 20 && cfg.groupSize === 5) ok('配置：20 词 / 5 词一组', JSON.stringify({ wordCount: cfg.roundSize, groupSize: cfg.groupSize }));
  else bad('配置', JSON.stringify(cfg));

  const s = await api(student, 'POST', `/student/word-task/start/${taskId}`);
  const sid = s.body.data.sessionId;
  if (s.body.data.groups === 4 && s.body.data.group.length === 5) ok('start：4 组 × 5 词');
  else bad('start', JSON.stringify(s.body.data).slice(0, 120));

  // 组 0：答 5 词 → nextGroup(0) → 组 0 填空（done:false）
  for (let i = 0; i < 5; i++) {
    const w = s.body.data.group[i];
    const c = w.options.find((o) => o.correct);
    await api(student, 'POST', `/student/word-task/submit-word/${sid}`, { wordId: w.id, input: c.text });
  }
  const g0 = await api(student, 'POST', `/student/word-task/group/${sid}`, { groupIndex: 0 });
  const d0 = g0.body.data;
  if (d0.phase === 'CLOZE' && d0.done === false && d0.cloze.length > 0 && d0.groupIndex === 1) ok('组0完成 → 组0 短语填空（未完）', `${d0.cloze.length} 题`);
  else bad('组0填空', JSON.stringify(d0).slice(0, 120));

  // 组 0 填空完成 → finish(groupIndex=0) → continueNext 返回组 1
  for (const q of d0.cloze) {
    await api(student, 'POST', '/student/word-task/cloze/check', { sessionId: sid, answer: q.answer, input: q.answer });
  }
  const f0 = await api(student, 'POST', `/student/word-task/finish/${sid}`, { clozeDone: true, groupIndex: 0 });
  const df0 = f0.body.data;
  if (df0.continueNext === true && df0.groupIndex === 1 && df0.group.length === 5 && df0.completed === false) ok('填空完成 → 自动进入组1', `${df0.groupIndex}/${df0.groups}`);
  else bad('进入组1', JSON.stringify(df0).slice(0, 120));

  // 组 1：答 5 词 → nextGroup(1) → 填空 → finish(1) → 组2...
  const grp1 = df0.group;
  for (let i = 0; i < 5; i++) {
    const c = grp1[i].options.find((o) => o.correct);
    await api(student, 'POST', `/student/word-task/submit-word/${sid}`, { wordId: grp1[i].id, input: c.text });
  }
  const g1 = await api(student, 'POST', `/student/word-task/group/${sid}`, { groupIndex: 1 });
  for (const q of g1.body.data.cloze) {
    await api(student, 'POST', '/student/word-task/cloze/check', { sessionId: sid, answer: q.answer, input: q.answer });
  }
  const f1 = await api(student, 'POST', `/student/word-task/finish/${sid}`, { clozeDone: true, groupIndex: 1 });
  if (f1.body.data.continueNext === true && f1.body.data.groupIndex === 2) ok('组1 → 组2');
  else bad('组1→组2', JSON.stringify(f1.body.data).slice(0, 100));

  // 跳到最后组（组 3）：答 5 词 → nextGroup(3) → 填空 → finish(3) → completed
  let curGroup = f1.body.data.group;
  let gi = 2;
  while (gi < 4) {
    for (let i = 0; i < 5; i++) {
      const c = curGroup[i].options.find((o) => o.correct);
      await api(student, 'POST', `/student/word-task/submit-word/${sid}`, { wordId: curGroup[i].id, input: c.text });
    }
    const gn = await api(student, 'POST', `/student/word-task/group/${sid}`, { groupIndex: gi });
    const dn = gn.body.data;
    for (const q of dn.cloze) {
      await api(student, 'POST', '/student/word-task/cloze/check', { sessionId: sid, answer: q.answer, input: q.answer });
    }
    const fn = await api(student, 'POST', `/student/word-task/finish/${sid}`, { clozeDone: true, groupIndex: gi });
    const df = fn.body.data;
    if (gi === 3) {
      if (df.continueNext !== true && df.completed !== false) ok('最后一组完成 → 任务完成', JSON.stringify(df).slice(0, 80));
      else bad('末组完成', JSON.stringify(df).slice(0, 100));
      break;
    }
    curGroup = df.group;
    gi += 1;
  }
  const taskNow = await db.task.findUnique({ where: { id: taskId }, select: { status: true } });
  if (taskNow?.status === 'COMPLETED') ok('任务 COMPLETED');
  else bad('任务状态', taskNow?.status);

  // 清理
  await api(parent, 'DELETE', `/parent/tasks/${taskId}`);
  await db.wordSession.deleteMany({ where: { id: sid } }).catch(() => {});
  await db.wordMistake.deleteMany({ where: { studentId } }).catch(() => {});
  await db.$disconnect();
  console.log('  已清理');

  console.log(`\nR 段结果：通过 ${PASS} / 失败 ${FAIL}`);
  if (FAIL > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('💥', e.message); process.exit(1); });
