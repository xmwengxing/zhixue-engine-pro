/**
 * 脏数据 / 呆数据检测与清理
 *
 * 检测项（每项都会先报数，--fix 才真正修）：
 *  D1 Question.materialNodeId 指向非 SUBJECT 节点        → 破坏项目不变量，学科维度查询会静默漏题
 *  D2 空试卷（QuestionPaper 无任何 item）                 → 家长端选卷会选到 0 题的卷
 *  D3 孤儿题目（不属于任何试卷 且 从未被作答）             → 呆数据
 *  D4 卡死会话（TrainingSession 长时间 IN_PROGRESS）      → 学员进任务时会复用旧会话导致状态错乱
 *  D5 孤儿会话（引用的 Task 已不存在）
 *  D6 引用已删除题目的错题本记录
 *  D7 DRAFT 状态却被任务引用的试卷                        → 学员能答未发布的卷
 *  D8 冒烟/测试残留数据（title 带 [冒烟] / subject 含"冒烟"）
 *  D9 知识点为空的题目                                    → 学情统计缺失
 *
 * 用法:
 *   node scripts/clean-dirty-data.mjs          # 只检测
 *   node scripts/clean-dirty-data.mjs --fix    # 执行清理
 *   node scripts/clean-dirty-data.mjs --fix --include-smoke   # 连冒烟残留一起删
 *   node scripts/clean-dirty-data.mjs --ci     # 只检测；有脏数据则退出码 1（CI / 每周定时任务用）
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const prisma = new PrismaClient();
const FIX = process.argv.includes('--fix');
const INCLUDE_SMOKE = process.argv.includes('--include-smoke');
// --ci：检出脏数据时以退出码 1 结束，供 CI / 定时任务告警（不自动修改数据）
const CI_MODE = process.argv.includes('--ci');
const STALE_HOURS = 24;

const report = [];
function log(code, desc, count, action) {
  report.push({ code, desc, count, action });
  const flag = count === 0 ? '✓' : '!';
  console.log(`  ${flag} [${code}] ${desc}: ${count}${count && action ? `  → ${action}` : ''}`);
}

async function main() {
  console.log(`\n=== 脏数据检测 ${FIX ? '(FIX 模式)' : '(只读)'} ===\n`);

  // D1 materialNodeId 指向非 SUBJECT
  const badNodeQs = await prisma.question.findMany({
    where: { materialNode: { type: { not: 'SUBJECT' } } },
    select: { id: true, materialNode: { select: { id: true, name: true, type: true, metadata: true } } },
  });
  log('D1', 'materialNodeId 未指向 SUBJECT 节点的题目', badNodeQs.length, FIX ? '改挂到对应学科 SUBJECT 节点' : '');
  if (FIX && badNodeQs.length) {
    const cache = new Map();
    const ensure = async (subject) => {
      if (cache.has(subject)) return cache.get(subject);
      let n = await prisma.materialNode.findFirst({ where: { type: 'SUBJECT', name: subject } });
      if (!n) n = await prisma.materialNode.create({ data: { name: subject, type: 'SUBJECT', order: 0, metadata: { subject, source: 'dirty-fix' } } });
      cache.set(subject, n.id);
      return n.id;
    };
    for (const q of badNodeQs) {
      const subject = q.materialNode?.metadata?.subject || q.materialNode?.name || '未分类';
      const nid = await ensure(subject);
      await prisma.question.update({ where: { id: q.id }, data: { materialNodeId: nid } });
    }
  }

  // D2 空试卷
  const emptyPapers = await prisma.questionPaper.findMany({
    where: { items: { none: {} } },
    select: { id: true, title: true, subject: true, status: true },
  });
  log('D2', '空试卷（0 道题）', emptyPapers.length, FIX ? '删除' : '');
  if (FIX && emptyPapers.length) {
    await prisma.questionPaper.deleteMany({ where: { id: { in: emptyPapers.map((p) => p.id) } } });
  }

  // D3 孤儿题目：不在任何卷 + 无作答记录 + 无错题引用
  const orphanQs = await prisma.question.findMany({
    where: { paperItems: { none: {} }, answers: { none: {} }, errorQuestions: { none: {} } },
    select: { id: true, source: true },
  });
  log('D3', '孤儿题目（不属任何卷且从未被作答）', orphanQs.length, FIX ? '删除' : '');
  if (FIX && orphanQs.length) {
    await prisma.question.deleteMany({ where: { id: { in: orphanQs.map((q) => q.id) } } });
  }

  // D4 卡死会话：>24h 未更新仍 ACTIVE
  //   - 一道题都没答过 → 是死会话，直接删（否则学员再进任务会复用它，卡在坏状态）
  //   - 答过题        → 置为 PAUSED，保留可续答
  const staleAt = new Date(Date.now() - STALE_HOURS * 3600 * 1000);
  const staleSessions = await prisma.trainingSession.findMany({
    where: { status: 'ACTIVE', startedAt: { lt: staleAt } },
    select: { id: true, phase: true, startedAt: true, _count: { select: { answers: true } } },
  });
  const deadOnes = staleSessions.filter((s) => s._count.answers === 0);
  const pausable = staleSessions.filter((s) => s._count.answers > 0);
  log('D4', `卡死会话（开始 >${STALE_HOURS}h 仍 ACTIVE）`, staleSessions.length,
    FIX ? `删除空会话 ${deadOnes.length} / 置 PAUSED ${pausable.length}` : '');
  if (FIX && staleSessions.length) {
    if (deadOnes.length) {
      await prisma.trainingSession.deleteMany({ where: { id: { in: deadOnes.map((s) => s.id) } } });
    }
    if (pausable.length) {
      await prisma.trainingSession.updateMany({
        where: { id: { in: pausable.map((s) => s.id) } },
        data: { status: 'PAUSED' },
      });
    }
  }

  // D5 孤儿会话（Task 已删）
  const allSessions = await prisma.trainingSession.findMany({ select: { id: true, taskId: true } });
  const taskIds = new Set((await prisma.task.findMany({ select: { id: true } })).map((t) => t.id));
  const orphanSessions = allSessions.filter((s) => s.taskId && !taskIds.has(s.taskId));
  log('D5', '孤儿会话（引用的任务已删除）', orphanSessions.length, FIX ? '删除' : '');
  if (FIX && orphanSessions.length) {
    const ids = orphanSessions.map((s) => s.id);
    await prisma.answer.deleteMany({ where: { sessionId: { in: ids } } });
    await prisma.trainingSession.deleteMany({ where: { id: { in: ids } } });
  }

  // D6 错题本引用已删题目 —— 外键保证不会出现，改查内容为空的错题
  const emptyErrors = await prisma.errorQuestion.count({ where: { question: { is: null } } }).catch(() => 0);
  log('D6', '错题本孤儿记录', emptyErrors, '');

  // D7 DRAFT 卷被任务引用
  const draftPapers = await prisma.questionPaper.findMany({ where: { status: 'DRAFT' }, select: { id: true, title: true } });
  let draftUsed = [];
  if (draftPapers.length) {
    const tasks = await prisma.task.findMany({ where: { mode: 'EXAM_PAPER' }, select: { id: true, config: true } });
    const draftIds = new Set(draftPapers.map((p) => p.id));
    draftUsed = tasks.filter((t) => {
      const pid = t.config?.paperId || t.config?.examConfig?.paperId;
      return pid && draftIds.has(pid);
    });
  }
  log('D7', '未发布(DRAFT)试卷被任务引用', draftUsed.length, FIX && draftUsed.length ? '把这些卷置为 PUBLISHED' : '');
  if (FIX && draftUsed.length) {
    const pids = draftUsed.map((t) => t.config?.paperId || t.config?.examConfig?.paperId).filter(Boolean);
    await prisma.questionPaper.updateMany({ where: { id: { in: pids } }, data: { status: 'PUBLISHED' } });
  }

  // D8 冒烟/测试残留
  const smokeTasks = await prisma.task.findMany({
    where: { OR: [{ title: { contains: '[冒烟]' } }, { title: { contains: '冒烟' } }] },
    select: { id: true, title: true },
  });
  const smokePapers = await prisma.questionPaper.findMany({
    where: { OR: [{ subject: { contains: '冒烟' } }, { title: { contains: '冒烟' } }] },
    select: { id: true, title: true },
  });
  log('D8', '冒烟/测试残留（任务 + 试卷）', smokeTasks.length + smokePapers.length,
    INCLUDE_SMOKE && FIX ? '删除' : '需加 --include-smoke 才删');
  if (FIX && INCLUDE_SMOKE) {
    const tIds = smokeTasks.map((t) => t.id);
    if (tIds.length) {
      const sess = await prisma.trainingSession.findMany({ where: { taskId: { in: tIds } }, select: { id: true } });
      const sIds = sess.map((s) => s.id);
      if (sIds.length) {
        // 删除顺序必须先清所有指向 TrainingSession 的外键，否则 P2003
        await prisma.answer.deleteMany({ where: { sessionId: { in: sIds } } });
        await prisma.aIConversation.deleteMany({ where: { sessionId: { in: sIds } } }).catch(() => {});
        await prisma.report.deleteMany({ where: { sessionId: { in: sIds } } }).catch(() => {});
        await prisma.trainingSession.deleteMany({ where: { id: { in: sIds } } });
      }
      // 任务下可能还挂着报告等引用
      await prisma.report.deleteMany({ where: { taskId: { in: tIds } } }).catch(() => {});
      await prisma.task.deleteMany({ where: { id: { in: tIds } } });
    }
    for (const p of smokePapers) {
      const items = await prisma.questionPaperItem.findMany({ where: { paperId: p.id }, select: { questionId: true } });
      await prisma.questionPaperItem.deleteMany({ where: { paperId: p.id } });
      await prisma.questionPaper.delete({ where: { id: p.id } });
      const qIds = items.map((i) => i.questionId);
      if (qIds.length) {
        const used = await prisma.answer.findMany({ where: { questionId: { in: qIds } }, select: { questionId: true } });
        const usedSet = new Set(used.map((u) => u.questionId));
        await prisma.question.deleteMany({ where: { id: { in: qIds.filter((i) => !usedSet.has(i)) } } });
      }
    }
  }

  // D9 知识点为空的题目
  const noKp = await prisma.question.count({ where: { knowledgePoints: { isEmpty: true } } });
  log('D9', '知识点为空的题目（学情统计会漏）', noKp, FIX ? '用学科名兜底' : '');
  if (FIX && noKp) {
    const rows = await prisma.question.findMany({
      where: { knowledgePoints: { isEmpty: true } },
      select: { id: true, materialNode: { select: { name: true } } },
    });
    for (const r of rows) {
      await prisma.question.update({ where: { id: r.id }, data: { knowledgePoints: [r.materialNode?.name || '综合'] } });
    }
  }

  // D10 僵尸 AI 服务商（ACTIVE 但实际不可用 → 会阻塞整条 AI 调用链）
  const providers = await prisma.aIProvider.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { priority: 'asc' },
  });
  const zombies = [];
  for (const p of providers) {
    const base = String(p.endpoint || '').replace(/\/$/, '');
    if (!base) { zombies.push({ p, why: '端点为空' }); continue; }

    // 探测方式必须与 aiServiceManager.createAdapter() 的选择逻辑保持一致，
    // 否则会把本地 Ollama（走原生 /api/chat + think:false）误判成僵尸并禁用主力服务商。
    const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0|ollama/i.test(base);
    try {
      if (isLocal) {
        const root = base.replace(/\/v1\/?$/, '');
        const headers = { 'Content-Type': 'application/json' };
        if (p.apiKey && p.apiKey !== 'ollama') headers.Authorization = `Bearer ${p.apiKey}`;
        const r = await fetch(`${root}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: p.model,
            messages: [{ role: 'user', content: '只回复两个字：正常' }],
            think: false,
            stream: false,
            // 实测部分 Qwen3 模型不认 think:false，会先输出一大段 thinking；
            // num_predict 给太小会在思考阶段就截断，导致把可用模型误判成僵尸。
            options: { num_predict: 2048 },
          }),
          signal: AbortSignal.timeout(120000), // 本地推理慢，与运行时 120s 对齐
        });
        if (!r.ok) { zombies.push({ p, why: `Ollama HTTP ${r.status}` }); continue; }
        const j = await r.json();
        const content = String(j?.message?.content || '').trim();
        const thinking = String(j?.message?.thinking || '').trim();
        if (!content) {
          // 有 thinking 说明模型活着，只是思考太长被截断 → 属于配置问题，不是僵尸
          zombies.push({
            p,
            why: thinking
              ? `content 为空但有 thinking（done_reason=${j?.done_reason}）→ 模型不遵守 think:false，需调高 maxTokens 或换非推理模型`
              : `content 为空（done_reason=${j?.done_reason}）`,
          });
        }
      } else {
        const r = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
          body: JSON.stringify({ model: p.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 512 }),
          signal: AbortSignal.timeout(30000),
        });
        if (!r.ok) { zombies.push({ p, why: `HTTP ${r.status}` }); continue; }
        const j = await r.json();
        const msg = j?.choices?.[0]?.message || {};
        // reasoning 模型把全部输出塞进 reasoning、content 为空 → 对结构化出题不可用
        if (!String(msg.content || '').trim()) {
          const hasReasoning = String(msg.reasoning || msg.reasoning_content || '').trim();
          zombies.push({ p, why: hasReasoning ? 'content 为空（纯 reasoning 模型，不适合出题）' : 'content 为空' });
        }
      }
    } catch (e) {
      zombies.push({ p, why: `不可达: ${String(e.message).slice(0, 40)}` });
    }
  }
  log('D10', '僵尸 AI 服务商（ACTIVE 但不可用，会拖垮整条调用链）', zombies.length,
    FIX ? '置为 INACTIVE 并降优先级' : '');
  for (const z of zombies) console.log(`        · ${z.p.name} (prio=${z.p.priority}) → ${z.why}`);
  if (FIX && zombies.length) {
    for (const z of zombies) {
      await prisma.aIProvider.update({ where: { id: z.p.id }, data: { status: 'INACTIVE', priority: 900 } });
    }
  }

  // D11 PROFILE 会话卡在 PLANNING/GUIDED_TRAINING 但训练计划为空
  // （历史上 generateTrainingPlan 是死代码，会导致学员做完诊断后永久卡死）
  const planless = await prisma.trainingSession.findMany({
    where: {
      phase: { in: ['PLANNING', 'GUIDED_TRAINING', 'FINAL_EXAM'] },
      trainingPlanData: { equals: null },
      status: { not: 'COMPLETED' },
      task: { mode: 'PROFILE' },
    },
    include: { task: { select: { title: true } } },
  });
  log('D11', 'PROFILE 会话缺训练计划（学员会卡死在规划页）', planless.length,
    FIX ? '重置回 PLANNING，由 ensureTrainingPlan 自愈重建' : '');
  for (const s of planless) {
    console.log(`        · ${s.id.slice(0, 8)} phase=${s.phase} 任务=${(s.task?.title || '').slice(0, 20)}`);
  }
  if (FIX && planless.length) {
    for (const s of planless) {
      // 退回 PLANNING：学员下次进入训练舱时 getSession 会触发自愈生成计划
      await prisma.trainingSession.update({
        where: { id: s.id },
        data: { phase: 'PLANNING' },
      });
    }
  }

  // 现状快照
  console.log('\n=== 题库现状 ===');
  const [pc, qc, sc, tc] = await Promise.all([
    prisma.questionPaper.count(), prisma.question.count(),
    prisma.trainingSession.count(), prisma.task.count(),
  ]);
  console.log(`  试卷 ${pc} / 题目 ${qc} / 训练会话 ${sc} / 任务 ${tc}`);
  const byStatus = await prisma.trainingSession.groupBy({ by: ['status'], _count: true });
  console.log('  会话状态:', byStatus.map((x) => `${x.status}=${x._count}`).join(' '));

  const dirty = report.filter((r) => r.count > 0);
  const dirtyTotal = dirty.reduce((a, b) => a + b.count, 0);
  console.log(`\n${FIX ? '已处理' : '检出'} ${dirty.length} 类问题，共 ${dirtyTotal} 条`);
  if (!FIX && dirty.length) console.log('加 --fix 执行清理');

  // --ci：给 CI / 定时任务用。只检测不修改，检出脏数据即以非 0 退出，触发告警。
  if (CI_MODE) {
    if (FIX) {
      console.log('\n[ci] --ci 与 --fix 同时传入：--ci 只负责退出码，清理已由 --fix 执行');
    }
    if (dirty.length > 0) {
      console.error(
        `\n[ci] 检出 ${dirty.length} 类脏数据（共 ${dirtyTotal} 条），请人工确认后执行 --fix`
      );
      process.exitCode = 1;
    } else {
      console.log('\n[ci] 脏数据检测全部归零 ✓');
    }
  }
}

main().catch((e) => { console.error('失败:', e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
