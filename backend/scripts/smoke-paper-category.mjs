/**
 * 冒烟测试：题库双分类 + CUSTOM 下拉选材 + 水平评估 + 专项题库组卷
 *
 * 覆盖：
 *  A. 管理端 QuestionPaper.category（EXERCISE / ASSESSMENT）过滤与 PATCH 改分类
 *  B. 家长端 /parent/question-bank/papers?category= 过滤
 *  C. 家长端 CUSTOM 任务用 textbookId + unitIds（下拉链路）+ assessment 水平评估
 *  D. 学科总任务「每学科仅 1 个活跃」409 约束
 *  E. 专项攻克 specialType=PAPER（题库组卷移入专项）
 *  F. 学员端 startTraining 验证水平评估题被前置为 PRE_TEST
 *
 * 运行：node backend/scripts/smoke-paper-category.mjs
 */
// 可用 SMOKE_PORT 指定端口（例如前台服务未热重载时，另起实例验证）
const base = `http://localhost:${process.env.SMOKE_PORT || 3000}/api`;

let PASS = 0;
let FAIL = 0;
const failures = [];

function ok(name, extra = '') {
  PASS++;
  console.log(`  ✅ ${name}${extra ? ' — ' + extra : ''}`);
}
function bad(name, detail) {
  FAIL++;
  failures.push(name);
  console.log(`  ❌ ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}`);
}

async function login(username, candidates) {
  for (const pwd of candidates) {
    const r = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pwd }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { token: j.data?.token || j.token, pwd, user: j.data?.user || j.user };
  }
  throw new Error(`login ${username} failed with all candidate passwords`);
}

async function api(token, method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}

const cleanup = { taskIds: [], paperIds: [], token: null, parentToken: null };

