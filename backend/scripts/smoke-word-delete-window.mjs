/**
 * 单词任务删除「进行中」时间窗冒烟
 * 覆盖：新鲜 IN_PROGRESS 会话（<30min）拦截删除 / 陈旧会话（>30min）允许删除并清理
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
  console.log('\n════════ P. 单词删除时间窗 ════════');
  const parent = await login('parent1', 'password123');
  const student = await login('student1', 'password123');
  const su = await db.user.findFirst({ where: { username: 'student1' }, select: { id: true } });
  const studentId = su.id;
  ok('登录');

  // 1) 创建 WORD 任务 + 开始会话（新鲜 IN_PROGRESS）
  const task = await api(parent, 'POST', '/parent/tasks/special', {
    studentId, subject: '英语', title: '冒烟P-时间窗', specialType: 'WORD', mode: 'WORD', category: 'SPECIAL',
    wordConfig: { mode: 'CHOICE', stage: 'CET4', orderMode: 'RANDOM', groupSize: 1, intervalSec: 0, roundSize: 2 },
  });
  const taskId = task.body.data.id;
  const s = await api(student, 'POST', `/student/word-task/start/${taskId}`);
  const sid = s.body.data.sessionId;

  // 2) 新鲜会话 → 删除应拦截
  const del1 = await api(parent, 'DELETE', `/parent/tasks/${taskId}`);
  if (del1.status === 400 && /训练会话/.test((del1.body.error || {}).message || '')) ok('新鲜会话拦截删除', del1.body.error.message);
  else bad('新鲜会话拦截', del1.status + ' ' + JSON.stringify(del1.body).slice(0, 120));

  // 3) 把会话 updatedAt 改成 31 分钟前（模拟学员早已离开）→ 删除应成功并清理
  const old = new Date(Date.now() - 31 * 60 * 1000);
  await db.wordSession.update({ where: { id: sid }, data: { updatedAt: old } });
  const del2 = await api(parent, 'DELETE', `/parent/tasks/${taskId}`);
  if (del2.status === 200) ok('陈旧会话允许删除');
  else bad('陈旧会话删除', del2.status + ' ' + JSON.stringify(del2.body).slice(0, 120));
  const left = await db.wordSession.count({ where: { id: sid } });
  const leftTask = await db.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (left === 0 && !leftTask) ok('残留会话与任务已清理');
  else bad('清理', `session=${left} task=${!!leftTask}`);

  await db.$disconnect();
  console.log(`\nP 段结果：通过 ${PASS} / 失败 ${FAIL}`);
  if (FAIL > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('💥', e.message); process.exit(1); });
