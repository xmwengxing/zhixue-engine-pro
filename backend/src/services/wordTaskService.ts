import { PrismaClient } from '@prisma/client';
import { aiServiceManager } from './aiServiceManager';
import { logger } from '../middlewares/logger';

const prisma = new PrismaClient();

/** AI 词汇老师指令名（SubjectInstruction.subject） */
export const WORD_TEACHER_SUBJECT = '词汇老师';

/** AI 词汇老师角色 prompt：只根据给定单词出短语填空题，不做任何其他行为 */
export const WORD_TEACHER_SYSTEM_PROMPT = `你是一位严谨的英语词汇老师。你的唯一职责：根据给定的一组单词，出「短语/搭配填空题」，帮助学生把这些单词用进真实语境，加深记忆。规则：
1. 只输出一个 JSON 数组，格式：
[{"sentence":"My father bought me a ____ (bike) for my birthday.","answer":"bike","hint":"目标单词：bike（首字母 b）"}, ...]
2. 每道题的 sentence 必须是一个完整的英文句子，空位用 ____ 表示，括号里给出目标单词作为提示；
3. 只使用给定单词，不要自创单词；每道题对应一个给定单词，题目数量 = 给定单词数量（不超过 10 道）；
4. 难度适中，贴近初中英语短语/搭配用法；
5. 不做任何其他行为：不讲解、不评价、不寒暄、不输出题目以外的任何文字（包括 markdown 代码块）。`;

/** 艾宾浩斯复习间隔（按掌握层级，单位：毫秒） */
export const EBBINGHAUS_INTERVALS_MS: Record<number, number> = {
  1: 10 * 60 * 1000,          // 10 分钟
  2: 24 * 60 * 60 * 1000,     // 1 天
  3: 2 * 24 * 60 * 60 * 1000, // 2 天
  4: 4 * 24 * 60 * 60 * 1000, // 4 天
  5: 7 * 24 * 60 * 60 * 1000, // 7 天
  6: 15 * 24 * 60 * 60 * 1000, // 15 天
  7: 30 * 24 * 60 * 60 * 1000, // 30 天（封顶）
};

export interface WordTaskConfig {
  mode: 'DICTATION' | 'SPELLING' | 'CHOICE';
  stage: string;
  orderMode: 'SEQUENCE' | 'RANDOM';
  groupSize: number;   // 1-5
  intervalSec: number; // 组间隔秒（手动输入）
  roundSize: number;   // 每轮词数 1-50，完成后触发短语填空
  aiTeacherId?: string | null;
}

/** 校验单词任务配置 */
export function validateWordConfig(raw: any): WordTaskConfig {
  if (!raw || typeof raw !== 'object') throw new Error('单词任务需要 wordConfig 配置');
  const mode = raw.mode;
  if (mode !== 'DICTATION' && mode !== 'SPELLING' && mode !== 'CHOICE') {
    throw new Error('单词任务模式必须为听写（DICTATION）、默写（SPELLING）或选择（CHOICE）');
  }
  const stage = String(raw.stage || '');
  if (!stage) throw new Error('单词任务必须指定阶段（小学/初中/高中）');
  const orderMode = raw.orderMode === 'RANDOM' ? 'RANDOM' : 'SEQUENCE';
  // 词组数量：每组词数（完成该组后进入短语填空）；恢复分组机制，默认 10
  const groupSize = Number.isFinite(Number(raw.groupSize))
    ? Math.max(1, Math.min(50, Math.round(Number(raw.groupSize))))
    : 10;
  // 单词跳转间隔（秒）：前端 3/5/8，默认 3
  const intervalSec = Number.isFinite(Number(raw.intervalSec))
    ? Math.max(0, Math.min(120, Number(raw.intervalSec)))
    : 3;
  // 单词总数（10-100）：wordCount；兼容旧字段 roundSize
  const rawCount = Number(raw.wordCount ?? raw.roundSize);
  const wordCount = Number.isFinite(rawCount) ? Math.max(10, Math.min(100, Math.round(rawCount))) : 20;
  // 词组数量不能超过单词总数（超则截断为单词总数）
  const gs = Math.min(groupSize, wordCount);
  return { mode, stage, orderMode, groupSize: gs, intervalSec, roundSize: wordCount, aiTeacherId: raw.aiTeacherId ?? null };
}

