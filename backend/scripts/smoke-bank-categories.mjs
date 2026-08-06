/**
 * 题库多级目录 + 标签 + 文件夹导入冒烟（V2）
 * 覆盖：目录树（系统初测目录）/ 一级目录创建与重名拦截 / 初测目录禁改 /
 *      标签 CRUD / 文件夹导入（2 文件+paths 自动生成目录，202 立即返回）/
 *      试卷列表 categoryId 过滤
 */
const base = `http://127.0.0.1:${process.env.SMOKE_PORT || 3000}/api`;
let PASS = 0;
let FAIL = 0;
const ok = (n, x = '') => { PASS++; console.log(`  ✅ ${n}${x ? ' — ' + x : ''}`); };
const bad = (n, x = '') => { FAIL++; console.log(`  ❌ ${n}${x ? ' — ' + x : ''}`); };

async function login(u, p) {
  const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  return (await r.json()).data.token;
}
async function api(token, method, path, body, form) {
  const headers = { Authorization: 'Bearer ' + token };
  if (form) {
    const r = await fetch(base + path, { method, headers, body: form });
    let j = null; try { j = await r.json(); } catch { /* 空 */ }
    return { status: r.status, body: j };
  }
  headers['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* 空 */ }
  return { status: r.status, body: j };
}

const SUBJ = '冒烟学科';

async function main() {
  console.log('\n════════ L. 题库多级目录/标签/文件夹导入 ════════');
  const token = await login('admin', 'password123');
  if (!token) { bad('admin 登录'); return; }
  ok('admin 登录');

  // 1) 目录树（自动创建系统初测目录）
  let r = await api(token, 'GET', `/admin/question-bank/categories?subject=${encodeURIComponent(SUBJ)}`);
  const sys = r.body.data.find((n) => n.system);
  if (sys && sys.name === '初测与水平评估' && sys.immutable) ok('系统初测目录', 'system+immutable');
  else bad('系统初测目录', JSON.stringify(r.body.data).slice(0, 120));

  // 2) 新建一级目录 + 重名拦截
  r = await api(token, 'POST', '/admin/question-bank/categories', { subject: SUBJ, name: '单元卷' });
  if (r.status === 201 && r.body.data.id) ok('新建一级目录');
  else bad('新建一级目录', r.status + ' ' + JSON.stringify(r.body).slice(0, 100));
  r = await api(token, 'POST', '/admin/question-bank/categories', { subject: SUBJ, name: '单元卷' });
  if (r.status === 400 && /已存在/.test(r.body.message)) ok('重名拦截');
  else bad('重名拦截', r.status + ' ' + JSON.stringify(r.body).slice(0, 100));
  // 系统目录名拦截
  r = await api(token, 'POST', '/admin/question-bank/categories', { subject: SUBJ, name: '初测与水平评估' });
  if (r.status === 400) ok('系统目录名创建拦截');
  else bad('系统目录名创建拦截', r.status);

  // 3) 初测目录禁重命名
  r = await api(token, 'PATCH', `/admin/question-bank/categories/${sys.id}`, { name: '改名' });
  if (r.status === 400 && /禁止/.test(r.body.message)) ok('初测目录禁重命名');
  else bad('初测目录禁重命名', r.status + ' ' + JSON.stringify(r.body).slice(0, 80));

  // 4) 标签 CRUD
  r = await api(token, 'POST', '/admin/question-bank/tags', { subject: SUBJ, name: '易错题', color: '#ef4444' });
  if (r.status === 201) ok('创建标签');
  else bad('创建标签', r.status);
  const tags = await api(token, 'GET', `/admin/question-bank/tags?subject=${encodeURIComponent(SUBJ)}`);
  const tag = tags.body.data.find((t) => t.name === '易错题');
  r = await api(token, 'DELETE', `/admin/question-bank/tags/${tag.id}`);
  if (r.status === 200) ok('删除标签');
  else bad('删除标签', r.status);

  // 5) 文件夹导入：2 个小文件 + paths（构造临时文件）
  const { PrismaClient } = await import('@prisma/client');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const tmpDir = path.join(os.tmpdir(), 'smoke_folder_' + Date.now());
  fs.mkdirSync(path.join(tmpDir, '专项一'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '专项一', '测试题.docx'), '测试文档内容，仅验证目录生成链路。');
  fs.writeFileSync(path.join(tmpDir, '说明.txt'), '说明文件，不参与导入。');
  const form = new FormData();
  form.append('files', new Blob([fs.readFileSync(path.join(tmpDir, '专项一', '测试题.docx'))], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), '测试题.docx');
  form.append('paths', `冒烟目录根/专项一/测试题.docx`);
  form.append('subject', SUBJ);
  form.append('paperType', 'UNIT');
  r = await api(token, 'POST', '/admin/question-bank/import-folder', null, form);
  if (r.status === 202 && r.body.data.jobIds && r.body.data.jobIds.length === 1) ok('文件夹导入 202 立即返回', `job=${r.body.data.jobIds[0].slice(0, 8)}`);
  else bad('文件夹导入', r.status + ' ' + JSON.stringify(r.body).slice(0, 150));
  const jobId = r.body.data && r.body.data.jobIds[0];

  // 6) 目录树含新生成的路径（一级=冒烟目录根，二级=专项一）
  const tree = await api(token, 'GET', `/admin/question-bank/categories?subject=${encodeURIComponent(SUBJ)}`);
  const rootNode = tree.body.data.find((n) => n.name === '冒烟目录根');
  const subNode = rootNode && rootNode.children.find((c) => c.name === '专项一');
  if (rootNode && subNode && subNode.level === 2) ok('自动生成多级目录', '冒烟目录根/专项一');
  else bad('自动生成多级目录', JSON.stringify(tree.body.data).slice(0, 200));

  // 7) 试卷列表 categoryId 过滤（新目录此时可能还没有试卷→total 为 0 或 >=0，接口不报错即可）
  r = await api(token, 'GET', `/admin/question-bank/papers?subject=${encodeURIComponent(SUBJ)}&categoryId=${subNode.id}`);
  if (r.status === 200) ok('试卷列表 categoryId 过滤', `total=${r.body.data.total}`);
  else bad('试卷列表 categoryId 过滤', r.status + ' ' + JSON.stringify(r.body).slice(0, 100));

  // 8) 题目列表 categoryId 过滤（接口可用）
  r = await api(token, 'GET', `/admin/question-bank/questions?subject=${encodeURIComponent(SUBJ)}&categoryId=${subNode.id}`);
  if (r.status === 200) ok('题目列表 categoryId 过滤');
  else bad('题目列表 categoryId 过滤', r.status);

  // 清理：删目录（级联）；job 后台若完成则 paper 一并删除（简化：删除目录节点即可，paper 保留由后台处理）
  const p = new PrismaClient();
  await p.paperCategory.deleteMany({ where: { subject: SUBJ } });
  if (jobId) {
    // 后台任务已开始的无法删除，等其自然结束；删除其生成的试卷（若已 DONE）
    const job = await p.questionImportJob.findUnique({ where: { id: jobId }, select: { paperId: true } });
    if (job && job.paperId) {
      await p.questionPaperItem.deleteMany({ where: { paperId: job.paperId } }).catch(() => {});
      await p.questionPaper.delete({ where: { id: job.paperId } }).catch(() => {});
    }
  }
  await p.$disconnect();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('  已清理冒烟数据');

  console.log(`\nL 段结果：通过 ${PASS} / 失败 ${FAIL}`);
  if (FAIL > 0) process.exitCode = 1;
}
main().catch((e) => { console.error('💥', e.message); process.exit(1); });
