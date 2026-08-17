import { useState, useEffect, useCallback, useRef } from 'react';
import request, { type ApiResponse } from '../../utils/request';
import { useAuthStore } from '../../stores/authStore';
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
  /** 试卷分类：EXERCISE 习题与试卷 / ASSESSMENT 初测与水平评估 */
  category?: 'EXERCISE' | 'ASSESSMENT' | null;
  /** 目录节点（V2） */
  categoryId?: string | null;
  categoryNode?: { id: string; name: string; level: number; parentId: string | null } | null;
  /** 试卷标签（V2）：PaperTag.id 数组 */
  tagIds?: string[];
  createdAt: string;
  _count?: { items: number };
}

/** 试卷多级目录节点（V2） */
interface CategoryNode {
  id: string;
  name: string;
  level: number;
  system: boolean;
  immutable: boolean;
  _count?: { papers: number; children: number };
  children: CategoryNode[];
}

/** 试卷标签（V2） */
interface PaperTagItem {
  id: string;
  name: string;
  subject: string;
  color?: string | null;
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
  /** 题目来源：MANUAL / IMPORT / AI_GENERATED */
  source?: string | null;
  /** ④ AI 生成题审核态：null=无需审核，PENDING/APPROVED/REJECTED */
  reviewStatus?: string | null;
  /** 所属试卷与目录（V2）：listQuestions 附带 */
  paperInfo?: Array<{
    id: string;
    title: string;
    categoryId: string | null;
    categoryNode: { id: string; name: string; level: number; parentId: string | null } | null;
  }>;
}

/** ④ AI 生成题审核统计 */
interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
  aiTotal: number;
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

// OCR 识别方式（导入弹窗下拉用）
interface OcrProviderOption {
  id: string;
  name: string;
  method: string;
  isDefault: boolean;
  status: string;
}

// 导出文件结构（仅需 counts）
interface BankExport {
  format: string;
  counts: { questions: number; papers: number; paperItems: number; materialNodes: number };
}

