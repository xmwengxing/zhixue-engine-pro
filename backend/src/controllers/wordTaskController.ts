import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { wordTaskService, WordTaskConfig } from '../services/wordTaskService';

const prisma = new PrismaClient();

function unauthorized(res: Response) {
  res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权访问' } });
}

/** GET /student/word-bank/stages — 词库阶段概览 */
export const getStages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.userId) { unauthorized(res); return; }
    const stages = await wordTaskService.getWordStages();
    res.json({ success: true, data: stages });
  } catch (e) {
    next(e);
  }
};

/** POST /student/word-task/start/:taskId — 开始单词训练会话 */
export const startWord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) { unauthorized(res); return; }
    const { taskId } = req.params;
    const task = await prisma.task.findFirst({
      where: { id: String(taskId), studentId, specialType: 'WORD', mode: 'WORD' },
    });
    if (!task) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '单词任务不存在' } });
      return;
    }
    const config = task.config as any as WordTaskConfig;
    const session = await wordTaskService.startWordSession(task.id, studentId, config);
    const groups = wordTaskService.buildGroups(session, config.groupSize);
    // 首组单词（含释义，供默写提示；听写时前端隐藏释义）
    const firstGroup = await loadWords(groups[0] || []);
    res.json({ success: true, data: { sessionId: session.id, groups: groups.length, total: session.total, group: firstGroup, config } });
  } catch (e) {
    next(e);
  }
};

/** POST /student/word-task/submit-word/:sessionId — 逐词提交（落库错题 + 推进进度，支持组中途退出恢复） */
export const submitWord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) { unauthorized(res); return; }
    const sessionId = String(req.params.sessionId);
    const { wordId, input } = req.body ?? {};
    if (!wordId || typeof input !== 'string') {
      res.status(400).json({ error: { code: 'INVALID_PARAMETER', message: '缺少 wordId 或 input' } });
      return;
    }
    const session = await prisma.wordSession.findFirst({ where: { id: sessionId, studentId } });
    if (!session) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '训练会话不存在' } });
      return;
    }
    const word = await prisma.word.findUnique({ where: { id: String(wordId) } });
    if (!word) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '单词不存在' } });
      return;
    }
    const correct = wordTaskService.checkWordInput(input, word.word);
    await wordTaskService.recordWordResult(studentId, word.id, correct);
    // 推进进度 + 记录组内已答（逐词落库）
    const doneInGroup: string[] = Array.isArray(session.doneInGroup) ? (session.doneInGroup as string[]) : [];
    if (!doneInGroup.includes(word.id)) doneInGroup.push(word.id);
    const nextIndex = Math.min(session.index + 1, session.total);
    await prisma.wordSession.update({
      where: { id: session.id },
      data: { index: nextIndex, doneInGroup },
    });
    res.json({ success: true, data: { correct } });
  } catch (e) {
    next(e);
  }
};

/** POST /student/word-task/group/:sessionId — 进入下一组（单词判定已由逐词提交完成） */
export const nextGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) { unauthorized(res); return; }
    const sessionId = String(req.params.sessionId);
    const { groupIndex } = req.body ?? {};
    const session = await prisma.wordSession.findFirst({ where: { id: sessionId, studentId } });
    if (!session) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '训练会话不存在' } });
      return;
    }
    const config = (await prisma.task.findUnique({ where: { id: session.taskId } }))?.config as any as WordTaskConfig;
    const groups = wordTaskService.buildGroups(session, config?.groupSize ?? 1);
    const nextIdx = (groupIndex ?? 0) + 1;
    const done = nextIdx >= groups.length;
    if (done) {
      // 单词听写/默写完成 → 强制进入短语填空
      const learned = (await loadWords(groups.flat())).map((w) => ({ word: w.word, meaning: w.meaning }));
      const cloze = await wordTaskService.generateCloze(learned);
      await prisma.wordSession.update({
        where: { id: session.id },
        data: { clozeJson: cloze as any, doneInGroup: [] as any, status: 'IN_PROGRESS' },
      });
      res.json({
        success: true,
        data: { done: true, phase: 'CLOZE', cloze },
      });
      return;
    }
    // 进入新组：清空组内进度
    await prisma.wordSession.update({ where: { id: session.id }, data: { doneInGroup: [] as any } });
    const group = await loadWords(groups[nextIdx] || []);
    res.json({ success: true, data: { done: false, groupIndex: nextIdx, group } });
  } catch (e) {
    next(e);
  }
};

