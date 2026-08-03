/**
 * 学员端全流程端到端冒烟
 *  A) EXAM_PAPER 链路：家长用真实试卷发任务 → 学员答题区加载/提交/批改
 *  B) PROFILE  链路：家长发档案任务 → 训练舱 诊断测试 → 计划 → 引导训练
 *
 * 用法: node scripts/smoke-student-e2e.mjs [--skip-profile]
 */
const BASE = 'http://localhost:3000/api';
const SKIP_PROFILE = process.argv.includes('--skip-profile');

const problems = [];
let passed = 0;

async function call(method, path, { token, body, timeout = 120000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 400) }; }
    return { status: res.status, json };
  } catch (e) {
    return { status: 0, json: { error: e.message } };
  } finally {
    clearTimeout(t);
  }
}

function ok(cond, msg, detail) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { problems.push(msg + (detail ? ` — ${detail}` : '')); console.log('  ✗', msg, detail ? `\n      ${detail}` : ''); }
  return !!cond;
}

async function login(username, password) {
  const { json } = await call('POST', '/auth/login', { body: { username, password } });
  const token = json?.data?.token;
  if (!token) throw new Error(`登录失败 ${username}: ${JSON.stringify(json).slice(0, 200)}`);
  return { token, user: json.data.user };
}

