import { prisma } from '../lib/prisma';
import { verifyFormula } from './formulaVerifyService';
import { studentTrainingService } from './studentTrainingService';
import { serializeQuestion } from './questionBankService';
import { logger } from '../middlewares/logger';

/**
 * 电子答题专区（EXAM_PAPER 模式）服务
 *
 * - loadExamPaper: 学员进入组卷任务，确保训练会话并返回题目内容（绝不返回答案）
 * - gradeExamPaper: 统一批改——客观题规则引擎、公式题接入 sympy 微服务、主观/几何/函数题标记待批改
 *
 * 设计原则（阶段 D「规则引擎优先」）：
 * 不依赖任何需要商业授权的 SDK（GeoGebra/Desmos/MyScript）。
 * 公式题通过已建好的 Python(sympy) 微服务做代数等价判断，微服务不可用时降级为待批改。
 */

export interface ExamQuestionDTO {
  id: string;
  type: string;
  stem: string;
  options: unknown;
  difficulty: number;
  knowledgePoints: string[];
  score: number;
}

export interface ExamPaperLoadResult {
  sessionId: string;
  taskId: string;
  title: string;
  subject: string;
  source: 'PAPER' | 'RANDOM';
  total: number;
  questions: ExamQuestionDTO[];
}

export interface StudentAnswerInput {
  questionId: string;
  /** 按题型组织的结构化答案：{ selected, value, text, latex, imageData } 等 */
  answerData: any;
  inputMethod?: string;
  timeSpent?: number;
}

export interface ExamGradeResultItem {
  questionId: string;
  /** true=正确, false=错误, null=待批改（主观/几何/函数等） */
  isCorrect: boolean | null;
  score: number;
  maxScore: number;
  correctAnswer?: string;
  analysis?: string;
  needsGrading?: boolean;
  method?: string;
}

export interface ExamGradeResult {
  results: ExamGradeResultItem[];
  totalScore: number;
  maxScore: number;
  correctCount: number;
  total: number;
  passed: boolean;
}

const DEFAULT_PER_QUESTION_SCORE = 10;

/**
 * 学员进入组卷任务：确保会话并返回题目内容（不含答案）
 */
export async function loadExamPaper(taskId: string, studentId: string): Promise<ExamPaperLoadResult> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error('任务不存在');
  if (task.studentId !== studentId) throw new Error('无权访问此任务');

  const config: any = task.config || {};
  if (config.mode !== 'EXAM_PAPER') throw new Error('该任务不是题库组卷任务');

  const questionIds: string[] = config.questionIds || [];
  if (questionIds.length === 0) throw new Error('组卷任务没有题目');

  // 确保训练会话（startTraining 对 EXAM_PAPER 幂等，已存在则直接返回）
  const session = await studentTrainingService.startTraining(taskId, studentId);

  const found = await prisma.question.findMany({ where: { id: { in: questionIds } } });
  const byId = new Map(found.map((q) => [q.id, q]));
  const scores: Record<string, number> = config.scores || {};

  const questions: ExamQuestionDTO[] = questionIds
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => {
      const s = serializeQuestion(q);
      return {
        id: q.id,
        type: q.type,
        stem: (s.stem as string) || '',
        options: s.options ?? null,
        difficulty: q.difficulty,
        knowledgePoints: q.knowledgePoints,
        score: scores[q.id] ?? DEFAULT_PER_QUESTION_SCORE,
      };
    });

  return {
    sessionId: session.id,
    taskId,
    title: task.title,
    subject: config.subject || '',
    source: config.source || 'PAPER',
    total: questions.length,
    questions,
  };
}

/**
 * 提交并批改整卷
 */
