import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';
import { LatexText, FormulaEditor } from '../../components/common/MathFormula';

/**
 * 电子答题专区（EXAM_PAPER 模式）
 * 学员从题库组卷任务进入，按题型作答，提交后由后端规则引擎 + sympy 微服务批改。
 *
 * 设计原则（阶段 D「规则引擎优先」）：
 * - 客观题（选择/判断/填空）即时规则批改，0 成本
 * - 公式题/含公式填空：MathLive 所见即所得编辑器 + 后端 sympy 微服务等价判断
 * - 主观/几何/函数/排序/连线：提交后标记「待批改」，不依赖商业 SDK
 * - 所有题型均提供「拍照上传」兜底
 */

interface ExamQuestion {
  id: string;
  type: string;
  stem: string;
  options: string[] | null;
  difficulty: number;
  knowledgePoints: string[];
  score: number;
}

interface ExamLoadData {
  sessionId: string;
  taskId: string;
  title: string;
  subject: string;
  source: 'PAPER' | 'RANDOM';
  total: number;
  questions: ExamQuestion[];
}

interface GradeResultItem {
  questionId: string;
  isCorrect: boolean | null;
  score: number;
  maxScore: number;
  correctAnswer?: string;
  analysis?: string;
  needsGrading?: boolean;
  method?: string;
}

interface GradeResult {
  results: GradeResultItem[];
  totalScore: number;
  maxScore: number;
  correctCount: number;
  total: number;
  passed: boolean;
}

type AnswerValue = {
  answerData: Record<string, unknown>;
  inputMethod: string;
  timeSpent: number;
};

const TYPE_LABELS: Record<string, string> = {
  CHOICE: '单选题',
  MULTIPLE_CHOICE: '多选题',
  JUDGE: '判断题',
  FILL: '填空题',
  ESSAY: '解答题',
  FORMULA: '公式题',
  GEOMETRY: '几何题',
  GRAPHING: '函数作图',
  PROOF: '证明题',
  SORTING: '排序题',
  MATCHING: '连线题',
};

const LETTERS = 'ABCDEFGH';

