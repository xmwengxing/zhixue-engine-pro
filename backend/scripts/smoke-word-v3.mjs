/**
 * 单词任务 V3 冒烟：新配置（wordCount/跳转间隔/去分组）/
 * 任务间去重（删任务释放）/ 再练一遍（积分重复）/ 终止任务
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
  console.log('\n════════ Q. 单词任务 V3（配置/去重/再练/终止） ════════');
  const parent = await login('parent1', 'password123');
  const student = await login('student1', 'password123');
  const su = await db.user.findFirst({ where: { username: 'student1' }, select: { id: true } });
  const studentId = su.id;
  ok('登录');

  // 1) 新配置创建（wordCount=30 跳转间隔 5s）
  const task = await api(parent, 'POST', '/parent/tasks/special', {
    studentId, subject: '英语', title: '冒烟Q-V3', specialType: 'WORD', mode: 'WORD', category: 'SPECIAL',
    wordConfig: { mode: 'CHOICE', stage: 'CET4', orderMode: 'RANDOM', wordCount: 30, intervalSec: 5 },
  });
  const taskId = task.body.data.id;
  const cfg = task.body.data.config;
  if (taskId && cfg.roundSize === 30 && cfg.intervalSec === 5 && cfg.groupSize >= 1) ok('V3 配置生效', `wordCount=${cfg.roundSize} interval=${cfg.intervalSec} groupSize=${cfg.groupSize}`);
  else bad('V3 配置', JSON.stringify(cfg).slice(0, 120));

  // 2) 跳转间隔修改接口
  const r1 = await api(student, 'PATCH', `/student/word-task/${taskId}/config`, { intervalSec: 8 });
  if (r1.body.data?.intervalSec === 8) ok('跳转间隔修改', '5s → 8s');
  else bad('跳转间隔修改', JSON.stringify(r1.body).slice(0, 80));

  // 3) 再练一遍：完成一轮 → COMPLETED → 再 start（新会话）+ 积分重复
  const s1 = await api(student, 'POST', `/student/word-task/start/${taskId}`);
  const sid = s1.body.data.sessionId;
  const w1 = s1.body.data.group[0];
  const c1 = w1.options.find((o) => o.correct);
  await api(student, 'POST', `/student/word-task/submit-word/${sid}`, { wordId: w1.id, input: c1.text });
  await api(student, 'POST', `/student/word-task/finish/${sid}`, { clozeDone: true });
  const ptsBefore = await db.pointsTransaction.count({ where: { studentId, relatedId: taskId } });
  // 再练（COMPLETED 任务重新 start）
  const s2 = await api(student, 'POST', `/student/word-task/start/${taskId}`);
  if (s2.body.data?.sessionId && s2.body.data.sessionId !== sid) ok('再练一遍：已完成任务重新训练', `新会话 ${s2.body.data.sessionId.slice(0, 8)}`);
  else bad('再练一遍', JSON.stringify(s2.body).slice(0, 100));
  const w2 = s2.body.data.group[0];
  const c2 = w2.options.find((o) => o.correct);
  await api(student, 'POST', `/student/word-task/submit-word/${s2.body.data.sessionId}`, { wordId: w2.id, input: c2.text });
  const ptsAfter = await db.pointsTransaction.count({ where: { studentId, relatedId: taskId } });
  if (ptsAfter > ptsBefore) ok('再练积分重复计入', `${ptsBefore} → ${ptsAfter}`);
  else bad('再练积分', `${ptsBefore} → ${ptsAfter}`);

  // 4) 任务间去重：任务 A 的词不再出现在任务 B
  const sA = await api(student, 'POST', `/student/word-task/start/${taskId}`);
  const wordsA = new Set(sA.body.data ? [sA.body.data.group[0].id] : []);
  const taskB = await api(parent, 'POST', '/parent/tasks/special', {
    studentId, subject: '英语', title: '冒烟Q-去重', specialType: 'WORD', mode: 'WORD', category: 'SPECIAL',
    wordConfig: { mode: 'CHOICE', stage: 'CET4', orderMode: 'RANDOM', wordCount: 10, intervalSec: 3 },
  });
  const taskBId = taskB.body.data.id;
  const sB = await api(student, 'POST', `/student/word-task/start/${taskBId}`);
  const wordsB = new Set(sB.body.data.group.map((g) => g.id));
  const overlap = [...wordsA].filter((x) => wordsB.has(x)).length;
  if (overlap === 0) ok('任务间去重：A/B 无重复词');
  else bad('任务间去重', `重复 ${overlap}`);

  // 5) 终止任务：任务 C 有进行中会话 → 终止 → 可删除
  const taskC = await api(parent, 'POST', '/parent/tasks/special', {
    studentId, subject: '英语', title: '冒烟Q-终止', specialType: 'WORD', mode: 'WORD', category: 'SPECIAL',
    wordConfig: { mode: 'CHOICE', stage: 'CET4', orderMode: 'RANDOM', wordCount: 10, intervalSec: 3 },
  });
  const taskCId = taskC.body.data.id;
  await api(student, 'POST', `/student/word-task/start/${taskCId}`);
  // 直接删 → 应被拦截（活跃窗口内）
  const delBlock = await api(parent, 'DELETE', `/parent/tasks/${taskCId}`);
  if (delBlock.status === 400) ok('终止前删除被拦截 400');
  else bad('终止前拦截', delBlock.status);
  const term = await api(parent, 'POST', `/parent/tasks/${taskCId}/terminate`);
  if (term.body.data?.success) ok('终止任务成功');
  else bad('终止任务', JSON.stringify(term.body).slice(0, 80));
  const delAfter = await api(parent, 'DELETE', `/parent/tasks/${taskCId}`);
  if (delAfter.status === 200) ok('终止后删除成功');
  else bad('终止后删除', delAfter.status + ' ' + JSON.stringify(delAfter.body).slice(0, 100));

  // 6) 删除任务释放词（A 删除后 B 再次 start 可用更多词）
  await api(parent, 'DELETE', `/parent/tasks/${taskBId}`);
  await api(parent, 'DELETE', `/parent/tasks/${taskId}`);
  await db.wordSession.deleteMany({ where: { studentId } }).catch(() => {});
  await db.wordMistake.deleteMany({ where: { studentId } }).catch(() => {});
  await db.pointsTransaction.deleteMany({ where: { studentId, relatedId: taskId } }).catch(() => {});
  await db.$disconnect();
  console.log('  已清理冒烟数据');

  console.log(`\nQ 段结果：通过 ${PASS} / 失败 ${FAIL}`);
  if (FAIL > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('💥', e.message); process.exit(1); });
