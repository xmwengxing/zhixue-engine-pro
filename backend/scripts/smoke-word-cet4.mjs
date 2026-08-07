/**
 * 单词专项 · CET-4 词库 + CHOICE 选择模式冒烟
 * 覆盖：词库阶段动态（含 CET4 与 label）/ WORD 专项创建（special 路由）/ CHOICE 出题（4 选项）/
 *      CHOICE 判分（正确/错误释义）/ 掌握词停更（level=7 不再安排复习）
 * 收尾 DB 硬清理（IN_PROGRESS 任务 API 删不掉，残留会占用名额）
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
  console.log('\n════════ M. 单词专项 CET4 + CHOICE ════════');
  const parent = await login('parent1', 'password123');
  const student = await login('student1', 'password123');
  if (!parent || !student) { bad('登录'); return; }
  ok('parent1/student1 登录');

  // 1) 词库阶段动态
  const st = await api(student, 'GET', '/student/word-bank/stages');
  const cet4 = st.body.data.find((s) => s.stage === 'CET4');
  if (cet4 && cet4.count >= 4000 && /英语四级词汇表/.test(cet4.label || '')) ok('CET4 词库', `${cet4.count} 词 · ${cet4.label}`);
  else bad('CET4 词库', JSON.stringify(st.body.data).slice(0, 150));

  // 2) WORD 专项创建（special 路由 + wordConfig）
  const su = await db.user.findFirst({ where: { username: 'student1' }, select: { id: true } });
  const studentId = su.id;
  const task = await api(parent, 'POST', '/parent/tasks/special', {
    studentId, subject: '英语', title: '冒烟CET4选择', specialType: 'WORD', mode: 'WORD', category: 'SPECIAL',
    wordConfig: { mode: 'CHOICE', stage: 'CET4', orderMode: 'RANDOM', groupSize: 2, intervalSec: 0, roundSize: 4 },
  });
  const taskId = task.body.data?.id;
  if (task.status === 201 && taskId) ok('WORD 专项创建');
  else bad('WORD 专项创建', task.status + ' ' + JSON.stringify(task.body).slice(0, 120));

  // 3) start → CHOICE 出题（4 选项）
  const s = await api(student, 'POST', `/student/word-task/start/${taskId}`);
  const d = s.body.data;
  if (d?.sessionId && d.config?.mode === 'CHOICE' && d.group[0]?.options?.length === 4) {
    ok('CHOICE 出题', `组数 ${d.groups} · 首词 4 选项`);
  } else bad('CHOICE 出题', JSON.stringify(s.body).slice(0, 150));

  // 4) 判分：正确释义 → true；错误释义 → false
  const w0 = d.group[0];
  const correctOpt = w0.options.find((o) => o.correct);
  let r = await api(student, 'POST', `/student/word-task/submit-word/${d.sessionId}`, { wordId: w0.id, input: correctOpt.text });
  if (r.body.data?.correct === true) ok('正确释义判对');
  else bad('正确释义判对', JSON.stringify(r.body).slice(0, 100));
  const wrongOpt = w0.options.find((o) => !o.correct);
  r = await api(student, 'POST', `/student/word-task/submit-word/${d.sessionId}`, { wordId: w0.id, input: wrongOpt.text });
  if (r.body.data?.correct === false) ok('错误释义判错');
  else bad('错误释义判错', JSON.stringify(r.body).slice(0, 100));

  // 5) 掌握停更：连答 7 次后 nextReviewAt 应为 null（level=7 掌握）
  const p = db;
  for (let i = 0; i < 6; i++) {
    await api(student, 'POST', `/student/word-task/submit-word/${d.sessionId}`, { wordId: w0.id, input: correctOpt.text });
  }
  const mm = await p.wordMistake.findUnique({
    where: { studentId_wordId: { studentId, wordId: w0.id } },
    select: { level: true, nextReviewAt: true },
  });
  if (mm && mm.level >= 7 && mm.nextReviewAt === null) ok('掌握停更', `level=${mm.level} nextReviewAt=null`);
  else bad('掌握停更', JSON.stringify(mm));

  // 清理：结束会话 + 删任务 + DB 硬清理
  await api(student, 'POST', `/student/word-task/finish/${d.sessionId}`, { clozeDone: false });
  await api(parent, 'DELETE', `/parent/tasks/${taskId}`);
  await p.wordMistake.deleteMany({ where: { studentId, wordId: w0.id } });
  await p.wordSession.deleteMany({ where: { id: d.sessionId } }).catch(() => {});
  await p.task.deleteMany({ where: { id: taskId } }).catch(() => {});
  await p.$disconnect();
  console.log('  已清理冒烟数据');

  console.log(`\nM 段结果：通过 ${PASS} / 失败 ${FAIL}`);
  if (FAIL > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('💥', e.message); process.exit(1); });
