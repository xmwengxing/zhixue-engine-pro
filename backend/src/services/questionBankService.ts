import {
  PrismaClient,
  QuestionType,
  PaperStatus,
  Prisma,
} from '@prisma/client';

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
      unitIds: data.unitIds ?? [],
      textbookId: data.textbookId ?? null,
    },
  });
}

export async function deletePaper(id: string) {
  return prisma.questionPaper.delete({ where: { id } });
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
 */
export async function listPublishedPapers(subject?: string) {
  const where: Prisma.QuestionPaperWhereInput = { status: PaperStatus.PUBLISHED };
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
}

/**
 * 按条件随机抽题（随机组卷）。返回题目 ID 列表（随机顺序）。
 * 支持按 教材/年级/学期/单元 过滤，便于"按某教材某单元抽题"的任务调用。
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
  if (input.knowledgePoints && input.knowledgePoints.length > 0) {
    where.knowledgePoints = { hasSome: input.knowledgePoints };
  }
  if (input.grade) where.grade = input.grade;
  if (input.term) where.term = input.term;
  if (input.unitIds && input.unitIds.length > 0) {
    where.OR = [{ materialNodeId: { in: input.unitIds } }, { unitIds: { hasSome: input.unitIds } }];
  }

  const candidates = await prisma.question.findMany({ where, select: { id: true } });
  // Fisher-Yates 洗牌后取前 count 个
  const ids = candidates.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, input.count);
}
