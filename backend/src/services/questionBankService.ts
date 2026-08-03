import {
  PrismaClient,
  QuestionType,
  PaperStatus,
  Prisma,
} from '@prisma/client';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

/**
 * 题库服务：试卷(QuestionPaper)、题目(Question)、导入任务(QuestionImportJob) 的增删查改。
 * 科目直接复用 SubjectInstruction.subject（不新建科目模型）。
 */

// ============ 科目 ============

/**
 * 获取所有已配置的科目（来自管理员配置的科目教学指令）
 */
export async function listSubjects(): Promise<string[]> {
  const rows = await prisma.subjectInstruction.findMany({ select: { subject: true } });
  return rows.map((r) => r.subject);
}

/**
 * 为题库题目找到/创建一个 SUBJECT 类型的教材节点（Question.materialNodeId 必填）
 */
export async function ensureSubjectNode(subject: string): Promise<string> {
  let node = await prisma.materialNode.findFirst({
    where: { type: 'SUBJECT', name: subject },
  });
  if (!node) {
    node = await prisma.materialNode.create({
      data: {
        name: subject,
        type: 'SUBJECT',
        order: 0,
        metadata: { subject, source: 'question-bank' },
      },
    });
  }
  return node.id;
}

/**
 * 根据单元 id / 教材 id 解析出 学科/版本/年级/学期 与首选单元节点，
 * 用于题目与教材体系的关联。
 */
async function resolveTextbookContext(
  unitIds?: string[],
  textbookId?: string
): Promise<{
  subject?: string;
  version?: string;
  grade?: string;
  term?: string;
  primaryUnitId?: string;
  textbookId?: string;
}> {
  let subject: string | undefined;
  let version: string | undefined;
  let grade: string | undefined;
  let term: string | undefined;
  let primaryUnitId: string | undefined;

  if (unitIds && unitIds.length > 0) {
    const unit = await prisma.materialNode.findUnique({
      where: { id: unitIds[0] },
      include: { parent: true },
    });
    if (unit) {
      primaryUnitId = unit.id;
      const m = (unit.parent?.metadata ?? unit.metadata) as any;
      subject = m?.subject;
      version = m?.version;
      grade = m?.grade;
      term = m?.term;
      if (unit.parent?.id) textbookId = textbookId ?? unit.parent.id;
    }
  }
  if (!subject && textbookId) {
    const tb = await prisma.materialNode.findUnique({ where: { id: textbookId } });
    if (tb) {
      const m = tb.metadata as any;
      subject = m?.subject;
      version = m?.version;
      grade = m?.grade;
      term = m?.term;
    }
  }
  return { subject, version, grade, term, primaryUnitId, textbookId };
}

// ============ 序列化 ============

/**
 * 将 Question 记录的 content JSON（{stem, options}）展开为顶层字段，便于前端直接使用
 */
export function serializeQuestion<T extends { content: Prisma.JsonValue }>(q: T) {
  const content = (q.content ?? {}) as { stem?: string; options?: unknown };
  return {
    ...q,
    stem: content.stem ?? '',
    options: content.options ?? null,
  };
}

// ============ 试卷 ============

export interface PaperQuery {
  subject?: string;
  status?: PaperStatus;
  paperType?: 'UNIT' | 'MIDTERM' | 'FINAL' | 'ZHONGKAO' | 'GAOKAO';
  category?: 'EXERCISE' | 'ASSESSMENT';
  page?: number;
  limit?: number;
}

export async function listPapers(query: PaperQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.max(1, query.limit ?? 10);
  const where: Prisma.QuestionPaperWhereInput = {};
  if (query.subject) where.subject = query.subject;
  if (query.status) where.status = query.status;
  if (query.paperType) where.paperType = query.paperType;
  // 题库分类筛选：习题与试卷(EXERCISE) / 初测与水平评估(ASSESSMENT)
  if (query.category) where.category = query.category;

  const [items, total] = await Promise.all([
    prisma.questionPaper.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { items: true } } },
    }),
    prisma.questionPaper.count({ where }),
  ]);

  // 解析教材名称，便于前端卡片直接展示教材关联
  const tbIds = items.map((p) => p.textbookId).filter((id): id is string => !!id);
  let tbNameMap: Record<string, string> = {};
  if (tbIds.length > 0) {
    const tbs = await prisma.materialNode.findMany({
      where: { id: { in: tbIds } },
      select: { id: true, name: true },
    });
    tbNameMap = Object.fromEntries(tbs.map((t) => [t.id, t.name]));
  }
  const itemsWithName = items.map((p) => ({
    ...p,
    textbookName: p.textbookId ? tbNameMap[p.textbookId] ?? null : null,
  }));

  return { items: itemsWithName, total, page, limit };
}

