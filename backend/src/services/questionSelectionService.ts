/**
 * 题库筛题服务（P2 题库化初测核心）
 *
 * 1. pickByDistribution — 按 单元+难度分布+题量 从题库抽题（支持缺口报告）
 * 2. aiProposeCriteria  — AI 读取学员信息产出筛题条件（AI 只出条件，不出题目）
 * 3. supplementWithAI   — 题库不足时 AI 生成补齐并入库（source=AI_GENERATED，受平台开关控制）
 * 4. buildInitialTest   — 发布任务时的统一入口：手动卷 / 手动条件 / AI 自动 三种来源
 */
import { PrismaClient, Prisma, QuestionType } from '@prisma/client';
import { aiServiceManager } from './aiServiceManager';
import { createQuestion, serializeQuestion } from './questionBankService';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

// ---------- 类型 ----------

/** 难度分布：{ "1": 2, "3": 5, "4": 3 } 等级→题量 */
export type DifficultyDist = Record<string, number>;

export interface PickCriteria {
  subject: string;
  grade?: string;
  term?: string;
  version?: string;
  unitIds?: string[];
  knowledgePoints?: string[];
  count: number;
  /** 可选：难度分布；不给则不限难度 */
  difficultyDist?: DifficultyDist;
}

export interface PickResult {
  questionIds: string[];
  requested: number;
  picked: number;
  /** 各难度缺口 { "4": 2 } 表示 4 级缺 2 题 */
  shortage: Record<string, number>;
  supplemented: number; // AI 补齐题数
}

// ---------- 1) 按条件+难度分布抽题 ----------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function baseWhere(c: PickCriteria): Prisma.QuestionWhereInput {
  const where: Prisma.QuestionWhereInput = {
    materialNode: { name: c.subject, type: 'SUBJECT' },
  };
  if (c.grade) where.grade = c.grade;
  if (c.term) where.term = c.term;
  if (c.version) where.version = c.version;
  if (c.unitIds && c.unitIds.length > 0) {
    where.OR = [{ materialNodeId: { in: c.unitIds } }, { unitIds: { hasSome: c.unitIds } }];
  }
  if (c.knowledgePoints && c.knowledgePoints.length > 0) {
    where.knowledgePoints = { hasSome: c.knowledgePoints };
  }
  return where;
}

export async function pickByDistribution(criteria: PickCriteria): Promise<PickResult> {
  const shortage: Record<string, number> = {};
  const pickedIds: string[] = [];

  if (criteria.difficultyDist && Object.keys(criteria.difficultyDist).length > 0) {
    // 按难度分层抽取
    for (const [levelStr, want] of Object.entries(criteria.difficultyDist)) {
      const level = Number(levelStr);
      if (!Number.isInteger(level) || level < 1 || level > 5 || want <= 0) continue;
      const candidates = await prisma.question.findMany({
        where: { ...baseWhere(criteria), difficulty: level, id: { notIn: pickedIds } },
        select: { id: true },
      });
      const got = shuffle(candidates.map((x) => x.id)).slice(0, want);
      pickedIds.push(...got);
      if (got.length < want) shortage[levelStr] = want - got.length;
    }
    // 缺口先尝试用相邻难度（±1）回填，仍缺则记录
    for (const [levelStr, missing] of Object.entries({ ...shortage })) {
      const level = Number(levelStr);
      let remain = missing;
      for (const alt of [level - 1, level + 1, level - 2, level + 2]) {
        if (remain <= 0 || alt < 1 || alt > 5) continue;
        const candidates = await prisma.question.findMany({
          where: { ...baseWhere(criteria), difficulty: alt, id: { notIn: pickedIds } },
          select: { id: true },
        });
        const got = shuffle(candidates.map((x) => x.id)).slice(0, remain);
        pickedIds.push(...got);
        remain -= got.length;
      }
      if (remain > 0) shortage[levelStr] = remain;
      else delete shortage[levelStr];
    }
  } else {
    // 不限难度
    const candidates = await prisma.question.findMany({
      where: baseWhere(criteria),
      select: { id: true },
    });
    const got = shuffle(candidates.map((x) => x.id)).slice(0, criteria.count);
    pickedIds.push(...got);
    if (got.length < criteria.count) shortage['any'] = criteria.count - got.length;
  }

  return {
    questionIds: shuffle(pickedIds).slice(0, criteria.count),
    requested: criteria.count,
    picked: Math.min(pickedIds.length, criteria.count),
    shortage,
    supplemented: 0,
  };
}

