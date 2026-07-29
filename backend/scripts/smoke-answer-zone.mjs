// 电子答题专区（EXAM_PAPER）端到端冒烟测试
// 流程：admin 建卷/建题/发布 → parent 用 EXAM_PAPER 布置给 student1
//       → student 进入 answer-zone（验证不泄露答案）→ 提交正确作答 → 验证批改结果

const BASE = 'http://localhost:3000/api';

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

async function login(username, password) {
  const { json } = await call('POST', '/auth/login', { body: { username, password } });
  const token = json?.data?.token || json?.token || json?.data?.accessToken;
  if (!token) throw new Error(`登录失败 ${username}: ${JSON.stringify(json)}`);
  const user = json?.data?.user || json?.user;
  return { token, user };
}

function assert(cond, msg) {
  if (!cond) throw new Error('断言失败: ' + msg);
  console.log('  ✓', msg);
}

const run = async () => {
  console.log('1) 登录 admin / parent1 / student1');
  const admin = await login('admin', 'admin');
  const parent = await login('parent1', 'password123');
  const student = await login('student1', 'password123');

  console.log('2) admin 建卷 + 题目（客观 + 公式）');
  const paperRes = await call('POST', '/admin/question-bank/papers', {
    token: admin.token,
    body: { subject: '冒烟数学', title: '冒烟测试卷', grade: '五年级', createdBy: admin.user.id },
  });
  const paperId = paperRes.json?.data?.id || paperRes.json?.id;
  assert(paperId, '试卷已创建 ' + paperId);

  const qDefs = [
    { type: 'CHOICE', stem: '1+1=?', answer: 'A', options: ['A. 2', 'B. 3', 'C. 4'], difficulty: 2, knowledgePoints: ['加法'] },
    { type: 'JUDGE', stem: '太阳从东边升起', answer: '对', options: null, difficulty: 1, knowledgePoints: ['常识'] },
    { type: 'FILL', stem: '3×4=', answer: '12', options: null, difficulty: 2, knowledgePoints: ['乘法'] },
    { type: 'FORMULA', stem: '化简 x+x', answer: '2x', answerConfig: { expectedLatex: '2*x' }, options: null, difficulty: 3, knowledgePoints: ['代数式'] },
  ];
  const qIds = [];
  for (const q of qDefs) {
    const r = await call('POST', '/admin/question-bank/questions', {
      token: admin.token,
      body: { subject: '冒烟数学', stem: q.stem, type: q.type, answer: q.answer, difficulty: q.difficulty, knowledgePoints: q.knowledgePoints, answerType: q.type, answerConfig: q.answerConfig },
    });
    const id = r.json?.data?.id || r.json?.id;
    assert(id, `题目创建 ${q.type} -> ${id}`);
    qIds.push(id);
    await call('POST', `/admin/question-bank/papers/${paperId}/items`, {
      token: admin.token,
      body: { questionId: id, score: 10 },
    });
  }

  console.log('3) 发布试卷');
  const pub = await call('POST', `/admin/question-bank/papers/${paperId}/publish`, { token: admin.token });
  assert(pub.status === 200 || pub.status === 201, '试卷已发布 status=' + pub.status);

  console.log('4) 获取 student1 的学员 ID');
  const childrenRes = await call('GET', '/parent/children', { token: parent.token });
  const studentId = childrenRes.json?.data?.children?.[0]?.student?.id;
  assert(studentId, '学员 ID=' + studentId);

  console.log('5) parent 用 EXAM_PAPER（整卷）布置任务');
  const taskRes = await call('POST', '/parent/tasks', {
    token: parent.token,
    body: {
      mode: 'EXAM_PAPER',
      studentId,
      examConfig: { source: 'PAPER', paperId, title: '冒烟答题任务' },
    },
  });
  const taskId = taskRes.json?.data?.id || taskRes.json?.id;
  assert(taskId, '任务已创建 ' + taskId + ' status=' + taskRes.status);

  console.log('6) student 进入 answer-zone（验证不泄露答案）');
  const loadRes = await call('GET', `/student/answer-zone/${taskId}`, { token: student.token });
  assert(loadRes.status === 200, '加载 status=' + loadRes.status);
  const data = loadRes.json?.data;
  assert(data?.sessionId, '返回 sessionId');
  assert(data?.questions?.length === 4, '返回 4 道题，实际 ' + data?.questions?.length);
  const leaked = data?.questions?.some((q) => 'answer' in q || (q.stem && q.stem.includes('secret')));
  assert(!leaked, '题目未泄露答案字段');
  // 确认学生端点不含 answer
  assert(!('answer' in (data?.questions?.[0] || {})), 'DTO 无 answer 字段');

  console.log('7) 构造正确作答并提交');
  const answers = data.questions.map((q, i) => {
    const def = qDefs[i];
    let answerData = {};
    if (def.type === 'CHOICE') answerData = { selected: def.answer };
    else if (def.type === 'JUDGE') answerData = { value: true };
    else if (def.type === 'FILL') answerData = { text: def.answer };
    else if (def.type === 'FORMULA') answerData = { latex: def.answerConfig.expectedLatex }; // 2x 等价 2*x
    return { questionId: q.id, answerData, inputMethod: 'click', timeSpent: 5 };
  });
  const submitRes = await call('POST', `/student/answer-zone/${data.sessionId}/submit`, {
    token: student.token,
    body: { answers },
  });
  assert(submitRes.status === 200, '提交 status=' + submitRes.status);
  const r = submitRes.json;
  console.log('   批改结果:', JSON.stringify(r.results?.map((x) => ({ t: x.isCorrect, m: x.method }))));
  assert(r.correctCount >= 3, `客观题+公式至少 3 题正确，实际 ${r.correctCount}`);
  assert(r.totalScore > 0, `总分 > 0，实际 ${r.totalScore}/${r.maxScore}`);

  console.log('8) 清理：删除任务与试卷');
  await call('DELETE', `/parent/tasks/${taskId}`, { token: parent.token });
  await call('DELETE', `/admin/question-bank/papers/${paperId}`, { token: admin.token });
  console.log('   清理完成');

  console.log('\n✅ 电子答题专区端到端冒烟全部通过');
};

run().catch((e) => {
  console.error('\n❌ 冒烟失败:', e.message);
  process.exit(1);
});