// ============ 知识点先修依赖（edu-learning-path 方法论，P1-3） ============

/**
 * 获取某学科的知识点先修图谱：聚合该学科题库中所有题目的 prerequisites，
 * 输出 [{ point, prerequisites, questionCount }]（按题目数降序）。
 */
export async function getKnowledgePointGraph(
  subject: string
): Promise<Array<{ point: string; prerequisites: string[]; questionCount: number }>> {
  const questions = await prisma.question.findMany({
    where: { materialNode: { name: subject, type: 'SUBJECT' } },
    select: { knowledgePoints: true, prerequisites: true },
  });
  const map = new Map<string, { prereqs: Set<string>; count: number }>();
  for (const q of questions) {
    const prereqs = Array.isArray(q.prerequisites) ? (q.prerequisites as string[]) : [];
    for (const kp of q.knowledgePoints) {
      if (!map.has(kp)) map.set(kp, { prereqs: new Set(), count: 0 });
      const entry = map.get(kp)!;
      entry.count += 1;
      prereqs.forEach((p) => p && entry.prereqs.add(p));
    }
  }
  return [...map.entries()]
    .map(([point, v]) => ({ point, prerequisites: [...v.prereqs], questionCount: v.count }))
    .sort((a, b) => b.questionCount - a.questionCount);
}

/**
 * 维护知识点先修依赖：将该学科所有含 point 的题目的 prerequisites 全量替换为清单。
 * 返回更新的题目数。语义为「替换」：管理端按知识点维护的清单即该知识点题目的最终前置。
 */
export async function updateKnowledgePointPrerequisites(
  subject: string,
  point: string,
  prerequisites: string[]
): Promise<number> {
  const clean = [...new Set((prerequisites ?? []).map((p) => String(p).trim()).filter(Boolean))].filter(
    (p) => p !== point // 不允许自依赖
  );
  const questions = await prisma.question.findMany({
    where: { materialNode: { name: subject, type: 'SUBJECT' }, knowledgePoints: { has: point } },
    select: { id: true },
  });
  let updated = 0;
  for (const q of questions) {
    await prisma.question.update({
      where: { id: q.id },
      data: { prerequisites: clean as any },
    });
    updated += 1;
  }
  return updated;
}

export async function getPaper(id: string) {
  const paper = await prisma.questionPaper.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { order: 'asc' },
        include: { question: true },
      },
      importJobs: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!paper) return null;
  let textbookName: string | null = null;
  if (paper.textbookId) {
    const tb = await prisma.materialNode.findUnique({
      where: { id: paper.textbookId },
      select: { name: true },
    });
    textbookName = tb?.name ?? null;
  }
  return {
    ...paper,
    textbookName,
    items: paper.items.map((it) => ({ ...it, question: serializeQuestion(it.question) })),
  };
}

export async function createPaper(data: {
  subject: string;
  title: string;
  grade?: string;
  createdBy: string;
  sourceFile?: string;
  textbookId?: string;
  paperType?: 'UNIT' | 'MIDTERM' | 'FINAL' | 'ZHONGKAO' | 'GAOKAO';
  category?: 'EXERCISE' | 'ASSESSMENT';
  term?: string;
  version?: string;
  unitIds?: string[];
}) {
  let { grade, term, version } = data;
  if (data.textbookId) {
    const tb = await prisma.materialNode.findUnique({ where: { id: data.textbookId } });
    if (tb) {
      const m = tb.metadata as any;
      grade = grade ?? m.grade;
      term = term ?? m.term;
      version = version ?? m.version;
    }
  }
  return prisma.questionPaper.create({
    data: {
      subject: data.subject,
      title: data.title,
      grade,
      term,
      version,
      createdBy: data.createdBy,
      sourceFile: data.sourceFile,
      status: PaperStatus.DRAFT,
      paperType: (data.paperType ?? 'UNIT') as any,
      category: (data.category ?? 'EXERCISE') as any,
      unitIds: data.unitIds ?? [],
      textbookId: data.textbookId ?? null,
    },
  });
}

