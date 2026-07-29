import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

/**
 * 电子答题专区（EXAM_PAPER 模式）
 * 学员从题库组卷任务进入，按题型作答，提交后由后端规则引擎 + sympy 微服务批改。
 *
 * 设计原则（阶段 D「规则引擎优先」）：
 * - 客观题（选择/判断/填空）即时规则批改，0 成本
 * - 公式题：LaTeX 纯文本输入 + 调用后端 sympy 微服务做等价判断
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
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
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">答题完成</h1>
            <p className="text-gray-600">
              得分 <span className="text-2xl font-bold text-blue-600">{result.totalScore}</span> /{' '}
              {result.maxScore}（正确 {result.correctCount}/{result.total} 题）
            </p>
            <p className={`mt-2 font-medium ${result.passed ? 'text-green-600' : 'text-amber-600'}`}>
              {result.passed ? '恭喜，达到及格线！' : '未达及格线，继续加油！'}
            </p>
            {result.results.some((r) => r.needsGrading) && (
              <p className="mt-2 text-sm text-gray-500">
                标注「待批改」的题目将由老师 / AI 后续评定。
              </p>
            )}
          </div>

          <div className="space-y-3">
            {result.results.map((r, i) => {
              const q = exam.questions.find((x) => x.id === r.questionId);
              const badge =
                r.isCorrect === true
                  ? { cls: 'bg-green-100 text-green-700', text: '正确' }
                  : r.isCorrect === false
                  ? { cls: 'bg-red-100 text-red-700', text: '错误' }
                  : { cls: 'bg-amber-100 text-amber-700', text: '待批改' };
              return (
                <div key={r.questionId} className="bg-white rounded-lg shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        第 {i + 1} 题
                        {q && <span className="ml-2 text-gray-400">（{TYPE_LABELS[q.type] || q.type}）</span>}
                      </p>
                      {q && (
                        <p className="mt-1 text-sm text-gray-700 line-clamp-2">{stripLatex(q.stem)}</p>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                      得分 {r.score} / {r.maxScore}
                    </span>
                    {r.correctAnswer && (
                      <span className="text-gray-600">参考答案：{r.correctAnswer}</span>
                    )}
                  </div>
                  {r.analysis && <p className="mt-1 text-xs text-gray-500">{r.analysis}</p>}
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
    };
    reader.readAsDataURL(file);
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
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-3xl mx-auto px-4">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate('/student/tasks')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← 返回
          </button>
          <div className="text-sm text-gray-600">
            {exam.subject} · 第 {currentIndex + 1}/{total} 题
          </div>
          <div className="text-sm text-gray-400">满分 {exam.questions.reduce((s, q) => s + q.score, 0)}</div>
        </div>

        {/* 进度条 */}
        <div className="w-full h-2 bg-gray-200 rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* 题目卡片 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">
              {TYPE_LABELS[question.type] || question.type}
            </span>
            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">
              {question.score} 分
            </span>
            {question.knowledgePoints.length > 0 && (
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-xs">
                {question.knowledgePoints.join('、')}
              </span>
            )}
          </div>

          <h2 className="text-lg font-medium text-gray-900 whitespace-pre-wrap leading-relaxed">
            {question.stem}
          </h2>

          {/* 答题输入区 */}
          <div className="mt-5">
            <AnswerInput
              question={question}
              value={currentAnswer?.answerData}
              photo={photoMap[question.id]}
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
            className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 disabled:opacity-40 hover:bg-gray-50"
          >
            上一题
          </button>
          {isLast ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 rounded-lg bg-blue-600 text-white disabled:bg-gray-400"
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
  onChange,
  onPhoto,
}: {
  question: ExamQuestion;
  value?: Record<string, unknown>;
  photo?: string;
  onChange: (answerData: Record<string, unknown>, inputMethod: string) => void;
  onPhoto: (file: File) => void;
}) {
  const options: string[] = Array.isArray(question.options) ? question.options : [];

  // 拍照上传兜底（所有题型通用）
  const PhotoFallback = () => (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
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
      {photo && (
        <img src={photo} alt="作答图片" className="mt-2 max-h-40 rounded border border-gray-200" />
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
                    checked ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-medium text-gray-500">{letter}.</span>
                  <span className="text-gray-800">{opt}</span>
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
                    checked ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-medium text-gray-500">{letter}.</span>
                  <span className="text-gray-800">{opt}</span>
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
                val === true ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              ✓ 正确
            </button>
            <button
              type="button"
              onClick={() => onChange({ value: false }, 'click')}
              className={`flex-1 py-4 rounded-lg border text-lg font-medium transition-colors ${
                val === false ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-300 hover:bg-gray-50'
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
          <input
            type="text"
            value={(value?.text as string) || ''}
            onChange={(e) => onChange({ text: e.target.value }, 'keyboard')}
            placeholder="请输入答案"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <PhotoFallback />
        </div>
      );

    case 'FORMULA':
      return (
        <div>
          <input
            type="text"
            value={(value?.latex as string) || ''}
            onChange={(e) => onChange({ latex: e.target.value }, 'formula')}
            placeholder="输入 LaTeX，例如 \frac{1}{2}"
            className="w-full px-4 py-3 font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-500">
            公式题：输入 LaTeX 表达式，提交后由公式验证服务判断是否与标准答案等价。
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
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
