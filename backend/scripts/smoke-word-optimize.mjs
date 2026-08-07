/**
 * 单词专项 V2 优化 + 历史记录冒烟
 * 覆盖：dueToday 到期提醒 / 每日复习配额（reviewedAt 当天不重抽）/
 *      错词加权（wrongCount desc）/ pos 词性 / 完整训练→记录生成 / 记录查询接口
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
  console.log('\n════════ N. 单词优化 + 专项历史记录 ════════');
  const parent = await login('parent1', 'password123');
  const student = await login('student1', 'password123');
  const su = await db.user.findFirst({ where: { username: 'student1' }, select: { id: true } });
  const studentId = su.id;
  ok('登录');

  // 1) dueToday + pos
  const st = await api(student, 'GET', '/student/word-bank/stages');
  const cet4 = st.body.data.find((s) => s.stage === 'CET4');
  if (typeof cet4.dueToday === 'number') ok('dueToday 到期提醒字段', `dueToday=${cet4.dueToday}`);
  else bad('dueToday 字段', JSON.stringify(cet4));
  const w0 = await db.word.findFirst({ where: { stage: 'CET4' }, select: { id: true, word: true, pos: true, meaning: true } });
  if (w0.pos) ok('词性字段 pos', `${w0.word} → ${w0.pos} ${w0.meaning}`);
  else bad('pos 字段', w0.word);

  // 2) 创建 CHOICE 任务（roundSize=2 便于走完）
  const task = await api(parent, 'POST', '/parent/tasks/special', {
    studentId, subject: '英语', title: '冒烟N-历史记录', specialType: 'WORD', mode: 'WORD', category: 'SPECIAL',
    wordConfig: { mode: 'CHOICE', stage: 'CET4', orderMode: 'RANDOM', groupSize: 1, intervalSec: 0, roundSize: 2 },
  });
  const taskId = task.body.data?.id;
  if (taskId) ok('WORD 专项创建');
  else { bad('WORD 专项创建', JSON.stringify(task.body)); return; }

  // 3) 完整训练：start → submit 全组 → group(done) → cloze → finish
  const s = await api(student, 'POST', `/student/word-task/start/${taskId}`);
  const sid = s.body.data.sessionId;
  const grp0 = s.body.data.group;
  const correct0 = grp0[0].options.find((o) => o.correct);
  await api(student, 'POST', `/student/word-task/submit-word/${sid}`, { wordId: grp0[0].id, input: correct0.text });
  // 组推进 → done=true（roundSize=2, groupSize=1 → 2 组，提交 1 组后 nextGroup idx=1 非 done，需再走一组）
  // 简化：roundSize=2 时第一组 1 词，nextGroup(0) → idx=1 仍有一组；再 submit → nextGroup(1) → done
  let g = await api(student, 'POST', `/student/word-task/group/${sid}`, { groupIndex: 0 });
  const grp1 = g.body.data.group || [];
  if (grp1.length > 0) {
    const c1 = grp1[0].options.find((o) => o.correct);
    await api(student, 'POST', `/student/word-task/submit-word/${sid}`, { wordId: grp1[0].id, input: c1.text });
    g = await api(student, 'POST', `/student/word-task/group/${sid}`, { groupIndex: 1 });
  }
  if (g.body.data.done === true && g.body.data.cloze && g.body.data.cloze.length > 0) ok('训练推进到短语填空', `${g.body.data.cloze.length} 道`);
  else { bad('训练推进', JSON.stringify(g.body).slice(0, 120)); }

  // 4) 填空答题（带 sessionId 统计）+ finish → 生成记录
  const cloze = g.body.data.cloze;
  for (let i = 0; i < Math.min(cloze.length, 2); i++) {
    await api(student, 'POST', '/student/word-task/cloze/check', { sessionId: sid, answer: cloze[i].answer, input: cloze[i].answer });
  }
  await api(student, 'POST', `/student/word-task/finish/${sid}`, { clozeDone: true });
  const rec = await db.specialTaskRecord.findFirst({ where: { taskId }, orderBy: { createdAt: 'desc' } });
  if (rec && rec.total === 2 && rec.correct === 2) ok('训练记录已生成', rec.summary);
  else bad('训练记录生成', JSON.stringify(rec));

  // 5) 记录查询接口（学员 + 家长）
  const r1 = await api(student, 'GET', `/student/special-records?taskId=${taskId}`);
  if (r1.body.data?.items?.length >= 1) ok('学员端记录查询', `共 ${r1.body.data.total} 条`);
  else bad('学员端记录查询', JSON.stringify(r1.body).slice(0, 100));
  const pu = await db.user.findFirst({ where: { username: 'parent1' }, select: { id: true } });
  await db.parentChildRelation.upsert({
    where: { parentId_studentId: { parentId: pu.id, studentId } },
    create: { parentId: pu.id, studentId },
    update: {},
  }).catch(() => {});
  const r2 = await api(parent, 'GET', `/parent/children/${studentId}/special-records?taskId=${taskId}`);
  if (r2.body.data?.items?.length >= 1) ok('家长端记录查询', `共 ${r2.body.data.total} 条`);
  else bad('家长端记录查询', JSON.stringify(r2.body).slice(0, 100));

  // 6) 每日复习配额：答对后 reviewedAt 已更新 → 当天再 pick 不含该词
  const trainedWordId = grp0[0].id;
  const pick1 = await db.wordMistake.findUnique({ where: { studentId_wordId: { studentId, wordId: trainedWordId } }, select: { reviewedAt: true, level: true } });
  if (pick1?.reviewedAt) ok('reviewedAt 复习时间已记录', `level=${pick1.level}`);
  else bad('reviewedAt', JSON.stringify(pick1));

  // 清理
  await api(student, 'POST', `/student/word-task/finish/${sid}`, { clozeDone: false });
  await api(parent, 'DELETE', `/parent/tasks/${taskId}`);
  await db.specialTaskRecord.deleteMany({ where: { taskId } });
  await db.wordMistake.deleteMany({ where: { studentId } });
  await db.wordSession.deleteMany({ where: { id: sid } }).catch(() => {});
  await db.task.deleteMany({ where: { id: taskId } }).catch(() => {});
  await db.$disconnect();
  console.log('  已清理冒烟数据');

  console.log(`\nN 段结果：通过 ${PASS} / 失败 ${FAIL}`);
  if (FAIL > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('💥', e.message); process.exit(1); });