export async function deletePaper(id: string) {
  return prisma.questionPaper.delete({ where: { id } });
}

/**
 * 调整试卷分类：EXERCISE（习题与试卷）/ ASSESSMENT（初测与水平评估）
 */
export async function updatePaperCategory(id: string, category: 'EXERCISE' | 'ASSESSMENT') {
  return prisma.questionPaper.update({
    where: { id },
    data: { category: category as any },
  });
}

export async function publishPaper(id: string) {
  return prisma.questionPaper.update({
    where: { id },
    data: { status: PaperStatus.PUBLISHED },
  });
}

export async function addPaperItem(paperId: string, questionId: string, score = 0) {
  const max = await prisma.questionPaperItem.aggregate({
    where: { paperId },
    _max: { order: true },
  });
  const order = (max._max.order ?? 0) + 1;
  return prisma.questionPaperItem.create({
    data: { paperId, questionId, order, score },
  });
}

export async function removePaperItem(itemId: string) {
  return prisma.questionPaperItem.delete({ where: { id: itemId } });
}

// ============ 题目 ============

export interface QuestionQuery {
  subject?: string;
  type?: QuestionType;
  knowledgePoint?: string;
  paperId?: string;
  grade?: string;
  term?: string;
  unitId?: string;
  /** 来源筛选：IMPORT | MANUAL | AI_GENERATED */
  source?: string;
  /** ④ 审核状态筛选：PENDING | APPROVED | REJECTED | NONE(无需审核) */
  reviewStatus?: string;
  page?: number;
  limit?: number;
}

export async function listQuestions(query: QuestionQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.max(1, query.limit ?? 10);
  const where: Prisma.QuestionWhereInput = {};
  if (query.type) where.type = query.type;
  if (query.subject) {
    where.materialNode = { name: query.subject, type: 'SUBJECT' };
  }
  if (query.knowledgePoint) {
    where.knowledgePoints = { has: query.knowledgePoint };
  }
  if (query.paperId) {
    where.paperItems = { some: { paperId: query.paperId } };
  }
  if (query.grade) where.grade = query.grade;
  if (query.term) where.term = query.term;
  if (query.source) where.source = query.source;
  if (query.reviewStatus) {
    // NONE = 导入/手动题（reviewStatus 为空，无需审核）
    where.reviewStatus = query.reviewStatus === 'NONE' ? null : query.reviewStatus;
  }
  if (query.unitId) {
    where.OR = [{ materialNodeId: query.unitId }, { unitIds: { has: query.unitId } }];
  }

  const [items, total] = await Promise.all([
    prisma.question.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.question.count({ where }),
  ]);

  return { items: items.map(serializeQuestion), total, page, limit };
}

/**
 * ④ AI 生成题审核概览：各状态计数，供管理端题库页顶部角标使用
 */
export async function getReviewStats() {
  const [pending, approved, rejected, aiTotal] = await Promise.all([
    prisma.question.count({ where: { reviewStatus: 'PENDING' } }),
    prisma.question.count({ where: { reviewStatus: 'APPROVED' } }),
    prisma.question.count({ where: { reviewStatus: 'REJECTED' } }),
    prisma.question.count({ where: { source: 'AI_GENERATED' } }),
  ]);
  return { pending, approved, rejected, aiTotal };
}

/**
 * ④ 批量审核 AI 生成题
 * APPROVED → 转为正式题库题，可被自动抽题命中
 * REJECTED → 保留记录（供追溯 AI 质量），但不再参与任何抽题
 */
export async function reviewQuestions(input: {
  ids: string[];
  action: 'APPROVE' | 'REJECT';
  reviewerId?: string;
  note?: string;
}) {
  const ids = Array.from(new Set((input.ids || []).filter((x) => typeof x === 'string' && x)));
  if (ids.length === 0) {
    return { updated: 0, ids: [] as string[] };
  }

  const result = await prisma.question.updateMany({
    where: { id: { in: ids } },
    data: {
      reviewStatus: input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      reviewedAt: new Date(),
      reviewedBy: input.reviewerId ?? null,
      reviewNote: input.note ?? null,
    },
  });

  return { updated: result.count, ids };
}

