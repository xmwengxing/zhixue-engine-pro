/**
 * P6 真实 LLM 链路验证（task #73）：
 *  - callAI 连通性（OpenAI 兼容端点 sensenova）
 *  - 构造一个带作答的会话 → studentMemoryService.updateFromSession 触发真实记忆归纳并落库+写日志
 *  - buildAgentContext 装配 L1-L6 → callAI 真实对话返回
 * 结束后清理本次构造的临时会话与记忆，避免污染测试库。
 */
import { PrismaClient } from '@prisma/client';
import { aiServiceManager } from '../src/services/aiServiceManager';
import { buildAgentContext } from '../src/services/agentContextBuilder';
import { studentMemoryService } from '../src/services/studentMemoryService';

const prisma = new PrismaClient();
const STUDENT_ID = '57f50f80-b31b-4220-af21-286f46320c94';
const SUBJECT = '数学';

function assert(c: boolean, m: string) {
  if (!c) throw new Error(`断言失败: ${m}`);
  console.log(`  ✅ ${m}`);
}

async function main() {
  console.log(`\n=== [P6-LLM] 1) callAI 连通性 ===`);
  const ping = await aiServiceManager.callAI('用一句话介绍勾股定理。', { maxTokens: 800, temperature: 0.3 });
  assert(typeof ping === 'string' && ping.trim().length > 5, `callAI 返回非空文本（${ping.length} 字）`);
  console.log('   ↳', ping.slice(0, 60).replace(/\n/g, ' '), '...');

  console.log(`\n=== [P6-LLM] 2) 构造带作答会话 → 触发记忆归纳 ===`);
  // 取一个真实题目作为“已作答”素材（Question 无 subject 列，按存在性取首条）
  const q = await prisma.question.findFirst({
    select: { id: true, content: true, knowledgePoints: true, difficulty: true, answer: true },
  });
  if (!q) throw new Error('未找到题目，无法构造会话');

  const task = await prisma.task.findFirst({
    where: { studentId: STUDENT_ID },
    select: { id: true, title: true, subject: true },
  });
  const taskId = task?.id ?? (await prisma.task.create({
    data: { title: 'P6临时任务', studentId: STUDENT_ID, subject: SUBJECT, category: 'SUBJECT_MAIN', difficulty: 3, status: 'ACTIVE' },
  })).id;

  const session = await prisma.trainingSession.create({
    data: {
      studentId: STUDENT_ID,
      taskId,
      phase: 'GUIDED_TRAINING',
      status: 'COMPLETED',
      totalSteps: 5,
      answers: {
        create: [{
          questionId: q.id,
          isCorrect: false,
          studentAnswer: '我算错了，以为答案是 9',
          timeSpent: 60,
        }],
      },
      aiConversations: {
        create: [{
          role: 'USER',
          message: '这道题我不会，能提示一下吗？',
        }],
      },
    },
    include: { answers: true },
  });
  console.log(`   ℹ️ 构造临时会话 ${session.id}（题目 ${q.id?.slice(0, 8)}，作答错误）`);

  await studentMemoryService.updateFromSession(session.id);
  // updateFromSession 以会话所属 task 的 subject 落库（本例复用 student1 既有任务，subject 取自任务）
  const memSubject = (await prisma.task.findUnique({ where: { id: taskId }, select: { subject: true } }))?.subject ?? SUBJECT;
  const mem = await studentMemoryService.getMemories(STUDENT_ID, memSubject);
  const fresh = mem.filter((m) => m.content && m.content.length > 10);
  assert(mem.length > 0, `学员记忆已写入（subject=${memSubject}，共 ${mem.length} 条）`);
  assert(fresh.length > 0, '存在本次新写入的记忆内容');
  console.log('   ↳ 记忆摘要:', (fresh[0]?.content || mem[0].content).slice(0, 80).replace(/\n/g, ' '), '...');

  const logs = await studentMemoryService.getMemoryLogs(mem[0].id);
  assert(logs.length > 0, `记忆修订历史已写入（${logs.length} 条）`);

  console.log(`\n=== [P6-LLM] 3) buildAgentContext L1-L6 → 真实对话 ===`);
  const ctx = await buildAgentContext({
    studentId: STUDENT_ID,
    subject: SUBJECT,
    phase: 'GUIDED_TRAINING',
    scene: '训练舱引导式对话（苏格拉底式，不直接给答案）',
    sessionState: '任务：P6 临时任务｜阶段：GUIDED_TRAINING｜最近作答：错误',
  });
  assert(ctx.systemPrompt.length > 0, `分层系统提示词已装配（${ctx.systemPrompt.length} 字）`);
  const layers = ctx.meta.map((m) => m.layer).join(' → ');
  console.log('   ℹ️ 注入层:', layers);
  assert(ctx.meta.some((m) => m.layer === 'L1'), 'L1 约束层必存在');

  const reply = await aiServiceManager.callAI('学生在刚才那道题上答错了，请用苏格拉底式提问引导他，不要直接给答案。', {
    systemPrompt: ctx.systemPrompt,
    maxTokens: 800,
    temperature: 0.7,
  });
  assert(reply.trim().length > 10, `分层上下文驱动的真实回复已生成（${reply.length} 字）`);
  console.log('   ↳ AI 回复:', reply.slice(0, 100).replace(/\n/g, ' '), '...');

  console.log(`\n=== [P6-LLM] 清理临时数据 ===`);
  await prisma.trainingSession.delete({ where: { id: session.id } }).catch(() => {});
  for (const m of mem) {
    await studentMemoryService.deleteMemory(m.id).catch(() => {});
  }
  console.log('   🧹 已删除临时会话与记忆');

  console.log('\n🎉 P6 真实 LLM 链路验证全部通过');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('\n❌ P6-LLM 验证失败:', e?.message || e);
    await prisma.$disconnect();
    process.exit(1);
  });