export async function gradeExamPaper(
  sessionId: string,
  studentId: string,
  answers: StudentAnswerInput[]
): Promise<ExamGradeResult> {
  const session = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    include: { task: true },
  });
  if (!session) throw new Error('训练会话不存在');
  if (session.studentId !== studentId) throw new Error('无权访问此会话');
  if (session.status !== 'ACTIVE' && session.status !== 'PAUSED') throw new Error('会话未激活');

  const config: any = (session.task as any).config || {};
  if (config.mode !== 'EXAM_PAPER') throw new Error('该会话不是题库组卷任务');

  const questionIds = answers.map((a) => a.questionId);
  const found = await prisma.question.findMany({ where: { id: { in: questionIds } } });
  const byId = new Map(found.map((q) => [q.id, q]));
  const scores: Record<string, number> = config.scores || {};

  const items: ExamGradeResultItem[] = [];
  let totalScore = 0;
  let maxScore = 0;
  let correctCount = 0;

  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    const max = scores[q.id] ?? DEFAULT_PER_QUESTION_SCORE;
    maxScore += max;

    const graded = await gradeOne(q, a);
    // 补题目解析（Question.analysis 独立字段 / content.analysis 兼容）：答对答错都展示，加深理解
    const qAnalysis =
      q.analysis || (q.content && typeof q.content === 'object' && (q.content as { analysis?: string }).analysis) || null;
    if (qAnalysis) {
      graded.analysis = graded.analysis ? `${graded.analysis}｜${qAnalysis}` : qAnalysis;
    }
    const isCorrect = graded.isCorrect;
    const item: ExamGradeResultItem = {
      questionId: q.id,
      isCorrect,
      score: isCorrect === true ? max : 0,
      maxScore: max,
      correctAnswer: graded.correctAnswer,
      analysis: graded.analysis,
      needsGrading: graded.needsGrading,
      method: graded.method,
    };
    items.push(item);
    if (isCorrect === true) {
      correctCount++;
      totalScore += max;
    }

    await prisma.answer.create({
      data: {
        sessionId,
        questionId: q.id,
        studentAnswer: graded.studentAnswerRaw,
        isCorrect: isCorrect === true,
        timeSpent: a.timeSpent ?? 0,
        answerData: {
          ...(a.answerData || {}),
          inputMethod: a.inputMethod,
          score: isCorrect === true ? max : 0,
          maxScore: max,
          correctAnswer: graded.correctAnswer,
          analysis: graded.analysis,
          needsGrading: graded.needsGrading || false,
          method: graded.method,
        } as any,
      },
    });
  }

  // 标记会话与任务完成
  await prisma.trainingSession.update({
    where: { id: sessionId },
    data: { status: 'COMPLETED', progress: 100 },
  });
  await prisma.task.update({ where: { id: session.taskId }, data: { status: 'COMPLETED' } });

  // 专项攻克任务历史记录（非单词专项：整卷提交完成生成一条；单词走 wordTaskController）
  try {
    const task = await prisma.task.findUnique({ where: { id: session.taskId }, select: { specialType: true } });
    if (task?.specialType && task.specialType !== 'WORD') {
      const durationSec = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000);
      const rate = items.length > 0 ? Math.round((correctCount / items.length) * 100) : 0;
      await prisma.specialTaskRecord.create({
        data: {
          taskId: session.taskId,
          studentId: session.studentId,
          specialType: task.specialType,
          mode: 'EXAM_PAPER',
          total: items.length,
          correct: correctCount,
          wrong: Math.max(0, items.length - correctCount),
          durationSec: Math.max(1, durationSec),
          summary: `完成 ${items.length} 题，答对 ${correctCount}，得分 ${totalScore}/${maxScore}（正确率 ${rate}%）`,
        },
      });
    }
  } catch (recordError) {
    console.error('专项训练记录生成失败:', recordError);
  }

  logger.info(
    `组卷任务批改完成: 会话 ${sessionId}, 正确 ${correctCount}/${items.length}, 得分 ${totalScore}/${maxScore}`
  );

  return {
    results: items,
    totalScore,
    maxScore,
    correctCount,
    total: items.length,
    passed: maxScore > 0 && totalScore >= maxScore * 0.6,
  };
}

// ============ 单题批改 ============

interface GradedResult {
  isCorrect: boolean | null;
  correctAnswer?: string;
  analysis?: string;
  needsGrading?: boolean;
  method?: string;
  studentAnswerRaw: string;
}

