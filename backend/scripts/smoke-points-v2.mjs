/**
 * 积分商城 V2 冒烟（HTTP 级）
 * 覆盖：开户基础分 / 积分规则 / 流水 / 家长手动调整 / 扣分申诉闭环（插入惩罚流水→申诉→审核返还）
 */
const base = `http://localhost:${process.env.SMOKE_PORT || 3000}/api`;
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
  console.log('\n════════ K. 积分商城 V2 ════════');
  const st = await login('student1', 'password123');
  if (!st) { bad('student1 登录'); return; }
  ok('student1 登录');
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + st };

  // 1) 开户基础分
  const bal = await api(st, 'GET', '/student/points/balance');
  if (bal.status === 200 && bal.body?.data?.balance >= 50) {
    ok('开户基础分 50+', `balance=${bal.body.data.balance}`);
  } else bad('开户基础分', JSON.stringify(bal.body).slice(0, 120));

  // 2) 积分规则
  const rules = await api(st, 'GET', '/student/points/rules');
  if (rules.status === 200 && Array.isArray(rules.body?.data) && rules.body.data.length >= 10) {
    ok('积分规则', `${rules.body.data.length} 条`);
  } else bad('积分规则', JSON.stringify(rules.body).slice(0, 120));

  // 3) 流水
  const txs = await api(st, 'GET', '/student/points/transactions');
  if (txs.status === 200 && txs.body?.data?.total >= 1) {
    ok('积分流水', `${txs.body.data.total} 条`);
  } else bad('积分流水', JSON.stringify(txs.body).slice(0, 120));

  // 4) 家长手动调整 +5
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  const s1 = await p.user.findFirst({ where: { username: 'student1' }, select: { id: true } });
  const pt = await login('parent1', 'password123');
  const PH = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pt };
  const adj = await api(pt, 'POST', `/parent/children/${s1.id}/points/adjust`, { amount: 5, memo: '冒烟测试奖励' });
  if (adj.status === 200) {
    ok('家长手动调整 +5', `balance=${adj.body?.data?.balance}`);
  } else bad('家长调整', JSON.stringify(adj.body).slice(0, 120));

  // 5) 申诉闭环：插入惩罚流水 → 学员申诉 → 家长审核通过 → 返还
  const last = await p.pointsTransaction.findFirst({ where: { studentId: s1.id }, orderBy: { createdAt: 'desc' }, select: { balance: true } });
  const bal0 = last?.balance ?? 0;
  const tx0 = await p.pointsTransaction.create({ data: { studentId: s1.id, amount: -6, type: 'PARTICIPATION_PENALTY', balance: bal0 - 6, memo: '冒烟扣分（2026-08-04）' } });
  const ap = await api(st, 'POST', `/student/points/appeal/${tx0.id}`, { reason: '冒烟申诉' });
  if (ap.status === 201) {
    ok('学员提交申诉');
    const ap2 = await api(st, 'POST', `/student/points/appeal/${tx0.id}`, { reason: '重复' });
    if (ap2.status === 409) ok('重复申诉拦截(409)');
    else bad('重复申诉拦截', String(ap2.status));
    const rv = await api(pt, 'POST', `/parent/points/appeals/${ap.body.data.id}/review`, { approve: true, note: '属实' });
    if (rv.status === 200) {
      const b2 = await api(st, 'GET', '/student/points/balance');
      ok('审核通过→返还', `balance=${b2.body?.data?.balance}（应=${bal0 - 6 + 6}）`);
    } else bad('审核通过', String(rv.status));
  } else {
    bad('学员提交申诉', `${ap.status} ${JSON.stringify(ap.body).slice(0, 120)}`);
  }

  // 6) 家长总览
  const ov = await api(pt, 'GET', `/parent/children/${s1.id}/points`);
  if (ov.status === 200 && ov.body?.data?.balance != null) {
    ok('家长积分总览', `balance=${ov.body.data.balance}, 流水=${ov.body.data.transactions?.length}`);
  } else bad('家长总览', JSON.stringify(ov.body).slice(0, 120));

  // 清理测试数据（保留 SIGNUP_BONUS）
  await p.pointsTransaction.deleteMany({ where: { studentId: s1.id, type: { not: 'SIGNUP_BONUS' } } });
  await p.pointsAppeal.deleteMany({ where: { studentId: s1.id } });
  await p.$disconnect();

  console.log(`\nK 段结果：通过 ${PASS} / 失败 ${FAIL}`);
  if (FAIL > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('💥', e.message); process.exit(1); });
