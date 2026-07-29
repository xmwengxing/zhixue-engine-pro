// 学科学情档案服务（P4 核心）
// 职责：
//  1) getSubjectState / listSubjects / getSubjectSummary —— 全端统一的学情读取入口
//     （questionSelectionService 的 AI 选题、AI 学科老师、前端学情总览页、P5 上下文装配器均复用）
//  2) updateFromSession —— 会话结束时增量合并学情档案
//     - SUBJECT_MAIN：全量更新（masteryMap / weakPoints / errorStats / taskHistory / irtTheta）
//     - SPECIAL：仅更新本次会话涉及的知识点并标 source:'special'，不改写总体结论（irtTheta / taskHistory 不动）

import { PrismaClient } from '@prisma/client';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

export interface MasteryEntry {
  score: number; // 0-100
  trend: 'up' | 'down' | 'flat';
  lastAt: string; // ISO
  source?: 'main' | 'special';
}

export interface SubjectState {
  studentId: string;
  subject: string;
  irtTheta: number | null;
  masteryMap: Record<string, MasteryEntry>;
  weakPoints: { point: string; score: number; priority: number }[];
  errorStats: {
    total: number;
    byMastery: Record<string, number>;
    byKnowledgePoint: Record<string, number>;
  };
  taskHistory: { taskId: string; title: string; completedAt: string; completion: number; score: number }[];
  updatedAt: string | null;
}

const EMPTY_STATE = (studentId: string, subject: string): SubjectState => ({
  studentId,
  subject,
  irtTheta: null,
  masteryMap: {},
  weakPoints: [],
  errorStats: { total: 0, byMastery: {}, byKnowledgePoint: {} },
  taskHistory: [],
  updatedAt: null,
});

/**
 * 读取学情档案；不存在时返回统一骨架（不抛错，便于前端/AI 安全消费）。
 */