export async function getQuestion(id: string) {
  const q = await prisma.question.findUnique({ where: { id } });
  return q ? serializeQuestion(q) : null;
}

export interface UpdateQuestionInput {
  stem?: string;
  type?: QuestionType;
  answer?: string;
  difficulty?: number;
  knowledgePoints?: string[];
  answerType?: string;
  answerConfig?: Prisma.InputJsonValue;
  analysis?: string;
  textbookId?: string;
  unitIds?: string[];
  grade?: string;
  term?: string;
  version?: string;
}

export async function updateQuestion(id: string, input: UpdateQuestionInput) {
  const data: Prisma.QuestionUpdateInput = {};
  if (input.stem !== undefined) {
    // 合并旧 content，避免丢失 options 等字段
    const existing = await prisma.question.findUnique({ where: { id }, select: { content: true } });
    const oldContent = (existing?.content ?? {}) as Record<string, unknown>;
    data.content = { ...oldContent, stem: input.stem } as Prisma.InputJsonValue;
  }
  if (input.type !== undefined) data.type = input.type;
  if (input.answer !== undefined) data.answer = input.answer;
  if (input.difficulty !== undefined) data.difficulty = input.difficulty;
  if (input.knowledgePoints !== undefined) data.knowledgePoints = input.knowledgePoints;
  if (input.answerType !== undefined) data.answerType = input.answerType;
  if (input.answerConfig !== undefined) data.answerConfig = input.answerConfig;
  if (input.textbookId !== undefined || input.unitIds !== undefined) {
    const ctx = await resolveTextbookContext(input.unitIds, input.textbookId);
    if (ctx.subject) data.materialNode = { connect: { id: await ensureSubjectNode(ctx.subject) } };
    if (input.unitIds !== undefined) data.unitIds = input.unitIds;
    if (ctx.grade !== undefined) data.grade = ctx.grade;
    if (ctx.term !== undefined) data.term = ctx.term;
    if (ctx.version !== undefined) data.version = ctx.version;
  }
  const updated = await prisma.question.update({ where: { id }, data });
  return serializeQuestion(updated);
}

/**
 * 手动创建一道题
 */
export async function createQuestion(input: {
  subject: string;
  stem: string;
  type: QuestionType;
  answer: string;
  difficulty: number;
  knowledgePoints: string[];
  answerType?: string;
  answerConfig?: Prisma.InputJsonValue;
  textbookId?: string;
  unitIds?: string[];
}) {
  let subject = input.subject;
  let materialNodeId: string;
  let grade: string | undefined;
  let term: string | undefined;
  let version: string | undefined;

  if (input.unitIds && input.unitIds.length > 0) {
    const ctx = await resolveTextbookContext(input.unitIds, input.textbookId);
    subject = ctx.subject ?? input.subject;
    grade = ctx.grade;
    term = ctx.term;
    version = ctx.version;
    materialNodeId = await ensureSubjectNode(subject);
  } else if (input.textbookId) {
    const ctx = await resolveTextbookContext(undefined, input.textbookId);
    subject = ctx.subject ?? input.subject;
    grade = ctx.grade;
    term = ctx.term;
    version = ctx.version;
    materialNodeId = await ensureSubjectNode(subject);
  } else {
    materialNodeId = await ensureSubjectNode(subject);
  }

  const q = await prisma.question.create({
    data: {
      materialNodeId,
      type: input.type,
      content: { stem: input.stem } as Prisma.InputJsonValue,
      answer: input.answer,
      difficulty: input.difficulty,
      knowledgePoints: input.knowledgePoints,
      answerType: input.answerType ?? input.type,
      answerConfig: (input.answerConfig ?? {}) as Prisma.InputJsonValue,
      grade,
      term,
      version,
      unitIds: input.unitIds ?? [],
    },
  });
  return serializeQuestion(q);
}

/**
 * 批量从归一化结果创建题目，并挂到指定试卷下
 */