/** POST /student/word-task/resume/:taskId — 恢复指定任务的进行中会话（含未完成填空） */
export const resumeWord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) { unauthorized(res); return; }
    const taskId = String(req.params.sessionId || req.params.taskId || '');
    if (!taskId) {
      res.status(400).json({ error: { code: 'INVALID_PARAMETER', message: '缺少任务 id' } });
      return;
    }
    // 仅恢复「本任务」的进行中会话（避免多任务间串会话）
    const session = await prisma.wordSession.findFirst({
      where: { studentId, taskId, status: 'IN_PROGRESS' },
      orderBy: { updatedAt: 'desc' },
    });
    if (!session) {
      res.json({ success: true, data: null });
      return;
    }
    const config = (await prisma.task.findUnique({ where: { id: session.taskId } }))?.config as any as WordTaskConfig;
    const groups = wordTaskService.buildGroups(session, config?.groupSize ?? 1);
    const done = session.index >= session.total;
    const data: any = {
      sessionId: session.id,
      phase: done ? 'CLOZE' : 'WORD',
      done,
      index: session.index,
      total: session.total,
      config,
    };
    if (done) {
      data.cloze = (session.clozeJson as any) || null;
      data.clozeDone = session.clozeDone;
      if (!data.cloze) {
        const learned = (await loadWords(groups.flat())).map((w) => ({ word: w.word, meaning: w.meaning }));
        const cloze = await wordTaskService.generateCloze(learned);
        await prisma.wordSession.update({ where: { id: session.id }, data: { clozeJson: cloze as any } });
        data.cloze = cloze;
      }
    } else {
      const currentGroupIdx = Math.floor(session.index / (config?.groupSize ?? 1));
      // 当前组内未答的词（逐词落库后，组中途退出只从未答词继续）
      const doneInGroup: string[] = Array.isArray(session.doneInGroup) ? (session.doneInGroup as string[]) : [];
      const all = await loadWords(groups[currentGroupIdx] || []);
      data.groupIndex = currentGroupIdx;
      data.group = all.filter((w) => !doneInGroup.includes(w.id));
      data.groupWordIndex = 0;
    }
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

/** POST /student/word-task/cloze/check — 短语填空题判定 */
export const clozeCheck = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) { unauthorized(res); return; }
    const { answer, input } = req.body ?? {};
    const correct = wordTaskService.checkClozeAnswer(String(input ?? ''), String(answer ?? ''));
    res.json({ success: true, data: { correct, answer } });
  } catch (e) {
    next(e);
  }
};

/** POST /student/word-task/finish/:sessionId — 完成会话（填空完成/退出保存进度） */
export const finishWord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) { unauthorized(res); return; }
    const sessionId = String(req.params.sessionId);
    const { clozeDone } = req.body ?? {};
    const session = await prisma.wordSession.findFirst({ where: { id: sessionId, studentId } });
    if (!session) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '训练会话不存在' } });
      return;
    }
    const completed = clozeDone === true || session.clozeDone;
    await prisma.wordSession.update({
      where: { id: session.id },
      data: {
        clozeDone: completed,
        status: completed ? 'COMPLETED' : 'IN_PROGRESS',
      },
    });
    // 任务状态同步：填空完成 → 任务 COMPLETED；仅保存进度 → 保持 IN_PROGRESS
    if (completed) {
      await prisma.task.update({ where: { id: session.taskId }, data: { status: 'COMPLETED' } });
    }
    res.json({ success: true, data: { status: 'OK' } });
  } catch (e) {
    next(e);
  }
};

/** GET /student/word-task/mistakes?stage= — 单词错题集（错误频率排序） */
export const getMistakes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.userId;
    if (!studentId) { unauthorized(res); return; }
    const { stage } = req.query;
    const rows = await prisma.wordMistake.findMany({
      where: {
        studentId,
        ...(stage ? { word: { stage: String(stage) } } : {}),
      },
      orderBy: [{ wrongCount: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
      include: { word: { select: { id: true, word: true, phonetic: true, meaning: true, stage: true } } },
    });
    res.json({
      success: true,
      data: rows.map((r) => ({
        wordId: r.wordId,
        word: r.word.word,
        phonetic: r.word.phonetic,
        meaning: r.word.meaning,
        stage: r.word.stage,
        wrongCount: r.wrongCount,
        correctCount: r.correctCount,
        level: r.level,
        lastWrongAt: r.lastWrongAt,
        nextReviewAt: r.nextReviewAt,
      })),
    });
  } catch (e) {
    next(e);
  }
};

/** POST /student/word-task/tts — edge-tts 发音（word → mp3，前端可批量预取） */
export const tts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { word, voice } = req.body ?? {};
    if (!word) {
      res.status(400).json({ error: { code: 'INVALID_PARAMETER', message: '缺少 word' } });
      return;
    }
    const audio = await wordTaskService.ttsWord(String(word), voice);
    if (!audio) {
      res.status(503).json({ error: { code: 'TTS_UNAVAILABLE', message: 'TTS 服务暂不可用' } });
      return;
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(audio);
  } catch (e) {
    next(e);
  }
};

async function loadWords(ids: string[]): Promise<Array<{ id: string; word: string; phonetic: string; meaning: string }>> {
  if (!ids.length) return [];
  const rows = await prisma.word.findMany({ where: { id: { in: ids } } });
  // 保持组内顺序
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => {
      const w = map.get(id);
      return w ? { id: w.id, word: w.word, phonetic: w.phonetic, meaning: w.meaning } : null;
    })
    .filter((x): x is { id: string; word: string; phonetic: string; meaning: string } => x !== null);
}


export const wordTaskController = {
  getStages,
  startWord,
  nextGroup,
  submitWord,
  resumeWord,
  clozeCheck,
  finishWord,
  getMistakes,
  tts,
};