// 导入数据汇总
interface ImportSummary {
  questionsCreated: number;
  questionsUpdated: number;
  papersCreated: number;
  papersUpdated: number;
  paperItemsCreated: number;
  paperItemsUpdated: number;
  materialNodesCreated: number;
  materialNodesUpdated: number;
  errors: string[];
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

// ④ AI 生成题审核态
const REVIEW_LABELS: Record<string, { text: string; cls: string }> = {
  PENDING: { text: '待审核', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  APPROVED: { text: '已通过', cls: 'bg-green-500/15 text-green-300 border-green-500/30' },
  REJECTED: { text: '已退回', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

const PAGE_SIZE = 10;

// 试卷类型标签（单元练习/期中/期末/中考/高考）
const PAPER_TYPE_LABELS: Record<string, string> = {
  UNIT: '单元练习',
  MIDTERM: '期中',
  FINAL: '期末',
  ZHONGKAO: '中考',
  GAOKAO: '高考',
};

function gradeLabel(grade?: string | null): string {
  if (!grade) return '';
  const map: Record<string, string> = {
    '1': '一年级', '2': '二年级', '3': '三年级', '4': '四年级', '5': '五年级', '6': '六年级',
    '7': '七年级', '8': '八年级', '9': '九年级',
    '10': '高一', '11': '高二', '12': '高三',
  };
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

  // 知识点先修关系（C2：edu-learning-path 方法论）
  const [kpModalOpen, setKpModalOpen] = useState(false);
  const [kpPoints, setKpPoints] = useState<
    Array<{ point: string; prerequisites: string[]; questionCount: number }>
  >([]);
  const [kpLoading, setKpLoading] = useState(false);
  const [kpEdit, setKpEdit] = useState<{ point: string; prereqs: string[] } | null>(null);
  const [kpSaving, setKpSaving] = useState(false);
  const [kpError, setKpError] = useState('');

  // 试卷列表
  const [papers, setPapers] = useState<Paper[]>([]);
  const [paperTotal, setPaperTotal] = useState(0);
  const [paperPage, setPaperPage] = useState(1);
  // 多级目录（V2）
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryPickerFor, setCategoryPickerFor] = useState<Paper | null>(null);
  // 标签（V2）
  const [tags, setTags] = useState<PaperTagItem[]>([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [pickedTagIds, setPickedTagIds] = useState<string[]>([]);
  // 文件夹导入（V2）
  const [folderImportOpen, setFolderImportOpen] = useState(false);

  // 题目列表
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionTotal, setQuestionTotal] = useState(0);
  const [questionPage, setQuestionPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');

  // ④ AI 生成题审核
  const [sourceFilter, setSourceFilter] = useState('');
  const [reviewFilter, setReviewFilter] = useState('');
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [reviewing, setReviewing] = useState(false);

  // 弹窗
  const [showCreatePaper, setShowCreatePaper] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImportData, setShowImportData] = useState(false);
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

  // ---------- 知识点先修关系（C2） ----------

  const loadKpPoints = async () => {
    if (!activeSubject) return;
    setKpLoading(true);
    setKpError('');
    try {
      const res = await request.get<ApiResponse<{ points: typeof kpPoints }>>(
        `/admin/question-bank/knowledge-points?subject=${encodeURIComponent(activeSubject)}`
      );
      setKpPoints(res.data?.points || []);
    } catch (e) {
      setKpError(getErrorMessage(e, '加载知识点图谱失败'));
    } finally {
      setKpLoading(false);
    }
  };

  const openKpModal = () => {
    setKpModalOpen(true);
    setKpEdit(null);
    void loadKpPoints();
  };

  const toggleKpPrereq = (p: string) => {
    if (!kpEdit) return;
    const has = kpEdit.prereqs.includes(p);
    setKpEdit({
      ...kpEdit,
      prereqs: has ? kpEdit.prereqs.filter((x) => x !== p) : [...kpEdit.prereqs, p],
    });
  };

  const saveKpPrereqs = async () => {
    if (!kpEdit) return;
    setKpSaving(true);
    setKpError('');
    try {
      await request.put<ApiResponse>('/admin/question-bank/knowledge-points/prerequisites', {
        subject: activeSubject,
        point: kpEdit.point,
        prerequisites: kpEdit.prereqs,
      });
      flash(`「${kpEdit.point}」先修关系已保存`);
      setKpEdit(null);
      void loadKpPoints();
    } catch (e) {
      setKpError(getErrorMessage(e, '保存先修关系失败'));
    } finally {
      setKpSaving(false);
    }
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
      const params = new URLSearchParams({
        subject: activeSubject,
        page: String(paperPage),
        limit: String(PAGE_SIZE),
      });
      // 目录过滤（V2）：选中目录时按目录（含子树）过滤；「初测与水平评估」目录 → category=ASSESSMENT
      if (activeCategoryId) params.set('categoryId', activeCategoryId);
      const res = await request.get<ApiResponse<PagedResult<Paper>>>(
        `/admin/question-bank/papers?${params.toString()}`
      );
      setPapers(res.data.items);
      setPaperTotal(res.data.total);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [activeSubject, paperPage, activeCategoryId]);

  // 目录树 + 标签加载（V2）
  const loadCategories = useCallback(async () => {
    if (!activeSubject) return;
    try {
      const res = await request.get<ApiResponse<CategoryNode[]>>(
        `/admin/question-bank/categories?subject=${encodeURIComponent(activeSubject)}`
      );
      setCategories(res.data);
    } catch {
      setCategories([]);
    }
  }, [activeSubject]);

  const loadTags = useCallback(async () => {
    if (!activeSubject) return;
    try {
      const res = await request.get<ApiResponse<PaperTagItem[]>>(
        `/admin/question-bank/tags?subject=${encodeURIComponent(activeSubject)}`
      );
      setTags(res.data);
    } catch {
      setTags([]);
    }
  }, [activeSubject]);

  const loadQuestions = useCallback(async () => {
    if (!activeSubject) return;
    try {
      const params = new URLSearchParams({
        subject: activeSubject,
        page: String(questionPage),
        limit: String(PAGE_SIZE),
      });
      if (typeFilter) params.set('type', typeFilter);
      if (sourceFilter) params.set('source', sourceFilter);
      if (reviewFilter) params.set('reviewStatus', reviewFilter);
      if (activeCategoryId) params.set('categoryId', activeCategoryId); // 题目按目录过滤（V2）
      const res = await request.get<ApiResponse<PagedResult<Question>>>(
        `/admin/question-bank/questions?${params.toString()}`
      );
      setQuestions(res.data.items);
      setQuestionTotal(res.data.total);
      setSelectedQIds([]);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [activeSubject, questionPage, typeFilter, sourceFilter, reviewFilter, activeCategoryId]);

  // ④ 审核统计（全库口径，不随科目筛选变化）
  const loadReviewStats = useCallback(async () => {
    try {
      const res = await request.get<ApiResponse<ReviewStats>>(
        '/admin/question-bank/questions/review-stats'
      );
      setReviewStats(res.data);
    } catch {
      /* 统计失败不阻断主流程 */
    }
  }, []);

  useEffect(() => {
    void loadPapers();
  }, [loadPapers]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    void loadReviewStats();
  }, [loadReviewStats]);

  // 目录树与标签随科目加载（V2）
  useEffect(() => {
    void loadCategories();
    void loadTags();
    setActiveCategoryId(''); // 切科目重置目录
    setPaperPage(1);
    setQuestionPage(1);
  }, [activeSubject, loadCategories, loadTags]);

  // 切换科目或试卷分类时重置分页
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

  /** 打开目录选单（V2 改分类） */
  const openCategoryPicker = (paper: Paper) => {
    setCategoryPickerFor(paper);
    setPickedTagIds(paper.tagIds || []);
  };

  /** 保存目录移动（PATCH categoryId + tags） */
  const saveCategoryMove = async (categoryId: string | null) => {
    if (!categoryPickerFor) return;
    const paperId = categoryPickerFor.id;
    try {
      await request.patch<ApiResponse>(`/admin/question-bank/papers/${paperId}`, {
        categoryId,
        tagIds: pickedTagIds,
      });
      flash('目录/标签已更新');
      setCategoryPickerFor(null);
      void loadPapers();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  /** 新建一级目录 */
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return alert('请输入目录名称');
    try {
      await request.post<ApiResponse>('/admin/question-bank/categories', {
        subject: activeSubject,
        name: newCategoryName.trim(),
      });
      setShowCategoryModal(false);
      setNewCategoryName('');
      flash('目录已创建');
      void loadCategories();
    } catch (e) {
      alert(getErrorMessage(e, '创建失败'));
    }
  };

  /** 标签管理 */
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return alert('请输入标签名称');
    try {
      await request.post<ApiResponse>('/admin/question-bank/tags', {
        subject: activeSubject,
        name: newTagName.trim(),
      });
      setNewTagName('');
      void loadTags();
    } catch (e) {
      alert(getErrorMessage(e, '创建失败'));
    }
  };
  const handleDeleteTag = async (id: string) => {
    if (!confirm('删除标签将从所有试卷移除该标签，确定？')) return;
    try {
      await request.delete<ApiResponse>(`/admin/question-bank/tags/${id}`);
      void loadTags();
    } catch (e) {
      alert(getErrorMessage(e, '删除失败'));
    }
  };

  // ---------- ④ AI 生成题审核 ----------

  const toggleSelectQuestion = (id: string) => {
    setSelectedQIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllQuestions = () => {
    setSelectedQIds((prev) => (prev.length === questions.length ? [] : questions.map((q) => q.id)));
  };

  /** 一键跳到「AI 生成 · 待审核」视图 */
  const jumpToPendingReview = () => {
    setView('questions');
    setSourceFilter('AI_GENERATED');
    setReviewFilter('PENDING');
    setTypeFilter('');
    setQuestionPage(1);
  };

  /** ids 缺省时对当前勾选项批量操作；单题快捷审核直接传 [id]，避免读到旧 state */
  const handleReview = async (action: 'APPROVE' | 'REJECT', ids?: string[]) => {
    const targetIds = ids ?? selectedQIds;
    if (targetIds.length === 0) return;
    const verb = action === 'APPROVE' ? '通过' : '退回';
    if (
      !window.confirm(
        `确定${verb} ${targetIds.length} 道题吗？\n${
          action === 'APPROVE'
            ? '通过后将转为正式题库题，可被自动抽题命中。'
            : '退回后仍保留记录（供追溯 AI 出题质量），但不再参与任何抽题。'
        }`
      )
    ) {
      return;
    }
    setReviewing(true);
    try {
      const res = await request.post<ApiResponse<{ updated: number }>>(
        '/admin/question-bank/questions/review',
        { ids: targetIds, action }
      );
      flash(`已${verb} ${res.data?.updated ?? targetIds.length} 道题`);
      setSelectedQIds([]);
      void loadQuestions();
      void loadReviewStats();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setReviewing(false);
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
              {/* ④ AI 生成题待审核入口 */}
              {!!reviewStats?.pending && (
                <button
                  onClick={jumpToPendingReview}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500/20 text-orange-300 border border-orange-500/40 rounded-lg text-sm font-medium hover:bg-orange-500/30 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">rate_review</span>
                  AI 生成题待审核
                  <span className="px-1.5 py-0.5 rounded bg-orange-500/30 text-orange-200 text-xs">
                    {reviewStats.pending}
                  </span>
                </button>
              )}
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
                onClick={() => setFolderImportOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-colors"
                title="选择文件夹导入，按相对路径自动生成多级分类目录"
              >
                <span className="material-symbols-outlined text-[20px]">folder_open</span>
                导入文件夹
              </button>
              <button
                onClick={() => setShowExport(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#232f48] text-white rounded-lg text-sm font-medium hover:bg-[#324467] transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">download</span>
                导出题库
              </button>
              <button
                onClick={() => setShowImportData(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#232f48] text-white rounded-lg text-sm font-medium hover:bg-[#324467] transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">drive_folder_upload</span>
                导入数据
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
            {/* 知识点先修关系（C2：edu-learning-path 方法论） */}
            {activeSubject && (
              <button
                onClick={openKpModal}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-[#232f48] border border-[#324467] text-[#92a4c9] hover:text-white hover:border-primary/60 transition-colors"
              >
                知识点先修关系
              </button>
            )}
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
            <div className="flex gap-5">
              {/* 左侧：多级目录导航（V2） */}
              <div className="w-60 shrink-0 hidden lg:block">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#92a4c9]">分类目录</span>
                  <button
                    onClick={() => setShowCategoryModal(true)}
                    className="px-2 py-1 text-[11px] rounded bg-[#232f48] border border-[#324467] text-[#92a4c9] hover:text-white hover:border-primary/60"
                    title="添加一级目录"
                  >
                    + 添加分类目录
                  </button>
                </div>
                <div className="rounded-xl bg-[#1a2332] border border-[#324467] p-2 max-h-[70vh] overflow-y-auto">
                  <CategoryTree
                    nodes={categories}
                    activeId={activeCategoryId}
                    onSelect={(id) => {
                      setActiveCategoryId(id);
                      setPaperPage(1);
                    }}
                  />
                </div>
                <button
                  onClick={() => setShowTagModal(true)}
                  className="mt-2 w-full px-3 py-2 text-xs rounded-lg bg-[#232f48] border border-[#324467] text-[#92a4c9] hover:text-white hover:border-primary/60"
                >
                  标签管理（{tags.length}）
                </button>
              </div>

              {/* 右侧：试卷列表 */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-3">
                  {/* 试卷按左侧目录树过滤：「初测与水平评估」为目录树一级目录（系统目录） */}
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
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${
                                p.category === 'ASSESSMENT'
                                  ? 'bg-amber-500/15 text-amber-300'
                                  : 'bg-blue-500/15 text-blue-300'
                              }`}
                            >
                              {p.category === 'ASSESSMENT' ? '初测与水平评估' : '习题与试卷'}
                            </span>
                            {p.categoryNode && (
                              <span className="px-2 py-0.5 rounded text-xs bg-[#232f48] text-[#92a4c9]">
                                📁 {p.categoryNode.name}
                              </span>
                            )}
                            {(p.tagIds?.length ?? 0) > 0 && (
                              <div className="flex items-center gap-1">
                                {(p.tagIds || []).map((tid) => {
                                  const t = tags.find((x) => x.id === tid);
                                  return t ? (
                                    <span
                                      key={tid}
                                      className="px-1.5 py-0.5 rounded text-[10px]"
                                      style={{ background: `${t.color || '#3b82f6'}22`, color: t.color || '#3b82f6' }}
                                    >
                                      #{t.name}
                                    </span>
                                  ) : null;
                                })}
                              </div>
                            )}
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
                            onClick={() => openCategoryPicker(p)}
                            className="px-3 py-1.5 text-xs text-amber-300 bg-amber-500/10 rounded-lg hover:bg-amber-500/20 transition-colors"
                            title="移动到分类目录 / 打标签"
                          >
                            改分类
                          </button>
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
              </div>
            </div>
          )}

          {/* 题目视图 */}
          {view === 'questions' && (
            <div className="flex gap-5">
              {/* 目录导航（V2）：最后一级是试卷；点目录过滤题目 */}
              <div className="w-60 shrink-0 hidden lg:block">
                <span className="text-xs font-medium text-[#92a4c9] block mb-2">分类目录</span>
                <div className="rounded-xl bg-[#1a2332] border border-[#324467] p-2 max-h-[70vh] overflow-y-auto">
                  <CategoryTree
                    nodes={categories}
                    activeId={activeCategoryId}
                    onSelect={(id) => {
                      setActiveCategoryId(id);
                      setQuestionPage(1);
                    }}
                  />
                </div>
                {activeCategoryId && (
                  <button
                    onClick={() => {
                      setActiveCategoryId('');
                      setQuestionPage(1);
                    }}
                    className="mt-2 w-full px-3 py-1.5 text-xs text-[#92a4c9] bg-[#232f48] border border-[#324467] rounded-lg hover:text-white"
                  >
                    显示全部题目
                  </button>
                )}
              </div>
              <div className="flex-1 min-w-0">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 flex-wrap">
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

                {/* ④ 来源 / 审核态筛选 */}
                <select
                  value={sourceFilter}
                  onChange={(e) => {
                    setSourceFilter(e.target.value);
                    setQuestionPage(1);
                  }}
                  className="bg-[#232f48] text-white text-sm rounded-lg px-3 py-2 border border-[#324467] focus:outline-none"
                >
                  <option value="">全部来源</option>
                  <option value="AI_GENERATED">AI 生成</option>
                  <option value="IMPORT">试卷导入</option>
                  <option value="MANUAL">手工录入</option>
                </select>
                <select
                  value={reviewFilter}
                  onChange={(e) => {
                    setReviewFilter(e.target.value);
                    setQuestionPage(1);
                  }}
                  className="bg-[#232f48] text-white text-sm rounded-lg px-3 py-2 border border-[#324467] focus:outline-none"
                >
                  <option value="">全部审核态</option>
                  <option value="PENDING">待审核</option>
                  <option value="APPROVED">已通过</option>
                  <option value="REJECTED">已退回</option>
                  <option value="NONE">无需审核</option>
                </select>

                {(sourceFilter || reviewFilter) && (
                  <button
                    onClick={() => {
                      setSourceFilter('');
                      setReviewFilter('');
                      setQuestionPage(1);
                    }}
                    className="px-3 py-2 text-xs text-[#92a4c9] bg-[#232f48] border border-[#324467] rounded-lg hover:text-white transition-colors"
                  >
                    清除筛选
                  </button>
                )}

                <div className="flex-1" />

                {reviewStats && (
                  <span className="text-xs text-[#5b6b8c]">
                    AI 生成题 {reviewStats.aiTotal} 道 · 待审 {reviewStats.pending} · 已通过{' '}
                    {reviewStats.approved} · 已退回 {reviewStats.rejected}
                  </span>
                )}
              </div>

              {/* ④ 批量审核操作条 */}
              {questions.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap rounded-lg bg-[#1a2332] border border-[#324467] px-4 py-2.5">
                  <label className="flex items-center gap-2 text-xs text-[#92a4c9] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedQIds.length > 0 && selectedQIds.length === questions.length}
                      onChange={toggleSelectAllQuestions}
                      className="accent-primary"
                    />
                    本页全选
                  </label>
                  <span className="text-xs text-[#5b6b8c]">已选 {selectedQIds.length} 道</span>
                  <div className="flex-1" />
                  <button
                    disabled={selectedQIds.length === 0 || reviewing}
                    onClick={() => void handleReview('APPROVE')}
                    className="px-3 py-1.5 text-xs text-green-300 bg-green-500/10 border border-green-500/30 rounded-lg hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {reviewing ? '处理中…' : '通过入库'}
                  </button>
                  <button
                    disabled={selectedQIds.length === 0 || reviewing}
                    onClick={() => void handleReview('REJECT')}
                    className="px-3 py-1.5 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    退回
                  </button>
                </div>
              )}
              {questions.length === 0 ? (
                <EmptyState text="当前科目暂无题目" />
              ) : (
                questions.map((q) => (
                  <div
                    key={q.id}
                    className={`flex flex-wrap items-start gap-4 rounded-xl bg-[#1a2332] border px-5 py-4 transition-colors ${
                      selectedQIds.includes(q.id) ? 'border-primary' : 'border-[#324467]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedQIds.includes(q.id)}
                      onChange={() => toggleSelectQuestion(q.id)}
                      className="mt-1 accent-primary"
                      aria-label="选择题目"
                    />
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-xs bg-primary/20 text-primary">
                          {TYPE_LABELS[q.type] || q.type}
                        </span>
                        <span className="text-[#92a4c9] text-xs">难度 {q.difficulty}/5</span>
                        {q.source === 'AI_GENERATED' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            AI 生成
                          </span>
                        )}
                        {q.reviewStatus && (
                          <span
                            className={`px-2 py-0.5 rounded text-xs border ${
                              REVIEW_LABELS[q.reviewStatus]?.cls ||
                              'bg-[#232f48] text-[#92a4c9] border-[#324467]'
                            }`}
                          >
                            {REVIEW_LABELS[q.reviewStatus]?.text || q.reviewStatus}
                          </span>
                        )}
                        {q.knowledgePoints.slice(0, 3).map((kp) => (
                          <span
                            key={kp}
                            className="px-2 py-0.5 rounded text-xs bg-[#232f48] text-[#92a4c9]"
                          >
                            {kp}
                          </span>
                        ))}
                        {/* 所属目录（V2） */}
                        {q.paperInfo && q.paperInfo.length > 0 && (
                          <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                            📁 {q.paperInfo[0].categoryNode?.name || '未分类'} · {q.paperInfo[0].title.slice(0, 18)}
                          </span>
                        )}
                      </div>
                      <p className="text-white text-sm mt-2 line-clamp-2 whitespace-pre-wrap">
                        {q.stem}
                      </p>
                      <p className="text-[#92a4c9] text-xs mt-1 line-clamp-1">
                        答案：{q.answer}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {q.reviewStatus === 'PENDING' && (
                        <>
                          <button
                            disabled={reviewing}
                            onClick={() => void handleReview('APPROVE', [q.id])}
                            className="px-3 py-1.5 text-xs text-green-300 bg-green-500/10 border border-green-500/30 rounded-lg hover:bg-green-500/20 disabled:opacity-40 transition-colors"
                          >
                            通过
                          </button>
                          <button
                            disabled={reviewing}
                            onClick={() => void handleReview('REJECT', [q.id])}
                            className="px-3 py-1.5 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/20 disabled:opacity-40 transition-colors"
                          >
                            退回
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setEditQuestion(q)}
                        className="px-3 py-1.5 text-xs text-white bg-[#232f48] rounded-lg hover:bg-[#324467] transition-colors"
                      >
                        编辑
                      </button>
                    </div>
                  </div>
                ))
              )}
              <Pagination page={questionPage} pages={questionPages} onChange={setQuestionPage} />
              </div>
              </div>
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

      {/* 知识点先修关系弹窗（C2） */}
      {kpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-2xl w-full bg-[#232f48] border border-[#324467] rounded-lg shadow-xl">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium text-white">知识点先修关系</h3>
                  <p className="text-sm text-[#5b6b8c] mt-0.5">
                    {activeSubject} · 前置未掌握（掌握度 &lt;60）时，该知识点会被标记为「阻塞后续」，出题/组卷优先补前置
                  </p>
                </div>
                <button
                  onClick={() => setKpModalOpen(false)}
                  className="text-[#5b6b8c] hover:text-white text-xl leading-none"
                >
                  ×
                </button>
              </div>

              {kpError && (
                <div className="mb-3 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-300">
                  {kpError}
                </div>
              )}

              {kpLoading ? (
                <div className="py-10 text-center text-[#92a4c9]">加载中...</div>
              ) : kpPoints.length === 0 ? (
                <div className="py-10 text-center text-[#5b6b8c]">
                  该学科题库暂无知识点，请先导入/创建题目
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto mb-4">
                  <table className="min-w-full divide-y divide-[#324467]">
                    <thead className="bg-[#1a2332]">
                      <tr>
                        {['知识点', '题量', '前置知识点', ''].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left text-xs font-medium text-[#92a4c9]"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#324467]">
                      {kpPoints.map((p) => (
                        <tr key={p.point} className="text-sm">
                          <td className="px-3 py-2 text-white whitespace-nowrap">{p.point}</td>
                          <td className="px-3 py-2 text-[#92a4c9]">{p.questionCount}</td>
                          <td className="px-3 py-2 text-[#92a4c9]">
                            {p.prerequisites.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {p.prerequisites.map((pr) => (
                                  <span
                                    key={pr}
                                    className="px-1.5 py-0.5 text-xs rounded bg-amber-500/15 text-amber-300"
                                  >
                                    {pr}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[#5b6b8c]">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() =>
                                setKpEdit({ point: p.point, prereqs: [...p.prerequisites] })
                              }
                              className="px-2 py-1 text-xs bg-[#1a2332] border border-[#324467] rounded text-[#92a4c9] hover:text-white hover:border-primary/60"
                            >
                              编辑
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 编辑子面板：多选该学科其他知识点作为先修 */}
              {kpEdit && (
                <div className="p-4 bg-[#1a2332] rounded-lg border border-[#324467] mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-white">
                      配置「{kpEdit.point}」的先修知识点
                    </p>
                    <button
                      onClick={() => setKpEdit(null)}
                      className="text-[#5b6b8c] hover:text-white text-sm"
                    >
                      收起
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {kpPoints
                      .filter((p) => p.point !== kpEdit.point)
                      .map((p) => {
                        const checked = kpEdit.prereqs.includes(p.point);
                        return (
                          <button
                            key={p.point}
                            onClick={() => toggleKpPrereq(p.point)}
                            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                              checked
                                ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                                : 'border-[#324467] text-[#92a4c9] hover:bg-[#232f48]'
                            }`}
                          >
                            {checked ? '☑ ' : '☐ '}
                            {p.point}
                          </button>
                        );
                      })}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[#5b6b8c]">
                      已选 {kpEdit.prereqs.length} 个 · 保存将覆盖该知识点相关题目的前置配置
                    </p>
                    <button
                      onClick={() => void saveKpPrereqs()}
                      disabled={kpSaving}
                      className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
                    >
                      {kpSaving ? '保存中...' : '保存先修关系'}
                    </button>
                  </div>
                </div>
              )}

              <div className="text-right">
                <button
                  onClick={() => setKpModalOpen(false)}
                  className="px-4 py-2 border border-[#324467] rounded-lg text-[#92a4c9] hover:text-white hover:border-primary/60"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
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
      {showExport && (
        <ExportBankModal
          subject={activeSubject}
          subjects={subjects}
          onClose={() => setShowExport(false)}
        />
      )}
      {showImportData && (
        <ImportDataModal
          onClose={() => setShowImportData(false)}
          onDone={(msg) => {
            flash(msg);
            void loadPapers();
            void loadQuestions();
          }}
        />
      )}
      {/* 文件夹导入（V2） */}
      {folderImportOpen && (
        <FolderImportModal
          subject={activeSubject}
          onClose={() => setFolderImportOpen(false)}
          onStarted={(count) => {
            flash(`已提交 ${count} 个文件，后台逐个处理中`);
            setFolderImportOpen(false);
            void loadPapers();
            void loadQuestions();
          }}
        />
      )}
      {/* 添加一级目录（V2） */}
      {showCategoryModal && (
        <Modal title="添加分类目录（一级）" onClose={() => setShowCategoryModal(false)}>
          <div className="p-5 space-y-4">
            <p className="text-xs text-[#5b6b8c]">
              将在「{activeSubject}」下创建一级目录；导入文件夹时可自动生成多级目录。
            </p>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="目录名称（如：期末冲刺）"
              className="w-full bg-[#1a2332] border border-[#324467] text-white rounded-lg px-4 py-2 focus:border-primary outline-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCategoryModal(false)} className="px-4 py-2 border border-[#324467] text-[#92a4c9] rounded-lg">取消</button>
              <button
                onClick={() => void handleCreateCategory()}
                className="px-4 py-2 bg-primary text-white rounded-lg"
              >
                创建
              </button>
            </div>
          </div>
        </Modal>
      )}
      {/* 改分类目录选单（V2） */}
      {categoryPickerFor && (
        <Modal title={`移动分类 / 打标签 · ${categoryPickerFor.title.slice(0, 24)}`} onClose={() => setCategoryPickerFor(null)}>
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <p className="text-xs text-[#5b6b8c]">选择目标目录（末级目录）；「初测与水平评估」下试卷自动归入初测库。</p>
            <div className="rounded-lg bg-[#1a2332] border border-[#324467] p-2">
              <button
                onClick={() => void saveCategoryMove(null)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs ${
                  !categoryPickerFor.categoryId ? 'bg-primary/20 text-primary' : 'text-[#92a4c9] hover:bg-[#232f48]'
                }`}
              >
                （不分类）
              </button>
              <CategoryTree
                nodes={categories}
                activeId={categoryPickerFor.categoryId || ''}
                onSelect={(id) => void saveCategoryMove(id)}
              />
            </div>
            <div className="border-t border-[#324467] pt-3">
              <p className="text-xs text-[#92a4c9] mb-2">试卷标签：</p>
              {tags.length === 0 ? (
                <p className="text-xs text-[#5b6b8c]">暂无标签，可先到「标签管理」创建</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <label key={t.id} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={pickedTagIds.includes(t.id)}
                        onChange={() =>
                          setPickedTagIds((prev) =>
                            prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                          )
                        }
                      />
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${t.color || '#3b82f6'}22`, color: t.color || '#3b82f6' }}>
                        {t.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {tags.length > 0 && (
                <button
                  onClick={() => void saveCategoryMove(categoryPickerFor.categoryId || null)}
                  className="mt-3 px-4 py-2 bg-primary text-white rounded-lg text-sm"
                >
                  保存标签
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
      {/* 标签管理（V2） */}
      {showTagModal && (
        <Modal title={`试卷标签管理 · ${activeSubject}`} onClose={() => setShowTagModal(false)}>
          <div className="p-5 space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="新标签名称（如：易错题 / 期末真题）"
                className="flex-1 bg-[#1a2332] border border-[#324467] text-white rounded-lg px-4 py-2 focus:border-primary outline-none"
              />
              <button onClick={() => void handleCreateTag()} className="px-4 py-2 bg-primary text-white rounded-lg">添加</button>
            </div>
            <div className="space-y-2">
              {tags.length === 0 ? (
                <p className="text-xs text-[#5b6b8c]">暂无标签</p>
              ) : (
                tags.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg bg-[#1a2332] border border-[#324467] px-3 py-2">
                    <span className="text-sm px-2 py-0.5 rounded" style={{ background: `${t.color || '#3b82f6'}22`, color: t.color || '#3b82f6' }}>
                      {t.name}
                    </span>
                    <button onClick={() => void handleDeleteTag(t.id)} className="text-xs text-red-400 hover:text-red-300">删除</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </Modal>
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
  // 试卷范围：常规（选教材单元/期中/期末）/ 中考 / 高考 —— 中考高考时锁定下方选项
  const isLockedType = paperType === 'ZHONGKAO' || paperType === 'GAOKAO';
  const SPECIAL_SCOPE: Array<{ value: string; label: string }> = [
    { value: 'MIDTERM', label: '期中' },
    { value: 'FINAL', label: '期末' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 试卷类型：常规 / 中考 / 高考（放标题下方） */}
      {showPaperType && (
        <div>
          <label className={labelCls}>试卷类型 *</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'UNIT', label: '常规' },
              { value: 'ZHONGKAO', label: '中考' },
              { value: 'GAOKAO', label: '高考' },
            ].map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => {
                  onPaperTypeChange?.(o.value);
                  // 切到中考/高考时清空单元选择（全局卷，不关联单元）
                  if (o.value !== 'UNIT') onChange(null, [], undefined);
                }}
                className={`px-2 py-2 text-xs rounded-lg border text-center transition-colors ${
                  (paperType === o.value) ||
                  (o.value === 'UNIT' && !['ZHONGKAO', 'GAOKAO', 'MIDTERM', 'FINAL'].includes(paperType || ''))
                    ? 'bg-primary text-white border-primary'
                    : 'bg-[#111722] text-[#92a4c9] border-[#324467] hover:border-primary'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[#5b6b8c] text-[11px] mt-1">
            常规：关联具体教材单元练习，或选「期中/期末」；中考/高考为整卷类型，不关联单元
          </p>
        </div>
      )}

      {/* 关联教材（仅常规类型可选；中考/高考锁定） */}
      {!isLockedType && (
        <div>
          <label className={labelCls}>关联教材 *</label>
          <select
            value={textbookId}
            onChange={(e) => {
              const id = e.target.value;
              onChange(id || null, [], textbooks.find((t) => t.id === id));
            }}
            className={inputCls}
          >
            <option value="">请选择教材</option>
            {textbooks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.version} {gradeLabel(t.grade)}
                {termLabel(t.term)} {t.subject}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isLockedType && textbookId && (
        <div>
          <label className={labelCls}>关联单元（单选）</label>
          {units.length === 0 ? (
            <p className="text-[#5b6b8c] text-xs">该教材暂无单元</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {showPaperType && SPECIAL_SCOPE.map((s) => (
                <button
                  type="button"
                  key={s.value}
                  onClick={() => {
                    onPaperTypeChange?.(s.value);
                    onChange(textbookId, [], selectedTextbook);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    paperType === s.value
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-[#111722] text-[#92a4c9] border-[#324467] hover:border-amber-500'
                  }`}
                >
                  {s.label}
                </button>
              ))}
              {units.map((u) => {
                const checked = unitIds.includes(u.id);
                return (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => {
                      // 单选：选中即替换
                      onPaperTypeChange?.('UNIT');
                      onChange(textbookId, [u.id], selectedTextbook);
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
    // 必填校验：常规类型必须关联教材（中考/高考卷除外）
    const isGlobal = paperType === 'ZHONGKAO' || paperType === 'GAOKAO';
    if (!isGlobal && !tbId) {
      setErr('常规试卷必须选择关联教材（中考/高考卷除外）');
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
          className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50"
        >
          {submitting ? '创建中…' : '创建试卷'}
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
  const [category, setCategory] = useState<'EXERCISE' | 'ASSESSMENT'>('EXERCISE');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'failed'>(
    'idle'
  );
  const [message, setMessage] = useState<string>('');
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // OCR 识别方式（默认回退到系统配置；管理员可指定）
  const [providers, setProviders] = useState<OcrProviderOption[]>([]);
  const [ocrProviderId, setOcrProviderId] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const res = await request.get<ApiResponse<OcrProviderOption[]>>('/admin/ocr-providers');
        const list = (res.data || []).filter((p) => p.status === 'ACTIVE');
        setProviders(list);
        const def = list.find((p) => p.isDefault);
        setOcrProviderId(def ? def.id : '');
      } catch {
        /* 忽略：无识别方式时由后端退回默认/环境变量 */
      }
    })();
  }, []);

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
      fd.append('category', category);
      unitIds.forEach((id) => fd.append('unitIds', id));
      if (ocrProviderId) fd.append('ocrProviderId', ocrProviderId);
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
          <label className={labelCls}>试卷分类</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCategory('EXERCISE')}
              className={`px-2 py-2 text-xs rounded-lg border text-center transition-colors ${
                category === 'EXERCISE'
                  ? 'bg-primary text-white border-primary'
                  : 'bg-[#111722] text-[#92a4c9] border-[#324467] hover:border-primary'
              }`}
            >
              习题与试卷
            </button>
            <button
              type="button"
              onClick={() => setCategory('ASSESSMENT')}
              className={`px-2 py-2 text-xs rounded-lg border text-center transition-colors ${
                category === 'ASSESSMENT'
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-[#111722] text-[#92a4c9] border-[#324467] hover:border-amber-500'
              }`}
            >
              初测与水平评估
            </button>
          </div>
          <p className="text-[#5b6b8c] text-[11px] mt-1">
            导入的试卷将归入所选分类；「初测与水平评估」不区分难度，供任务初测或水平评估使用
          </p>
        </div>
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
        <div>
          <label className={labelCls}>OCR 识别方式</label>
          <select
            value={ocrProviderId}
            onChange={(e) => setOcrProviderId(e.target.value)}
            disabled={busy}
            className={inputCls}
          >
            <option value="">默认方式（系统配置）</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.method === 'LOCAL_SERVICE'
                  ? '（本地 OCR）'
                  : p.method === 'LOCAL_VISION'
                    ? '（本地视觉）'
                    : '（厂商 API）'}
                {p.isDefault ? ' · 默认' : ''}
              </option>
            ))}
          </select>
          <p className="text-[#5b6b8c] text-[11px] mt-1">
            图片 / 扫描件识别方式；留空则使用系统默认配置。未配置视觉模型时仅支持文本格式。
          </p>
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
/** 试卷教材关联编辑弹窗（详情页「编辑教材」） */
const EditPaperMetaModal = ({
  paper,
  onClose,
  onSaved,
}: {
  paper: PaperDetail;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [tbId, setTbId] = useState(paper.textbookId || '');
  const [unitIds, setUnitIds] = useState<string[]>(paper.unitIds || []);
  const [tbSubject, setTbSubject] = useState<string | undefined>(paper.subject);
  const [paperType, setPaperType] = useState<string>(paper.paperType || 'UNIT');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const isGlobal = paperType === 'ZHONGKAO' || paperType === 'GAOKAO';
    if (!isGlobal && !tbId) {
      setErr('常规试卷必须选择关联教材（中考/高考卷除外）');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await request.patch<ApiResponse>('/admin/question-bank/papers/' + paper.id, {
        textbookId: tbId || undefined,
        paperType,
        unitIds,
        subject: tbSubject || paper.subject,
      });
      onSaved();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={'编辑教材关联：' + paper.title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <TextbookUnitSelector
          subject={paper.subject}
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
          className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50"
        >
          {submitting ? '保存中…' : '保存'}
        </button>
      </div>
    </Modal>
  );
};

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
  const [showEditMeta, setShowEditMeta] = useState(false);

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
          <div className="flex gap-2">
            <button
              onClick={() => setShowEditMeta(true)}
              className="px-3 py-1.5 text-xs rounded-lg bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25"
            >
              编辑教材关联
            </button>
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
      {showEditMeta && paper && (
        <EditPaperMetaModal
          paper={paper}
          onClose={() => setShowEditMeta(false)}
          onSaved={() => {
            setShowEditMeta(false);
            void load();
          }}
        />
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
    // 新建试题必填：关联教材（版本/年级）与单元（避免题库体系混乱，训练舱可按单元索引）
    if (!isEdit) {
      if (!tbId) {
        setErr('请选择关联教材（教材含版本与年级）');
        return;
      }
      if (unitIds.length === 0) {
        setErr('请选择关联单元（单选）');
        return;
      }
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

/** 导出题库弹窗（按试卷筛选 → .zxbank 自描述 JSON，带鉴权下载） */
const ExportBankModal = ({
  subject,
  subjects,
  onClose,
}: {
  subject: string;
  subjects: string[];
  onClose: () => void;
}) => {
  const [selSubject, setSelSubject] = useState(subject);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [includeTaxonomy, setIncludeTaxonomy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [counts, setCounts] = useState<BankExport['counts'] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadPapers = useCallback(
    async (subj: string) => {
      setLoading(true);
      setErr(null);
      try {
        const params = new URLSearchParams({ limit: '1000' });
        if (subj) params.set('subject', subj);
        const res = await request.get<ApiResponse<PagedResult<Paper>>>(
          `/admin/question-bank/papers?${params.toString()}`
        );
        setPapers(res.data.items || []);
        setSelectedIds([]);
        setCounts(null);
      } catch (e) {
        setErr(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadPapers(selSubject);
  }, [selSubject, loadPapers]);

  const toggle = (id: string) =>
    setSelectedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const buildQuery = () => {
    const q = new URLSearchParams();
    if (selSubject) q.set('subject', selSubject);
    if (selectedIds.length) q.set('paperIds', selectedIds.join(','));
    q.set('includeTaxonomy', String(includeTaxonomy));
    return q.toString();
  };

  const preview = async () => {
    setErr(null);
    try {
      const res = await request.get<ApiResponse<BankExport>>(
        `/admin/question-bank/export?${buildQuery()}`
      );
      setCounts(res.data.counts);
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const exportNow = async () => {
    setExporting(true);
    setErr(null);
    try {
      const token = useAuthStore.getState().token;
      const base = import.meta.env.VITE_API_BASE_URL || '/api';
      const res = await fetch(`${base}/admin/question-bank/export?${buildQuery()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`导出失败（${res.status}）`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `zhixue-bank-${new Date().toISOString().slice(0, 10)}.zxbank`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(getErrorMessage(e, '导出失败'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal title="导出题库数据" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-[#92a4c9] text-xs leading-relaxed">
          选择科目与试卷后导出为 <code className="text-primary">.zxbank</code> 自描述 JSON（含试卷、题目、卷内关系，可选附带教材节点）。
          该文件可在生产环境通过「导入数据」直接入库。
        </p>

        <div>
          <label className={labelCls}>科目</label>
          <select
            value={selSubject}
            onChange={(e) => setSelSubject(e.target.value)}
            className={inputCls}
          >
            <option value="">全部科目</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>
            试卷范围（不选则导出「全部科目/当前科目」的所有试卷）
          </label>
          {loading ? (
            <p className="text-[#5b6b8c] text-xs">加载试卷中...</p>
          ) : papers.length === 0 ? (
            <p className="text-[#5b6b8c] text-xs">该科目暂无试卷，将导出全部题目数据。</p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto rounded-lg bg-[#111722] border border-[#324467] p-2">
              {papers.map((p) => {
                const checked = selectedIds.includes(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ${
                      checked ? 'bg-primary/20 text-white' : 'text-[#92a4c9] hover:bg-[#232f48]'
                    }`}
                  >
                    <span
                      className={`size-4 rounded border flex items-center justify-center text-[12px] ${
                        checked ? 'bg-primary border-primary text-white' : 'border-[#324467]'
                      }`}
                    >
                      {checked ? '✓' : ''}
                    </span>
                    <span className="truncate">{p.title}</span>
                    <span className="text-[#5b6b8c] text-xs ml-auto">{p._count?.items ?? 0} 题</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={includeTaxonomy}
            onChange={(e) => setIncludeTaxonomy(e.target.checked)}
          />
          <span className="text-[#92a4c9] text-sm">附带教材节点（使文件自包含，便于跨环境导入）</span>
        </label>

        {err && <p className="text-red-400 text-sm">{err}</p>}

        {counts && (
          <div className="rounded-lg bg-[#232f48] p-4 text-sm">
            <p className="text-white font-medium mb-2">预计导出：</p>
            <div className="grid grid-cols-2 gap-2 text-[#92a4c9]">
              <span>题目：{counts.questions}</span>
              <span>试卷：{counts.papers}</span>
              <span>卷内关系：{counts.paperItems}</span>
              <span>教材节点：{counts.materialNodes}</span>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => void preview()}
            className="px-4 py-2.5 bg-[#232f48] text-white rounded-lg text-sm font-medium hover:bg-[#324467] transition-colors"
          >
            预览命中数
          </button>
          <button
            onClick={() => void exportNow()}
            disabled={exporting}
            className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {exporting ? '导出中...' : '导出题库（.zxbank）'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

/** 导入题库数据弹窗（上传 .zxbank → 按 id 幂等 upsert） */
const ImportDataModal = ({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (msg: string) => void;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'done' | 'failed'>('idle');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [message, setMessage] = useState('');

  const upload = async () => {
    if (!file) {
      setMessage('请先选择 .zxbank 文件');
      return;
    }
    setPhase('uploading');
    setMessage('导入中（按 id 幂等写入，可能需要片刻）...');
    setSummary(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await request.post<ApiResponse<ImportSummary>>(
        '/admin/question-bank/import-data',
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setSummary(res.data);
      setPhase('done');
      setMessage('导入完成。');
      onDone('题库数据已导入');
    } catch (e) {
      setPhase('failed');
      setMessage(getErrorMessage(e));
    }
  };

  const busy = phase === 'uploading';

  return (
    <Modal title="导入题库数据" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-[#92a4c9] text-xs leading-relaxed">
          上传此前导出的 <code className="text-primary">.zxbank</code> 文件，系统将按 id 幂等写入
          教材节点 / 题目 / 试卷 / 卷内题目（已存在则更新）。适用于生产环境直接灌入结构化数据。
        </p>

        <div>
          <label className={labelCls}>数据文件 *（.zxbank / .json）</label>
          <input
            type="file"
            accept=".zxbank,.json"
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

        {summary && (
          <div className="rounded-lg bg-[#232f48] p-4 text-sm">
            <div className="grid grid-cols-2 gap-2 text-[#92a4c9]">
              <span>题目 新建/更新：{summary.questionsCreated}/{summary.questionsUpdated}</span>
              <span>试卷 新建/更新：{summary.papersCreated}/{summary.papersUpdated}</span>
              <span>卷内 新建/更新：{summary.paperItemsCreated}/{summary.paperItemsUpdated}</span>
              <span>教材节点 新建/更新：{summary.materialNodesCreated}/{summary.materialNodesUpdated}</span>
            </div>
            {summary.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-red-400 text-xs mb-1">部分记录导入失败（{summary.errors.length}）：</p>
                <ul className="text-red-400/80 text-xs list-disc pl-5 max-h-32 overflow-y-auto">
                  {summary.errors.slice(0, 20).map((er, i) => (
                    <li key={i}>{er}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => void upload()}
            disabled={busy || !file}
            className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {busy ? '导入中...' : '开始导入'}
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

/** 文件夹导入弹窗（V2）：webkitdirectory 多文件 + 相对路径 → 自动生成目录树 */
const FolderImportModal: React.FC<{
  subject: string;
  onClose: () => void;
  onStarted: (count: number) => void;
}> = ({ subject, onClose, onStarted }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [paths, setPaths] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<Array<{ name: string; status: string }>>([]);

  const handleSelect = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).filter((f) => /\.(docx|pdf|doc|txt|md|png|jpe?g|bmp)$/i.test(f.name));
    setFiles(arr);
    // 相对路径：webkitRelativePath 形如 "根目录/子目录/文件.docx"，全保留用于生成目录
    setPaths(arr.map((f) => f.webkitRelativePath || f.name));
  };

  const handleImport = async () => {
    if (files.length === 0) return alert('请先选择文件夹（将自动识别其中可解析文件）');
    setImporting(true);
    const form = new FormData();
    for (const f of files) {
      form.append('files', f);
    }
    form.append('paths', paths.join('\n'));
    form.append('subject', subject);
    form.append('paperType', 'UNIT');
    try {
      const res = await request.post<{ success: boolean; data: { jobIds: string[]; skipped: number } }>(
        '/admin/question-bank/import-folder',
        form
      );
      const ids = res.data?.jobIds || [];
      setProgress(ids.map((id, i) => ({ name: files[i]?.name || id.slice(0, 8), status: 'PROCESSING' })));
      onStarted(ids.length);
      // 后台轮询进度（只展示前 8 个）
      const timer = setInterval(async () => {
        const sts: Array<{ name: string; status: string }> = [];
        for (let i = 0; i < Math.min(ids.length, 8); i++) {
          try {
            const q = await request.get<{ success: boolean; data: { status: string } }>(
              `/admin/question-bank/import/${ids[i]}`
            );
            sts.push({ name: files[i]?.name || '', status: q.data.status });
          } catch {
            sts.push({ name: files[i]?.name || '', status: 'ERROR' });
          }
        }
        setProgress(sts);
        if (sts.every((s) => s.status === 'DONE' || s.status === 'FAILED')) clearInterval(timer);
      }, 6000);
    } catch (e) {
      alert(getErrorMessage(e, '导入失败'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal title={`导入文件夹 · ${subject}`} onClose={onClose}>
      <div className="p-5 space-y-4">
        <p className="text-xs text-[#5b6b8c]">
          选择文件夹后，将按相对路径自动生成多级分类目录（一级目录=所选文件夹名），
          每个可解析文件（docx/pdf/txt/图片）单独建卷。文件较多时后台逐个处理，可先关闭本窗口。
        </p>
        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#324467] py-8 cursor-pointer hover:border-primary/60 transition-colors">
          <span className="material-symbols-outlined text-[32px] text-[#92a4c9]">folder_open</span>
          <span className="text-sm text-[#92a4c9]">{files.length > 0 ? `已选 ${files.length} 个可解析文件` : '点击选择文件夹'}</span>
          <input
            type="file"
            className="hidden"
            multiple
            // @ts-ignore webkitdirectory 为非标准属性
            webkitdirectory=""
            // @ts-ignore
            directory=""
            onChange={(e) => handleSelect(e.target.files)}
          />
        </label>
        {files.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg bg-[#1a2332] border border-[#324467] p-2 space-y-1">
            {files.slice(0, 12).map((f, i) => (
              <div key={i} className="text-xs text-[#92a4c9] truncate">{paths[i]?.slice(0, 80) || f.name}</div>
            ))}
            {files.length > 12 && <div className="text-xs text-[#5b6b8c]">…共 {files.length} 个</div>}
          </div>
        )}
        {progress.length > 0 && (
          <div className="rounded-lg bg-[#1a2332] border border-[#324467] p-2 space-y-1 max-h-32 overflow-y-auto">
            {progress.map((p, i) => (
              <div key={`${p.name}-${i}`} className="flex items-center justify-between text-xs">
                <span className="text-[#92a4c9] truncate">{p.name.slice(0, 30)}</span>
                <span className={p.status === 'DONE' ? 'text-green-400' : p.status === 'FAILED' ? 'text-red-400' : 'text-amber-300'}>
                  {p.status === 'PROCESSING' ? '处理中…' : p.status}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-[#324467] text-[#92a4c9] rounded-lg">关闭</button>
          <button
            onClick={() => void handleImport()}
            disabled={importing || files.length === 0}
            className="px-4 py-2 bg-emerald-500 text-white rounded-lg disabled:opacity-40"
          >
            {importing ? '提交中…' : '开始导入'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

/** 多级目录树（V2）：折叠展示，末级可选中；初测目录带系统标识 */
const CategoryTree: React.FC<{
  nodes: CategoryNode[];
  activeId: string;
  onSelect: (id: string, isAssessment: boolean) => void;
  depth?: number;
}> = ({ nodes, activeId, onSelect, depth = 0 }) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <div className="space-y-0.5">
      {nodes.map((n) => {
        const hasKids = n.children && n.children.length > 0;
        const isOpen = !collapsed[n.id];
        const isAssessment = n.system && n.name === '初测与水平评估';
        return (
          <div key={n.id}>
            <div
              className={`flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                activeId === n.id
                  ? 'bg-primary/20 text-primary'
                  : 'text-[#92a4c9] hover:bg-[#232f48] hover:text-white'
              }`}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => onSelect(n.id, !!isAssessment)}
            >
              {hasKids ? (
                <button
                  className="text-[#5b6b8c]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((c) => ({ ...c, [n.id]: !c[n.id] }));
                  }}
                >
                  <span className="material-symbols-outlined text-[14px]">{isOpen ? 'expand_more' : 'chevron_right'}</span>
                </button>
              ) : (
                <span className="text-[#5b6b8c] w-[14px] text-center material-symbols-outlined text-[12px]">chevron_right</span>
              )}
              <span className={`truncate ${isAssessment ? 'text-amber-300' : ''}`}>
                {isAssessment ? '🛡️' : '📁'} {n.name}
              </span>
              {n._count && n._count.papers > 0 && (
                <span className="text-[10px] text-[#5b6b8c] ml-auto">{n._count.papers}</span>
              )}
              {n.immutable && (
                <span className="text-[9px] text-amber-500/70" title="系统目录，禁止重命名/删除">
                  系统
                </span>
              )}
            </div>
            {hasKids && isOpen && (
              <CategoryTree nodes={n.children} activeId={activeId} onSelect={onSelect} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default QuestionBankManagement;
