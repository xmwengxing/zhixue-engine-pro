/**
 * 冒烟测试：EXAM_PAPER 组卷任务模式（阶段 C）
 * 1. admin 登录 → 建试卷 + 建题 + 挂题 + 发布
 * 2. parent1 登录 → 查已发布试卷 → 整卷发布任务 → 随机组卷任务
 * 3. student1 登录 → 开始训练（验证固定题目加载）
 */
const base = 'http://localhost:3000/api';

async function login(username, password) {
  const r = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`login ${username} failed: ${JSON.stringify(j)}`);
  return j.data?.token || j.token;
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

const admin = await login('admin', 'admin');
console.log('[1] admin 登录成功');

// 建试卷
const paper = await api(admin, 'POST', '/admin/question-bank/papers', {
  subject: '数学',
  title: '冒烟测试卷·一元一次方程',
  grade: '七年级',
});
if (paper.status !== 201) throw new Error('createPaper: ' + JSON.stringify(paper));
const paperId = paper.body.data.id;
console.log('[2] 试卷创建成功:', paperId);

// 建 3 道题并挂到试卷
const questions = [
  { type: 'CHOICE', stem: '方程 2x+3=7 的解是？\nA. x=1  B. x=2  C. x=3  D. x=4', answer: 'B', difficulty: 2, knowledgePoints: ['一元一次方程'] },
  { type: 'FILL', stem: '若 3x-6=0，则 x = ____', answer: '2', difficulty: 1, knowledgePoints: ['一元一次方程'] },
  { type: 'FORMULA', stem: '化简 \\frac{x^2-1}{x-1}（x≠1）', answer: 'x+1', difficulty: 3, knowledgePoints: ['因式分解'] },
];
for (let i = 0; i < questions.length; i++) {
  const q = await api(admin, 'POST', '/admin/question-bank/questions', { subject: '数学', ...questions[i] });
  if (q.status !== 201) throw new Error('createQuestion: ' + JSON.stringify(q));
  const item = await api(admin, 'POST', `/admin/question-bank/papers/${paperId}/items`, {
    questionId: q.body.data.id,
    score: 10,
  });
  if (item.status !== 201) throw new Error('addItem: ' + JSON.stringify(item));
}
console.log('[3] 3 道题目已创建并挂卷');

// 发布试卷
const pub = await api(admin, 'POST', `/admin/question-bank/papers/${paperId}/publish`);
if (pub.status !== 200) throw new Error('publish: ' + JSON.stringify(pub));
console.log('[4] 试卷已发布');

// 家长端
const parent = await login('parent1', 'password123');
const papers = await api(parent, 'GET', '/parent/question-bank/papers?subject=' + encodeURIComponent('数学'));
console.log('[5] 家长可见试卷数:', papers.body.data.papers.length);
const summary = await api(parent, 'GET', '/parent/question-bank/summary?subject=' + encodeURIComponent('数学'));
console.log('[6] 题库概况:', JSON.stringify(summary.body.data));

// 找学员 ID
const children = await api(parent, 'GET', '/parent/children');
const student = children.body.data?.children?.[0] || children.body.data?.[0];
const studentId = student?.id || student?.studentId || student?.student?.id;
if (!studentId) throw new Error('未找到绑定学员: ' + JSON.stringify(children.body).slice(0, 300));
console.log('[7] 学员 ID:', studentId);

// 整卷发布任务
const t1 = await api(parent, 'POST', '/parent/tasks', {
  mode: 'EXAM_PAPER',
  studentId,
  examConfig: { source: 'PAPER', paperId },
});
if (t1.status !== 201) throw new Error('EXAM_PAPER(PAPER) 任务创建失败: ' + JSON.stringify(t1.body));
console.log('[8] 整卷任务创建成功:', t1.body.data.id, '| 题数:', t1.body.data.config.questionCount, '| 模式:', t1.body.data.mode);

// 随机组卷任务
const t2 = await api(parent, 'POST', '/parent/tasks', {
  mode: 'EXAM_PAPER',
  studentId,
  examConfig: { source: 'RANDOM', subject: '数学', questionCount: 2, difficultyMin: 1, difficultyMax: 3 },
});
if (t2.status !== 201) throw new Error('EXAM_PAPER(RANDOM) 任务创建失败: ' + JSON.stringify(t2.body));
console.log('[9] 随机组卷任务创建成功:', t2.body.data.id, '| 题数:', t2.body.data.config.questionCount, '| 标题:', t2.body.data.title);

// 学员端开始训练（验证固定题目）
const studentToken = await login('student1', 'password123');
const start = await fetch(base + `/student/training/start/${t1.body.data.id}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + studentToken },
});
const startBody = await start.json().catch(() => ({}));
if (start.ok) {
  const s = startBody.data || startBody;
  console.log('[10] 学员开始训练成功 | 会话:', s.id, '| totalSteps:', s.totalSteps, '| 题目数:', (s.questions || []).length);
} else {
  console.log('[10] 学员开始训练返回:', start.status, JSON.stringify(startBody).slice(0, 300), '（若路由不同请忽略）');
}

console.log('\n✅ EXAM_PAPER 冒烟测试完成');
