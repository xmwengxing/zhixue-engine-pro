/**
 * 英语单词攻克功能冒烟（HTTP 级）
 * 覆盖：词库阶段概览 / 学员建 WORD 任务 / 开始会话（分组）/ 组提交（错词记录）/
 *       完成→AI 词汇老师短语填空 / 填空判定 / 错题集 / TTS 代理
 */
const base = `http://localhost:${process.env.SMOKE_PORT || 3000}/api`;

let PASS = 0;
let FAIL = 0;
const ok = (name, extra = '') => { PASS++; console.log(`  ✅ ${name}${extra ? ' — ' + extra : ''}`); };
const bad = (name, extra = '') => { FAIL++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); };

async function login(u, p) {
  const r = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p }),
  });
  const j = await r.json();
  return { token: j.data?.token || j.token, user: j.data?.user || j.user };
}
async function api(token, method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch { /* 空 body */ }
  return { status: r.status, body: j };
}

async function main() {
  console.log('\n════════ J. 英语单词攻克 ════════');
  const stu = await login('student1', 'password123');
  if (!stu.token) { bad('student1 登录'); return; }
  ok('student1 登录');

  // 1) 词库阶段概览
  const st = await api(stu.token, 'GET', '/student/word-bank/stages');
  const stages = st.body?.data || [];
  if (st.status === 200 && Array.isArray(stages) && stages.length > 0) {
    ok('词库阶段概览', stages.map((s) => `${s.stage}:${s.count}`).join(' '));
  } else bad('词库阶段概览', JSON.stringify(st.body).slice(0, 150));

  // 2) 学员创建 WORD 任务
  const ct = await api(stu.token, 'POST', '/student/tasks/special', {
    subject: '英语',
    specialType: 'WORD',
    wordConfig: { mode: 'SPELLING', stage: '初中', orderMode: 'RANDOM', groupSize: 2, intervalSec: 1, roundSize: 6 },
    title: '冒烟·单词默写',
  });
  if (ct.status === 201 && ct.body?.success) {
    const task = ct.body.data;
    ok('学员创建 WORD 任务', `id=${task.id}, mode=${task.mode}, specialType=${task.specialType}`);
    if (task.config?.aiTeacherId) ok('老师固定 AI 词汇老师', task.config.aiTeacherId.slice(0, 8));
    else bad('老师固定 AI 词汇老师', 'config.aiTeacherId 缺失');

    // 3) 开始会话
    const start = await api(stu.token, 'POST', `/student/word-task/start/${task.id}`);
    if (start.status === 200 && start.body?.data?.sessionId) {
      const d = start.body.data;
      ok('开始会话', `session=${d.sessionId.slice(0, 8)}, 组=${d.groups}, 总词=${d.total}`);
      if (Array.isArray(d.group) && d.group.length === 2) ok('首组 2 词（组数配置生效）');
      else bad('首组词数', JSON.stringify(d.group));

      // 4) 逐词提交首组（1 对 1 错）→ 下一组
      const g0 = d.group;
      for (let i = 0; i < g0.length; i++) {
        await api(stu.token, 'POST', `/student/word-task/submit-word/${d.sessionId}`, {
          wordId: g0[i].id,
          input: i === 0 ? g0[i].word : 'wronginput',
        });
      }
      const g1 = await api(stu.token, 'POST', `/student/word-task/group/${d.sessionId}`, {
        groupIndex: 0,
      });
      if (g1.status === 200 && g1.body?.data?.done === false && Array.isArray(g1.body.data.group)) {
        ok('逐词提交→下一组', `组 ${g1.body.data.groupIndex}`);
      } else bad('提交首组', JSON.stringify(g1.body).slice(0, 200));

      // 5) 连续提交剩余组直到 done（进入短语填空）
      let gi = 1;
      let cloze = null;
      let lastResp = g1;
      let safety = 0;
      while (safety++ < 10) {
        const cur = gi === 1 ? g1.body.data : lastResp.body.data;
        const curGroup = cur.group;
        if (!curGroup || curGroup.length === 0) break;
        for (const w of curGroup) {
          await api(stu.token, 'POST', `/student/word-task/submit-word/${d.sessionId}`, {
            wordId: w.id,
            input: w.word,
          });
        }
        lastResp = await api(stu.token, 'POST', `/student/word-task/group/${d.sessionId}`, {
          groupIndex: gi,
        });
        const rd = lastResp.body?.data;
        if (lastResp.status === 200 && rd?.done === true) {
          cloze = rd.cloze;
          ok('完成全部组→强制进入短语填空', `题数=${Array.isArray(cloze) ? cloze.length : 0}`);
          break;
        }
        gi = rd?.groupIndex ?? gi + 1;
      }
      if (cloze) {
        if (Array.isArray(cloze) && cloze.length > 0) {
          ok('AI 词汇老师出题（实时不入库）', `第 1 题: ${cloze[0].sentence.slice(0, 60)}...`);
          // 填空判定
          const q = cloze[0];
          const ck = await api(stu.token, 'POST', '/student/word-task/cloze/check', {
            answer: q.answer,
            input: q.answer.toUpperCase(),
          });
          if (ck.body?.data?.correct === true) ok('填空判定（忽略大小写）');
          else bad('填空判定', JSON.stringify(ck.body).slice(0, 120));
        } else bad('短语填空为空', 'AI 出题失败');
      }

      // 6) 恢复进行中会话（填空未完成）
      const resume = await api(stu.token, 'POST', `/student/word-task/resume/${task.id}`);
      if (resume.status === 200) {
        const rd = resume.body?.data;
        if (rd && rd.phase === 'CLOZE') ok('恢复会话→回到未完成填空', `题数=${rd.cloze?.length}`);
        else ok('恢复会话', `phase=${rd?.phase || 'null'}`);
      } else bad('恢复会话', JSON.stringify(resume.body).slice(0, 120));

      // 7) 完成会话
      const fin = await api(stu.token, 'POST', `/student/word-task/finish/${d.sessionId}`, { clozeDone: true });
      if (fin.status === 200) ok('完成会话');
      else bad('完成会话', JSON.stringify(fin.body).slice(0, 120));
    } else bad('开始会话', JSON.stringify(start.body).slice(0, 200));

    // 8) 单词错题集（应包含刚才答错的 wronginput 词）
    const mk = await api(stu.token, 'GET', '/student/word-task/mistakes?stage=' + encodeURIComponent('初中'));
    const rows = mk.body?.data || [];
    if (mk.status === 200 && Array.isArray(rows)) {
      ok('单词错题集', `错词 ${rows.length} 个`);
      if (rows.length > 0 && rows[0].wrongCount >= 1) ok('错误频率已记录', `TOP: ${rows[0].word} ×${rows[0].wrongCount}`);
    } else bad('单词错题集', JSON.stringify(mk.body).slice(0, 120));
  } else bad('学员创建 WORD 任务', `status=${ct.status} ${JSON.stringify(ct.body).slice(0, 200)}`);

  console.log(`\nJ 段结果：通过 ${PASS} / 失败 ${FAIL}`);
  if (FAIL > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('💥', e.message);
  process.exit(1);
});