export async function createQuestionsFromNormalized(
  subject: string,
  normalized: NormalizedQuestion[],
  paperId: string,
  score = 0,
  opts?: { textbookId?: string; unitIds?: string[] }
) {
  let materialNodeId = await ensureSubjectNode(subject);
  let grade: string | undefined;
  let term: string | undefined;
  let version: string | undefined;
  let unitIds = opts?.unitIds ?? [];
  if (unitIds.length > 0 || opts?.textbookId) {
    const ctx = await resolveTextbookContext(unitIds, opts?.textbookId);
    grade = ctx.grade;
    term = ctx.term;
    version = ctx.version;
    if (!unitIds.length && ctx.primaryUnitId) unitIds = [ctx.primaryUnitId];
  }
  materialNodeId = await ensureSubjectNode(subject);
  const created: { id: string; order: number }[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const n = normalized[i];
    const question = await prisma.question.create({
      data: {
        materialNodeId,
        type: n.type,
        content: { stem: n.stem, options: n.options ?? null } as Prisma.InputJsonValue,
        answer: n.answer,
        difficulty: n.difficulty,
        knowledgePoints: n.knowledgePoints,
        answerType: n.type,
        answerConfig: (n.config ?? {}) as Prisma.InputJsonValue,
        grade,
        term,
        version,
        unitIds,
      },
    });
    await prisma.questionPaperItem.create({
      data: { paperId, questionId: question.id, order: i + 1, score: n.score ?? score },
    });
    created.push({ id: question.id, order: i + 1 });
  }

  return created;
}

// 归一化题元（与导入服务共享）
export interface NormalizedQuestion {
  type: QuestionType;
  stem: string;
  options?: string[];
  answer: string;
  analysis?: string;
  difficulty: number;
  knowledgePoints: string[];
  score?: number;
  config?: Record<string, unknown>;
}

// ============ 导入任务 ============

export async function createImportJob(data: {
  subject: string;
  fileName: string;
  createdBy: string;
  status?: PaperStatus | 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
}) {
  return prisma.questionImportJob.create({
    data: {
      subject: data.subject,
      fileName: data.fileName,
      createdBy: data.createdBy,
      status: (data.status as any) ?? 'PROCESSING',
    },
  });
}

export async function getImportJob(id: string) {
  return prisma.questionImportJob.findUnique({ where: { id } });
}

export async function updateImportJob(
  id: string,
  data: {
    status?: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
    rawText?: string;
    result?: Prisma.InputJsonValue;
    error?: string;
    paperId?: string;
  }
) {
  return prisma.questionImportJob.update({ where: { id }, data });
}

// ============ 家长端组卷（EXAM_PAPER 模式支撑） ============

/**
 * 获取已发布的试卷列表（家长端选卷用）
 * @param category 题库分类：EXERCISE(组卷用习题卷，默认) / ASSESSMENT(初测与水平评估卷)
 */
export async function listPublishedPapers(subject?: string, category: 'EXERCISE' | 'ASSESSMENT' = 'EXERCISE') {
  const where: Prisma.QuestionPaperWhereInput = { status: PaperStatus.PUBLISHED, category };
  if (subject) where.subject = subject;
  const items = await prisma.questionPaper.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { items: true } } },
  });
  // 解析教材名称，便于前端卡片直接展示教材关联
  const tbIds = items.map((p) => p.textbookId).filter((id): id is string => !!id);
  let tbNameMap: Record<string, string> = {};
  if (tbIds.length > 0) {
    const tbs = await prisma.materialNode.findMany({
      where: { id: { in: tbIds } },
      select: { id: true, name: true },
    });
    tbNameMap = Object.fromEntries(tbs.map((t) => [t.id, t.name]));
  }
  return items.map((p) => ({
    ...p,
    textbookName: p.textbookId ? tbNameMap[p.textbookId] ?? null : null,
  }));
}

/**
 * 题库概况：某科目下各题型可用题目数量（家长端随机组卷配置用）
 */
export async function getBankSummary(subject: string) {
  const rows = await prisma.question.groupBy({
    by: ['type'],
    where: { materialNode: { name: subject, type: 'SUBJECT' } },
    _count: { _all: true },
  });
  const byType: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byType[r.type] = r._count._all;
    total += r._count._all;
  }
  return { subject, total, byType };
}