// ---------- 2) AI 产出筛题条件 ----------

export interface ProposeInput {
  studentId: string;
  subject: string;
  count?: number; // 期望题量，默认 10
  unitIds?: string[]; // 家长限定范围（可选）；AI 在该范围内分配
}

export interface ProposedCriteria extends PickCriteria {
  reason: string; // AI 给出的选题理由（展示给家长）
}

export async function aiProposeCriteria(input: ProposeInput): Promise<ProposedCriteria> {
  const count = input.count ?? 10;

  // 学员画像
  const profile = await prisma.studentProfile.findUnique({ where: { userId: input.studentId } });
  const state = await prisma.subjectLearningState.findUnique({
    where: { studentId_subject: { studentId: input.studentId, subject: input.subject } },
  });
  const recentErrors = await prisma.errorQuestion.findMany({
    where: { studentId: input.studentId, subject: input.subject },
    orderBy: { collectedAt: 'desc' },
    take: 30,
    include: { question: { select: { knowledgePoints: true, difficulty: true, unitIds: true } } },
  });

  // 可用单元（含各难度存量），让 AI 在真实存量内做决策
  const unitWhere: Prisma.MaterialNodeWhereInput = { type: 'UNIT' };
  if (input.unitIds && input.unitIds.length > 0) unitWhere.id = { in: input.unitIds };
  const units = await prisma.materialNode.findMany({ where: unitWhere, select: { id: true, name: true, metadata: true } });

  const unitStock: Array<{ id: string; name: string; byDifficulty: Record<string, number> }> = [];
  for (const u of units) {
    const rows = await prisma.question.groupBy({
      by: ['difficulty'],
      where: {
        materialNode: { name: input.subject, type: 'SUBJECT' },
        OR: [{ materialNodeId: u.id }, { unitIds: { has: u.id } }],
      },
      _count: true,
    });
    if (rows.length === 0) continue;
    const byDifficulty: Record<string, number> = {};
    for (const r of rows) byDifficulty[String(r.difficulty)] = r._count;
    unitStock.push({ id: u.id, name: u.name, byDifficulty });
  }

  const errorKpCount: Record<string, number> = {};
  for (const e of recentErrors) {
    for (const kp of e.question?.knowledgePoints ?? []) {
      errorKpCount[kp] = (errorKpCount[kp] ?? 0) + 1;
    }
  }

  const prompt = `你是一名${input.subject}学科的测评设计师。请根据学员情况，从下面的题库存量中设计一组"初始测试"筛题条件。

## 学员信息
- 年级：${profile?.grade ?? '未知'}
- 教材版本：${profile?.materialVersion ?? '未知'}
- 学习基础：${profile?.learningFoundation ?? '未知'}
- 学科薄弱点（学情档案）：${JSON.stringify(state?.weakPoints ?? [])}
- 近期错题知识点分布：${JSON.stringify(errorKpCount)}

## 题库存量（单元 → 各难度可用题数，难度1-5）
${JSON.stringify(unitStock.map((u) => ({ unitId: u.id, name: u.name, stock: u.byDifficulty })), null, 0)}

## 要求
1. 总题量 ${count} 题；单元从上面存量列表中选（unitIds 用列表中的 unitId）。
2. 难度分布结构合理（参考 7:2:1 或 5:3:2，覆盖学员薄弱点但不过度打击信心）。
3. **分配的每个难度题量不得超过所选单元的总存量**。
4. 只输出 JSON，格式：
{"unitIds":["..."],"difficultyDist":{"2":3,"3":5,"4":2},"reason":"一句话说明选题思路"}`;

  const response = await aiServiceManager.callAI(prompt, { temperature: 0.3, maxTokens: 600, timeout: 20000 });
  const parsed = extractJson(response);
  if (!parsed || !Array.isArray(parsed.unitIds) || typeof parsed.difficultyDist !== 'object') {
    throw new Error('AI 筛题条件解析失败，请重试或改用手动模式');
  }

  // 归一化：难度分布总量对齐 count
  const dist: DifficultyDist = {};
  let sum = 0;
  for (const [k, v] of Object.entries(parsed.difficultyDist as Record<string, unknown>)) {
    const n = Math.max(0, Math.floor(Number(v)));
    const lv = Number(k);
    if (n > 0 && Number.isInteger(lv) && lv >= 1 && lv <= 5) { dist[k] = n; sum += n; }
  }
  if (sum === 0) throw new Error('AI 筛题条件无有效难度分布');
  if (sum !== count) {
    // 等比缩放并修正余数
    const keys = Object.keys(dist);
    let acc = 0;
    for (const k of keys) { dist[k] = Math.max(1, Math.round((dist[k] / sum) * count)); acc += dist[k]; }
    let diff = count - acc;
    for (let i = 0; diff !== 0 && i < keys.length * 2; i++) {
      const k = keys[i % keys.length];
      if (diff > 0) { dist[k] += 1; diff--; }
      else if (dist[k] > 1) { dist[k] -= 1; diff++; }
    }
  }

  const validUnitIds = new Set(unitStock.map((u) => u.id));
  const unitIds = (parsed.unitIds as string[]).filter((id) => validUnitIds.has(id));
  if (unitIds.length === 0) throw new Error('AI 选择的单元在题库中无存量');

  return {
    subject: input.subject,
    unitIds,
    count,
    difficultyDist: dist,
    reason: String(parsed.reason ?? ''),
  };
}

