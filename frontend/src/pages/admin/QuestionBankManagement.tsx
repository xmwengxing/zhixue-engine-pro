import { useState, useEffect, useCallback, useRef } from 'react';
import request, { type ApiResponse } from '../../utils/request';
import { getErrorMessage } from '../../types/error';

/**
 * 题库管理页面（管理员端）
 *
 * 功能：
 * - 按科目分类浏览试卷与题目
 * - 手动创建试卷 / 题目
 * - 上传试卷文件（docx/pdf/图片/txt/md）→ OCR/解析 + AI 识别 → 自动入库
 * - 试卷详情：查看/移除题目、发布试卷
 */

// ==================== 类型定义 ====================

interface Paper {
  id: string;
  subject: string;
  title: string;
  grade?: string | null;
  term?: string | null;
  version?: string | null;
  sourceFile?: string | null;
  status: 'DRAFT' | 'NORMALIZED' | 'PUBLISHED';
  paperType?: 'UNIT' | 'MIDTERM' | 'FINAL' | 'ZHONGKAO' | 'GAOKAO' | null;
  textbookId?: string | null;
  textbookName?: string | null;
  unitIds?: string[];
  createdAt: string;
  _count?: { items: number };
}

interface Question {
  id: string;
  stem: string;
  type: string;
  answer: string;
  difficulty: number;
  knowledgePoints: string[];
  answerType?: string | null;
  answerConfig?: Record<string, unknown> | null;
  unitIds?: string[];
  textbookId?: string | null;
  createdAt: string;
}

interface PaperItem {
  id: string;
  order: number;
  score: number;
  question: Question;
}

interface PaperDetail extends Paper {
  items: PaperItem[];
}

interface ImportJob {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  fileName: string;
  error?: string | null;
  paperId?: string | null;
  result?: { count?: number } | null;
}

interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** AI 难度归类后台任务状态（P2） */
interface ClassifyJob {
  id: string;
  scope: string;
  subject?: string;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  total: number;
  processed: number;
  updated: number;
  lowConfidence: number;
  failed: number;
  error?: string;
}

// ==================== 常量 ====================

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

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: '草稿', cls: 'bg-[#324467] text-[#92a4c9]' },
  NORMALIZED: { text: '已识别', cls: 'bg-amber-500/20 text-amber-400' },
  PUBLISHED: { text: '已发布', cls: 'bg-green-500/20 text-green-400' },
};

const PAGE_SIZE = 10;

// 试卷类型（期中/期末/中考/高考等特殊归类，便于任务按类型调用）
const PAPER_TYPE_OPTIONS = [
  { value: 'UNIT', label: '单元练习' },
  { value: 'MIDTERM', label: '期中' },
  { value: 'FINAL', label: '期末' },
  { value: 'ZHONGKAO', label: '中考' },
  { value: 'GAOKAO', label: '高考' },
];
const PAPER_TYPE_LABELS: Record<string, string> = {
  UNIT: '单元练习',
  MIDTERM: '期中',
  FINAL: '期末',
  ZHONGKAO: '中考',
  GAOKAO: '高考',
};

function gradeLabel(grade?: string | null): string {
  if (!grade) return '';
  const map: Record<string, string> = { '7': '七年级', '8': '八年级', '9': '九年级' };
  return map[grade] || `${grade}年级`;
}
function termLabel(term?: string | null): string {
  return term === 'UP' ? '上' : term === 'DOWN' ? '下' : '';
}

// ==================== 主组件 ====================