async function gradeOne(q: any, a: StudentAnswerInput): Promise<GradedResult> {
  const type = q.type as string;
  const ad = a.answerData || {};

  switch (type) {
    case 'CHOICE': {
      const expected = normalizeExpectedChoice(q.answer);
      const selected = asStringArray(ad.selected);
      const correct = gradeChoiceSet(selected, expected, false);
      return {
        isCorrect: correct,
        correctAnswer: expected.join(' / '),
        analysis: correct ? '' : `正确答案：${expected.join(' / ')}`,
        studentAnswerRaw: selected.join(''),
      };
    }
    case 'MULTIPLE_CHOICE': {
      const expected = normalizeExpectedChoice(q.answer);
      const selected = asStringArray(ad.selected);
      const correct = gradeChoiceSet(selected, expected, true);
      return {
        isCorrect: correct,
        correctAnswer: expected.join('、'),
        analysis: correct ? '' : `正确答案：${expected.join('、')}`,
        studentAnswerRaw: JSON.stringify(selected),
      };
    }
    case 'JUDGE': {
      const exp = normalizeBool(q.answer);
      const studentVal = typeof ad.value === 'boolean' ? ad.value : normalizeBool(String(ad.value));
      const correct = exp !== null && studentVal === exp;
      return {
        isCorrect: correct,
        correctAnswer: exp === true ? '正确' : '错误',
        analysis: correct ? '' : `正确答案：${exp === true ? '正确' : '错误'}`,
        studentAnswerRaw: String(ad.value),
      };
    }
    case 'FILL': {
      const text = String(ad.text ?? '').trim();
      const latex = String(ad.latex ?? '').trim();
      // 含公式的填空（如分数/根号答案）：优先走 sympy 等价判断；否则文本比对
      if (latex) {
        const expectedLatex = (q.answerConfig as any)?.expectedLatex || q.answer;
        if (expectedLatex) {
          const r = await gradeFormula(latex, expectedLatex);
          return {
            isCorrect: r.isCorrect,
            correctAnswer: expectedLatex,
            method: r.method,
            needsGrading: r.method === 'service_down',
            analysis:
              r.method === 'service_down'
                ? '公式验证服务暂不可用，已标记为待批改'
                : r.isCorrect
                  ? ''
                  : `正确答案：${expectedLatex}`,
            studentAnswerRaw: latex,
          };
        }
      }
      const correct = gradeFill(text, q.answer);
      return {
        isCorrect: correct,
        correctAnswer: q.answer,
        analysis: correct ? '' : `正确答案：${q.answer}`,
        studentAnswerRaw: text,
      };
    }
    case 'FORMULA': {
      const studentLatex = String(ad.latex ?? '').trim();
      const expectedLatex = (q.answerConfig as any)?.expectedLatex || q.answer;
      if (!expectedLatex) {
        return {
          isCorrect: null,
          needsGrading: true,
          analysis: '未配置标准答案，已标记为待批改',
          studentAnswerRaw: studentLatex,
        };
      }
      const r = await gradeFormula(studentLatex, expectedLatex);
      return {
        isCorrect: r.isCorrect,
        correctAnswer: expectedLatex,
        method: r.method,
        needsGrading: r.method === 'service_down',
        analysis:
          r.method === 'service_down'
            ? '公式验证服务暂不可用，已标记为待批改'
            : r.isCorrect
            ? ''
            : `标准答案：${expectedLatex}`,
        studentAnswerRaw: studentLatex,
      };
    }
    // 排序题：比对期望顺序（支持「选项内容」或「序号（1 基）」两种标准答案格式）
    case 'SORTING': {
      const studentOrder = Array.isArray(ad.order)
        ? ad.order.map((x: unknown) => String(x).trim()).filter(Boolean)
        : [];
      const expectedRaw = String(q.answer || '').trim();
      const expected = expectedRaw
        .split(/[,，;；、|]/)
        .map((x) => x.trim())
        .filter(Boolean);
      let correct = false;
      if (expected.length > 0 && studentOrder.length === expected.length) {
        const mapped = expected.every((e) => /^\d+$/.test(e))
          ? expected.map((e) => {
              const idx = parseInt(e, 10) - 1;
              const opts = Array.isArray((q.answerConfig as any)?.options) ? (q.answerConfig as any).options : (q as any).options;
              return Array.isArray(opts) && opts[idx] ? String(opts[idx]).trim() : e;
            })
          : expected;
        correct = mapped.every((e, i) => e === studentOrder[i]);
      }
      return {
        isCorrect: studentOrder.length === 0 ? null : correct,
        needsGrading: studentOrder.length === 0,
        correctAnswer: expectedRaw,
        analysis: correct ? '' : `标准顺序：${expectedRaw}`,
        studentAnswerRaw: studentOrder.join(' → '),
      };
    }
    // 连线题：比对左→右映射（顺序无关）
    case 'MATCHING': {
      const pairs: Array<{ left: string; right: string }> = Array.isArray(ad.pairs)
        ? (ad.pairs as Array<{ left: string; right: string }>).filter(
            (p) => p && p.left != null && p.right != null
          )
        : [];
      const expectedRaw = String(q.answer || '').trim();
      const expectedMap = new Map<string, string>();
      for (const part of expectedRaw.split(/[;；,，]/)) {
        const m = part.match(/^\s*(.+?)\s*(?:[-—→:：])\s*(.+?)\s*$/);
        if (m) expectedMap.set(m[1].trim(), m[2].trim());
      }
      let correct = false;
      if (expectedMap.size > 0 && pairs.length === expectedMap.size) {
        const studentMap = new Map(pairs.map((p) => [String(p.left).trim(), String(p.right).trim()]));
        let allMatch = true;
        for (const [l, r] of expectedMap) {
          if (studentMap.get(l) !== r) {
            allMatch = false;
            break;
          }
        }
        correct = allMatch;
      }
      const joined = pairs.map((p) => `${p.left}—${p.right}`).join('；');
      return {
        isCorrect: pairs.length === 0 ? null : correct,
        needsGrading: pairs.length === 0,
        correctAnswer: expectedRaw,
        analysis: correct ? '' : `标准配对：${expectedRaw}`,
        studentAnswerRaw: joined,
      };
    }
    // 证明题：分步输入 → 拼接为文本，标记待批改（老师 / AI 评定）
    case 'PROOF': {
      const steps: Array<{ text?: string; latex?: string }> = Array.isArray(ad.steps)
        ? (ad.steps as Array<{ text?: string; latex?: string }>)
        : [];
      const text = steps
        .map((s, i) => `${i + 1}. ${s.text || ''}${s.latex ? ` ${s.latex}` : ''}`.trim())
        .filter(Boolean)
        .join('\n');
      const raw = text || (ad.imageData ? '[拍照上传]' : '');
      return {
        isCorrect: null,
        needsGrading: true,
        correctAnswer: undefined,
        analysis: '已提交，等待老师 / AI 批改',
        studentAnswerRaw: raw,
      };
    }
    // 主观题 / 几何 / 函数：暂不支持自动批改，标记待批改
    default: {
      const raw = ad.imageData
        ? '[拍照上传]'
        : JSON.stringify(ad.text ?? ad.latex ?? '');
      return {
        isCorrect: null,
        needsGrading: true,
        correctAnswer: undefined,
        analysis: '已提交，等待老师 / AI 批改',
        studentAnswerRaw: raw,
      };
    }
  }
}

