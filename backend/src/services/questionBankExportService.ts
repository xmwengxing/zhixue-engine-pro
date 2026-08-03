import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface BankExportFilter {
  paperIds?: string[];
  subject?: string;
  grade?: string;
  term?: string;
  version?: string;
  unitId?: string; // 仅导出关联该单元的题目
  source?: string; // 题目来源 IMPORT/MANUAL/AI_GENERATED
  includeTaxonomy?: boolean; // 是否附带引用的教材节点（material_nodes）
}

export interface BankExport {
  format: 'zhixue-bank';
  version: 1;
  exportedAt: string;
  exportedBy: string;
  filter: BankExportFilter;
  counts: {
    questions: number;
    papers: number;
    paperItems: number;
    materialNodes: number;
  };
  questions: any[];
  papers: any[];
  paperItems: any[];
  materialNodes?: any[];
}

export interface ImportSummary {
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

function withoutId<T extends Record<string, any>>(obj: T): Omit<T, 'id'> {
  const { id, ...rest } = obj;
  return rest as Omit<T, 'id'>;
}

/**
 * 题库导出 / 导入服务（生产环境数据迁移用，自描述 .zxbank 格式）。
 */
export class QuestionBankExportService {
  /**
   * 组装题库导出数据。
   * 导出范围以「试卷」为核心：先确定目标试卷，再取其卷内题目（可按单元/来源/年级等进一步收窄）。
   */
  async buildExport(filter: BankExportFilter, exportedBy: string): Promise<BankExport> {
    const paperWhere: any = {};
    if (filter.subject) paperWhere.subject = filter.subject;
    if (filter.grade) paperWhere.grade = filter.grade;
    if (filter.term) paperWhere.term = filter.term;
    if (filter.version) paperWhere.version = filter.version;
    if (filter.paperIds?.length) paperWhere.id = { in: filter.paperIds };

    const papers = await prisma.questionPaper.findMany({ where: paperWhere });
    const paperIds = papers.map((p) => p.id);

    const paperItems = paperIds.length
      ? await prisma.questionPaperItem.findMany({ where: { paperId: { in: paperIds } } })
      : [];

    // 题目级收窄条件
    const qWhere: any = {};
    if (filter.unitId) qWhere.unitIds = { has: filter.unitId };
    if (filter.source) qWhere.source = filter.source;
    if (filter.grade) qWhere.grade = filter.grade;
    if (filter.term) qWhere.term = filter.term;
    if (filter.version) qWhere.version = filter.version;

    if (paperItems.length) {
      const itemQIds = paperItems.map((i) => i.questionId);
      qWhere.id = qWhere.id ? { in: (qWhere.id as any).in.filter((id: string) => itemQIds.includes(id)) } : { in: itemQIds };
    }

    const questions = await prisma.question.findMany({ where: qWhere });

    // 可选：附带引用的教材节点，使文件自包含
    let materialNodes: any[] | undefined;
    if (filter.includeTaxonomy) {
      const nodeIds = new Set<string>();
      questions.forEach((q) => {
        if (q.materialNodeId) nodeIds.add(q.materialNodeId);
        (q.unitIds || []).forEach((u: string) => nodeIds.add(u));
      });
      papers.forEach((p) => {
        (p.unitIds || []).forEach((u: string) => nodeIds.add(u));
        if (p.textbookId) nodeIds.add(p.textbookId);
      });
      if (nodeIds.size) {
        materialNodes = await prisma.materialNode.findMany({ where: { id: { in: [...nodeIds] } } });
      } else {
        materialNodes = [];
      }
    }

    return {
      format: 'zhixue-bank',
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy,
      filter,
      counts: {
        questions: questions.length,
        papers: papers.length,
        paperItems: paperItems.length,
        materialNodes: materialNodes?.length || 0,
      },
      questions,
      papers,
      paperItems,
      materialNodes,
    };
  }

  /** 校验并应用导入数据（按 id 幂等 upsert）。返回汇总。 */
  async applyImport(data: any, adminId: string): Promise<ImportSummary> {
    const summary: ImportSummary = {
      questionsCreated: 0,
      questionsUpdated: 0,
      papersCreated: 0,
      papersUpdated: 0,
      paperItemsCreated: 0,
      paperItemsUpdated: 0,
      materialNodesCreated: 0,
      materialNodesUpdated: 0,
      errors: [],
    };

    if (!data || data.format !== 'zhixue-bank') {
      throw new Error('文件格式无效：缺少 format="zhixue-bank" 标识');
    }
    if (data.version !== 1) {
      throw new Error(`不支持的版本：version=${data.version}（仅支持 1）`);
    }
    if (!Array.isArray(data.questions) || !Array.isArray(data.papers) || !Array.isArray(data.paperItems)) {
      throw new Error('文件结构无效：缺少 questions / papers / paperItems 数组');
    }

    // 1) 教材节点（若存在）
    for (const n of data.materialNodes || []) {
      try {
        const exists = await prisma.materialNode.findUnique({ where: { id: n.id } });
        if (exists) {
          await prisma.materialNode.update({ where: { id: n.id }, data: withoutId(n) });
          summary.materialNodesUpdated++;
        } else {
          await prisma.materialNode.create({ data: n });
          summary.materialNodesCreated++;
        }
      } catch (e: any) {
        summary.errors.push(`教材节点 ${n.id}: ${e.message}`);
      }
    }

    // 2) 题目
    for (const q of data.questions) {
      try {
        const exists = await prisma.question.findUnique({ where: { id: q.id } });
        if (exists) {
          await prisma.question.update({ where: { id: q.id }, data: withoutId(q) });
          summary.questionsUpdated++;
        } else {
          await prisma.question.create({ data: q });
          summary.questionsCreated++;
        }
      } catch (e: any) {
        summary.errors.push(`题目 ${q.id}: ${e.message}`);
      }
    }

    // 3) 试卷（createdBy 不存在则落到当前管理员，避免外键冲突）
    for (const p of data.papers) {
      try {
        const paperData = { ...p };
        const author = await prisma.user.findUnique({ where: { id: p.createdBy } });
        if (!author) paperData.createdBy = adminId;
        const exists = await prisma.questionPaper.findUnique({ where: { id: p.id } });
        if (exists) {
          await prisma.questionPaper.update({ where: { id: p.id }, data: withoutId(paperData) });
          summary.papersUpdated++;
        } else {
          await prisma.questionPaper.create({ data: paperData });
          summary.papersCreated++;
        }
      } catch (e: any) {
        summary.errors.push(`试卷 ${p.id}: ${e.message}`);
      }
    }

    // 4) 卷内题目
    for (const it of data.paperItems) {
      try {
        const exists = await prisma.questionPaperItem.findUnique({ where: { id: it.id } });
        if (exists) {
          await prisma.questionPaperItem.update({ where: { id: it.id }, data: withoutId(it) });
          summary.paperItemsUpdated++;
        } else {
          await prisma.questionPaperItem.create({ data: it });
          summary.paperItemsCreated++;
        }
      } catch (e: any) {
        summary.errors.push(`卷内题目 ${it.id}: ${e.message}`);
      }
    }

    return summary;
  }
}

export const questionBankExportService = new QuestionBankExportService();