// ---------- 3) AI 补题入库 ----------

async function isSupplementEnabled(): Promise<boolean> {
  const setting = await prisma.platformSetting.findUnique({ where: { key: 'aiSupplementQuestions' } });
  const v = setting?.value as { enabled?: boolean } | null;
  return v?.enabled === true;
}

const TYPE_MAP: Record<string, QuestionType> = {
  single_choice: 'CHOICE',
  choice: 'CHOICE',
  fill_blank: 'FILL',
  fill: 'FILL',
  short_answer: 'ESSAY',
  essay: 'ESSAY',
  judge: 'JUDGE',
};

/**
 * 题库缺口 AI 补齐：生成的题目入库（source=AI_GENERATED），返回新题 id 列表
 */
export async function supplementWithAI(
  criteria: PickCriteria,
  shortage: Record<string, number>
): Promise<string[]> {
  if (!(await isSupplementEnabled())) return [];

  const unitNames =
    criteria.unitIds && criteria.unitIds.length > 0
      ? (
          await prisma.materialNode.findMany({ where: { id: { in: criteria.unitIds } }, select: { name: true } })
        ).map((u) => u.name)
      : [];

  const created: string[] = [];
  for (const [levelStr, missing] of Object.entries(shortage)) {
    const level = levelStr === 'any' ? 3 : Number(levelStr);
    const n = Math.min(missing, 10); // 单次上限保护
    if (n <= 0) continue;

    const prompt = `你是一名${criteria.subject}命题老师。请命制 ${n} 道${criteria.grade ?? ''}${criteria.subject}题目。

要求：
- 范围：${unitNames.length > 0 ? unitNames.join('、') : '本学科常规范围'}，严禁超纲。
- 难度：${level} 级（1=基础再现一步作答，2=简单变形，3=多知识点2-3步，4=跨章节综合含隐含条件，5=压轴级）。
- 题型：单选题（4 个选项）。
- 只输出 JSON 数组，每题格式：
{"stem":"题干","options":["A. ...","B. ...","C. ...","D. ..."],"correctAnswer":"A","explanation":"解析","knowledgePoint":"知识点"}`;

    try {
      const response = await aiServiceManager.callAI(prompt, { temperature: 0.7, maxTokens: 2500, timeout: 60000 });
      const arr = extractJson(response);
      if (!Array.isArray(arr)) continue;
      for (const item of arr.slice(0, n)) {
        if (!item?.stem || !item?.correctAnswer) continue;
        const q = await createQuestion({
          subject: criteria.subject,
          stem: String(item.stem),
          type: TYPE_MAP['single_choice'],
          answer: String(item.correctAnswer),
          difficulty: level,
          knowledgePoints: item.knowledgePoint ? [String(item.knowledgePoint)] : [],
          answerType: 'single_choice',
          answerConfig: {
            options: Array.isArray(item.options) ? item.options : [],
            correctAnswer: String(item.correctAnswer),
            explanation: String(item.explanation ?? ''),
          },
          unitIds: criteria.unitIds,
        });
        // 标记 AI 生成来源
        await prisma.question.update({ where: { id: q.id }, data: { source: 'AI_GENERATED' } });
        created.push(q.id);
      }
    } catch (err) {
      logger.error(`AI 补题失败（难度${levelStr}）:`, err);
    }
  }
  if (created.length > 0) logger.info(`AI 补题入库 ${created.length} 道（source=AI_GENERATED）`);
  return created;
}