export interface RandomPickInput {
  subject: string;
  count: number;
  types?: QuestionType[];
  difficultyMin?: number;
  difficultyMax?: number;
  knowledgePoints?: string[];
  grade?: string;
  term?: string;
  unitIds?: string[];
  /**
   * 组卷蓝图（借鉴 edu-paper-builder 双向细目表方法论）：
   * 按 难度分布 + 知识点覆盖 + 题型配额 分桶抽题，替代纯随机洗牌。
   */
  blueprint?: ExamBlueprint;
}

/** 组卷蓝图：难度分布（易:中:难 百分比，默认 40:40:20）+ 目标知识点 + 题型配额 + 预估时长 */
export interface ExamBlueprint {
  /** 易(1-2) / 中(3) / 难(4-5) 占比（百分比，和不必为 100，自动归一化） */
  difficultyDist?: { easy?: number; medium?: number; hard?: number };
  /** 目标知识点覆盖（多选；缺省则最大化题库自然覆盖） */
  knowledgePoints?: string[];
  /** 题型配额：{ "CHOICE": 8, "FILL": 4, "ESSAY": 8 }（键为 QuestionType 枚举名） */
  typeDist?: Record<string, number>;
  /** 预估时长（分钟，仅展示） */
  estimatedMinutes?: number;
}

/** 按难度分桶：1-2 易 / 3 中 / 4-5 难 */
function difficultyBand(d: number): 'easy' | 'medium' | 'hard' {
  if (d <= 2) return 'easy';
  if (d === 3) return 'medium';
  return 'hard';
}

/** Fisher-Yates 洗牌 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 按蓝图配额抽题：难度分桶 → 知识点轮转（已选最少者优先，尽量覆盖目标知识点）→ 题型约束。
 * 数量不足时自动放宽（同桶内任意题 → 全量兜底），并打 warn 日志便于定位题库标注缺失。
 */
function pickByBlueprint(
  cands: { id: string; difficulty: number; type: QuestionType; knowledgePoints: string[] }[],
  input: RandomPickInput
): string[] {
  const { count, blueprint } = input;
  if (!blueprint) return [];
  const dist = blueprint.difficultyDist ?? { easy: 40, medium: 40, hard: 20 };
  const total = (dist.easy ?? 0) + (dist.medium ?? 0) + (dist.hard ?? 0);
  const safeTotal = total > 0 ? total : 100;
  const tEasy = Math.round((count * (dist.easy ?? 0)) / safeTotal);
  const tMed = Math.round((count * (dist.medium ?? 0)) / safeTotal);
  const clamp = (t: number) => Math.max(0, Math.min(count, t));
  const targets = {
    easy: clamp(tEasy),
    medium: clamp(tMed),
    hard: clamp(count - tEasy - tMed),
  };

  const requestedKPs = blueprint.knowledgePoints?.length
    ? new Set(blueprint.knowledgePoints)
    : null;
  const typeSet = blueprint.typeDist
    ? new Set(Object.keys(blueprint.typeDist).map((t) => t.toUpperCase()))
    : null;

  const pools: Record<'easy' | 'medium' | 'hard', typeof cands> = { easy: [], medium: [], hard: [] };
  for (const c of cands) pools[difficultyBand(c.difficulty)].push(c);

  const pickedIds = new Set<string>();
  const picked: string[] = [];
  const kpPick = new Map<string, number>();
  const firstKp = (kps: string[]) => (kps && kps.length > 0 ? kps[0] : '');

  for (const band of ['easy', 'medium', 'hard'] as const) {
    let pool = pools[band];
    if (typeSet) {
      const typed = pool.filter((c) => typeSet.has(String(c.type).toUpperCase()));
      if (typed.length > 0) pool = typed; // 有指定题型的题才收窄，否则保持全量兜底
    }
    if (pool.length === 0) continue;
    let need = targets[band];
    let guard = 0;
    while (need > 0 && guard++ < 500) {
      const usable = pool.filter((c) => !pickedIds.has(c.id));
      if (usable.length === 0) break;
      // 轮转：优先取「已选次数最少的目标知识点」的随机一题，最大化覆盖
      let best: (typeof usable)[number] | null = null;
      let bestCount = Infinity;
      for (const c of usable) {
        const kp = firstKp(c.knowledgePoints);
        if (requestedKPs && !requestedKPs.has(kp)) continue;
        const cnt = kpPick.get(kp) ?? 0;
        if (cnt < bestCount) {
          bestCount = cnt;
          best = c;
        }
      }
      if (!best) best = shuffle(usable)[0]; // 目标知识点取尽 → 同桶内任意题兜底
      pickedIds.add(best.id);
      picked.push(best.id);
      const kp = firstKp(best.knowledgePoints);
      if (kp) kpPick.set(kp, (kpPick.get(kp) ?? 0) + 1);
      need--;
    }
  }

  // 全量兜底：配额未满时从剩余候选中补齐（打 warn 便于定位题库缺口）
  if (picked.length < count) {
    const rest = shuffle(cands.filter((c) => !pickedIds.has(c.id)));
    for (const c of rest) {
      if (picked.length >= count) break;
      pickedIds.add(c.id);
      picked.push(c.id);
    }
    if (rest.length > 0) {
      logger.warn(
        `[组卷蓝图] 配额未满，已全量兜底补齐: subject=${input.subject} count=${count} picked=${picked.length} (请求 ${
          requestedKPs?.size ?? 0
        } 个知识点)`
      );
    }
  }

  // 目标知识点覆盖率检查（<80% 打 warn，便于定位题库标注缺失）
  if (requestedKPs && requestedKPs.size > 0) {
    const covered = new Set<string>();
    for (const id of picked) {
      const c = cands.find((x) => x.id === id);
      if (c?.knowledgePoints) {
        for (const kp of c.knowledgePoints) {
          if (requestedKPs.has(kp)) covered.add(kp);
        }
      }
    }
    const coverage = covered.size / requestedKPs.size;
    if (coverage < 0.8) {
      logger.warn(
        `[组卷蓝图] 目标知识点覆盖率 ${Math.round(coverage * 100)}% (<80%): 覆盖 ${covered.size}/${requestedKPs.size}，题库标注可能不足`
      );
    }
  }

  return picked.slice(0, count);
}

