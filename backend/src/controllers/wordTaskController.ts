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
    const stages = await wordTaskService.getWordStages(req.user?.userId);
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
    let firstGroup = await loadWords(groups[0] || []);
    // CHOICE 选择模式：为每个词附带 4 选 1 中文释义选项
    if (config.mode === 'CHOICE' && firstGroup.length > 0) {
      firstGroup = await wordTaskService.attachChoiceOptions(firstGroup as any, config.stage);
    }
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
    // CHOICE 选择模式：input 是选中的中文释义；其余模式 input 是英文单词
    const correct =
      session.mode === 'CHOICE'
        ? wordTaskService.checkWordInput(input, word.meaning)
        : wordTaskService.checkWordInput(input, word.word);
    await wordTaskService.recordWordResult(studentId, word.id, correct);
    // 推进进度 + 记录组内已答（逐词落库）+ 会话统计（供历史记录）
    const doneInGroup: string[] = Array.isArray(session.doneInGroup) ? (session.doneInGroup as string[]) : [];
    if (!doneInGroup.includes(word.id)) doneInGroup.push(word.id);
    const nextIndex = Math.min(session.index + 1, session.total);
    const stats: { wordsCorrect: number; wordsWrong: number; clozeCorrect: number; clozeTotal: number } =
      (session.stats as any) || { wordsCorrect: 0, wordsWrong: 0, clozeCorrect: 0, clozeTotal: 0 };
    if (correct) stats.wordsCorrect += 1;
    else stats.wordsWrong += 1;
    await prisma.wordSession.update({
      where: { id: session.id },
      data: { index: nextIndex, doneInGroup, stats },
    });

    // 积分：答对 1 词 +1（词汇量×准确率）；复习旧词答对 +2（幂等）
    try {
      const { pointsEngineService } = await import('../services/pointsEngineService');
      if (correct) {
        const task = await prisma.task.findUnique({ where: { id: session.taskId }, select: { config: true } });
        const roundSize = Number((task?.config as any)?.roundSize) || 0;
        if (roundSize >= 10) {
          await pointsEngineService.reward(studentId, 'WORD_CORRECT', 1, session.taskId, `单词「${word.word}」答对`, { allowMultiPerDay: true });
        }
        const mistake = await prisma.wordMistake.findUnique({
          where: { studentId_wordId: { studentId, wordId: word.id } },
        });
        if (mistake && mistake.level >= 1) {
          await pointsEngineService.reward(studentId, 'WORD_REVIEW_CORRECT', 2, session.taskId, `复习单词「${word.word}」答对`, { allowMultiPerDay: true });
        }
      }
      // 参与度惩罚结算（单词连续未训练）
      const task = await prisma.task.findUnique({ where: { id: session.taskId }, select: { category: true, specialType: true, config: true } });
      if (task) {
        await pointsEngineService.settleParticipationPenalties(studentId, session.taskId, task.category, task.config as any, session.updatedAt ?? null);
      }
    } catch (pointsError) {
      // 非致命
    }
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
    const { groupIndex, preview } = req.body ?? {};
    const session = await prisma.wordSession.findFirst({ where: { id: sessionId, studentId } });
    if (!session) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '训练会话不存在' } });
      return;
    }
    const config = (await prisma.task.findUnique({ where: { id: session.taskId } }))?.config as any as WordTaskConfig;
    const groups = wordTaskService.buildGroups(session, config.groupSize);
    const completedGroup = groups[groupIndex ?? 0] || [];
    // 背词模式预取短语：只读/仅落库短语，不消费 clozeJson、不动 doneInGroup（保留答题进度）
    if (preview === true) {
      const preP = session.clozeJson as any;
      let clozeP: any[] = preP && preP.group === (groupIndex ?? 0) && Array.isArray(preP.cloze) ? preP.cloze : [];
      if (!clozeP.length) {
        const learned = (await loadWords(completedGroup)).map((w) => ({ word: w.word, meaning: w.meaning }));
        clozeP = await wordTaskService.generateCloze(learned);
        // 落库供真实进填空时零等待复用（不动 doneInGroup）
        await prisma.wordSession.update({
          where: { id: session.id },
          data: { clozeJson: { group: groupIndex ?? 0, cloze: clozeP } as any },
        });
      }
      res.json({ success: true, data: { cloze: clozeP } });
      return;
    }
    const nextIdx = (groupIndex ?? 0) + 1;
    const done = nextIdx >= groups.length;
    // 每组完成后强制进入短语填空（填空基于「本组」词）；优先复用预生成填空（零等待）
    let cloze: any = null;
    const pre = session.clozeJson as any;
    if (pre && pre.group === (groupIndex ?? 0) && Array.isArray(pre.cloze)) {
      cloze = pre.cloze;
    }
    if (!cloze) {
      const learned = (await loadWords(completedGroup)).map((w) => ({ word: w.word, meaning: w.meaning }));
      cloze = await wordTaskService.generateCloze(learned);
    }
    await prisma.wordSession.update({
      where: { id: session.id },
      // 进填空：保留 clozeJson（填空恢复不再 AI 重新生成）+ 标记填空进行中
      data: { clozeActive: true, doneInGroup: [] as any, status: 'IN_PROGRESS' },
    });
    // 积分：每组完成 +5（组内答对已按词计分）
    try {
      const { pointsEngineService } = await import('../services/pointsEngineService');
      const roundSize = Number(config?.roundSize) || 0;
      if (roundSize >= 10) {
        await pointsEngineService.reward(studentId, 'WORD_ROUND_DONE', 5, session.taskId, '完成一组单词训练');
      }
    } catch (pointsError) {
      // 非致命
    }
    res.json({
      success: true,
      data: { done, phase: 'CLOZE', cloze, groupIndex: nextIdx, groups: groups.length },
    });
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
    // 填空进行中 → 从填空继续（clozeJson 保留，不再 AI 重新生成）
    const clozeActive = session.clozeActive === true && !session.clozeDone;
    const done = session.status === 'COMPLETED' || session.index >= session.total;
    const data: any = {
      sessionId: session.id,
      phase: clozeActive ? 'CLOZE' : done ? 'CLOZE' : 'WORD',
      done,
      index: session.index,
      total: session.total,
      groups: groups.length, // 组总数（前端分组信息显示，防「第 2/1 组」错乱）
      config,
      historyGroups: session.historyGroups || [], // 已完成组历史明细（退出/续训持久化）
    };
    if (clozeActive || done) {
      // clozeJson 兼容：预生成结构 {group, cloze} → 取 cloze 数组；旧结构直接数组
      const pre = session.clozeJson as any;
      data.cloze = pre && Array.isArray(pre.cloze) ? pre.cloze : pre;
      data.clozeGroup = pre && typeof pre.group === 'number' ? pre.group : 0;
      data.clozeDone = session.clozeDone;
      data.historyGroups = session.historyGroups || [];
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
      // 已开始答题（有已答词）→ 直接回训练断点（不做背词）；组未动 → 先进背词
      data.phase = doneInGroup.length > 0 ? 'WORD' : 'MEMORIZE';
      // 选择模式：恢复的词组必须带选项（否则训练阶段 4 选 1 无选项可点）
      if (config?.mode === 'CHOICE') {
        data.group = await wordTaskService.attachChoiceOptions(data.group as any, config.stage);
      }
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
    const { answer, input, sessionId } = req.body ?? {};
    const correct = wordTaskService.checkClozeAnswer(String(input ?? ''), String(answer ?? ''));
    // 记录填空统计（供历史记录）
    if (sessionId) {
      try {
        const session = await prisma.wordSession.findFirst({ where: { id: String(sessionId), studentId } });
        if (session) {
          const stats: { wordsCorrect: number; wordsWrong: number; clozeCorrect: number; clozeTotal: number } =
            (session.stats as any) || { wordsCorrect: 0, wordsWrong: 0, clozeCorrect: 0, clozeTotal: 0 };
          stats.clozeTotal += 1;
          if (correct) stats.clozeCorrect += 1;
          await prisma.wordSession.update({ where: { id: session.id }, data: { stats } });
        }
      } catch {
        /* 统计失败不影响判分 */
      }
    }
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
    const { clozeDone, groupIndex, historyGroups } = req.body ?? {};
    const session = await prisma.wordSession.findFirst({ where: { id: sessionId, studentId } });
    if (!session) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '训练会话不存在' } });
      return;
    }
    const completed = clozeDone === true || session.clozeDone;
    // 多组模式：本组填空完成但还有剩余组 → 返回下一组继续（不完成任务）
    if (completed && Number.isFinite(Number(groupIndex))) {
      const task = await prisma.task.findUnique({ where: { id: session.taskId }, select: { config: true } });
      const config = (task?.config as any as WordTaskConfig) || {};
      const groups = wordTaskService.buildGroups(session, config.groupSize || 1);
      const nextIdx = Number(groupIndex) + 1;
      if (nextIdx < groups.length) {
        // 预生成下一组短语填空（存 clozeJson）：下组词尾进入填空时零等待
        let nextCloze: any = null;
        try {
          const learned = (await loadWords(groups[nextIdx] || [])).map((w) => ({ word: w.word, meaning: w.meaning }));
          nextCloze = await wordTaskService.generateCloze(learned);
        } catch {
          nextCloze = null;
        }
        await prisma.wordSession.update({
          where: { id: session.id },
          data: {
            clozeDone: false,
            doneInGroup: [] as any,
            status: 'IN_PROGRESS',
            clozeJson: nextCloze ? ({ group: nextIdx, cloze: nextCloze } as any) : null,
          },
        });
        let group = await loadWords(groups[nextIdx] || []);
        if (config.mode === 'CHOICE' && group.length > 0) {
          group = await wordTaskService.attachChoiceOptions(group as any, config.stage);
        }
        res.json({
          success: true,
          data: { continueNext: true, groupIndex: nextIdx, group, groups: groups.length, completed: false },
        });
        return;
      }
    }
    // 历史明细持久化（前端全量上报，整体覆盖；退出/组完成/任务完成都同步）
    const persistHistory = Array.isArray(historyGroups) ? (historyGroups as any) : session.historyGroups;
    await prisma.wordSession.update({
      where: { id: session.id },
      data: {
        clozeDone: completed,
        // 任务完成 → 退出填空态并清短语；仅保存进度 → 填空进行中标记保留（下次从填空继续）
        ...(completed ? { clozeActive: false, clozeJson: null as any } : {}),
        status: completed ? 'COMPLETED' : 'IN_PROGRESS',
        ...(persistHistory ? { historyGroups: persistHistory } : {}),
      },
    });
    // 任务状态同步：填空完成 → 任务 COMPLETED；仅保存进度 → 保持 IN_PROGRESS
    if (completed) {
      await prisma.task.update({ where: { id: session.taskId }, data: { status: 'COMPLETED' } });
      // 生成训练历史记录（每次短语填空完成一条）
      try {
        const task = await prisma.task.findUnique({ where: { id: session.taskId }, select: { specialType: true } });
        const stats: { wordsCorrect: number; wordsWrong: number; clozeCorrect: number; clozeTotal: number } =
          (session.stats as any) || { wordsCorrect: 0, wordsWrong: 0, clozeCorrect: 0, clozeTotal: 0 };
        const total = session.total || 0;
        const correct = stats.wordsCorrect || 0;
        const wrong = stats.wordsWrong || 0;
        const durationSec = Math.round((Date.now() - new Date(session.createdAt).getTime()) / 1000);
        const rate = total > 0 ? Math.round((correct / Math.max(1, correct + wrong)) * 100) : 0;
        const summary = `完成 ${total} 词，答对 ${correct}，短语填空 ${stats.clozeCorrect}/${stats.clozeTotal || total}`;
        await prisma.specialTaskRecord.create({
          data: {
            taskId: session.taskId,
            studentId,
            specialType: task?.specialType || 'WORD',
            mode: session.mode,
            total,
            correct,
            wrong,
            clozeTotal: stats.clozeTotal || 0,
            clozeCorrect: stats.clozeCorrect || 0,
            durationSec: Math.max(1, durationSec),
            summary: `${summary}（正确率 ${rate}%）`,
          },
        });
      } catch (recordError) {
        console.error('单词训练记录生成失败:', recordError);
      }
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

async function loadWords(ids: string[]): Promise<Array<{ id: string; word: string; phonetic: string; pos: string; meaning: string }>> {
  if (!ids.length) return [];
  const rows = await prisma.word.findMany({ where: { id: { in: ids } } });
  // 保持组内顺序
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => {
      const w = map.get(id);
      return w ? { id: w.id, word: w.word, phonetic: w.phonetic, pos: w.pos || "", meaning: w.meaning } : null;
    })
    .filter((x): x is { id: string; word: string; phonetic: string; pos: string; meaning: string } => x !== null);
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
