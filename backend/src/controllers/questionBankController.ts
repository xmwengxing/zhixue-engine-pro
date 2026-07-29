import { Request, Response } from 'express';
import * as questionBankService from '../services/questionBankService';
import * as questionImportService from '../services/questionImportService';
import { QuestionType, PaperStatus } from '@prisma/client';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(docx|pdf|txt|text|md|markdown|png|jpe?g|bmp|gif|webp)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('仅支持 docx / pdf / txt / md / 图片 格式'));
  },
});

function getUserId(req: Request): string {
  return (req as any).user?.id ?? 'system';
}

// 将 query 参数统一为单个字符串（express 可能为数组）
function one(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
}

// 将路由参数 id 统一为字符串
function pid(req: Request): string {
  const v = req.params.id;
  return Array.isArray(v) ? v[0] : (v as string);
}

// ============ 科目 ============
export const listSubjects = async (_req: Request, res: Response) => {
  try {
    const subjects = await questionBankService.listSubjects();
    return res.json({ success: true, data: { subjects } });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// ============ 试卷 ============
export const listPapers = async (req: Request, res: Response) => {
  try {
    const result = await questionBankService.listPapers({
      subject: one(req.query.subject),
      status: one(req.query.status) as PaperStatus | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return res.json({ success: true, data: result });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const getPaper = async (req: Request, res: Response) => {
  try {
    const paper = await questionBankService.getPaper(pid(req));
    if (!paper) return res.status(404).json({ success: false, message: '试卷不存在' });
    return res.json({ success: true, data: paper });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const createPaper = async (req: Request, res: Response) => {
  try {
    const { subject, title, grade, textbookId, paperType, term, version, unitIds } = req.body;
    if (!subject || !title) {
      return res.status(400).json({ success: false, message: '缺少 subject / title' });
    }
    const paper = await questionBankService.createPaper({
      subject,
      title,
      grade,
      createdBy: getUserId(req),
      textbookId,
      paperType,
      term,
      version,
      unitIds: Array.isArray(unitIds) ? unitIds : undefined,
    });
    return res.status(201).json({ success: true, data: paper });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
};

export const deletePaper = async (req: Request, res: Response) => {
  try {
    await questionBankService.deletePaper(pid(req));
    return res.json({ success: true, message: '已删除' });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
};

export const publishPaper = async (req: Request, res: Response) => {
  try {
    const paper = await questionBankService.publishPaper(pid(req));
    return res.json({ success: true, data: paper });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
};

export const addPaperItem = async (req: Request, res: Response) => {
  try {
    const { questionId, score } = req.body;
    if (!questionId) return res.status(400).json({ success: false, message: '缺少 questionId' });
    const item = await questionBankService.addPaperItem(
      pid(req),
      questionId,
      score ? Number(score) : 0
    );
    return res.status(201).json({ success: true, data: item });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
};

export const removePaperItem = async (req: Request, res: Response) => {
  try {
    await questionBankService.removePaperItem(pid(req));
    return res.json({ success: true, message: '已移除' });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
};

// ============ 题目 ============
export const listQuestions = async (req: Request, res: Response) => {
  try {
    const result = await questionBankService.listQuestions({
      subject: one(req.query.subject),
      type: one(req.query.type) as QuestionType | undefined,
      knowledgePoint: one(req.query.knowledgePoint),
      paperId: one(req.query.paperId),
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return res.json({ success: true, data: result });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const getQuestion = async (req: Request, res: Response) => {
  try {
    const q = await questionBankService.getQuestion(pid(req));
    if (!q) return res.status(404).json({ success: false, message: '题目不存在' });
    return res.json({ success: true, data: q });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const updateQuestion = async (req: Request, res: Response) => {
  try {
    const q = await questionBankService.updateQuestion(pid(req), req.body);
    return res.json({ success: true, data: q });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
};

export const createQuestion = async (req: Request, res: Response) => {
  try {
    const {
      subject,
      stem,
      type,
      answer,
      difficulty,
      knowledgePoints,
      answerType,
      answerConfig,
      textbookId,
      unitIds,
    } = req.body;
    if (!subject || !stem || !type || !answer || difficulty == null || !knowledgePoints) {
      return res.status(400).json({ success: false, message: '缺少必填字段' });
    }
    const q = await questionBankService.createQuestion({
      subject,
      stem,
      type,
      answer,
      difficulty: Number(difficulty),
      knowledgePoints,
      answerType,
      answerConfig,
      textbookId,
      unitIds: Array.isArray(unitIds) ? unitIds : undefined,
    });
    return res.status(201).json({ success: true, data: q });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
};

// ============ 导入 ============
export const uploadAndImport = [
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      const subject = (req.body as any).subject as string | undefined;
      if (!file) return res.status(400).json({ success: false, message: '请上传文件' });
      if (!subject) return res.status(400).json({ success: false, message: '缺少 subject' });

      const result = await questionImportService.startImport({
        file,
        subject,
        createdBy: getUserId(req),
        textbookId: (req.body as any).textbookId || undefined,
        paperType: (req.body as any).paperType || undefined,
        unitIds: Array.isArray((req.body as any).unitIds)
          ? (req.body as any).unitIds
          : undefined,
      });
      return res.status(202).json({ success: true, data: result });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  },
];

export const getImportJob = async (req: Request, res: Response) => {
  try {
    const job = await questionImportService.getImportJob(pid(req));
    if (!job) return res.status(404).json({ success: false, message: '任务不存在' });
    return res.json({ success: true, data: job });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// ============ AI 难度归类（P2） ============

/**
 * 启动 AI 难度归类后台任务
 * POST /api/admin/question-bank/classify
 * body: { scope: 'ALL'|'UNLABELED'|'PAPER', subject?, paperId? }
 */
export const startDifficultyClassify = async (req: Request, res: Response) => {
  try {
    const { scope, subject, paperId } = req.body as {
      scope?: string;
      subject?: string;
      paperId?: string;
    };
    if (!scope || !['ALL', 'UNLABELED', 'PAPER'].includes(scope)) {
      return res
        .status(400)
        .json({ success: false, message: 'scope 必须是 ALL、UNLABELED 或 PAPER' });
    }
    const svc = await import('../services/difficultyClassifyService');
    const job = await svc.startClassifyJob({
      scope: scope as 'ALL' | 'UNLABELED' | 'PAPER',
      subject,
      paperId,
      startedBy: getUserId(req),
    });
    return res.status(202).json({ success: true, data: job });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
};

/** 归类任务列表 GET /api/admin/question-bank/classify */
export const listDifficultyClassifyJobs = async (_req: Request, res: Response) => {
  const svc = await import('../services/difficultyClassifyService');
  return res.json({ success: true, data: svc.listJobs() });
};

/** 单个归类任务状态 GET /api/admin/question-bank/classify/:id */
export const getDifficultyClassifyJob = async (req: Request, res: Response) => {
  const svc = await import('../services/difficultyClassifyService');
  const job = svc.getJob(pid(req));
  if (!job) return res.status(404).json({ success: false, message: '归类任务不存在' });
  return res.json({ success: true, data: job });
};

/** 低置信度复核列表 GET /api/admin/question-bank/needs-review */
export const listDifficultyNeedsReview = async (req: Request, res: Response) => {
  try {
    const svc = await import('../services/difficultyClassifyService');
    const result = await svc.listNeedsReview(
      one(req.query.subject),
      Number(one(req.query.page)) || 1,
      Number(one(req.query.limit)) || 20
    );
    return res.json({ success: true, data: result });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
};
