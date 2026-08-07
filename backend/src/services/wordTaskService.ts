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
  const groupSize = Number(raw.groupSize);
  if (![1, 2, 3, 4, 5].includes(groupSize)) throw new Error('每组单词数必须为 1-5');
  const intervalSec = Number(raw.intervalSec);
  if (!Number.isFinite(intervalSec) || intervalSec < 0 || intervalSec > 120) {
    throw new Error('每组间隔秒数需在 0-120 之间');
  }
  const roundSize = Number(raw.roundSize);
  if (!Number.isFinite(roundSize) || roundSize < 1 || roundSize > 50) {
    throw new Error('每轮词数需在 1-50 之间');
  }
  return { mode, stage, orderMode, groupSize, intervalSec, roundSize, aiTeacherId: raw.aiTeacherId ?? null };
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
export async function getWordStages() {
  const groups = await prisma.word.groupBy({ by: ['stage'], _count: { _all: true } });
  const order = ['小学', '初中', '高中', 'CET4'];
  const labels: Record<string, string> = { CET4: '英语四级词汇表 (CET-4) 完整版' };
  return groups
    .map((g) => ({ stage: g.stage, count: g._count._all, label: labels[g.stage] || g.stage }))
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
  roundSize: number
): Promise<string[]> {
  const now = new Date();
  // 1) 到期错词（nextReviewAt <= now；level=7 视为已掌握，不再强制复习）
  const dueMistakes = await prisma.wordMistake.findMany({
    where: { studentId, word: { stage }, nextReviewAt: { lte: now }, level: { gt: 0, lt: 7 } },
    orderBy: { nextReviewAt: 'asc' },
    select: { wordId: true },
  });
  const dueIds = dueMistakes.map((m) => m.wordId);
  const dueTake = Math.min(dueIds.length, Math.ceil(roundSize / 2));
  const duePart = dueIds.slice(0, dueTake);

  // 2) 新词/低掌握词补足（level=0 优先，其次 level=1）
  const need = roundSize - duePart.length;
  let freshIds: string[] = [];
  if (need > 0) {
    const used = new Set(duePart);
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
  return [...duePart, ...freshIds];
}

/** 更新单词错题集 + 艾宾浩斯层级（答对升档；level=7 封顶且视为已掌握，不再安排复习） */
export async function recordWordResult(
  studentId: string,
  wordId: string,
  correct: boolean
): Promise<void> {
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
      },
      update: {
        correctCount: { increment: 1 },
        level: nextLevel,
        nextReviewAt,
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
        lastWrongAt: new Date(),
        nextReviewAt: new Date(Date.now() + EBBINGHAUS_INTERVALS_MS[1]),
      },
      update: {
        wrongCount: { increment: 1 },
        level: 1,
        lastWrongAt: new Date(),
        nextReviewAt: new Date(Date.now() + EBBINGHAUS_INTERVALS_MS[1]),
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
  const wordIds = await pickWords(studentId, taskConfig.stage, taskConfig.orderMode, taskConfig.roundSize);
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
): Promise<Array<{ id: string; word: string; phonetic: string; meaning: string; options: Array<{ text: string; correct: boolean }> }>> {
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
    return { ...w, options: opts };
  });
}

// ============ AI 词汇老师短语填空 ============

export interface ClozeQuestion {
  sentence: string;
  answer: string;
  hint?: string;
}

/** 调用 AI 词汇老师生成短语填空题（实时、不入题库） */
export async function generateCloze(learnedWords: Array<{ word: string; meaning: string }>): Promise<ClozeQuestion[]> {
  if (learnedWords.length === 0) throw new Error('没有可出题的单词');
  const teacher = await ensureWordTeacherInstruction();
  const wordList = learnedWords
    .slice(0, 10)
    .map((w) => `${w.word}（${w.meaning}）`)
    .join('、');
  const prompt = `请根据以下已学单词出短语/搭配填空题（每题空位用 ____ 表示，括号给目标单词提示）：\n${wordList}`;
  let raw: string;
  try {
    raw = await aiServiceManager.callAI(prompt, {
      temperature: 0.4,
      maxTokens: 3000,
      timeout: 150000, // 本地 9B 出题实测 44~93s，放宽到 150s
      maxRetries: 0, // 慢生成重试只会重复耗时
      systemPrompt: teacher.systemPrompt,
      providerName: process.env.WORD_CLOZE_PROVIDER || 'Ollama-Vocab', // 词汇老师专用（Qwopus Q4，更快更稳）
    });
  } catch (e: any) {
    logger.warn('[word] AI 词汇老师出题失败:', e.message);
    throw new Error('AI 词汇老师暂时无法出题，请稍后重试');
  }
  // 容错解析 JSON 数组
  const cleaned = (raw || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('AI 词汇老师返回格式异常');
  let list: unknown;
  try {
    list = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error('AI 词汇老师返回格式异常');
  }
  if (!Array.isArray(list) || list.length === 0) throw new Error('AI 词汇老师未返回题目');
  return list
    .filter((q: any) => q && typeof q.sentence === 'string' && typeof q.answer === 'string')
    .slice(0, 10)
    .map((q: any) => ({ sentence: q.sentence, answer: q.answer, hint: q.hint }));
}

/** 短语填空题判定：忽略大小写与空白 */
export function checkClozeAnswer(input: string, answer: string): boolean {
  return (input || '').trim().toLowerCase() === (answer || '').trim().toLowerCase();
}

// ============ TTS 代理（edge-tts 微服务） ============

const TTS_SERVICE_URL = process.env.WORD_TTS_URL || 'http://localhost:8010';

export async function ttsWord(word: string, voice?: string): Promise<Buffer | null> {
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
    return Buffer.from(await res.arrayBuffer());
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