/**
 * 按条件随机抽题（随机组卷）。返回题目 ID 列表（随机顺序）。
 * 支持按 教材/年级/学期/单元 过滤，便于"按某教材某单元抽题"的任务调用。
 * 若传入 blueprint，则按 难度分布+知识点覆盖+题型配额 分桶抽题（双向细目表）。
 */
export async function pickRandomQuestions(input: RandomPickInput): Promise<string[]> {
  const where: Prisma.QuestionWhereInput = {
    materialNode: { name: input.subject, type: 'SUBJECT' },
  };
  if (input.types && input.types.length > 0) where.type = { in: input.types };
  if (input.difficultyMin != null || input.difficultyMax != null) {
    where.difficulty = {
      gte: input.difficultyMin ?? 1,
      lte: input.difficultyMax ?? 5,
    };
  }
  // 知识点过滤：显式 knowledgePoints 优先，其次 blueprint.knowledgePoints
  const kpFilter = input.knowledgePoints?.length
    ? input.knowledgePoints
    : input.blueprint?.knowledgePoints?.length
      ? input.blueprint.knowledgePoints
      : undefined;
  if (kpFilter && kpFilter.length > 0) {
    where.knowledgePoints = { hasSome: kpFilter };
  }
  if (input.grade) where.grade = input.grade;
  if (input.term) where.term = input.term;
  if (input.unitIds && input.unitIds.length > 0) {
    where.OR = [{ materialNodeId: { in: input.unitIds } }, { unitIds: { hasSome: input.unitIds } }];
  }

  const candidates = await prisma.question.findMany({
    where,
    select: { id: true, difficulty: true, type: true, knowledgePoints: true },
  });

  // 蓝图配额抽题（双向细目表）
  if (input.blueprint) {
    const ids = pickByBlueprint(candidates, input);
    if (ids.length > 0) return ids;
    logger.warn(`[组卷蓝图] 配额抽题返回空，回退纯随机: subject=${input.subject}`);
  }

  // 纯随机（原有逻辑）：Fisher-Yates 洗牌后取前 count 个
  const ids = candidates.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, input.count);
}