// ============ 工具 ============

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).toUpperCase().trim()).filter(Boolean);
  if (typeof v === 'string' && v) return [v.toUpperCase().trim()];
  return [];
}

function normalizeExpectedChoice(answer: string): string[] {
  const letters = (answer || '').toUpperCase().match(/[A-Z]/g) || [];
  return Array.from(new Set(letters));
}

function gradeChoiceSet(selected: string[], expected: string[], multi: boolean): boolean {
  if (multi) {
    return selected.length === expected.length && expected.every((e) => selected.includes(e));
  }
  return selected.length === 1 && expected.includes(selected[0]);
}

function normalizeBool(answer: string): boolean | null {
  const a = (answer || '').trim().toLowerCase();
  if (['对', '正确', '√', 't', 'true', '1', '是', 'yes'].includes(a)) return true;
  if (['错', '错误', '×', 'x', 'f', 'false', '0', '否', 'no'].includes(a)) return false;
  return null;
}

function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function gradeFill(student: string, expected: string): boolean {
  const cands = (expected || '')
    .split(/[|、/，,，]/)
    .map(normalizeText)
    .filter(Boolean);
  return cands.includes(normalizeText(student));
}

async function gradeFormula(
  studentLatex: string,
  expectedLatex: string
): Promise<{ isCorrect: boolean | null; method?: string }> {
  if (!studentLatex) return { isCorrect: false, method: 'empty' };
  const r = await verifyFormula(studentLatex, expectedLatex);
  if (r === null) return { isCorrect: null, method: 'service_down' }; // 微服务不可用 → 待批改
  return { isCorrect: r.equivalent, method: r.method };
}
