/**
 * P5 冒烟测试：验证分层上下文装配器（L1-L6）在真实数据库上的行为。
 * 不涉及 AI 调用，仅做 DB 读取与组装，安全可重复执行。
 */
import { PrismaClient } from '@prisma/client';
import { buildAgentContext } from '../src/services/agentContextBuilder';
import { studentMemoryService } from '../src/services/studentMemoryService';

const prisma = new PrismaClient();

async function main() {
  // 1) 校验种子文档存在
  const docCount = await prisma.agentDocument.count();
  const enabledDocs = await prisma.agentDocument.count({ where: { enabled: true } });
  console.log(`[seed] AgentDocument 总数=${docCount} 启用=${enabledDocs}`);

  // 2) 找一个真实会话，拿到 studentId / subject
  const session = await prisma.trainingSession.findFirst({
    include: { task: true },
    orderBy: { startedAt: 'desc' },
  });

  if (!session) {
    console.log('[warn] 无训练会话，尝试取任一学员做基础读取');
    const anyStudent = await prisma.user.findFirst({
      where: { role: 'STUDENT' },
      select: { id: true },
    });
    if (anyStudent) {
      const ctx = await buildAgentContext({ studentId: anyStudent.id, subject: null });
      console.log(`[ctx] student=${anyStudent.id} 长度=${ctx.systemPrompt.length} 层=${ctx.meta.map((m) => m.layer).join(',') || '无'}`);
    }
  } else {
    const studentId = session.studentId;
    const subject: string | null = (session.task as any)?.subject ?? null;
    console.log(`[ctx] 目标 student=${studentId} subject=${subject ?? '全局'} phase=GUIDED_TRAINING`);

    const ctx = await buildAgentContext({
      studentId,
      subject,
      phase: 'GUIDED_TRAINING',
      scene: '训练舱引导式对话（苏格拉底式）',
      sessionState: '任务：冒烟测试',
    });
    console.log(`[ctx] 系统提示词长度=${ctx.systemPrompt.length}`);
    console.log('[ctx] 各层注入：');
    for (const m of ctx.meta) {
      console.log(`   ${m.layer} | ${m.title} | ${m.chars} 字`);
    }
    // L1 永不被裁剪：合并不应缺失约束层
    const hasL1 = ctx.meta.some((m) => m.layer === 'L1');
    console.log(`[assert] L1 约束层存在=${hasL1}`);

    const mem = await studentMemoryService.getMemories(studentId, subject);
    console.log(`[mem] 该学员记忆条数=${mem.length}`);
  }

  // 3) 校验 memory 规范默认文档存在
  const memSpec = await prisma.agentDocument.count({ where: { type: 'MEMORY_SPEC', enabled: true } });
  console.log(`[spec] MEMORY_SPEC 启用文档=${memSpec}`);

  await prisma.$disconnect();
  console.log('SMOKE_OK');
}

main().catch(async (e) => {
  console.error('SMOKE_FAIL', e);
  await prisma.$disconnect();
  process.exit(1);
});