export async function getSubjectState(studentId: string, subject: string): Promise<SubjectState> {
  const row = await prisma.subjectLearningState.findUnique({
    where: { studentId_subject: { studentId, subject } },
  });
  if (!row) return EMPTY_STATE(studentId, subject);
  return {
    studentId: row.studentId,
    subject: row.subject,
    irtTheta: row.irtTheta,
    masteryMap: (row.masteryMap as unknown as Record<string, MasteryEntry>) ?? {},
    weakPoints: (row.weakPoints as any) ?? [],
    errorStats: (row.errorStats as any) ?? { total: 0, byMastery: {}, byKnowledgePoint: {} },
    taskHistory: (row.taskHistory as any) ?? [],
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

/**
 * 列出该生所有学科的学情档案（用于前端学科 Tab / 总览入口）。
 */
export async function listSubjects(studentId: string): Promise<SubjectState[]> {
  const rows = await prisma.subjectLearningState.findMany({
    where: { studentId },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((row) => ({
    studentId: row.studentId,
    subject: row.subject,
    irtTheta: row.irtTheta,
    masteryMap: (row.masteryMap as unknown as Record<string, MasteryEntry>) ?? {},
    weakPoints: (row.weakPoints as any) ?? [],
    errorStats: (row.errorStats as any) ?? { total: 0, byMastery: {}, byKnowledgePoint: {} },
    taskHistory: (row.taskHistory as any) ?? [],
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  }));
}

/**
 * 给 AI 用的学情摘要（L5）：薄弱点 TOP5 + 近期趋势 + 已掌握度概览。
 * 程序生成的精简摘要，而非全量 masteryMap，节省 token。
 */
export async function getSubjectSummary(studentId: string, subject: string): Promise<{
  subject: string;
  irtTheta: number | null;
  weakPointsTop5: { point: string; score: number }[];
  totalKnowledgePoints: number;
  masteredCount: number;
  errorTotal: number;
  recentTrend: { point: string; trend: string; score: number }[];
}> {
  const state = await getSubjectState(studentId, subject);
  const entries = Object.entries(state.masteryMap) as [string, MasteryEntry][];
  const weak = [...entries].sort((a, b) => a[1].score - b[1].score).slice(0, 5);
  const mastered = entries.filter(([, v]) => v.score >= 80).length;
  const recent = [...entries]
    .sort((a, b) => (b[1].lastAt || '').localeCompare(a[1].lastAt || ''))
    .slice(0, 5)
    .map(([point, v]) => ({ point, trend: v.trend, score: v.score }));
  return {
    subject,
    irtTheta: state.irtTheta,
    weakPointsTop5: weak.map(([point, v]) => ({ point, score: v.score })),
    totalKnowledgePoints: entries.length,
    masteredCount: mastered,
    errorTotal: state.errorStats.total,
    recentTrend: recent,
  };
}

/**
 * 会话结束时增量更新学情档案。被 reportGenerationService 在 saveReport 之后调用。
 * 失败只记日志，绝不阻断报告生成主流程。
 */
export async function updateFromSession(sessionId: string): Promise<void> {
  try {
    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: {
        task: true,
        answers: { include: { question: true } },
      },
    });
    if (!session) {
      logger.warn(`[SubjectState] 会话不存在，跳过更新: ${sessionId}`);
      return;
    }

    const studentId = session.studentId;
    const task = session.task;
    const category: 'SUBJECT_MAIN' | 'SPECIAL' = task?.category ?? 'SUBJECT_MAIN';
    const subject = await resolveSubject(task);
    if (!subject || subject === '通用') {
      // 无明确学科（如综合任务）不写入学科档案，避免污染
      logger.info(`[SubjectState] 会话 ${sessionId} 学科为「${subject}」，跳过学科档案更新`);
      return;
    }

    // 1) 本次会话各知识点正确率
    const kpStats: Record<string, { correct: number; total: number }> = {};
    for (const a of session.answers) {
      const kps = a.question?.knowledgePoints ?? [];
      for (const kp of kps) {
        kpStats[kp] ||= { correct: 0, total: 0 };
        kpStats[kp].total += 1;
        if (a.isCorrect) kpStats[kp].correct += 1;
      }
    }

    // 2) 读取现有档案
    const existing = await prisma.subjectLearningState.findUnique({
      where: { studentId_subject: { studentId, subject } },
    });
    const prevMastery: Record<string, MasteryEntry> = existing?.masteryMap
      ? (existing.masteryMap as unknown as Record<string, MasteryEntry>)
      : {};
    const masteryMap: Record<string, MasteryEntry> = { ...prevMastery };
    const now = new Date();
    const nowIso = now.toISOString();

    // 3) 合并 masteryMap（专项仅更新本次涉及的、属于目标的知识点）
    const isSpecial = category === 'SPECIAL';
    for (const [kp, st] of Object.entries(kpStats)) {
      const rate = st.total > 0 ? st.correct / st.total : 0;
      const sessionScore = Math.round(rate * 100);
      const prev = prevMastery[kp];
      const prevScore = prev?.score ?? 50;
      // 指数滑动平均：新会话权重 0.6，历史 0.4（首会话用本次成绩）
      const blended = prev ? Math.round(prevScore * 0.4 + sessionScore * 0.6) : sessionScore;
      let trend: MasteryEntry['trend'] = 'flat';
      if (blended > prevScore + 2) trend = 'up';
      else if (blended < prevScore - 2) trend = 'down';
      masteryMap[kp] = {
        score: blended,
        trend,
        lastAt: nowIso,
        source: isSpecial ? 'special' : 'main',
      };
    }

    // 4) 薄弱点：按掌握度升序取前 10
    const weakPoints = Object.entries(masteryMap)
      .map(([point, v]) => ({ point, score: v.score }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 10)
      .map((x, i) => ({ point: x.point, score: x.score, priority: i + 1 }));

    // 5) 错题分布快照（该学科全部错题，含知识点分布）
    const errors = await prisma.errorQuestion.findMany({
      where: { studentId, subject },
      select: { mastery: true, question: { select: { knowledgePoints: true } } },
    });
    const byMastery: Record<string, number> = {};
    const byKnowledgePoint: Record<string, number> = {};
    for (const e of errors) {
      byMastery[e.mastery] = (byMastery[e.mastery] ?? 0) + 1;
      for (const kp of e.question?.knowledgePoints ?? []) {
        byKnowledgePoint[kp] = (byKnowledgePoint[kp] ?? 0) + 1;
      }
    }
    const errorStats = { total: errors.length, byMastery, byKnowledgePoint };

    // 6) 总任务履历（仅 SUBJECT_MAIN 追加；专项不动总体结论）
    let taskHistory: any[] = existing?.taskHistory ? (existing.taskHistory as any[]) : [];
    if (!isSpecial && task) {
      const total = session.answers.length;
      const correct = session.answers.filter((a) => a.isCorrect).length;
      const completion = total > 0 ? Math.round((correct / total) * 100) : 0;
      taskHistory = [
        ...taskHistory,
        {
          taskId: task.id,
          title: task.title,
          completedAt: nowIso,
          completion,
          score: correct,
        },
      ].slice(-20);
    }

    // 7) 能力估计 irtTheta（仅 SUBJECT_MAIN 重算；专项不覆盖总体结论）
    const overallRate =
      session.answers.length > 0
        ? session.answers.filter((a) => a.isCorrect).length / session.answers.length
        : 0;
    const sessionTheta = Math.round((overallRate * 6 - 3) * 100) / 100; // 映射到 -3..3
    let irtTheta: number | null = existing?.irtTheta ?? null;
    if (!isSpecial) {
      irtTheta = sessionTheta;
    }

    // 8) upsert
    await prisma.subjectLearningState.upsert({
      where: { studentId_subject: { studentId, subject } },
      create: {
        studentId,
        subject,
        irtTheta,
        masteryMap: masteryMap as any,
        weakPoints: weakPoints as any,
        errorStats: errorStats as any,
        taskHistory: taskHistory as any,
      },
      update: {
        irtTheta,
        masteryMap: masteryMap as any,
        weakPoints: weakPoints as any,
        errorStats: errorStats as any,
        taskHistory: taskHistory as any,
        updatedAt: now,
      },
    });

    logger.info(
      `[SubjectState] 更新学情档案成功: student=${studentId} subject=${subject} category=${category} kps=${Object.keys(kpStats).length}`
    );
  } catch (error: any) {
    logger.error(`[SubjectState] 更新学情档案失败: 会话 ${sessionId}`, error);
    // 不抛出：学情更新是报告生成的后置增强，失败不得影响主流程
  }
}

/**
 * 解析会话学科：优先用任务一级字段 subject；缺省时回退到教材节点链找 SUBJECT 节点。
 */
async function resolveSubject(task: any): Promise<string> {
  const direct = task?.subject;
  if (direct && direct !== '通用') return direct;
  try {
    const config = task?.config as any;
    const materialNodeIds: string[] = config?.materialNodeIds ?? [];
    if (materialNodeIds.length > 0) {
      const node = await prisma.materialNode.findUnique({
        where: { id: materialNodeIds[0] },
        include: { parent: { include: { parent: true } } },
      });
      if (node) {
        let current: any = node;
        while (current && current.type !== 'SUBJECT') current = current.parent;
        if (current?.name) return current.name;
      }
    }
    return '通用';
  } catch {
    return '通用';
  }
}

export const subjectLearningStateService = {
  getSubjectState,
  listSubjects,
  getSubjectSummary,
  updateFromSession,
};

export default subjectLearningStateService;