const QuestionBankManagement = () => {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [activeSubject, setActiveSubject] = useState<string>('');
  const [view, setView] = useState<'papers' | 'questions'>('papers');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 试卷列表
  const [papers, setPapers] = useState<Paper[]>([]);
  const [paperTotal, setPaperTotal] = useState(0);
  const [paperPage, setPaperPage] = useState(1);

  // 题目列表
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionTotal, setQuestionTotal] = useState(0);
  const [questionPage, setQuestionPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');

  // 弹窗
  const [showCreatePaper, setShowCreatePaper] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [detailPaperId, setDetailPaperId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState<Question | 'new' | null>(null);

  // AI 难度归类（P2）
  const [showClassify, setShowClassify] = useState(false);
  const [classifyScope, setClassifyScope] = useState<'UNLABELED' | 'ALL'>('UNLABELED');
  const [classifyJob, setClassifyJob] = useState<ClassifyJob | null>(null);
  const [classifyStarting, setClassifyStarting] = useState(false);
  const classifyTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  // ---------- 数据加载 ----------

  useEffect(() => {
    (async () => {
      try {
        const res = await request.get<ApiResponse<{ subjects: string[] }>>(
          '/admin/question-bank/subjects'
        );
        const list = res.data.subjects || [];
        setSubjects(list);
        if (list.length > 0) setActiveSubject((prev) => prev || list[0]);
      } catch (e) {
        setError(getErrorMessage(e));
      }
    })();
  }, []);

  const loadPapers = useCallback(async () => {
    if (!activeSubject) return;
    try {
      const res = await request.get<ApiResponse<PagedResult<Paper>>>(
        `/admin/question-bank/papers?subject=${encodeURIComponent(activeSubject)}&page=${paperPage}&limit=${PAGE_SIZE}`
      );
      setPapers(res.data.items);
      setPaperTotal(res.data.total);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [activeSubject, paperPage]);

  const loadQuestions = useCallback(async () => {
    if (!activeSubject) return;
    try {
      const params = new URLSearchParams({
        subject: activeSubject,
        page: String(questionPage),
        limit: String(PAGE_SIZE),
      });
      if (typeFilter) params.set('type', typeFilter);
      const res = await request.get<ApiResponse<PagedResult<Question>>>(
        `/admin/question-bank/questions?${params.toString()}`
      );
      setQuestions(res.data.items);
      setQuestionTotal(res.data.total);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [activeSubject, questionPage, typeFilter]);

  useEffect(() => {
    void loadPapers();
  }, [loadPapers]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  // 切换科目时重置分页
  useEffect(() => {
    setPaperPage(1);
    setQuestionPage(1);
  }, [activeSubject]);

  // ---------- 试卷操作 ----------

  const handleDeletePaper = async (paper: Paper) => {
    if (!window.confirm(`确定删除试卷「${paper.title}」吗？（不会删除已入库的题目）`)) return;
    try {
      await request.delete<ApiResponse>(`/admin/question-bank/papers/${paper.id}`);
      flash('试卷已删除');
      void loadPapers();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handlePublishPaper = async (paper: Paper) => {
    try {
      await request.post<ApiResponse>(`/admin/question-bank/papers/${paper.id}/publish`);
      flash('试卷已发布，家长端可选用');
      void loadPapers();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  // ---------- AI 难度归类 ----------

  const startClassify = async () => {
    setClassifyStarting(true);
    try {
      const res = await request.post<ApiResponse<ClassifyJob>>('/admin/question-bank/classify', {
        scope: classifyScope,
        subject: activeSubject,
      });
      setClassifyJob(res.data);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setClassifyStarting(false);
    }
  };

  // 轮询归类任务进度
  useEffect(() => {
    if (classifyJob?.status !== 'RUNNING') {
      if (classifyTimer.current) {
        clearInterval(classifyTimer.current);
        classifyTimer.current = null;
      }
      return;
    }
    classifyTimer.current = setInterval(async () => {
      try {
        const res = await request.get<ApiResponse<ClassifyJob>>(
          `/admin/question-bank/classify/${classifyJob.id}`
        );
        setClassifyJob(res.data);
        if (res.data.status === 'DONE') {
          flash(
            `难度归类完成：共 ${res.data.total} 题，成功 ${res.data.updated}，低置信 ${res.data.lowConfidence}，失败 ${res.data.failed}`
          );
          void loadQuestions();
        } else if (res.data.status === 'FAILED') {
          setError(`难度归类失败：${res.data.error || '未知错误'}`);
        }
      } catch {
        /* 轮询失败静默重试 */
      }
    }, 2000);
    return () => {
      if (classifyTimer.current) {
        clearInterval(classifyTimer.current);
        classifyTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classifyJob?.id, classifyJob?.status]);

  const paperPages = Math.max(1, Math.ceil(paperTotal / PAGE_SIZE));
  const questionPages = Math.max(1, Math.ceil(questionTotal / PAGE_SIZE));

  // ==================== 渲染 ====================

  return (
    <div className="flex flex-1 flex-col h-full min-h-screen bg-[#111722]">
      <div className="px-4 md:px-8 lg:px-12 flex flex-1 justify-center py-8">
        <div className="flex flex-col max-w-[1200px] flex-1 gap-6">
          {/* 标题栏 */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-white tracking-tight text-[32px] font-bold leading-tight">
                题库管理
              </h1>
              <p className="text-[#92a4c9] text-sm mt-1">
                按科目管理试卷与题目，支持上传试卷文件自动识别入库
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClassify(true)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-lg text-sm font-medium hover:bg-amber-500/30 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                AI 难度归类
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-[20px]">upload_file</span>
                导入试卷
              </button>
              <button
                onClick={() => setShowCreatePaper(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#232f48] text-white rounded-lg text-sm font-medium hover:bg-[#324467] transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">post_add</span>
                新建试卷
              </button>
              <button
                onClick={() => setEditQuestion('new')}
                className="flex items-center gap-2 px-4 py-2 bg-[#232f48] text-white rounded-lg text-sm font-medium hover:bg-[#324467] transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">add_circle</span>
                新建题目
              </button>
            </div>
          </div>

          {/* 提示条 */}
          {error && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
              <span className="text-red-400 text-sm">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          )}
          {notice && (
            <div className="rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3">
              <span className="text-green-400 text-sm">{notice}</span>
            </div>
          )}

          {/* 科目 Tab */}
          <div className="flex items-center gap-2 border-b border-[#324467] pb-0">
            {subjects.map((s) => (
              <button
                key={s}
                onClick={() => setActiveSubject(s)}
                className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
                  activeSubject === s
                    ? 'text-white border-primary bg-[#1a2332]'
                    : 'text-[#92a4c9] border-transparent hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
            <div className="flex-1" />
            {/* 视图切换 */}
            <div className="flex mb-1 rounded-lg bg-[#232f48] p-1">
              <button
                onClick={() => setView('papers')}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === 'papers' ? 'bg-primary text-white' : 'text-[#92a4c9]'
                }`}
              >
                试卷（{paperTotal}）
              </button>
              <button
                onClick={() => setView('questions')}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === 'questions' ? 'bg-primary text-white' : 'text-[#92a4c9]'
                }`}
              >
                题目（{questionTotal}）
              </button>
            </div>
          </div>

          {/* 试卷视图 */}
          {view === 'papers' && (
            <div className="flex flex-col gap-3">
              {papers.length === 0 ? (
                <EmptyState text="当前科目暂无试卷，可点击右上角「导入试卷」或「新建试卷」" />
              ) : (
                papers.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-4 rounded-xl bg-[#1a2332] border border-[#324467] px-5 py-4"
                  >
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-semibold">{p.title}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${STATUS_LABELS[p.status]?.cls || ''}`}
                        >
                          {STATUS_LABELS[p.status]?.text || p.status}
                        </span>
                      </div>
                      <div className="text-[#92a4c9] text-xs mt-1">
                        {p.paperType ? `${PAPER_TYPE_LABELS[p.paperType] || p.paperType} · ` : ''}
                        {p.textbookName ? `${p.textbookName} · ` : ''}
                        {p.grade ? `${gradeLabel(p.grade)} · ` : ''}
                        {p._count?.items ?? 0} 题 · 创建于{' '}
                        {new Date(p.createdAt).toLocaleString('zh-CN')}
                        {p.sourceFile ? ` · 来源: ${p.sourceFile}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDetailPaperId(p.id)}
                        className="px-3 py-1.5 text-xs text-white bg-[#232f48] rounded-lg hover:bg-[#324467] transition-colors"
                      >
                        详情
                      </button>
                      {p.status !== 'PUBLISHED' && (
                        <button
                          onClick={() => void handlePublishPaper(p)}
                          className="px-3 py-1.5 text-xs text-green-400 bg-green-500/10 rounded-lg hover:bg-green-500/20 transition-colors"
                        >
                          发布
                        </button>
                      )}
                      <button
                        onClick={() => void handleDeletePaper(p)}
                        className="px-3 py-1.5 text-xs text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              )}
              <Pagination page={paperPage} pages={paperPages} onChange={setPaperPage} />
            </div>
          )}

          {/* 题目视图 */}
          {view === 'questions' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setQuestionPage(1);
                  }}
                  className="bg-[#232f48] text-white text-sm rounded-lg px-3 py-2 border border-[#324467] focus:outline-none"
                >
                  <option value="">全部题型</option>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              {questions.length === 0 ? (
                <EmptyState text="当前科目暂无题目" />
              ) : (
                questions.map((q) => (
                  <div
                    key={q.id}
                    className="flex flex-wrap items-start gap-4 rounded-xl bg-[#1a2332] border border-[#324467] px-5 py-4"
                  >
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-xs bg-primary/20 text-primary">
                          {TYPE_LABELS[q.type] || q.type}
                        </span>
                        <span className="text-[#92a4c9] text-xs">难度 {q.difficulty}/5</span>
                        {q.knowledgePoints.slice(0, 3).map((kp) => (
                          <span
                            key={kp}
                            className="px-2 py-0.5 rounded text-xs bg-[#232f48] text-[#92a4c9]"
                          >
                            {kp}
                          </span>
                        ))}
                      </div>
                      <p className="text-white text-sm mt-2 line-clamp-2 whitespace-pre-wrap">
                        {q.stem}
                      </p>
                      <p className="text-[#92a4c9] text-xs mt-1 line-clamp-1">
                        答案：{q.answer}
                      </p>
                    </div>
                    <button
                      onClick={() => setEditQuestion(q)}
                      className="px-3 py-1.5 text-xs text-white bg-[#232f48] rounded-lg hover:bg-[#324467] transition-colors"
                    >
                      编辑
                    </button>
                  </div>
                ))
              )}
              <Pagination page={questionPage} pages={questionPages} onChange={setQuestionPage} />
            </div>
          )}
        </div>
      </div>

      {/* AI 难度归类弹窗（P2） */}
      {showClassify && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-[#1a2332] border border-[#324467] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white text-lg font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400">auto_awesome</span>
                AI 难度一键归类
              </h3>
              <button onClick={() => setShowClassify(false)} className="text-[#92a4c9] hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="text-[#92a4c9] text-xs mb-4 leading-relaxed">
              AI 将依据管理端配置的「{activeSubject}难度判定标准」（智能体文档·STANDARD），逐题判定
              1-5 级难度并写回题库；低置信度（&lt;0.6）题目会进入复核列表。
            </p>

            <div className="mb-4">
              <label className="text-white text-sm font-medium block mb-2">归类范围</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setClassifyScope('UNLABELED')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    classifyScope === 'UNLABELED'
                      ? 'bg-primary/20 border-primary text-white'
                      : 'bg-[#232f48] border-[#324467] text-[#92a4c9]'
                  }`}
                >
                  仅未标注题目
                </button>
                <button
                  onClick={() => setClassifyScope('ALL')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    classifyScope === 'ALL'
                      ? 'bg-primary/20 border-primary text-white'
                      : 'bg-[#232f48] border-[#324467] text-[#92a4c9]'
                  }`}
                >
                  全部题目（重新归类）
                </button>
              </div>
              <p className="text-[#92a4c9] text-xs mt-2">科目：{activeSubject || '（未选择）'}</p>
            </div>

            {classifyJob && (
              <div className="mb-4 rounded-lg bg-[#232f48] p-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-white">
                    {classifyJob.status === 'RUNNING'
                      ? '归类中…'
                      : classifyJob.status === 'DONE'
                        ? '已完成'
                        : '失败'}
                  </span>
                  <span className="text-[#92a4c9] text-xs">
                    {classifyJob.processed}/{classifyJob.total}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#111722] overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      classifyJob.status === 'FAILED' ? 'bg-red-500' : 'bg-amber-400'
                    }`}
                    style={{
                      width: `${classifyJob.total > 0 ? Math.round((classifyJob.processed / classifyJob.total) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="flex gap-4 mt-2 text-xs text-[#92a4c9]">
                  <span>成功 {classifyJob.updated}</span>
                  <span className="text-amber-400">低置信 {classifyJob.lowConfidence}</span>
                  <span className="text-red-400">失败 {classifyJob.failed}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClassify(false)}
                className="px-4 py-2 text-sm text-[#92a4c9] hover:text-white transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => void startClassify()}
                disabled={classifyStarting || classifyJob?.status === 'RUNNING' || !activeSubject}
                className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {classifyJob?.status === 'RUNNING' ? '归类进行中…' : '开始归类'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 弹窗们 */}
      {showCreatePaper && (
        <CreatePaperModal
          subject={activeSubject}
          subjects={subjects}
          onClose={() => setShowCreatePaper(false)}
          onCreated={() => {
            setShowCreatePaper(false);
            flash('试卷已创建');
            void loadPapers();
          }}
        />
      )}
      {showImport && (
        <ImportModal
          subject={activeSubject}
          subjects={subjects}
          onClose={() => setShowImport(false)}
          onDone={(msg) => {
            flash(msg);
            void loadPapers();
            void loadQuestions();
          }}
        />
      )}
      {detailPaperId && (
        <PaperDetailModal
          paperId={detailPaperId}
          onClose={() => setDetailPaperId(null)}
          onChanged={() => void loadPapers()}
        />
      )}
      {editQuestion && (
        <QuestionFormModal
          subject={activeSubject}
          subjects={subjects}
          question={editQuestion === 'new' ? null : editQuestion}
          onClose={() => setEditQuestion(null)}
          onSaved={() => {
            setEditQuestion(null);
            flash('题目已保存');
            void loadQuestions();
          }}
        />
      )}
    </div>
  );
};

// ==================== 子组件 ====================

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#324467] py-16 gap-3">
    <span className="material-symbols-outlined text-[48px] text-[#324467]">quiz</span>
    <p className="text-[#92a4c9] text-sm">{text}</p>
  </div>
);

const Pagination = ({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (p: number) => void;
}) => {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-2">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="px-3 py-1.5 text-xs text-white bg-[#232f48] rounded-lg disabled:opacity-40"
      >
        上一页
      </button>
      <span className="text-[#92a4c9] text-xs">
        {page} / {pages}
      </span>
      <button
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        className="px-3 py-1.5 text-xs text-white bg-[#232f48] rounded-lg disabled:opacity-40"
      >
        下一页
      </button>
    </div>
  );
};

/** 弹窗外壳 */
const Modal = ({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/60" onClick={onClose} />
    <div
      className={`relative w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[85vh] overflow-y-auto rounded-2xl bg-[#1a2332] border border-[#324467] p-6`}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white text-lg font-bold">{title}</h2>
        <button onClick={onClose} className="text-[#92a4c9] hover:text-white">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      {children}
    </div>
  </div>
);

// 教材/单元选择相关类型
interface TextbookOption {
  id: string;
  name: string;
  subject: string;
  version: string;
  grade: string;
  term: string;
}
interface UnitOption {
  id: string;
  seq: number;
  name: string;
}

/**
 * 教材 + 单元（多选）选择器，可选带试卷类型选择。
 * - 选教材后自动拉取该教材下的单元供多选
 * - onChange 回传 教材 id、已选单元 id 列表，以及被选中教材对象（便于上层取学科）
 */
const TextbookUnitSelector = ({
  subject,
  textbookId,
  unitIds,
  onChange,
  showPaperType,
  paperType,
  onPaperTypeChange,
}: {
  subject?: string;
  textbookId: string;
  unitIds: string[];
  onChange: (textbookId: string | null, unitIds: string[], textbook?: TextbookOption) => void;
  showPaperType?: boolean;
  paperType?: string;
  onPaperTypeChange?: (t: string) => void;
}) => {
  const [textbooks, setTextbooks] = useState<TextbookOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await request.get<ApiResponse<TextbookOption[]>>(
          '/admin/question-bank/textbooks'
        );
        let list = res.data || [];
        if (subject) list = list.filter((t) => t.subject === subject);
        setTextbooks(list);
      } catch {
        /* 忽略 */
      }
    })();
  }, [subject]);

  useEffect(() => {
    if (!textbookId) {
      setUnits([]);
      return;
    }
    (async () => {
      try {
        const res = await request.get<ApiResponse<UnitOption[]>>(
          `/admin/materials/textbooks/${textbookId}/units`
        );
        setUnits(res.data || []);
      } catch {
        setUnits([]);
      }
    })();
  }, [textbookId]);

  const selectedTextbook = textbooks.find((t) => t.id === textbookId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className={labelCls}>关联教材（可选）</label>
        <select
          value={textbookId}
          onChange={(e) => {
            const id = e.target.value;
            onChange(id || null, [], textbooks.find((t) => t.id === id));
          }}
          className={inputCls}
        >
          <option value="">不关联教材</option>
          {textbooks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.version} {gradeLabel(t.grade)}
              {termLabel(t.term)} {t.subject}
            </option>
          ))}
        </select>
      </div>

      {textbookId && (
        <div>
          <label className={labelCls}>关联单元（可多选）</label>
          {units.length === 0 ? (
            <p className="text-[#5b6b8c] text-xs">该教材暂无单元</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {units.map((u) => {
                const checked = unitIds.includes(u.id);
                return (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => {
                      const next = checked
                        ? unitIds.filter((x) => x !== u.id)
                        : [...unitIds, u.id];
                      onChange(textbookId, next, selectedTextbook);
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      checked
                        ? 'bg-primary text-white border-primary'
                        : 'bg-[#111722] text-[#92a4c9] border-[#324467] hover:border-primary'
                    }`}
                  >
                    {u.seq}. {u.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showPaperType && (
        <div>
          <label className={labelCls}>试卷类型</label>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {PAPER_TYPE_OPTIONS.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => onPaperTypeChange?.(o.value)}
                className={`px-2 py-2 text-xs rounded-lg border text-center transition-colors ${
                  paperType === o.value
                    ? 'bg-primary text-white border-primary'
                    : 'bg-[#111722] text-[#92a4c9] border-[#324467] hover:border-primary'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[#5b6b8c] text-[11px] mt-1">
            期中/期末/中考/高考为特殊归类，便于任务按类型调用；单元练习为常规单元测验
          </p>
        </div>
      )}
    </div>
  );
};

const inputCls =
  'w-full bg-[#111722] text-white text-sm rounded-lg px-3 py-2.5 border border-[#324467] focus:outline-none focus:border-primary placeholder:text-[#5b6b8c]';
const labelCls = 'text-[#92a4c9] text-xs font-medium mb-1.5 block';

/** 新建试卷弹窗 */
const CreatePaperModal = ({
  subject,
  subjects,
  onClose,
  onCreated,
}: {
  subject: string;
  subjects: string[];
  onClose: () => void;
  onCreated: () => void;
}) => {
  const [form, setForm] = useState({ subject, title: '' });
  const [tbId, setTbId] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [tbSubject, setTbSubject] = useState<string | undefined>();
  const [paperType, setPaperType] = useState('UNIT');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!form.title.trim()) {
      setErr('请填写试卷标题');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const effSubject = tbSubject || form.subject;
      await request.post<ApiResponse>('/admin/question-bank/papers', {
        subject: effSubject,
        title: form.title.trim(),
        textbookId: tbId || undefined,
        paperType,
        unitIds,
      });
      onCreated();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="新建试卷" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div>
          <label className={labelCls}>科目</label>
          <select
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className={inputCls}
          >
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>试卷标题 *</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="如：2026 学年第一学期期中数学试卷"
            className={inputCls}
          />
        </div>
        <TextbookUnitSelector
          subject={form.subject}
          textbookId={tbId}
          unitIds={unitIds}
          onChange={(id, uIds, tb) => {
            setTbId(id ?? '');
            setUnitIds(uIds);
            setTbSubject(tb?.subject);
          }}
          showPaperType
          paperType={paperType}
          onPaperTypeChange={setPaperType}
        />
        <button
          onClick={() => void submit()}
          disabled={submitting}
          className="mt-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {submitting ? '创建中...' : '创建试卷'}
        </button>
      </div>
    </Modal>
  );
};

/** 导入试卷弹窗（上传 + 轮询任务状态） */
const ImportModal = ({
  subject,
  subjects,
  onClose,
  onDone,
}: {
  subject: string;
  subjects: string[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) => {
  const [selSubject, setSelSubject] = useState(subject);
  const [tbId, setTbId] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [paperType, setPaperType] = useState('UNIT');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'failed'>(
    'idle'
  );
  const [message, setMessage] = useState<string>('');
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    },
    []
  );

  const startPolling = (jobId: string) => {
    setPhase('processing');
    setMessage('文件已上传，正在解析与 AI 识别（可能需要 1-2 分钟）...');
    pollTimer.current = setInterval(async () => {
      try {
        const res = await request.get<ApiResponse<ImportJob>>(
          `/admin/question-bank/import/${jobId}`
        );
        const job = res.data;
        if (job.status === 'DONE') {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setPhase('done');
          const count = job.result?.count;
          setMessage(`识别完成${count ? `，共导入 ${count} 道题目` : ''}，已生成草稿试卷。`);
          onDone('试卷导入成功');
        } else if (job.status === 'FAILED') {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setPhase('failed');
          setMessage(job.error || '识别失败，请检查文件内容或稍后重试');
        }
      } catch {
        /* 轮询失败忽略，下次重试 */
      }
    }, 3000);
  };

  const upload = async () => {
    if (!file) {
      setMessage('请先选择文件');
      return;
    }
    setPhase('uploading');
    setMessage('上传中...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('subject', selSubject);
      if (tbId) fd.append('textbookId', tbId);
      fd.append('paperType', paperType);
      unitIds.forEach((id) => fd.append('unitIds', id));
      const res = await request.post<ApiResponse<{ jobId: string }>>(
        '/admin/question-bank/import',
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      startPolling(res.data.jobId);
    } catch (e) {
      setPhase('failed');
      setMessage(getErrorMessage(e));
    }
  };

  const busy = phase === 'uploading' || phase === 'processing';

  return (
    <Modal title="导入试卷" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-[#92a4c9] text-xs leading-relaxed">
          支持 Word(.docx)、PDF、图片（拍照）、纯文本/Markdown。上传后系统将自动提取文字并调用 AI
          识别为标准化题目，生成草稿试卷供人工校对。
          <br />
          注意：图片识别需要已配置 OCR 服务；AI 识别需要已配置可用的 AI 服务商。
        </p>
        <div>
          <label className={labelCls}>科目</label>
          <select
            value={selSubject}
            onChange={(e) => setSelSubject(e.target.value)}
            className={inputCls}
            disabled={busy}
          >
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <TextbookUnitSelector
          subject={selSubject}
          textbookId={tbId}
          unitIds={unitIds}
          onChange={(id, uIds) => {
            setTbId(id ?? '');
            setUnitIds(uIds);
          }}
          showPaperType
          paperType={paperType}
          onPaperTypeChange={setPaperType}
        />
        <div>
          <label className={labelCls}>试卷文件 *</label>
          <input
            type="file"
            accept=".docx,.pdf,.txt,.md,.png,.jpg,.jpeg,.bmp,.webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
            className="w-full text-sm text-[#92a4c9] file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-[#232f48] file:text-white file:text-sm file:cursor-pointer"
          />
        </div>
        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              phase === 'failed'
                ? 'bg-red-500/10 text-red-400'
                : phase === 'done'
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-[#232f48] text-[#92a4c9]'
            }`}
          >
            {busy && (
              <span className="material-symbols-outlined text-[16px] animate-spin align-middle mr-2">
                progress_activity
              </span>
            )}
            {message}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => void upload()}
            disabled={busy || !file}
            className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {busy ? '处理中...' : '上传并识别'}
          </button>
          {(phase === 'done' || phase === 'failed') && (
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-[#232f48] text-white rounded-lg text-sm font-medium"
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

/** 试卷详情弹窗 */
const PaperDetailModal = ({
  paperId,
  onClose,
  onChanged,
}: {
  paperId: string;
  onClose: () => void;
  onChanged: () => void;
}) => {
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await request.get<ApiResponse<PaperDetail>>(
        `/admin/question-bank/papers/${paperId}`
      );
      setPaper(res.data);
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  }, [paperId]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeItem = async (itemId: string) => {
    if (!window.confirm('确定从试卷中移除该题吗？')) return;
    try {
      await request.delete<ApiResponse>(`/admin/question-bank/paper-items/${itemId}`);
      void load();
      onChanged();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  return (
    <Modal title={paper ? `试卷详情：${paper.title}` : '试卷详情'} onClose={onClose} wide>
      {err && <p className="text-red-400 text-sm mb-3">{err}</p>}
      {!paper ? (
        <p className="text-[#92a4c9] text-sm">加载中...</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-[#92a4c9] text-xs">
            {paper.subject}
            {paper.paperType ? ` · ${PAPER_TYPE_LABELS[paper.paperType] || paper.paperType}` : ''}
            {paper.textbookName ? ` · ${paper.textbookName}` : ''}
            {paper.grade ? ` · ${gradeLabel(paper.grade)}` : ''} · {paper.items.length} 题 · 状态：
            {STATUS_LABELS[paper.status]?.text || paper.status}
          </div>
          {paper.items.length === 0 ? (
            <EmptyState text="试卷暂无题目，可在题目列表中编辑后加入，或通过导入识别自动生成" />
          ) : (
            paper.items.map((item, idx) => (
              <div
                key={item.id}
                className="rounded-lg bg-[#111722] border border-[#324467] px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <span className="text-primary text-sm font-bold shrink-0">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="px-2 py-0.5 rounded text-xs bg-primary/20 text-primary">
                        {TYPE_LABELS[item.question.type] || item.question.type}
                      </span>
                      <span className="text-[#92a4c9] text-xs">
                        {item.score > 0 ? `${item.score} 分 · ` : ''}难度{' '}
                        {item.question.difficulty}/5
                      </span>
                    </div>
                    <p className="text-white text-sm whitespace-pre-wrap">{item.question.stem}</p>
                    <p className="text-[#92a4c9] text-xs mt-1">答案：{item.question.answer}</p>
                  </div>
                  <button
                    onClick={() => void removeItem(item.id)}
                    className="text-red-400 shrink-0 hover:bg-red-500/10 rounded p-1"
                    title="移除"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Modal>
  );
};

/** 题目新建/编辑弹窗 */
const QuestionFormModal = ({
  subject,
  subjects,
  question,
  onClose,
  onSaved,
}: {
  subject: string;
  subjects: string[];
  question: Question | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const isEdit = !!question;
  const [form, setForm] = useState({
    subject,
    stem: question?.stem ?? '',
    type: question?.type ?? 'CHOICE',
    answer: question?.answer ?? '',
    difficulty: question?.difficulty ?? 3,
    knowledgePoints: (question?.knowledgePoints ?? []).join('，'),
  });
  const [tbId, setTbId] = useState(question?.textbookId ?? '');
  const [unitIds, setUnitIds] = useState<string[]>(question?.unitIds ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!form.stem.trim() || !form.answer.trim()) {
      setErr('请填写题干和答案');
      return;
    }
    setSubmitting(true);
    setErr(null);
    const kps = form.knowledgePoints
      .split(/[,，、;；\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      if (isEdit && question) {
        await request.put<ApiResponse>(`/admin/question-bank/questions/${question.id}`, {
          stem: form.stem.trim(),
          type: form.type,
          answer: form.answer.trim(),
          difficulty: Number(form.difficulty),
          knowledgePoints: kps,
          textbookId: tbId || undefined,
          unitIds: unitIds.length ? unitIds : undefined,
        });
      } else {
        await request.post<ApiResponse>('/admin/question-bank/questions', {
          subject: form.subject,
          stem: form.stem.trim(),
          type: form.type,
          answer: form.answer.trim(),
          difficulty: Number(form.difficulty),
          knowledgePoints: kps,
          textbookId: tbId || undefined,
          unitIds: unitIds.length ? unitIds : undefined,
        });
      }
      onSaved();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={isEdit ? '编辑题目' : '新建题目'} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {!isEdit && (
            <div>
              <label className={labelCls}>科目</label>
              <select
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className={inputCls}
              >
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>题型</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className={inputCls}
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>难度（1-5）</label>
            <input
              type="number"
              min={1}
              max={5}
              value={form.difficulty}
              onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}
              className={inputCls}
            />
          </div>
        </div>
        <TextbookUnitSelector
          subject={form.subject}
          textbookId={tbId}
          unitIds={unitIds}
          onChange={(id, uIds) => {
            setTbId(id ?? '');
            setUnitIds(uIds);
          }}
        />
        <div>
          <label className={labelCls}>题干 *（选择题请把选项写在题干中，公式用 LaTeX）</label>
          <textarea
            value={form.stem}
            onChange={(e) => setForm({ ...form, stem: e.target.value })}
            rows={5}
            className={inputCls}
            placeholder={'例：下列哪个是质数？\nA. 4  B. 6  C. 7  D. 9'}
          />
        </div>
        <div>
          <label className={labelCls}>答案 *</label>
          <textarea
            value={form.answer}
            onChange={(e) => setForm({ ...form, answer: e.target.value })}
            rows={2}
            className={inputCls}
            placeholder="例：C（公式题可填 LaTeX，如 x+1）"
          />
        </div>
        <div>
          <label className={labelCls}>知识点（用逗号分隔）</label>
          <input
            value={form.knowledgePoints}
            onChange={(e) => setForm({ ...form, knowledgePoints: e.target.value })}
            className={inputCls}
            placeholder="例：质数，因数分解"
          />
        </div>
        <button
          onClick={() => void submit()}
          disabled={submitting}
          className="mt-1 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {submitting ? '保存中...' : '保存题目'}
        </button>
      </div>
    </Modal>
  );
};

export default QuestionBankManagement;
