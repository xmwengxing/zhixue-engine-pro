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
  // ===== 薄弱点诊断结构化（借鉴 edu-class-diagnosis 方法论，全部可选向后兼容）=====
  gap_level?: number; // 1-5：失分率映射 <15%→1 / 15-35%→2 / 35-55%→3 / 55-75%→4 / >75%→5
  priority_score?: number; // gap_level × 核心度(1.0) + blocks_followup×1
  blocks_followup?: boolean; // 是否阻塞后续知识点（先修依赖，P1 接入依赖图后计算）
  urgency?: '高' | '中' | '低'; // ≥6 高 / 4-6 中 / <4 低
  confidence?: '高' | '中' | '低'; // 按累计作答样本量判定
  evidence?: string; // 判定依据描述
  suggestions?: string[]; // 补弱建议（规则生成，P1 可叠加 AI）
  attemptCount?: number; // 累计作答次数
  errorCount?: number; // 累计答错次数
}

/** 薄弱点诊断工件（WeakPoint）——供出题排序、学情摘要、学期归档复用 */
export interface WeakPoint {
  point: string;
  score: number;
  gap_level: number;
  priority_score: number;
  blocks_followup: boolean;
  urgency: '高' | '中' | '低';
  confidence: '高' | '中' | '低';
  evidence?: string;
  suggestions?: string[];
}