const run = async () => {
  console.log('\n========== 学员端全流程冒烟 ==========\n');

  console.log('[0] 登录');
  const admin = await login('admin', 'password123');
  const parent = await login('parent1', 'password123');
  const student = await login('student1', 'password123');
  ok(true, `admin/parent1/student1 登录成功`);

  const childRes = await call('GET', '/parent/children', { token: parent.token });
  const studentId = childRes.json?.data?.children?.[0]?.student?.id;
  ok(!!studentId, '取到学员 ID ' + studentId);

  // ---------- A) EXAM_PAPER ----------
  console.log('\n[A] EXAM_PAPER 链路（真实试卷）');
  const papersRes = await call('GET', '/admin/question-bank/papers?status=PUBLISHED&pageSize=50', { token: admin.token });
  const papers = papersRes.json?.data?.items || papersRes.json?.data?.list || papersRes.json?.data || [];
  const realPaper = (Array.isArray(papers) ? papers : []).find((p) => (p.sourceFile || '').startsWith('real-paper-import'));
  ok(!!realPaper, '找到导入的真实试卷: ' + (realPaper?.title || '无'), realPaper ? '' : JSON.stringify(papersRes.json).slice(0, 200));

  let examTaskId = null;
  if (realPaper) {
    const taskRes = await call('POST', '/parent/tasks', {
      token: parent.token,
      body: { mode: 'EXAM_PAPER', studentId, examConfig: { source: 'PAPER', paperId: realPaper.id, title: `[冒烟]${realPaper.title}` } },
    });
    examTaskId = taskRes.json?.data?.id;
    ok(!!examTaskId, 'EXAM_PAPER 任务已创建', examTaskId ? '' : `status=${taskRes.status} ${JSON.stringify(taskRes.json).slice(0, 250)}`);
  }

  if (examTaskId) {
    const load = await call('GET', `/student/answer-zone/${examTaskId}`, { token: student.token });
    const az = load.json?.data;
    ok(load.status === 200 && az?.sessionId, '答题区加载成功', load.status === 200 ? '' : `status=${load.status} ${JSON.stringify(load.json).slice(0, 200)}`);
    if (az?.questions?.length) {
      ok(az.questions.length > 0, `返回 ${az.questions.length} 道题`);
      const leak = az.questions.some((q) => 'answer' in q);
      ok(!leak, '题目未泄露答案字段');
      const noStem = az.questions.filter((q) => !q.stem || !String(q.stem).trim());
      ok(noStem.length === 0, '所有题目都有题干', noStem.length ? `${noStem.length} 道题干为空` : '');
      const choiceNoOpt = az.questions.filter((q) => q.type === 'CHOICE' && !(q.options?.length));
      ok(choiceNoOpt.length === 0, '选择题都带选项', choiceNoOpt.length ? `${choiceNoOpt.length} 道选择题无选项` : '');

      // 提交（只答前 5 题，其余留空）
      const answers = az.questions.map((q, i) => {
        let answerData = {};
        if (i < 5) {
          if (q.type === 'CHOICE') answerData = { selected: 'A' };
          else if (q.type === 'JUDGE') answerData = { value: true };
          else answerData = { text: '测试作答' };
        }
        return { questionId: q.id, answerData, inputMethod: 'click', timeSpent: 3 };
      });
      const sub = await call('POST', `/student/answer-zone/${az.sessionId}/submit`, { token: student.token, body: { answers } });
      ok(sub.status === 200, '整卷提交成功', sub.status === 200 ? '' : `status=${sub.status} ${JSON.stringify(sub.json).slice(0, 300)}`);
      if (sub.status === 200) {
        const r = sub.json;
        ok(Array.isArray(r.results) && r.results.length === az.questions.length, `批改返回 ${r.results?.length} 条结果`);
        ok(typeof r.totalScore === 'number', `总分 ${r.totalScore}/${r.maxScore}`);
        const pending = (r.results || []).filter((x) => x.isCorrect === null).length;
        console.log(`      待人工/AI批改: ${pending} 题`);
      }
    }
  }

  if (SKIP_PROFILE) { report(); return; }

  // ---------- B) PROFILE 训练舱 ----------
  console.log('\n[B] PROFILE 链路（训练舱）');
  const teachersRes = await call('GET', '/parent/tasks/ai-teachers', { token: parent.token });
  const teachers = teachersRes.json?.data || [];
  const teacher = teachers.find((t) => t.subject === '数学') || teachers[0];
  if (!ok(!!teacher, 'AI 科目老师可用: ' + (teacher?.subject || '无'), teacher ? '' : JSON.stringify(teachersRes.json).slice(0, 200))) {
    report(); return;
  }
  const profRes = await call('POST', '/parent/tasks', {
    token: parent.token,
    body: {
      mode: 'PROFILE',
      studentId,
      profileConfig: {
        aiTeacher: teacher.id,
        trainingGoal: '通过冒烟测试验证训练舱全流程是否正常运转',
        diagnosticQuestionCount: 5,
      },
    },
  });
  let profTaskId = profRes.json?.data?.id;
  let profReused = false;
  if (!profTaskId) {
    // 业务约束：同学科同时只允许 1 个进行中的总任务。
    // 冲突时复用已有 PROFILE 任务继续验证（不算失败）。
    const msg = String(profRes.json?.error?.message || profRes.json?.message || '');
    if (/已有进行中的总任务|只允许 1 个/.test(msg)) {
      const mine = await call('GET', '/student/tasks', { token: student.token });
      const arr = mine.json?.data?.tasks || mine.json?.data || [];
      const exist = arr.filter((t) => t.mode === 'PROFILE').pop();
      if (exist?.id) { profTaskId = exist.id; profReused = true; }
    }
  }
  if (!ok(!!profTaskId, `PROFILE 任务已${profReused ? '复用' : '创建'}`, profTaskId ? '' : `status=${profRes.status} ${JSON.stringify(profRes.json).slice(0, 300)}`)) {
    report(); return;
  }

  const startRes = await call('POST', `/student/training/start/${profTaskId}`, { token: student.token });
  // 注意：该接口返回 { success, message, session }，不是标准 { success, data }
  const sess = startRes.json?.session || startRes.json?.data?.session || startRes.json?.data;
  if (!ok(startRes.status === 200 && sess?.id, '训练会话已开启 phase=' + sess?.phase, startRes.status === 200 ? `结构异常: ${JSON.stringify(startRes.json).slice(0, 200)}` : `status=${startRes.status} ${JSON.stringify(startRes.json).slice(0, 300)}`)) {
    report(); return;
  }
  const sid = sess.id;

  // 诊断测试循环
  let phase = sess.phase;
  let guard = 0;
  while (phase === 'DIAGNOSTIC_TEST' && guard++ < 15) {
    const t0 = Date.now();
    const nq = await call('GET', `/student/training/next-question/${sid}`, { token: student.token });
    const cost = Date.now() - t0;
    if (nq.status !== 200) {
      ok(false, `第 ${guard} 题获取失败`, `status=${nq.status} ${JSON.stringify(nq.json).slice(0, 300)}`);
      break;
    }
    const q = nq.json?.data?.question || nq.json?.data;
    if (!q || !q.stem) {
      // 诊断结束
      phase = nq.json?.data?.phase || 'PLANNING';
      console.log(`      诊断测试结束 → ${phase}`);
      break;
    }
    ok(!!q.stem, `第 ${guard} 题已下发 (${cost}ms) [${q.type}] ${String(q.stem).slice(0, 30)}...`);
    const hasOpt = Array.isArray(q.options) && q.options.length > 0;
    if (!hasOpt && q.type !== 'fill_blank' && q.type !== 'short_answer') {
      problems.push(`题目 type=${q.type} 既无选项又非填空/简答，前端将无输入控件`);
    }
    const ansVal = hasOpt ? q.options[0] : '测试答案';
    const sa = await call('POST', `/student/training/submit-answer/${sid}`, {
      token: student.token,
      body: { questionData: q, answer: ansVal, timeSpent: 5 },
    });
    if (sa.status !== 200) {
      ok(false, `第 ${guard} 题提交失败`, `status=${sa.status} ${JSON.stringify(sa.json).slice(0, 300)}`);
      break;
    }
    // 注意：该接口平铺返回 { success, correct, feedback, explanation, ... }，字段名是 correct
    const fb = sa.json?.data || sa.json;
    const verdict = typeof fb?.correct === 'boolean' ? fb.correct : fb?.isCorrect;
    ok(typeof verdict === 'boolean', `  判分返回 correct=${verdict} ${fb?.explanation ? '(含AI讲解)' : '(无讲解)'}`);
    if (fb?.phase && fb.phase !== phase) { phase = fb.phase; console.log(`      阶段推进 → ${phase}`); }
    if (fb?.isComplete || fb?.diagnosticComplete) { phase = 'PLANNING'; break; }
  }

  // 计划阶段
  if (phase === 'PLANNING') {
    let plan = null;
    for (let i = 0; i < 12; i++) {
      const s = await call('GET', `/student/training/session/${sid}`, { token: student.token });
      plan = s.json?.data?.trainingPlanData;
      if (plan) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    ok(!!plan, '训练计划已生成', plan ? '' : '60s 内未生成（AI 超时或未触发）');
    if (plan) {
      const cf = await call('POST', `/student/training/confirm-plan/${sid}`, { token: student.token });
      ok(cf.status === 200, '训练计划已确认 → GUIDED_TRAINING', cf.status === 200 ? '' : `status=${cf.status} ${JSON.stringify(cf.json).slice(0, 200)}`);
      if (cf.status === 200) phase = 'GUIDED_TRAINING';
    }
  }

  // 引导训练 1 题
  if (phase === 'GUIDED_TRAINING') {
    const t0 = Date.now();
    const nq = await call('GET', `/student/training/next-question/${sid}`, { token: student.token });
    ok(nq.status === 200, `引导训练出题 (${Date.now() - t0}ms)`, nq.status === 200 ? '' : `status=${nq.status} ${JSON.stringify(nq.json).slice(0, 300)}`);
    const q = nq.json?.data?.question || nq.json?.data;
    if (q?.stem) {
      ok(true, `  题目: [${q.type}] ${String(q.stem).slice(0, 40)}...`);
      const sa = await call('POST', `/student/training/submit-answer/${sid}`, {
        token: student.token,
        body: { questionData: q, answer: (q.options?.[0]) || '测试答案', timeSpent: 5 },
      });
      ok(sa.status === 200, '  引导训练答案已提交并判分', sa.status === 200 ? '' : `status=${sa.status}`);
    }
  }

  // AI 对话
  const chat = await call('POST', `/student/training/chat/${sid}`, { token: student.token, body: { message: '这道题怎么想？' } });
  ok(chat.status === 200, 'AI 助手对话可用', chat.status === 200 ? '' : `status=${chat.status} ${JSON.stringify(chat.json).slice(0, 200)}`);

  report();
};

function report() {
  console.log('\n========== 汇总 ==========');
  console.log(`通过 ${passed} 项`);
  if (problems.length) {
    console.log(`\n发现 ${problems.length} 个问题:`);
    problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  } else {
    console.log('未发现问题');
  }
}

run().catch((e) => { console.error('\n冒烟中断:', e.message); report(); process.exitCode = 1; });
