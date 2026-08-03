// 验证训练舱 PLANNING → GUIDED_TRAINING 链路（含训练计划自愈与兜底）
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:3000/api';
const prisma = new PrismaClient();
const results = [];
const ok = (m, d = '') => { results.push({ ok: true, m }); console.log(`  ✓ ${m}${d ? ' ' + d : ''}`); };
const bad = (m, d = '') => { results.push({ ok: false, m, d }); console.log(`  ✗ ${m}${d ? '\n      ' + d : ''}`); };

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* 空响应 */ }
  return { status: res.status, json };
}

async function main() {
  console.log('[PLANNING 链路验证]');

  // 1. 登录
  const login = await api('/auth/login', { method: 'POST', body: { username: 'student1', password: 'password123' } });
  const token = login.json?.data?.token || login.json?.token;
  if (!token) return bad('学员登录', JSON.stringify(login.json).slice(0, 200));
  ok('学员登录成功');

  // 2. 找到 PLANNING 会话；若已推进则复用 GUIDED_TRAINING 会话继续验证后半段
  const argId = process.argv[2];
  let stuck = argId
    ? await prisma.trainingSession.findUnique({ where: { id: argId }, select: { id: true, trainingPlanData: true, phase: true } })
    : await prisma.trainingSession.findFirst({
        where: { phase: 'PLANNING' },
        orderBy: { startedAt: 'desc' },
        select: { id: true, trainingPlanData: true, phase: true },
      });
  if (!stuck) {
    stuck = await prisma.trainingSession.findFirst({
      where: { phase: 'GUIDED_TRAINING', task: { mode: 'PROFILE' } },
      orderBy: { startedAt: 'desc' },
      select: { id: true, trainingPlanData: true, phase: true },
    });
  }
  if (!stuck) return bad('未找到可验证的会话');
  ok(`目标会话 ${stuck.id.slice(0, 8)}`, `phase=${stuck.phase} plan=${stuck.trainingPlanData ? 'YES' : 'NULL'}`);
  const alreadyTraining = stuck.phase === 'GUIDED_TRAINING';

  // 3. GET session 触发自愈
  const s1 = await api(`/student/training/session/${stuck.id}`, { token });
  if (s1.status !== 200) return bad('获取会话', `HTTP ${s1.status} ${JSON.stringify(s1.json).slice(0, 200)}`);
  const body1 = s1.json?.data ?? s1.json?.session ?? s1.json;
  ok('获取会话成功', `phase=${body1?.phase} planGenerating=${body1?.planGenerating}`);

  // 4. 轮询等待计划生成（AI 慢则走兜底，最多等 240s）
  let plan = stuck.trainingPlanData;
  let waited = 0;
  if (!plan) {
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      waited += 5;
      const row = await prisma.trainingSession.findUnique({
        where: { id: stuck.id },
        select: { trainingPlanData: true },
      });
      if (row?.trainingPlanData) { plan = row.trainingPlanData; break; }
      if (waited % 30 === 0) console.log(`      ...已等待 ${waited}s`);
    }
  }
  if (!plan) return bad('训练计划生成', `${waited}s 内仍为 NULL`);
  ok('训练计划已生成', `来源=${plan.generatedBy || 'ai'}${waited ? ` 耗时≈${waited}s` : '（已存在）'}`);

  // 5. 校验计划结构
  const stages = plan.stages || {};
  const structOK = plan.learningGoals?.main
    && Array.isArray(plan.knowledgePoints) && plan.knowledgePoints.length >= 5
    && stages.foundation?.questionCount > 0
    && stages.improvement?.questionCount > 0
    && stages.application?.questionCount > 0
    && plan.finalExam?.questionCount >= 20;
  if (structOK) {
    ok('计划结构完整', `目标/${plan.knowledgePoints.length}知识点/三阶段(${stages.foundation.questionCount},${stages.improvement.questionCount},${stages.application.questionCount})/考试${plan.finalExam.questionCount}题`);
  } else {
    bad('计划结构完整', JSON.stringify(plan).slice(0, 400));
  }

  // 6. 确认计划 → 进入引导训练
  if (!alreadyTraining) {
    const confirm = await api(`/student/training/confirm-plan/${stuck.id}`, { method: 'POST', token });
    if (confirm.status !== 200) return bad('确认训练计划', `HTTP ${confirm.status} ${JSON.stringify(confirm.json).slice(0, 300)}`);
    ok('确认训练计划成功');
  }

  const afterConfirm = await prisma.trainingSession.findUnique({
    where: { id: stuck.id },
    select: { phase: true, trainingProgress: true },
  });
  if (afterConfirm?.phase === 'GUIDED_TRAINING') {
    const tp = afterConfirm.trainingProgress;
    ok('阶段推进 → GUIDED_TRAINING', `currentStage=${tp?.currentStage} 三阶段已初始化=${tp?.stages ? Object.keys(tp.stages).join('/') : '无'}`);
  } else {
    bad('阶段推进 → GUIDED_TRAINING', `实际 phase=${afterConfirm?.phase}`);
  }

  // 7. 引导训练阶段取题
  const t0 = Date.now();
  const q = await api(`/student/training/next-question/${stuck.id}`, { token });
  const cost = Date.now() - t0;
  if (q.status !== 200) {
    bad('引导训练题目下发', `HTTP ${q.status} ${JSON.stringify(q.json).slice(0, 300)}`);
  } else {
    const qd = q.json?.data || q.json;
    const stem = qd?.question?.stem || qd?.stem;
    if (stem) {
      ok('引导训练题目下发', `(${cost}ms) ${String(stem).slice(0, 40)}...`);

      // 8. 提交一次作答
      const opts = qd?.question?.options || qd?.options || [];
      const ans = opts[0] || 'A';
      const sub = await api(`/student/training/submit-answer/${stuck.id}`, {
        method: 'POST',
        token,
        body: { questionData: qd?.question || qd, answer: ans, timeSpent: 30 },
      });
      if (sub.status === 200) {
        const sd = sub.json?.data || sub.json;
        ok('引导训练判分返回', `correct=${sd?.correct} ${sd?.explanation ? '含讲解' : '无讲解'}`);
      } else {
        bad('引导训练判分', `HTTP ${sub.status} ${JSON.stringify(sub.json).slice(0, 300)}`);
      }
    } else {
      bad('引导训练题目下发', JSON.stringify(qd).slice(0, 300));
    }
  }

  // 9. 落库核对
  const cnt = await prisma.answer.count({ where: { sessionId: stuck.id } });
  cnt > 0 ? ok('作答已落库', `Answer=${cnt} 条`) : bad('作答已落库', 'Answer=0');
}

main()
  .catch((e) => bad('脚本异常', e?.message || String(e)))
  .finally(async () => {
    await prisma.$disconnect();
    const p = results.filter((r) => r.ok).length;
    const f = results.filter((r) => !r.ok);
    console.log(`\n========== 汇总 ==========\n通过 ${p} 项`);
    if (f.length) {
      console.log(`\n发现 ${f.length} 个问题:`);
      f.forEach((x, i) => console.log(`  ${i + 1}. ${x.m}${x.d ? ' — ' + x.d : ''}`));
    } else {
      console.log('全部通过 ✅');
    }
    process.exit(f.length ? 1 : 0);
  });