export interface SubjectState {
  studentId: string;
  subject: string;
  irtTheta: number | null;
  masteryMap: Record<string, MasteryEntry>;
  weakPoints: WeakPoint[];
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

// ===================== 薄弱点诊断工具（edu-class-diagnosis 方法论） =====================

/** gap_level：由失分率映射（课标通用参考阈值，见技能说明） */
export function calcGapLevel(errorRate: number): number {
  if (errorRate < 0.15) return 1;
  if (errorRate < 0.35) return 2;
  if (errorRate < 0.55) return 3;
  if (errorRate < 0.75) return 4;
  return 5;
}

/** urgency：priority_score ≥6 高 / 4-6 中 / <4 低 */
export function calcUrgency(priorityScore: number): '高' | '中' | '低' {
  if (priorityScore >= 6) return '高';
  if (priorityScore >= 4) return '中';
  return '低';
}

/** 置信度：按累计作答样本量（≥5 高 / 2-4 中 / <2 低） */
export function calcConfidence(attemptCount: number): '高' | '中' | '低' {
  if (attemptCount >= 5) return '高';
  if (attemptCount >= 2) return '中';
  return '低';
}

/** 补弱建议（规则生成，稳定零成本；P1 可叠加 AI 个性化建议） */
export function calcSuggestions(gapLevel: number): string[] {
  switch (gapLevel) {
    case 1:
      return ['课堂 5 分钟随堂巩固'];
    case 2:
      return ['针对性练习 1 组（基础巩固）'];
    case 3:
      return ['专题讲练 1-2 课时', '基础巩固 + 变式题各 3-5 题'];
    case 4:
      return ['重新教学（专题补讲 2 课时）', '分层练习：基础回炉 + 综合变式'];
    default:
      return ['回炉重讲 + 分层补救', '先排查是否漏讲/未覆盖该考点'];
  }
}

/**
 * 由 masteryMap 条目构建结构化 WeakPoint。
 * @param blocksFollowup 先修依赖阻塞（P1 接入依赖图后传入；缺省 false）
 */
export function buildWeakPoint(
  point: string,
  entry: MasteryEntry,
  blocksFollowup = false
): WeakPoint {
  const errorRate =
    entry.attemptCount && entry.attemptCount > 0
      ? (entry.errorCount ?? 0) / entry.attemptCount
      : (100 - entry.score) / 100;
  const gap = entry.gap_level ?? calcGapLevel(errorRate);
  const priority = entry.priority_score ?? gap * 1.0 + (blocksFollowup ? 1 : 0);
  const attempts = entry.attemptCount ?? 0;
  return {
    point,
    score: entry.score,
    gap_level: gap,
    priority_score: priority,
    blocks_followup: blocksFollowup || entry.blocks_followup === true,
    urgency: entry.urgency ?? calcUrgency(priority),
    confidence: entry.confidence ?? calcConfidence(attempts),
    evidence:
      entry.evidence ||
      (attempts > 0
        ? `累计作答 ${attempts} 次，答错 ${entry.errorCount ?? 0} 次（失分率 ${Math.round(errorRate * 100)}%）`
        : `当前掌握度 ${entry.score} 分`),
    suggestions: entry.suggestions ?? calcSuggestions(gap),
  };
}

/**
 * 薄弱点优先级排序（PriorityList）：priority_score 降序，同分按掌握度升序。
 * 供 AI 出题选题、学情摘要、学期归档统一复用。
 */
export function getWeakPointPriorityList(
  state: Pick<SubjectState, 'masteryMap'>,
  limit = 10
): WeakPoint[] {
  const list = Object.entries(state.masteryMap)
    .map(([point, entry]) => buildWeakPoint(point, entry))
    .sort(
      (a, b) =>
        b.priority_score - a.priority_score || a.score - b.score || a.point.localeCompare(b.point)
    )
    .slice(0, limit);
  return list;
}

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
 * 薄弱点按 priority_score 排序（结构化：gap_level/urgency/建议），仍保留 point/score 兼容字段。
 */
export async function getSubjectSummary(studentId: string, subject: string): Promise<{
  subject: string;
  irtTheta: number | null;
  weakPointsTop5: WeakPoint[];
  totalKnowledgePoints: number;
  masteredCount: number;
  errorTotal: number;
  recentTrend: { point: string; trend: string; score: number }[];
}> {
  const state = await getSubjectState(studentId, subject);
  const entries = Object.entries(state.masteryMap) as [string, MasteryEntry][];
  // 结构化优先级排序（降级兜底：老数据无 gap 字段时按掌握度升序）
  const weak =
    state.weakPoints.length > 0
      ? state.weakPoints.slice(0, 5)
      : getWeakPointPriorityList(state, 5).map((w) => ({
          point: w.point,
          score: w.score,
          gap_level: w.gap_level,
          priority_score: w.priority_score,
          blocks_followup: w.blocks_followup,
          urgency: w.urgency,
          confidence: w.confidence,
          evidence: w.evidence,
          suggestions: w.suggestions,
        }));
  const mastered = entries.filter(([, v]) => v.score >= 80).length;
  const recent = [...entries]
    .sort((a, b) => (b[1].lastAt || '').localeCompare(a[1].lastAt || ''))
    .slice(0, 5)
    .map(([point, v]) => ({ point, trend: v.trend, score: v.score }));
  return {
    subject,
    irtTheta: state.irtTheta,
    weakPointsTop5: weak,
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

    // 1.5) 知识点先修依赖图（C2）：该学科题目的 prerequisites → { 知识点: [前置] }
    //      用于 blocks_followup 判定（任一前置掌握度 <60 → 阻塞后续）
    const prereqGraph = new Map<string, string[]>();
    try {
      const graphRows = await prisma.question.findMany({
        where: { materialNode: { name: subject, type: 'SUBJECT' } },
        select: { knowledgePoints: true, prerequisites: true },
      });
      for (const r of graphRows) {
        const prereqs = Array.isArray(r.prerequisites) ? (r.prerequisites as string[]) : [];
        if (prereqs.length === 0) continue;
        for (const kp of r.knowledgePoints) {
          const acc = prereqGraph.get(kp) ?? [];
          prereqs.forEach((p) => p && !acc.includes(p) && acc.push(p));
          prereqGraph.set(kp, acc);
        }
      }
    } catch {
      /* 图谱读取失败不影响学情更新 */
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
    //    同时维护薄弱点诊断字段：累计作答/答错 → 失分率 → gap_level → priority_score/urgency/建议
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
      // 累计作答/答错样本（跨会话累计，供失分率与置信度判定）
      const attemptCount = (prev?.attemptCount ?? 0) + st.total;
      const errorCount = (prev?.errorCount ?? 0) + (st.total - st.correct);
      const errorRate = attemptCount > 0 ? errorCount / attemptCount : 0;
      const gapLevel = calcGapLevel(errorRate);
      // 先修依赖阻塞判定（C2）：任一前置知识点已进入档案且掌握度 <60 → 阻塞后续
      let blocksFollowup = prev?.blocks_followup === true;
      if (!blocksFollowup) {
        const prereqs = prereqGraph.get(kp) ?? [];
        blocksFollowup = prereqs.some((p) => {
          const ps = prevMastery[p]?.score;
          return typeof ps === 'number' && ps < 60; // 前置已学但未掌握 → 阻塞
        });
      }
      const priorityScore = gapLevel * 1.0 + (blocksFollowup ? 1 : 0);
      masteryMap[kp] = {
        score: blended,
        trend,
        lastAt: nowIso,
        source: isSpecial ? 'special' : 'main',
        attemptCount,
        errorCount,
        gap_level: gapLevel,
        priority_score: priorityScore,
        blocks_followup: blocksFollowup,
        urgency: calcUrgency(priorityScore),
        confidence: calcConfidence(attemptCount),
        evidence: `累计作答 ${attemptCount} 次，答错 ${errorCount} 次（失分率 ${Math.round(errorRate * 100)}%）`,
        suggestions: calcSuggestions(gapLevel),
      };
    }

    // 4) 薄弱点：按 priority_score 降序（高优先级在前），同分按掌握度升序，取前 10
    const weakPoints: WeakPoint[] = getWeakPointPriorityList({ masteryMap }, 10);

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
  getWeakPointPriorityList,
  calcGapLevel,
  calcUrgency,
  calcSuggestions,
  buildWeakPoint,
};

export default subjectLearningStateService;
