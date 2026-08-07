/**
 * 专项任务删除 + 历史任务表冒烟
 * 覆盖：家长删除 WORD 任务（含 WordSession/SpecialTaskRecord 依赖清理）/ 学员删除自己创建的专项 /
 *      非本人创建拦截 403 / 积分流水保留 / getTasks 附带 lastRecord
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
  console.log('\n════════ O. 专项任务删除 + 历史表 ════════');
  const parent = await login('parent1', 'password123');
  const student = await login('student1', 'password123');
  const su = await db.user.findFirst({ where: { username: 'student1' }, select: { id: true } });
  const studentId = su.id;
  ok('登录');

  // 1) 家长创建 WORD 任务 + 完成一轮（生成 WordSession + SpecialTaskRecord）
  const task = await api(parent, 'POST', '/parent/tasks/special', {
    studentId, subject: '英语', title: '冒烟O-删除测试', specialType: 'WORD', mode: 'WORD', category: 'SPECIAL',
    wordConfig: { mode: 'CHOICE', stage: 'CET4', orderMode: 'RANDOM', groupSize: 1, intervalSec: 0, roundSize: 2 },
  });
  const taskId = task.body.data.id;
  // 造一条积分流水（任务相关）
  await db.pointsTransaction.create({
    data: { studentId, amount: 3, type: 'SPECIAL_CORRECT', relatedId: taskId, balance: 999, memo: '冒烟积分' },
  }).catch(() => {});
  const s = await api(student, 'POST', `/student/word-task/start/${taskId}`);
  const sid = s.body.data.sessionId;
  await api(student, 'POST', `/student/word-task/finish/${sid}`, { clozeDone: true });
  const recCount = await db.specialTaskRecord.count({ where: { taskId } });
  const sessCount = await db.wordSession.count({ where: { taskId } });
  if (recCount >= 1 && sessCount >= 1) ok('训练数据已生成', `record=${recCount} session=${sessCount}`);
  else bad('训练数据生成', `record=${recCount} session=${sessCount}`);

  // 2) 家长删除任务 → 依赖清理 + 积分保留
  const del = await api(parent, 'DELETE', `/parent/tasks/${taskId}`);
  if (del.status === 200) ok('家长删除 WORD 任务');
  else bad('家长删除', del.status + ' ' + JSON.stringify(del.body).slice(0, 100));
  const leftRec = await db.specialTaskRecord.count({ where: { taskId } });
  const leftSess = await db.wordSession.count({ where: { taskId } });
  const leftTask = await db.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (leftRec === 0 && leftSess === 0 && !leftTask) ok('依赖清理完整（记录/会话/任务）');
  else bad('依赖清理', `rec=${leftRec} sess=${leftSess} task=${!!leftTask}`);
  const pts = await db.pointsTransaction.count({ where: { relatedId: taskId } });
  if (pts >= 1) ok('积分流水保留', `${pts} 条`);
  else bad('积分保留', `${pts} 条`);

  // 3) 学员删除自己创建的专项
  const myTask = await api(student, 'POST', '/student/tasks/special', {
    subject: '英语', specialType: 'WORD', title: '冒烟O-学员自建',
    wordConfig: { mode: 'SPELLING', stage: 'CET4', orderMode: 'RANDOM', groupSize: 1, intervalSec: 0, roundSize: 2 },
  });
  const myTaskId = myTask.body.data.id;
  const delMine = await api(student, 'DELETE', `/student/special-tasks/${myTaskId}`);
  if (delMine.status === 200) ok('学员删除自建任务');
  else bad('学员删除自建', delMine.status + ' ' + JSON.stringify(delMine.body).slice(0, 100));

  // 4) 学员删除非自己创建 → 403
  const parentTask2 = await api(parent, 'POST', '/parent/tasks/special', {
    studentId, subject: '英语', title: '冒烟O-家长任务', specialType: 'WORD', mode: 'WORD', category: 'SPECIAL',
    wordConfig: { mode: 'CHOICE', stage: 'CET4', orderMode: 'RANDOM', groupSize: 1, intervalSec: 0, roundSize: 2 },
  });
  const pTask2 = parentTask2.body.data.id;
  const delOther = await api(student, 'DELETE', `/student/special-tasks/${pTask2}`);
  if (delOther.status === 403) ok('学员删他人任务被拦截 403');
  else bad('学员删他人拦截', delOther.status + ' ' + JSON.stringify(delOther.body).slice(0, 100));

  // 5) getTasks 附带 lastRecord（家长端）
  await db.specialTaskRecord.create({
    data: { taskId: pTask2, studentId, specialType: 'WORD', mode: 'CHOICE', total: 10, correct: 8, wrong: 2, clozeTotal: 5, clozeCorrect: 4, durationSec: 300, summary: '完成 10 词，答对 8（正确率 80%）' },
  }).catch(() => {});
  const list = await api(parent, 'GET', '/parent/tasks?category=SPECIAL&limit=5');
  const withRec = (list.body.data.tasks || []).find((t) => t.id === pTask2);
  if (withRec && withRec.lastRecord && withRec.lastRecord.correct === 8) ok('getTasks 附带 lastRecord', withRec.lastRecord.summary);
  else bad('getTasks lastRecord', JSON.stringify(withRec).slice(0, 120));

  // 清理
  await api(parent, 'DELETE', `/parent/tasks/${pTask2}`).catch(()=>{});
  await db.specialTaskRecord.deleteMany({ where: { taskId: pTask2 } }).catch(() => {});
  await db.pointsTransaction.deleteMany({ where: { relatedId: taskId } }).catch(() => {});
  await db.$disconnect();
  console.log('  已清理冒烟数据');

  console.log(`\nO 段结果：通过 ${PASS} / 失败 ${FAIL}`);
  if (FAIL > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('💥', e.message); process.exit(1); });