export default function AnswerZone() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exam, setExam] = useState<ExamLoadData | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [photoMap, setPhotoMap] = useState<Record<string, string>>({}); // questionId -> dataURL 缩略图
  const [recognizingId, setRecognizingId] = useState<string | null>(null); // 正在视觉识别的题目
  const [recognizeTips, setRecognizeTips] = useState<Record<string, string>>({}); // 每题识别结果提示
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!taskId) return;
    const load = async () => {
      try {
        const res = await request.get(`/student/answer-zone/${taskId}`);
        setExam(res.data as ExamLoadData);
      } catch (err: unknown) {
        setError(getErrorMessage(err, '加载题目失败'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [taskId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#111722]">
        <div className="text-[#92a4c9]">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#111722] p-6">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/student/tasks')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            返回任务中心
          </button>
        </div>
      </div>
    );
  }

  if (!exam) return null;

  // ===== 提交后：展示批改结果 =====
  if (result) {
    return (
      <div className="min-h-screen bg-[#111722] py-8">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-[#232f48] rounded-lg shadow-sm p-6 mb-6 text-center">
            <h1 className="text-2xl font-bold text-white mb-2">答题完成</h1>
            <p className="text-[#92a4c9]">
              得分 <span className="text-2xl font-bold text-blue-400">{result.totalScore}</span> /{' '}
              {result.maxScore}（正确 {result.correctCount}/{result.total} 题）
            </p>
            <p className={`mt-2 font-medium ${result.passed ? 'text-green-400' : 'text-amber-400'}`}>
              {result.passed ? '恭喜，达到及格线！' : '未达及格线，继续加油！'}
            </p>
            {result.results.some((r) => r.needsGrading) && (
              <p className="mt-2 text-sm text-[#5b6b8c]">
                标注「待批改」的题目将由老师 / AI 后续评定。
              </p>
            )}
          </div>

          <div className="space-y-3">
            {result.results.map((r, i) => {
              const q = exam.questions.find((x) => x.id === r.questionId);
              const badge =
                r.isCorrect === true
                  ? { cls: 'bg-green-500/15 text-green-300', text: '正确' }
                  : r.isCorrect === false
                  ? { cls: 'bg-red-500/15 text-red-300', text: '错误' }
                  : { cls: 'bg-amber-500/15 text-amber-300', text: '待批改' };
              return (
                <div key={r.questionId} className="bg-[#232f48] rounded-lg shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">
                        第 {i + 1} 题
                        {q && <span className="ml-2 text-[#5b6b8c]">（{TYPE_LABELS[q.type] || q.type}）</span>}
                      </p>
                      {q && (
                        <p className="mt-1 text-sm text-[#c3cfe6] line-clamp-2">{stripLatex(q.stem)}</p>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-[#5b6b8c]">
                      得分 {r.score} / {r.maxScore}
                    </span>
                    {r.correctAnswer && (
                      <span className="text-[#92a4c9]">参考答案：{r.correctAnswer}</span>
                    )}
                  </div>
                  {r.analysis && <p className="mt-1 text-xs text-[#5b6b8c]">{r.analysis}</p>}
                </div>
              );
            })}
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/student/tasks')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg"
            >
              返回任务中心
            </button>
          </div>
        </div>
      </div>
    );
  }

  const question = exam.questions[currentIndex];
  const total = exam.questions.length;
  const isLast = currentIndex === total - 1;
  const currentAnswer = answers[question.id];

  const setAnswerData = (questionId: string, answerData: Record<string, unknown>, inputMethod: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        answerData,
        inputMethod,
        timeSpent: Math.round((Date.now() - startedAt.current) / 1000),
      },
    }));
  };

  const handlePhoto = (questionId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPhotoMap((prev) => ({ ...prev, [questionId]: dataUrl }));
      setAnswerData(questionId, { imageData: dataUrl, text: (answers[questionId]?.answerData.text as string) || '' }, 'photo');
      void tryRecognize(questionId, file);
    };
    reader.readAsDataURL(file);
  };

  /** 调用非本地视觉模型识别图片内容，回填到答案文本（失败则保留图片兜底） */
  const tryRecognize = async (questionId: string, file: File) => {
    setRecognizingId(questionId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await request.post<{ success: boolean; data: { text: string } }>(
        '/student/vision/recognize',
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      const text = res?.data?.text;
      if (text) {
        setAnswers((p) => {
          const prev = p[questionId];
          return {
            ...p,
            [questionId]: {
              answerData: { ...(p[questionId]?.answerData || {}), text, imageData: prev?.answerData.imageData },
              inputMethod: prev?.inputMethod || 'photo',
              timeSpent: prev?.timeSpent || 0,
            },
          };
        });
        setRecognizeTips((p) => ({ ...p, [questionId]: '已通过视觉模型识别图片内容并自动填入答案' }));
      } else {
        setRecognizeTips((p) => ({ ...p, [questionId]: '视觉识别未返回文本，图片将交由老师批改' }));
      }
    } catch (e) {
      setRecognizeTips((p) => ({
        ...p,
        [questionId]: getErrorMessage(e, '未配置视觉识别模型，图片将交由老师批改'),
      }));
    } finally {
      setRecognizingId(null);
    }
  };

  const handleSubmit = async () => {
    if (!exam) return;
    // 收集所有已作答（含拍照兜底）
    const payloadAnswers = exam.questions.map((q) => {
      const a = answers[q.id];
      return {
        questionId: q.id,
        answerData: a?.answerData || {},
        inputMethod: a?.inputMethod || 'keyboard',
        timeSpent: a?.timeSpent || 0,
      };
    });
    setSubmitting(true);
    try {
      const res = await request.post(`/student/answer-zone/${exam.sessionId}/submit`, {
        answers: payloadAnswers,
      });
      setResult(res.data as GradeResult);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '提交失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111722] py-6">
      <div className="max-w-3xl mx-auto px-4">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate('/student/tasks')}
            className="text-sm text-[#5b6b8c] hover:text-[#c3cfe6]"
          >
            ← 返回
          </button>
          <div className="text-sm text-[#92a4c9]">
            {exam.subject} · 第 {currentIndex + 1}/{total} 题
          </div>
          <div className="text-sm text-[#5b6b8c]">满分 {exam.questions.reduce((s, q) => s + q.score, 0)}</div>
        </div>

        {/* 进度条 */}
        <div className="w-full h-2 bg-[#324467] rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* 题目卡片 */}
        <div className="bg-[#232f48] rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 text-xs font-medium">
              {TYPE_LABELS[question.type] || question.type}
            </span>
            <span className="px-2 py-0.5 rounded bg-[#1a2332] text-[#92a4c9] text-xs">
              {question.score} 分
            </span>
            {question.knowledgePoints.length > 0 && (
              <span className="px-2 py-0.5 rounded bg-[#1a2332] text-[#5b6b8c] text-xs">
                {question.knowledgePoints.join('、')}
              </span>
            )}
          </div>

          <h2 className="text-lg font-medium text-white whitespace-pre-wrap leading-relaxed">
            <LatexText text={question.stem} />
          </h2>

          {/* 答题输入区 */}
          <div className="mt-5">
            <AnswerInput
              question={question}
              value={currentAnswer?.answerData}
              photo={photoMap[question.id]}
              recognizing={recognizingId === question.id}
              recognizeTip={recognizeTips[question.id]}
              onChange={(answerData, inputMethod) => setAnswerData(question.id, answerData, inputMethod)}
              onPhoto={(file) => handlePhoto(question.id, file)}
            />
          </div>
        </div>

        {/* 底部导航 */}
        <div className="mt-6 flex justify-between">
          <button
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="px-5 py-2 rounded-lg border border-[#324467] text-[#c3cfe6] disabled:opacity-40 hover:bg-[#1a2332]"
          >
            上一题
          </button>
          {isLast ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 rounded-lg bg-blue-600 text-white disabled:bg-[#324467] disabled:text-[#5b6b8c]"
            >
              {submitting ? '提交中...' : '提交整卷'}
            </button>
          ) : (
            <button
              onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              下一题
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ 答题输入组件（按题型分发） ============

function AnswerInput({
  question,
  value,
  photo,
  recognizing,
  recognizeTip,
  onChange,
  onPhoto,
}: {
  question: ExamQuestion;
  value?: Record<string, unknown>;
  photo?: string;
  recognizing?: boolean;
  recognizeTip?: string;
  onChange: (answerData: Record<string, unknown>, inputMethod: string) => void;
  onPhoto: (file: File) => void;
}) {
  const options: string[] = Array.isArray(question.options) ? question.options : [];

  // 拍照上传兜底（所有题型通用）
  const PhotoFallback = () => (
    <div className="mt-4 pt-4 border-t border-[#324467]">
      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#324467] text-sm text-[#92a4c9] cursor-pointer hover:bg-[#1a2332]">
        <span className="material-symbols-outlined text-[18px]">photo_camera</span>
        拍照 / 上传图片（兜底）
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPhoto(f);
          }}
        />
      </label>

      {recognizing && (
        <div className="mt-2 flex items-center gap-2 text-xs text-blue-400">
          <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
          正在调用视觉模型识别图片内容...
        </div>
      )}

      {photo && (
        <img src={photo} alt="作答图片" className="mt-2 max-h-40 rounded border border-[#324467]" />
      )}

      {recognizeTip && !recognizing && (
        <p className="mt-2 text-xs text-[#5b6b8c]">{recognizeTip}</p>
      )}
    </div>
  );

  switch (question.type) {
    case 'CHOICE':
      return (
        <div>
          <div className="space-y-2">
            {options.map((opt, i) => {
              const letter = LETTERS[i];
              const checked = value?.selected === letter;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onChange({ selected: letter }, 'click')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                    checked ? 'border-blue-500 bg-blue-500/10' : 'border-[#324467] hover:bg-[#1a2332]'
                  }`}
                >
                  <span className="font-medium text-[#5b6b8c]">{letter}.</span>
                  <span className="text-[#e2e8f5]">{opt}</span>
                </button>
              );
            })}
          </div>
          <PhotoFallback />
        </div>
      );

    case 'MULTIPLE_CHOICE': {
      const selected: string[] = Array.isArray(value?.selected) ? (value?.selected as string[]) : [];
      const toggle = (letter: string) => {
        const next = selected.includes(letter)
          ? selected.filter((l) => l !== letter)
          : [...selected, letter];
        onChange({ selected: next }, 'click');
      };
      return (
        <div>
          <div className="space-y-2">
            {options.map((opt, i) => {
              const letter = LETTERS[i];
              const checked = selected.includes(letter);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggle(letter)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                    checked ? 'border-blue-500 bg-blue-500/10' : 'border-[#324467] hover:bg-[#1a2332]'
                  }`}
                >
                  <span className="font-medium text-[#5b6b8c]">{letter}.</span>
                  <span className="text-[#e2e8f5]">{opt}</span>
                </button>
              );
            })}
          </div>
          <PhotoFallback />
        </div>
      );
    }

    case 'JUDGE': {
      const val = value?.value as boolean | undefined;
      return (
        <div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onChange({ value: true }, 'click')}
              className={`flex-1 py-4 rounded-lg border text-lg font-medium transition-colors ${
                val === true ? 'border-green-500 bg-green-500/10 text-green-300' : 'border-[#324467] hover:bg-[#1a2332]'
              }`}
            >
              ✓ 正确
            </button>
            <button
              type="button"
              onClick={() => onChange({ value: false }, 'click')}
              className={`flex-1 py-4 rounded-lg border text-lg font-medium transition-colors ${
                val === false ? 'border-red-500 bg-red-500/10 text-red-300' : 'border-[#324467] hover:bg-[#1a2332]'
              }`}
            >
              ✗ 错误
            </button>
          </div>
          <PhotoFallback />
        </div>
      );
    }

    case 'FILL':
      return (
        <div>
          {/* 填空：文本或公式输入（含公式的答案切到公式编辑器，判对走 sympy 等价） */}
          <input
            type="text"
            value={(value?.text as string) || ''}
            onChange={(e) =>
              onChange({ ...(value || {}), text: e.target.value }, 'keyboard')
            }
            placeholder="请输入答案（可切换到下方公式输入）"
            className="w-full px-4 py-3 border border-[#324467] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="mt-2">
            <FormulaEditor
              value={(value?.latex as string) || ''}
              placeholder="公式填空：用公式编辑器输入（如分数、根号）"
              onChange={(latex) => onChange({ ...(value || {}), latex }, 'formula')}
            />
          </div>
          <PhotoFallback />
        </div>
      );

    case 'FORMULA':
      return (
        <div>
          <FormulaEditor
            value={(value?.latex as string) || ''}
            placeholder="输入公式，如 \frac{1}{2}"
            onChange={(latex) => onChange({ latex }, 'formula')}
          />
          <p className="mt-1 text-xs text-[#5b6b8c]">
            使用公式编辑器输入，提交后由公式验证服务判断是否与标准答案等价。
          </p>
          <PhotoFallback />
        </div>
      );

    // 主观 / 几何 / 函数 / 排序 / 连线：自由文本 + 拍照兜底，提交后待批改
    default:
      return (
        <div>
          <textarea
            value={(value?.text as string) || ''}
            onChange={(e) => onChange({ text: e.target.value }, 'keyboard')}
            placeholder="请输入你的解答（可配合下方拍照上传）"
            rows={5}
            className="w-full px-4 py-3 border border-[#324467] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <PhotoFallback />
        </div>
      );
  }
}

/** 去除题干里的 LaTeX 标记，预览用 */
function stripLatex(s: string): string {
  return (s || '').replace(/\$/g, '').replace(/\\frac|\\sqrt|\\cdot|\\times/g, '');
}