async function main() {
  console.log('\n════════ 0. 登录 ════════');
  const adminAuth = await login('admin', ['password123', 'admin', 'admin123']);
  const admin = adminAuth.token;
  ok('admin 登录', `密码=${adminAuth.pwd}`);
  const parentAuth = await login('parent1', ['password123', 'parent1']);
  const parent = parentAuth.token;
  cleanup.token = admin;
  cleanup.parentToken = parent;
  ok('parent1 登录');

  // ───────── A. 管理端题库分类 ─────────
  console.log('\n════════ A. 管理端题库双分类 ════════');

  const listEx = await api(admin, 'GET', '/admin/question-bank/papers?category=EXERCISE&limit=100');
  if (listEx.status === 200) ok('GET papers?category=EXERCISE', `共 ${listEx.body.data?.total ?? '?'} 份`);
  else bad('GET papers?category=EXERCISE', listEx);

  const listAs0 = await api(admin, 'GET', '/admin/question-bank/papers?category=ASSESSMENT&limit=100');
  if (listAs0.status === 200) ok('GET papers?category=ASSESSMENT', `共 ${listAs0.body.data?.total ?? '?'} 份`);
  else bad('GET papers?category=ASSESSMENT', listAs0);

  // 选一个真实存在的科目（优先已有教材的科目）
  const tbRes = await api(admin, 'GET', '/admin/materials/textbooks');
  const textbooks = tbRes.body.data?.items || tbRes.body.data || [];
  if (!Array.isArray(textbooks) || textbooks.length === 0) {
    bad('管理端教材列表非空', tbRes);
    throw new Error('无教材数据，无法继续 CUSTOM 链路测试');
  }
  ok('管理端教材列表', `共 ${textbooks.length} 本`);
  const tb = textbooks[0];
  const SUBJECT = tb.subject || '数学';
  console.log(`     选用教材: ${tb.name} (subject=${SUBJECT}, id=${tb.id})`);

  // 建 ASSESSMENT 卷
  const pRes = await api(admin, 'POST', '/admin/question-bank/papers', {
    subject: SUBJECT,
    title: `冒烟·水平评估卷 ${Date.now()}`,
    category: 'ASSESSMENT',
    paperType: 'UNIT',
  });
  if (pRes.status !== 201 && pRes.status !== 200) {
    bad('创建 ASSESSMENT 试卷', pRes);
    throw new Error('建卷失败，中止');
  }
  const paperId = pRes.body.data.id;
  cleanup.paperIds.push(paperId);
  ok('创建 ASSESSMENT 试卷', `id=${paperId}, category=${pRes.body.data.category}`);
  if (pRes.body.data.category === 'ASSESSMENT') ok('新建卷 category 落库正确');
  else bad('新建卷 category 落库正确', `实际=${pRes.body.data.category}`);

  // 挂 3 道题
  const qDefs = [
    { type: 'CHOICE', stem: '[冒烟·评估] 3+5=? A.6 B.7 C.8 D.9', answer: 'C', difficulty: 1 },
    { type: 'FILL', stem: '[冒烟·评估] 12÷4 = ____', answer: '3', difficulty: 1 },
    { type: 'CHOICE', stem: '[冒烟·评估] 下列哪个是偶数？A.3 B.5 C.7 D.8', answer: 'D', difficulty: 2 },
  ];
  const qIds = [];
  for (const q of qDefs) {
    const qr = await api(admin, 'POST', '/admin/question-bank/questions', {
      subject: SUBJECT,
      knowledgePoints: ['冒烟测试'],
      ...q,
    });
    if (qr.status !== 201 && qr.status !== 200) {
      bad('创建题目', qr);
      break;
    }
    const qid = qr.body.data.id;
    qIds.push(qid);
    const it = await api(admin, 'POST', `/admin/question-bank/papers/${paperId}/items`, {
      questionId: qid,
      score: 10,
    });
    if (it.status !== 201 && it.status !== 200) bad('挂题到试卷', it);
  }
  if (qIds.length === 3) ok('创建并挂载 3 道评估题');

  // 审核通过题目（题库过滤会排除 PENDING/REJECTED）；批量接口
  const rev = await api(admin, 'POST', '/admin/question-bank/questions/review', {
    ids: qIds,
    action: 'APPROVE',
  });
  if (rev.status === 200) ok('评估题批量审核通过', `updated=${rev.body.data?.updated}`);
  else bad('评估题批量审核通过', rev);

  // 发布试卷
  const pub = await api(admin, 'POST', `/admin/question-bank/papers/${paperId}/publish`);
  if (pub.status === 200) ok('发布 ASSESSMENT 试卷');
  else bad('发布 ASSESSMENT 试卷', pub);

  // 分类过滤正确性
  const listAs1 = await api(admin, 'GET', '/admin/question-bank/papers?category=ASSESSMENT&limit=200');
  const inAs = (listAs1.body.data?.items || []).some((p) => p.id === paperId);
  if (inAs) ok('ASSESSMENT 列表包含新卷');
  else bad('ASSESSMENT 列表包含新卷', `total=${listAs1.body.data?.total}`);

  const listEx1 = await api(admin, 'GET', '/admin/question-bank/papers?category=EXERCISE&limit=200');
  const inEx = (listEx1.body.data?.items || []).some((p) => p.id === paperId);
  if (!inEx) ok('EXERCISE 列表不含该卷（分类隔离生效）');
  else bad('EXERCISE 列表不含该卷', '分类过滤失效');

  // PATCH 改分类
  const patch1 = await api(admin, 'PATCH', `/admin/question-bank/papers/${paperId}`, {
    category: 'EXERCISE',
  });
  if (patch1.status === 200 && patch1.body.data?.category === 'EXERCISE') ok('PATCH 改分类 → EXERCISE');
  else bad('PATCH 改分类 → EXERCISE', patch1);

  const patch2 = await api(admin, 'PATCH', `/admin/question-bank/papers/${paperId}`, {
    category: 'ASSESSMENT',
  });
  if (patch2.status === 200 && patch2.body.data?.category === 'ASSESSMENT') ok('PATCH 改回 ASSESSMENT');
  else bad('PATCH 改回 ASSESSMENT', patch2);

  // ───────── B. 家长端分类过滤 ─────────
  console.log('\n════════ B. 家长端试卷分类过滤 ════════');
  const pAs = await api(
    parent,
    'GET',
    `/parent/question-bank/papers?category=ASSESSMENT&subject=${encodeURIComponent(SUBJECT)}`
  );
  const pAsList = pAs.body.data?.papers || [];
  if (pAs.status === 200 && pAsList.some((p) => p.id === paperId))
    ok('家长端 ASSESSMENT 可见新卷', `共 ${pAsList.length} 份`);
  else bad('家长端 ASSESSMENT 可见新卷', pAs);

  const pEx = await api(
    parent,
    'GET',
    `/parent/question-bank/papers?subject=${encodeURIComponent(SUBJECT)}`
  );
  const pExList = pEx.body.data?.papers || [];
  if (!pExList.some((p) => p.id === paperId))
    ok('家长端默认(EXERCISE)不含评估卷', `共 ${pExList.length} 份`);
  else bad('家长端默认(EXERCISE)不含评估卷', '默认未按 EXERCISE 过滤');

  // ───────── C. CUSTOM 下拉链路 ─────────
  console.log('\n════════ C. 家长端 CUSTOM 教材下拉链路 ════════');
  const ptb = await api(parent, 'GET', '/parent/question-bank/textbooks');
  const ptbList = ptb.body.data?.items || ptb.body.data || [];
  if (ptb.status === 200 && ptbList.length > 0) ok('家长端教材列表', `共 ${ptbList.length} 本`);
  else bad('家长端教材列表', ptb);

  const pickTb = ptbList.find((t) => t.subject === SUBJECT) || ptbList[0];
  const unitsRes = await api(parent, 'GET', `/parent/question-bank/textbooks/${pickTb.id}/units`);
  const units = unitsRes.body.data?.items || unitsRes.body.data || [];
  if (unitsRes.status === 200 && units.length > 0) ok('教材单元列表', `${pickTb.name} → ${units.length} 单元`);
  else bad('教材单元列表', unitsRes);

  // 学员
  const childrenRes = await api(parent, 'GET', '/parent/children');
  const cd = childrenRes.body.data;
  const child = cd?.children?.[0] || (Array.isArray(cd) ? cd[0] : null);
  const studentId = child?.id || child?.studentId || child?.student?.id;
  if (studentId) ok('取到绑定学员', `studentId=${studentId}`);
  else {
    bad('取到绑定学员', childrenRes);
    throw new Error('无绑定学员，中止');
  }

  const aiT = await api(parent, 'GET', '/parent/tasks/ai-teachers');
  const teachers = aiT.body.data || [];
  const teacher = teachers.find((t) => t.subject === (pickTb.subject || SUBJECT)) || teachers[0];
  // 注意：aiTeacher 传的是 SubjectInstruction.id，不是科目名
  const aiTeacher = teacher?.id;
  if (aiTeacher) ok('取到 AI 科目老师', `${teacher.subject} (id=${aiTeacher})`);
  else {
    bad('取到 AI 科目老师', aiT);
    throw new Error('无 SubjectInstruction，无法建 CUSTOM 任务');
  }

  // 先清掉该学科已有活跃总任务，避免 409 干扰
  const existing = await api(
    parent,
    'GET',
    `/parent/tasks?studentId=${studentId}&category=SUBJECT_MAIN`
  );
  const exTasks = existing.body.data?.tasks || existing.body.data?.items || [];
  const conflicting = exTasks.filter(
    (t) => t.subject === (pickTb.subject || SUBJECT) && ['PENDING', 'IN_PROGRESS'].includes(t.status)
  );
  for (const t of conflicting) {
    await api(parent, 'DELETE', `/parent/tasks/${t.id}`);
  }
  if (conflicting.length) console.log(`     （已清理 ${conflicting.length} 个同学科活跃总任务以便测试）`);

  const customBody = {
    mode: 'CUSTOM',
    studentId,
    customConfig: {
      title: `冒烟·CUSTOM水平评估 ${Date.now()}`,
      aiTeacher,
      subject: pickTb.subject || SUBJECT,
      textbookId: pickTb.id,
      unitIds: units.slice(0, 2).map((u) => u.id),
      goal: '冒烟测试：验证教材下拉 + 水平评估链路',
      difficulty: 'medium',
      questionCount: 6,
      assessment: { source: 'PAPER', paperId },
    },
  };
  let customTaskId = null;
  const t1 = await api(parent, 'POST', '/parent/tasks', customBody);
  if (t1.status === 201 || t1.status === 200) {
    const task = t1.body.data?.task || t1.body.data;
    cleanup.taskIds.push(task.id);
    customTaskId = task.id;
    ok('创建 CUSTOM 任务（textbookId+unitIds+assessment）', `taskId=${task.id}`);
    const cfg = task.config || {};
    if (Array.isArray(cfg.materialNodeIds) && cfg.materialNodeIds.length > 0)
      ok('config.materialNodeIds 已解析为 SUBJECT 节点', JSON.stringify(cfg.materialNodeIds));
    else bad('config.materialNodeIds 已解析', JSON.stringify(cfg).slice(0, 300));
    if (Array.isArray(cfg.unitIds) && cfg.unitIds.length === 2) ok('config.unitIds 落库正确');
    else bad('config.unitIds 落库正确', JSON.stringify(cfg.unitIds));
    if (cfg.assessment?.source === 'PAPER' && cfg.assessment?.paperId === paperId)
      ok('config.assessment 落库正确');
    else bad('config.assessment 落库正确', JSON.stringify(cfg.assessment));
  } else {
    bad('创建 CUSTOM 任务', t1);
  }

  // ───────── D. 每学科仅 1 个活跃总任务 ─────────
  console.log('\n════════ D. 学科总任务唯一性约束 ════════');
  const t1dup = await api(parent, 'POST', '/parent/tasks', {
    ...customBody,
    customConfig: { ...customBody.customConfig, title: '冒烟·重复总任务' },
  });
  if (t1dup.status === 409) ok('同学科重复发布总任务被拒 (409)', t1dup.body?.error?.message || '');
  else {
    bad('同学科重复发布总任务应返回 409', `实际 status=${t1dup.status}`);
    const dupTask = t1dup.body.data?.task || t1dup.body.data;
    if (dupTask?.id) cleanup.taskIds.push(dupTask.id);
  }

  // 校验：不能手填教材（textbookId 缺失应 400）
  const tBad = await api(parent, 'POST', '/parent/tasks', {
    mode: 'CUSTOM',
    studentId,
    customConfig: {
      title: '冒烟·缺 textbookId',
      aiTeacher,
      subject: pickTb.subject || SUBJECT,
      materialVersion: '人教版',
      units: ['第一单元'],
      goal: 'x',
    },
  });
  if (tBad.status === 400) ok('缺 textbookId 被拒 (400)，旧手填字段已失效');
  else bad('缺 textbookId 应返回 400', `实际 status=${tBad.status}`);

  // ───────── E. 专项攻克题库组卷 ─────────
  console.log('\n════════ E. 专项攻克 specialType=PAPER ════════');
  // 找一份 EXERCISE 已发布卷用于整卷专项
  const exPapers = pExList;
  let specialPaperId = exPapers[0]?.id;

  const sp1 = await api(parent, 'POST', '/parent/tasks/special', {
    studentId,
    subject: pickTb.subject || SUBJECT,
    specialType: 'PAPER',
    title: `冒烟·专项组卷-随机 ${Date.now()}`,
    questionCount: 5,
    examConfig: {
      source: 'RANDOM',
      subject: pickTb.subject || SUBJECT,
      questionCount: 5,
      types: [],
      difficulty: null,
    },
  });
  if (sp1.status === 201 || sp1.status === 200) {
    const st = sp1.body.data?.task || sp1.body.data;
    cleanup.taskIds.push(st.id);
    ok('专项-随机抽题任务创建', `id=${st.id}, mode=${st.mode}, category=${st.category}, specialType=${st.specialType}`);
    if (st.mode === 'EXAM_PAPER' && st.category === 'SPECIAL' && st.specialType === 'PAPER')
      ok('专项组卷字段组合正确（EXAM_PAPER + SPECIAL + PAPER）');
    else bad('专项组卷字段组合', `${st.mode}/${st.category}/${st.specialType}`);
    const qc = st.config?.questionIds?.length;
    if (qc > 0) ok('随机抽题已固化 questionIds', `${qc} 题`);
    else bad('随机抽题应固化 questionIds', JSON.stringify(st.config).slice(0, 200));
  } else {
    bad('专项-随机抽题任务创建', sp1);
  }

  if (specialPaperId) {
    const sp2 = await api(parent, 'POST', '/parent/tasks/special', {
      studentId,
      subject: pickTb.subject || SUBJECT,
      specialType: 'PAPER',
      title: `冒烟·专项组卷-整卷 ${Date.now()}`,
      examConfig: { source: 'PAPER', paperId: specialPaperId },
    });
    if (sp2.status === 201 || sp2.status === 200) {
      const st2 = sp2.body.data?.task || sp2.body.data;
      cleanup.taskIds.push(st2.id);
      ok('专项-整卷任务创建', `id=${st2.id}, 题数=${st2.config?.questionIds?.length}`);
    } else bad('专项-整卷任务创建', sp2);
  } else {
    console.log('  ⚠️  无 EXERCISE 已发布卷，跳过「整卷专项」用例');
  }

  // 组卷蓝图（双向细目表）：难度分布 50:30:20 + 目标知识点，验证配额抽题路径
  const spBlue = await api(parent, 'POST', '/parent/tasks/special', {
    studentId,
    subject: pickTb.subject || SUBJECT,
    specialType: 'PAPER',
    title: `冒烟·专项组卷-蓝图 ${Date.now()}`,
    questionCount: 8,
    examConfig: {
      source: 'RANDOM',
      subject: pickTb.subject || SUBJECT,
      questionCount: 8,
      blueprint: {
        difficultyDist: { easy: 50, medium: 30, hard: 20 },
        estimatedMinutes: 45,
      },
    },
  });
  if (spBlue.status === 201 || spBlue.status === 200) {
    const stb = spBlue.body.data?.task || spBlue.body.data;
    cleanup.taskIds.push(stb.id);
    const ql = stb.config?.questionIds?.length;
    ok('专项-蓝图组卷创建', `id=${stb.id}, 题数=${ql}`);
    if (ql === 8) ok('蓝图配额抽题题量达标(8/8)');
    else bad('蓝图配额抽题题量', `实际 ${ql}`);
    const bp = stb.config?.randomFilter?.blueprint;
    if (bp?.difficultyDist?.easy === 50 && bp?.estimatedMinutes === 45)
      ok('config.randomFilter.blueprint 落库');
    else bad('blueprint 落库', JSON.stringify(bp));
  } else {
    bad('专项-蓝图组卷创建', spBlue);
  }

  // 非法 specialType 兜底
  const spBad = await api(parent, 'POST', '/parent/tasks/special', {
    studentId,
    subject: pickTb.subject || SUBJECT,
    specialType: 'PAPER',
    title: '冒烟·缺 examConfig',
  });
  if (spBad.status === 400) ok('PAPER 缺 examConfig 被拒 (400)');
  else {
    bad('PAPER 缺 examConfig 应返回 400', `实际 status=${spBad.status}`);
    const bt = spBad.body.data?.task || spBad.body.data;
    if (bt?.id) cleanup.taskIds.push(bt.id);
  }

  // ───────── F. 学员端训练启动：水平评估前置 ─────────
  console.log('\n════════ F. 学员端 startTraining（水平评估前置） ════════');
  if (!customTaskId) {
    console.log('  ⚠️  无 CUSTOM 任务，跳过训练启动用例');
  } else {
    let stuAuth = null;
    try {
      stuAuth = await login('student1', ['password123', 'student1']);
    } catch {
      console.log('  ⚠️  student1 登录失败，尝试用学员账号跳过');
    }
    if (stuAuth) {
      const start = await api(stuAuth.token, 'POST', `/student/training/start/${customTaskId}`);
      if (start.status === 200 || start.status === 201) {
        const session = start.body.session || start.body.data?.session;
        const qs = session?.questions || [];
        ok('startTraining 成功', `sessionId=${session?.id}, 题数=${qs.length}`);
        const ids = qs.map((q) => (typeof q === 'string' ? q : q.id || q.questionId));
        const head = ids.slice(0, 3);
        const hit = head.filter((h) => qIds.includes(h)).length;
        if (hit > 0) ok('水平评估题已前置到题集头部', `头部 3 题中命中 ${hit} 道评估题`);
        else
          bad('水平评估题应前置到题集头部', `head=${JSON.stringify(head).slice(0, 200)}`);

        // 断言训练练习题非空：评估 3 题 + 练习 questionCount 题
        const exerciseCount = ids.filter((id) => !qIds.includes(id)).length;
        if (exerciseCount > 0)
          ok('训练练习题非空（单元过滤有降级兜底）', `练习题 ${exerciseCount} 道`);
        else
          bad(
            '训练练习题非空',
            `仅有评估题，generateQuestions 返回 0 题（unitIds 过滤未兜底）`
          );
      } else {
        bad('startTraining', start);
      }
    }
  }

  // ───────── G. 学期延续模式：调整单元 / 归档 / 新学期强制初测 ─────────
  console.log('\n════════ G. 学期延续模式（调整单元/归档/新学期初测） ════════');
  // C 段任务仍 IN_PROGRESS（有活跃会话），先把其置为 COMPLETED 释放「同学科 1 个总任务」名额
  if (customTaskId) {
    const p0 = new (await import('@prisma/client')).PrismaClient();
    await p0.task.update({
      where: { id: customTaskId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await p0.trainingSession.updateMany({
      where: { taskId: customTaskId, status: { in: ['ACTIVE', 'PAUSED'] } },
      data: { status: 'COMPLETED' },
    });
    await p0.$disconnect();
    console.log('     （C 段任务已置 COMPLETED，释放名额）');
  }
  const semBody = {
    mode: 'CUSTOM',
    studentId,
    customConfig: {
      title: `冒烟·学期延续 ${Date.now()}`,
      aiTeacher,
      subject: pickTb.subject || SUBJECT,
      textbookId: pickTb.id,
      unitIds: units.slice(0, 2).map((u) => u.id),
      goal: '冒烟：学期延续模式验证',
      assessment: { source: 'AI' },
      goalScore: 70,
    },
  };
  const g1 = await api(parent, 'POST', '/parent/tasks', semBody);
  let semTaskId = null;
  if (g1.status === 201 || g1.status === 200) {
    const task = g1.body.data?.task || g1.body.data;
    semTaskId = task.id;
    cleanup.taskIds.push(task.id);
    ok('学期延续·创建任务(含期末目标 70%)', `taskId=${task.id}`);
    if (task.config?.goalScore === 70) ok('config.goalScore 落库');
    else bad('config.goalScore 落库', JSON.stringify(task.config?.goalScore));
  } else {
    bad('学期延续·创建任务', g1);
  }

  if (semTaskId) {
    // ── G1 调整单元（全量替换勾选） ──
    const newUnitIds =
      units.length >= 3 ? [units[0].id, units[2].id] : [units[0].id];
    const gp = await api(parent, 'PATCH', `/parent/tasks/${semTaskId}/units`, {
      unitIds: newUnitIds,
    });
    if (gp.status === 200 && gp.body?.success) {
      ok('调整单元(PATCH) 成功');
      const gt = await api(parent, 'GET', `/parent/tasks/${semTaskId}`);
      const t = gt.body.data?.task || gt.body.data || gt.body;
      const cfg = t.config || {};
      const got = (cfg.unitIds || []).slice().sort();
      const want = [...newUnitIds].sort();
      if (JSON.stringify(got) === JSON.stringify(want))
        ok('config.unitIds 已按新勾选全量替换');
      else bad('config.unitIds 全量替换', JSON.stringify({ got, want }));
      if (Array.isArray(cfg.unitHistory) && cfg.unitHistory.length > 0)
        ok('unitHistory 单元追加历史已记录');
      else bad('unitHistory 记录', JSON.stringify(cfg.unitHistory));
      if (t.status === 'PENDING') ok('调整后任务状态不变(PENDING，可继续训练)');
    } else {
      bad('调整单元(PATCH)', gp);
    }

    // ── G2 归档校验：PENDING → 无期末考 → 未达标 → 达标 ──
    const ar1 = await api(parent, 'POST', `/parent/tasks/${semTaskId}/archive`);
    if (ar1.status === 409 && /尚未开始|未完成期末考/.test(ar1.body?.error?.message || ''))
      ok('PENDING 任务归档被拒 (409)', ar1.body?.error?.message);
    else bad('PENDING 归档应 409', `status=${ar1.status} ${JSON.stringify(ar1.body).slice(0, 200)}`);

    const prisma = new (await import('@prisma/client')).PrismaClient();
    await prisma.task.update({
      where: { id: semTaskId },
      data: { status: 'IN_PROGRESS' },
    });
    const ar2 = await api(parent, 'POST', `/parent/tasks/${semTaskId}/archive`);
    if (ar2.status === 409 && /期末考/.test(ar2.body?.error?.message || ''))
      ok('未完成期末考不可归档 (409)', ar2.body?.error?.message);
    else bad('无期末考归档应 409', `status=${ar2.status} ${JSON.stringify(ar2.body).slice(0, 200)}`);

    // 模拟：补一条 FINAL_EXAM COMPLETED 会话（正确率 40 < 目标 70）
    const sess = await prisma.trainingSession.create({
      data: {
        taskId: semTaskId,
        studentId,
        phase: 'FINAL_EXAM',
        currentStep: 0,
        totalSteps: 10,
        progress: 100,
        questions: [],
        status: 'COMPLETED',
        completedAt: new Date(),
        finalExamData: {
          questions: [],
          answers: {},
          results: { accuracy: 40, correctCount: 4, totalQuestions: 10 },
        },
      },
    });
    const ar3 = await api(parent, 'POST', `/parent/tasks/${semTaskId}/archive`);
    if (ar3.status === 409 && /未达到目标/.test(ar3.body?.error?.message || ''))
      ok('期末未达目标(40<70)归档被拒 (409)', ar3.body?.error?.message);
    else bad('未达标归档应 409', `status=${ar3.status} ${JSON.stringify(ar3.body).slice(0, 200)}`);

    // 改达标（85 >= 70）→ 归档成功
    await prisma.trainingSession.update({
      where: { id: sess.id },
      data: {
        finalExamData: {
          questions: [],
          answers: {},
          results: { accuracy: 85, correctCount: 9, totalQuestions: 10 },
        },
      },
    });
    const ar4 = await api(parent, 'POST', `/parent/tasks/${semTaskId}/archive`);
    if (ar4.status === 200 && ar4.body?.success) {
      ok('达标后归档成功', `archiveId=${ar4.body.data?.archiveId}, 期末=${ar4.body.data?.finalExamAccuracy}%`);
      if (ar4.body.data?.semesterLabel) ok('semesterLabel 已生成', ar4.body.data.semesterLabel);
      if (ar4.body.data?.summaryText) ok('学期总结已生成(规则兜底)', ar4.body.data.summaryText.split('\n')[0]);
      const gta = await api(parent, 'GET', `/parent/tasks/${semTaskId}`);
      const tAfter = gta.body.data?.task || gta.body.data || gta.body;
      if (tAfter.status === 'COMPLETED' && tAfter.archivedAt)
        ok('归档后任务置 COMPLETED + archivedAt');
      else bad('归档后任务状态', JSON.stringify({ status: tAfter.status, archivedAt: tAfter.archivedAt }));
    } else {
      bad('达标后归档', `status=${ar4.status} ${JSON.stringify(ar4.body).slice(0, 300)}`);
    }
    await prisma.$disconnect();
  }

  // ── G3 新学期强制初测（上一步已产生归档任务） ──
  const g3a = await api(parent, 'POST', '/parent/tasks', {
    mode: 'CUSTOM',
    studentId,
    customConfig: {
      ...semBody.customConfig,
      title: '冒烟·新学期无初测',
      assessment: null,
    },
  });
  if (g3a.status === 409 && /初测/.test(g3a.body?.error?.message || ''))
    ok('新学期不配初测被拒 (409)', g3a.body?.error?.message);
  else bad('新学期无初测应 409', `status=${g3a.status} ${JSON.stringify(g3a.body).slice(0, 200)}`);

  const g3b = await api(parent, 'POST', '/parent/tasks', {
    mode: 'CUSTOM',
    studentId,
    customConfig: {
      ...semBody.customConfig,
      title: '冒烟·新学期带初测',
      assessment: { source: 'AI' },
    },
  });
  if (g3b.status === 201 || g3b.status === 200) {
    const task3 = g3b.body.data?.task || g3b.body.data;
    cleanup.taskIds.push(task3.id);
    ok('新学期带初测创建成功', `taskId=${task3.id}`);
    if (task3.config?.prevArchiveId)
      ok('config.prevArchiveId 已注入（AI 读归档总结省 token）');
    else bad('config.prevArchiveId 注入', JSON.stringify(task3.config));
  } else {
    bad('新学期带初测创建', g3b);
  }

  // ───────── 清理 ─────────
  console.log('\n════════ 清理测试数据 ════════');
  for (const id of cleanup.taskIds) {
    const d = await api(parent, 'DELETE', `/parent/tasks/${id}`);
    console.log(`     删除任务 ${id}: ${d.status}`);
  }
  for (const id of cleanup.paperIds) {
    const d = await api(admin, 'DELETE', `/admin/question-bank/papers/${id}`);
    console.log(`     删除试卷 ${id}: ${d.status}`);
  }
  // 题目无删除接口，标记驳回避免污染题库
  if (qIds.length) {
    const rj = await api(admin, 'POST', '/admin/question-bank/questions/review', {
      ids: qIds,
      action: 'REJECT',
      note: '冒烟测试数据',
    });
    console.log(`     驳回冒烟题目 ${qIds.length} 道: ${rj.status}`);
  }

  // IN_PROGRESS 任务 API 删不掉，走 DB 硬清理，避免占用「每学科 1 个总任务」名额
  await hardCleanupTasks(cleanup.taskIds);
}

/** 数据库级清理：删除冒烟产生的任务及其训练会话/答题记录 */
async function hardCleanupTasks(taskIds) {
  if (!taskIds.length) return;
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const sessions = await prisma.trainingSession.findMany({
      where: { taskId: { in: taskIds } },
      select: { id: true },
    });
    const sIds = sessions.map((s) => s.id);
    if (sIds.length) {
      await prisma.answer.deleteMany({ where: { sessionId: { in: sIds } } });
      await prisma.aIConversation.deleteMany({ where: { sessionId: { in: sIds } } });
      await prisma.trainingSession.deleteMany({ where: { id: { in: sIds } } });
    }
    // 学期延续模式：归档表/报告表外键引用任务，先删
    await prisma.taskArchive.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.report.deleteMany({ where: { taskId: { in: taskIds } } });
    const del = await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    console.log(`     DB 硬清理：会话 ${sIds.length} 个、任务 ${del.count} 个`);
    await prisma.$disconnect();
  } catch (e) {
    console.log(`     ⚠️ DB 硬清理失败（可忽略）: ${e.message}`);
  }
}

main()
  .then(() => {
    console.log(`\n════════ 结果 ════════`);
    console.log(`通过 ${PASS} / 失败 ${FAIL}`);
    if (FAIL) console.log('失败项：\n - ' + failures.join('\n - '));
    process.exit(FAIL ? 1 : 0);
  })
  .catch(async (e) => {
    console.error('\n💥 冒烟中断:', e.message);
    // 尽力清理
    try {
      for (const id of cleanup.paperIds)
        await api(cleanup.token, 'DELETE', `/admin/question-bank/papers/${id}`);
      await hardCleanupTasks(cleanup.taskIds);
    } catch {
      /* ignore */
    }
    console.log(`\n通过 ${PASS} / 失败 ${FAIL}`);
    if (failures.length) console.log('失败项：\n - ' + failures.join('\n - '));
    process.exit(1);
  });