// ---------- 4) 发布任务初测统一入口 ----------

export interface InitialTestSource {
  source: 'PAPER' | 'CRITERIA' | 'AI';
  paperId?: string;          // PAPER：直接选一份已发布试卷
  criteria?: PickCriteria;   // CRITERIA：家长手动条件
  ai?: ProposeInput;         // AI：自动产出条件
}

export interface InitialTestResult {
  questionIds: string[];
  meta: {
    source: string;
    paperId?: string;
    criteria?: PickCriteria;
    reason?: string;
    shortage: Record<string, number>;
    supplemented: number;
  };
}

export async function buildInitialTest(
  input: InitialTestSource,
  options: { supplement?: boolean } = {}
): Promise<InitialTestResult> {
  const allowSupplement = options.supplement !== false;
  if (input.source === 'PAPER') {
    if (!input.paperId) throw new Error('PAPER 模式需要 paperId');
    const items = await prisma.questionPaperItem.findMany({
      where: { paperId: input.paperId },
      orderBy: { order: 'asc' },
      select: { questionId: true },
    });
    if (items.length === 0) throw new Error('所选试卷没有题目');
    return {
      questionIds: items.map((i) => i.questionId),
      meta: { source: 'PAPER', paperId: input.paperId, shortage: {}, supplemented: 0 },
    };
  }

  let criteria: PickCriteria;
  let reason: string | undefined;
  if (input.source === 'AI') {
    if (!input.ai) throw new Error('AI 模式需要 ai 参数');
    const proposed = await aiProposeCriteria(input.ai);
    criteria = proposed;
    reason = proposed.reason;
  } else {
    if (!input.criteria) throw new Error('CRITERIA 模式需要 criteria');
    criteria = input.criteria;
  }

  let result = await pickByDistribution(criteria);

  // 缺口 → AI 补题（受平台开关控制；预览模式不补题）
  if (allowSupplement && Object.keys(result.shortage).length > 0) {
    const supplemented = await supplementWithAI(criteria, result.shortage);
    if (supplemented.length > 0) {
      result = await pickByDistribution(criteria); // 重抽（包含新题）
      result.supplemented = supplemented.length;
    }
  }

  if (result.questionIds.length === 0) {
    throw new Error('题库中没有符合条件的题目，请调整条件或导入更多试卷');
  }

  return {
    questionIds: result.questionIds,
    meta: {
      source: input.source,
      criteria,
      reason,
      shortage: result.shortage,
      supplemented: result.supplemented,
    },
  };
}

/** 预览题目（发布前给家长确认） */
export async function previewQuestions(questionIds: string[]) {
  const found = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    include: { materialNode: { select: { name: true } } },
  });
  const byId = new Map(found.map((q) => [q.id, q]));
  return questionIds
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => {
      const s = serializeQuestion(q);
      return {
        id: s.id,
        stem: (s.content as { stem?: string })?.stem ?? '',
        type: s.type,
        difficulty: s.difficulty,
        knowledgePoints: s.knowledgePoints,
        subject: q.materialNode?.name,
      };
    });
}

// ---------- 工具 ----------

function extractJson(text: string): any {
  // 剥掉 markdown 代码块
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // 尝试截取第一个 { 或 [ 到最后一个 } 或 ]
    const start = Math.min(
      ...['{', '['].map((c) => (cleaned.indexOf(c) === -1 ? Infinity : cleaned.indexOf(c)))
    );
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start === Infinity || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