/** 确保 AI 词汇老师指令存在（幂等），返回指令记录 */
export async function ensureWordTeacherInstruction(): Promise<{
  id: string;
  subject: string;
  systemPrompt: string;
  providerId: string | null;
}> {
  let ins = await prisma.subjectInstruction.findUnique({ where: { subject: WORD_TEACHER_SUBJECT } });
  if (!ins) {
    ins = await prisma.subjectInstruction.create({
      data: { subject: WORD_TEACHER_SUBJECT, systemPrompt: WORD_TEACHER_SYSTEM_PROMPT, examples: [] },
    });
    logger.info(`[word] 已自动创建 AI 词汇老师指令 ${ins.id}`);
  }
  return { id: ins.id, subject: ins.subject, systemPrompt: ins.systemPrompt, providerId: ins.providerId };
}

/** 词库阶段概览（动态：读库内实际 stage，自动包含 CET4 等新词库） */
export async function getWordStages(studentId?: string) {
  const groups = await prisma.word.groupBy({ by: ['stage'], _count: { _all: true } });
  const order = ['小学', '初中', '高中', 'CET4'];
  const labels: Record<string, string> = { CET4: '英语四级词汇表 (CET-4) 完整版' };
  // 到期提醒：当前学员各词库今日待复习数（nextReviewAt<=now、level<7、今天未复习）
  let dueMap: Record<string, number> = {};
  if (studentId) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = await prisma.wordMistake.groupBy({
      by: ['wordId'],
      where: {
        studentId,
        nextReviewAt: { lte: now },
        level: { gt: 0, lt: 7 },
        OR: [{ reviewedAt: null }, { reviewedAt: { lt: todayStart } }],
      },
      _count: { _all: true },
    });
    const ids = due.map((d) => d.wordId);
    if (ids.length > 0) {
      const words = await prisma.word.findMany({ where: { id: { in: ids } }, select: { id: true, stage: true } });
      dueMap = words.reduce((acc, w) => {
        acc[w.stage] = (acc[w.stage] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    }
  }
  return groups
    .map((g) => ({
      stage: g.stage,
      count: g._count._all,
      label: labels[g.stage] || g.stage,
      dueToday: dueMap[g.stage] || 0,
    }))
    .sort((a, b) => {
      const ia = order.indexOf(a.stage);
      const ib = order.indexOf(b.stage);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
}

/** 根据艾宾浩斯状态抽词：到期错词优先（≤50%）+ 新词补足 */
export async function pickWords(
  studentId: string,
  stage: string,
  orderMode: 'SEQUENCE' | 'RANDOM',
  roundSize: number,
  excludeIds: string[] = []
): Promise<string[]> {
  const now = new Date();
  // 每日复习配额：当天（自然日 0 点起）已复习过的词不再重复抽取，防止到期堆积
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const exclude = new Set(excludeIds);
  // 1) 到期错词（nextReviewAt <= now；level=7 视为已掌握不再复习；今天已复习过的不抽；
  //    其他任务已使用的词跳过）
  //    错词加权：按逾期程度优先，其次错误次数多的优先
  const dueMistakes = await prisma.wordMistake.findMany({
    where: {
      studentId,
      word: { stage },
      nextReviewAt: { lte: now },
      level: { gt: 0, lt: 7 },
      OR: [{ reviewedAt: null }, { reviewedAt: { lt: todayStart } }],
    },
    orderBy: [{ nextReviewAt: 'asc' }, { wrongCount: 'desc' }],
    select: { wordId: true },
  });
  const dueIds = dueMistakes.map((m) => m.wordId).filter((id) => !exclude.has(id));
  const dueTake = Math.min(dueIds.length, Math.ceil(roundSize / 2));
  const duePart = dueIds.slice(0, dueTake);

  // 2) 新词/低掌握词补足（level=0 优先，其次 level=1）；排除其他任务已用词
  const need = roundSize - duePart.length;
  let freshIds: string[] = [];
  if (need > 0) {
    const used = new Set([...duePart, ...exclude]);
    const freshRows = await prisma.word.findMany({
      where: { stage, id: { notIn: [...used] } },
      select: { id: true },
      orderBy: orderMode === 'RANDOM' ? undefined : { word: 'asc' },
    });
    const allFresh = freshRows.map((r) => r.id);
    if (orderMode === 'RANDOM') {
      // Fisher-Yates 洗牌
      for (let i = allFresh.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allFresh[i], allFresh[j]] = [allFresh[j], allFresh[i]];
      }
    }
    freshIds = allFresh.slice(0, need);
  }
  const picked = [...duePart, ...freshIds];
  // 排除其他任务已用词后数量不足 → 降级放行（词库标注不足时保证训练可用，warn 提示）
  if (excludeIds.length > 0 && picked.length < roundSize) {
    console.warn(`[word] pickWords 可用词不足（已排除 ${excludeIds.length} 个他任务词）：命中 ${picked.length}/${roundSize}`);
  }
  return picked;
}

/** 更新单词错题集 + 艾宾浩斯层级（答对升档；level=7 封顶且视为已掌握，不再安排复习） */
export async function recordWordResult(
  studentId: string,
  wordId: string,
  correct: boolean
): Promise<void> {
  const now = new Date();
  const existing = await prisma.wordMistake.findUnique({
    where: { studentId_wordId: { studentId, wordId } },
  });
  if (correct) {
    const nextLevel = Math.min((existing?.level ?? 0) + 1, 7);
    // level>=7：已掌握 → 不再安排复习（nextReviewAt 置空，避免 30 天后再次被抽中）
    const nextReviewAt = nextLevel >= 7 ? null : new Date(Date.now() + EBBINGHAUS_INTERVALS_MS[nextLevel]);
    await prisma.wordMistake.upsert({
      where: { studentId_wordId: { studentId, wordId } },
      create: {
        studentId,
        wordId,
        correctCount: 1,
        level: nextLevel,
        nextReviewAt: nextLevel >= 7 ? null : nextReviewAt,
        reviewedAt: now,
      },
      update: {
        correctCount: { increment: 1 },
        level: nextLevel,
        nextReviewAt,
        reviewedAt: now,
      },
    });
  } else {
    await prisma.wordMistake.upsert({
      where: { studentId_wordId: { studentId, wordId } },
      create: {
        studentId,
        wordId,
        wrongCount: 1,
        level: 1,
        lastWrongAt: now,
        nextReviewAt: new Date(now.getTime() + EBBINGHAUS_INTERVALS_MS[1]),
        reviewedAt: now,
      },
      update: {
        wrongCount: { increment: 1 },
        level: 1,
        lastWrongAt: now,
        nextReviewAt: new Date(now.getTime() + EBBINGHAUS_INTERVALS_MS[1]),
        reviewedAt: now,
      },
    });
  }
}

// ============ 训练会话 ============

export async function startWordSession(
  taskId: string,
  studentId: string,
  taskConfig: WordTaskConfig
) {
  // 任务间去重（按模式）：同模式的其他任务已用词不重复抽取；
  // 不同模式（默写/听写/选择）允许共用同组词（如先默写后听写同一批词）
  const otherSessions = await prisma.wordSession.findMany({
    where: { studentId, taskId: { not: taskId }, mode: taskConfig.mode },
    select: { wordIds: true },
  });
  const usedByOthers = new Set<string>();
  for (const s of otherSessions) {
    if (Array.isArray(s.wordIds)) {
      for (const w of s.wordIds as string[]) usedByOthers.add(w);
    }
  }
  // 重启任务（恢复重练）：复用冻结的原词表（lastWordIds），从头开始；否则按查重规则抽词
  const frozen = (taskConfig as any).lastWordIds as string[] | undefined;
  const wordIds =
    Array.isArray(frozen) && frozen.length > 0
      ? frozen
      : await pickWords(
          studentId,
          taskConfig.stage,
          taskConfig.orderMode,
          taskConfig.roundSize,
          [...usedByOthers]
        );
  if (wordIds.length === 0) {
    throw new Error(`「${taskConfig.stage}」阶段暂无可用单词，请先导入词库`);
  }
  // 覆盖【本任务】已有进行中会话（同一任务重新开始）；不影响其他任务的进行中会话
  await prisma.wordSession.updateMany({
    where: { studentId, taskId, status: 'IN_PROGRESS' },
    data: { status: 'COMPLETED' },
  });
  const session = await prisma.wordSession.create({
    data: {
      taskId,
      studentId,
      mode: taskConfig.mode,
      stage: taskConfig.stage,
      wordIds,
      total: wordIds.length,
      status: 'IN_PROGRESS',
    },
  });
  // 异步预生成第一组短语填空（不阻塞 start 响应）：组尾进入填空时零等待；
  // 用户答题期间（≥10 词 × 数秒）预生成早已完成
  void (async () => {
    try {
      const groups0 = buildGroups({ wordIds, total: wordIds.length }, taskConfig.groupSize || 10);
      if (groups0[0]?.length) {
        const learned = await prisma.word.findMany({
          where: { id: { in: groups0[0] } },
          select: { word: true, meaning: true },
        });
        const cloze = await generateCloze(learned.map((w) => ({ word: w.word, meaning: w.meaning })));
        if (cloze.length) {
          await prisma.wordSession.update({
            where: { id: session.id },
            data: { clozeJson: { group: 0, cloze } as any },
          });
        }
      }
    } catch {
      /* 预生成失败 → nextGroup 兜底现生成 */
    }
  })();
  // 任务状态同步：开始训练 → IN_PROGRESS（任务列表显示「继续训练」）
  await prisma.task.update({ where: { id: taskId }, data: { status: 'IN_PROGRESS' } });
  return session;
}

/** 会话按配置分组 */
export function buildGroups(session: { wordIds: unknown; total: number }, groupSize: number): string[][] {
  const ids: string[] = Array.isArray(session.wordIds) ? (session.wordIds as string[]) : [];
  const groups: string[][] = [];
  for (let i = 0; i < ids.length; i += groupSize) {
    groups.push(ids.slice(i, i + groupSize));
  }
  return groups;
}

/** 单词答题判定（听写/默写统一：忽略大小写与首尾空格） */
export function checkWordInput(input: string, word: string): boolean {
  return (input || '').trim().toLowerCase() === (word || '').trim().toLowerCase();
}

/**
 * CHOICE 选择测验：为组内每个词生成 4 选 1 中文释义选项
 * 正确项 = 词义；干扰项 = 同词库随机 3 个不同 meaning（去重，不足则用兜底文案）
 */
export async function attachChoiceOptions(
  words: Array<{ id: string; word: string; phonetic: string; meaning: string }>,
  stage: string
): Promise<Array<{ id: string; word: string; phonetic: string; pos: string; meaning: string; options: Array<{ text: string; correct: boolean }> }>> {
  const meanings = new Set(words.map((w) => w.meaning.trim()));
  const distractors: string[] = [];
  if (distractors.length < 3) {
    const rows = await prisma.word.findMany({
      where: { stage, NOT: { id: { in: words.map((w) => w.id) } } },
      select: { meaning: true },
      take: 50,
      orderBy: { word: 'asc' },
    });
    // Fisher-Yates 洗牌后取不重复的干扰项
    const pool = rows.map((r) => r.meaning.trim()).filter((m) => m && !meanings.has(m));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const m of pool) {
      if (distractors.length >= 3) break;
      if (!distractors.includes(m)) distractors.push(m);
    }
  }
  while (distractors.length < 3) distractors.push('（释义）');
  return words.map((w) => {
    const opts: Array<{ text: string; correct: boolean }> = [
      { text: w.meaning.trim(), correct: true },
      ...distractors.map((d) => ({ text: d, correct: false })),
    ];
    // 打乱选项顺序
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return { ...w, pos: (w as any).pos || "", options: opts };
  });
}

// ============ AI 词汇老师短语填空 ============

export interface ClozeQuestion {
  sentence: string;
  answer: string;
  hint?: string;
  translation?: string; // 整句中文释义（提交后展示，作答前不显示）
}

/** 短语题洗牌：打乱出题顺序，避免学员照搬单词原顺序填写 */
export function shuffleCloze(list: ClozeQuestion[]): ClozeQuestion[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 调用 AI 词汇老师生成短语填空题（实时、不入题库；返回前统一洗牌） */
export async function generateCloze(learnedWords: Array<{ word: string; meaning: string }>): Promise<ClozeQuestion[]> {
  if (learnedWords.length === 0) throw new Error('没有可出题的单词');
  // 模板兜底：AI 词汇老师不可用时按词义生成基础填空题，保证训练流程不中断
  const fallback = (): ClozeQuestion[] =>
    shuffleCloze(
      learnedWords.slice(0, 10).map((w) => ({
        sentence: `请写出与「${w.meaning}」对应的英文单词：____`,
        answer: w.word,
        hint: `目标单词：${w.word}（首字母 ${w.word.charAt(0).toUpperCase()}）`,
        translation: `（中文释义：${w.meaning}）`,
      }))
    );
  let teacher: { systemPrompt: string } | null = null;
  try {
    teacher = await ensureWordTeacherInstruction();
  } catch {
    return fallback();
  }
  const wordList = learnedWords
    .slice(0, 10)
    .map((w) => `${w.word}（${w.meaning}）`)
    .join('、');
  const prompt = `请根据以下已学单词出短语/搭配填空题，每题必须包含：
- sentence：英文句子，填空处用 ____ 表示
- answer：填空处应填的单词
- hint：不含答案的提示（如语境提示，不要直接给出目标单词）
- translation：整句的中文释义（必须提供，供提交后对照学习）
返回 JSON 数组，格式：[{sentence, answer, hint, translation}]
单词列表：\n${wordList}`;
  let raw: string;
  try {
    raw = await aiServiceManager.callAI(prompt, {
      temperature: 0.4,
      maxTokens: 3000,
      timeout: 150000,
      maxRetries: 1,
      systemPrompt: teacher.systemPrompt,
      // 词汇老师：默认走全局优先级 AI 服务商（当前 sensenova），不再硬编码本地 Ollama
    });
  } catch (e: any) {
    logger.warn('[word] AI 词汇老师出题失败，使用模板兜底:', e.message);
    return fallback();
  }
  const cleaned = (raw || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) return fallback();
  let list: unknown;
  try {
    list = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return fallback();
  }
  if (!Array.isArray(list) || list.length === 0) return fallback();
  const questions = list
    .filter((q: any) => q && typeof q.sentence === 'string' && typeof q.answer === 'string')
    .slice(0, 10)
    .map((q: any) => ({
      sentence: q.sentence,
      answer: q.answer,
      hint: q.hint,
      translation: q.translation || '',
    }));
  return questions.length > 0 ? shuffleCloze(questions) : fallback();
}

export function checkClozeAnswer(input: string, answer: string): boolean {
  return (input || '').trim().toLowerCase() === (answer || '').trim().toLowerCase();
}

// ============ TTS 代理（edge-tts 微服务） ============

const TTS_SERVICE_URL = process.env.WORD_TTS_URL || 'http://localhost:8010';
// 词音频内存缓存（LRU 上限）：同词二次请求零生成，跨学员/跨会话复用
const ttsCache = new Map<string, Buffer>();
const TTS_CACHE_MAX = 3000;

export async function ttsWord(word: string, voice?: string): Promise<Buffer | null> {
  const key = `${voice || 'en-US-AriaNeural'}:${(word || '').toLowerCase().trim()}`;
  const hit = ttsCache.get(key);
  if (hit) {
    // 命中 → 移到末尾（LRU）
    ttsCache.delete(key);
    ttsCache.set(key, hit);
    return hit;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`${TTS_SERVICE_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: word, voice: voice || 'en-US-AriaNeural' }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.length > 0) {
      ttsCache.set(key, audio);
      if (ttsCache.size > TTS_CACHE_MAX) {
        const oldest = ttsCache.keys().next().value;
        if (oldest) ttsCache.delete(oldest);
      }
    }
    return audio;
  } catch (e: any) {
    logger.warn('[word] tts 微服务不可用，前端将走 Web Speech 兜底:', e.message);
    return null;
  }
}

export const wordTaskService = {
  validateWordConfig,
  ensureWordTeacherInstruction,
  getWordStages,
  pickWords,
  attachChoiceOptions,
  recordWordResult,
  startWordSession,
  buildGroups,
  checkWordInput,
  generateCloze,
  checkClozeAnswer,
  ttsWord,
};
