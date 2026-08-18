import { PrismaClient, QuestionPaperCategory } from '@prisma/client';

const prisma = new PrismaClient();

/** 系统内置目录：初测与水平评估（被训练舱 AI 调用，禁止重命名/删除） */
export const ASSESSMENT_CATEGORY_NAME = '初测与水平评估';

/** 惰性确保每学科存在「初测与水平评估」一级目录（system + immutable） */
export async function ensureAssessmentCategory(subject: string): Promise<{ id: string; name: string }> {
  const exist = await prisma.paperCategory.findFirst({
    where: { subject, name: ASSESSMENT_CATEGORY_NAME, parentId: null },
  });
  if (exist) return { id: exist.id, name: exist.name };
  return prisma.paperCategory.create({
    data: { name: ASSESSMENT_CATEGORY_NAME, subject, level: 1, system: true, immutable: true, sortOrder: 0 },
  });
}

/** 系统内置目录：通用与其他（无目录的导入/新建试卷默认挂载，禁止重命名/删除） */
export const GENERAL_CATEGORY_NAME = '通用与其他';

/** 系统级考试分类目录（期中/期末/专项/单元，禁止重命名/删除；已存在则修正为 system+immutable） */
export const EXAM_CATEGORY_NAMES = ['期中', '期末', '专项', '单元'] as const;

/** 惰性确保每学科存在「通用与其他」一级目录（system + immutable） */
export async function ensureGeneralCategory(subject: string): Promise<{ id: string; name: string }> {
  const exist = await prisma.paperCategory.findFirst({
    where: { subject, name: GENERAL_CATEGORY_NAME, parentId: null },
  });
  if (exist) return { id: exist.id, name: exist.name };
  return prisma.paperCategory.create({
    data: { name: GENERAL_CATEGORY_NAME, subject, level: 1, system: true, immutable: true, sortOrder: 10 },
  });
}

/** 惰性确保每学科存在 期中/期末/专项/单元 四个系统级一级目录 */
export async function ensureExamCategories(subject: string) {
  const orderBase = 20; // 初测 0 / 通用 10 之后依次：期中 20、期末 30、专项 40、单元 50
  for (let i = 0; i < EXAM_CATEGORY_NAMES.length; i++) {
    const name = EXAM_CATEGORY_NAMES[i];
    const exist = await prisma.paperCategory.findFirst({
      where: { subject, name, parentId: null },
    });
    if (exist) {
      // 已存在（如早期手动创建）→ 修正为系统目录属性
      if (!exist.system || !exist.immutable || exist.sortOrder !== orderBase + i * 10) {
        await prisma.paperCategory.update({
          where: { id: exist.id },
          data: { system: true, immutable: true, sortOrder: orderBase + i * 10 },
        });
      }
      continue;
    }
    await prisma.paperCategory.create({
      data: { name, subject, level: 1, system: true, immutable: true, sortOrder: orderBase + i * 10 },
    });
  }
}

/** 目录树（含系统初测目录；papers 数统计到末级） */
export async function getCategoryTree(subject?: string) {
  const where = subject ? { subject } : {};
  const nodes = await prisma.paperCategory.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { papers: true, children: true } } },
  });
  // 若学科无初测目录则创建
  if (subject) {
    await ensureAssessmentCategory(subject);
    await ensureGeneralCategory(subject);
    await ensureExamCategories(subject);
    const nodes2 = await prisma.paperCategory.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { papers: true, children: true } } },
    });
    return buildTree(nodes2);
  }
  return buildTree(nodes);
}

function buildTree(nodes: any[]): any[] {
  const map = new Map<string, any>();
  nodes.forEach((n) => map.set(n.id, { ...n, children: [] }));
  const roots: any[] = [];
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}

/** 手动新建一级目录 */
export async function createRootCategory(subject: string, name: string) {
  const trimmed = String(name).trim();
  if (!trimmed) throw new Error('目录名称不能为空');
  if (trimmed === ASSESSMENT_CATEGORY_NAME) {
    throw new Error('「初测与水平评估」为系统目录，由系统维护');
  }
  if (trimmed === GENERAL_CATEGORY_NAME) {
    throw new Error('「通用与其他」为系统目录，由系统维护');
  }
  const exist = await prisma.paperCategory.findFirst({ where: { subject, name: trimmed, parentId: null } });
  if (exist) throw new Error(`一级目录「${trimmed}」已存在`);
  return prisma.paperCategory.create({
    data: { name: trimmed, subject, level: 1 },
  });
}

/** 批量创建子目录（导入文件夹时按相对路径生成），返回路径→节点映射 */
export async function ensurePathCategories(
  subject: string,
  pathSegments: string[]
): Promise<{ id: string; name: string; level: number } | null> {
  const segs = pathSegments.filter((s) => s && s.trim());
  if (segs.length === 0) return null;
  let parentId: string | null = null;
  let current: { id: string; name: string; level: number } | null = null;
  for (let i = 0; i < segs.length; i++) {
    const name = segs[i].trim();
    if (!name) continue;
    if (name === ASSESSMENT_CATEGORY_NAME) throw new Error(`文件夹路径不能使用系统目录名「${ASSESSMENT_CATEGORY_NAME}」`);
    const exist: { id: string; name: string; level: number } | null = await prisma.paperCategory.findFirst({
      where: { subject, name, parentId },
      select: { id: true, name: true, level: true },
    });
    if (exist) {
      current = exist;
    } else {
      current = await prisma.paperCategory.create({
        data: { name, subject, parentId, level: i + 1 },
      });
    }
    parentId = current.id;
  }
  return current;
}

/** 重命名目录（immutable 禁止） */
export async function renameCategory(id: string, name: string) {
  const node = await prisma.paperCategory.findUnique({ where: { id } });
  if (!node) throw new Error('目录不存在');
  if (node.immutable) throw new Error('「初测与水平评估」为系统目录，禁止重命名');
  return prisma.paperCategory.update({ where: { id }, data: { name: String(name).trim() } });
}

/** 删除目录（immutable 禁止；级联删除子目录与解除试卷关联） */
export async function deleteCategory(id: string) {
  const node = await prisma.paperCategory.findUnique({ where: { id } });
  if (!node) throw new Error('目录不存在');
  if (node.immutable) throw new Error('「初测与水平评估」为系统目录，禁止删除');
  // 目录下试卷 categoryId 置空（ON DELETE SET NULL 由 FK 处理），并同步 category=EXERCISE
  await prisma.questionPaper.updateMany({ where: { categoryId: id }, data: { category: 'EXERCISE', categoryId: null } });
  await prisma.paperCategory.delete({ where: { id } });
}

/**
 * 试卷移动目录后同步 category 字段（初测目录 → ASSESSMENT，其余 → EXERCISE）
 * 兼容训练舱按 category='ASSESSMENT' 取初测卷
 */
export async function syncPaperCategoryField(paperId: string, categoryId: string | null) {
  let category: QuestionPaperCategory = 'EXERCISE';
  if (categoryId) {
    const node = await prisma.paperCategory.findUnique({ where: { id: categoryId } });
    if (node?.name === ASSESSMENT_CATEGORY_NAME) category = 'ASSESSMENT';
  }
  await prisma.questionPaper.update({ where: { id: paperId }, data: { category, categoryId } });
  return category;
}

// ==================== 试卷标签 ====================

export async function listTags(subject?: string) {
  return prisma.paperTag.findMany({
    where: subject ? { subject } : {},
    orderBy: { createdAt: 'asc' },
  });
}

export async function createTag(subject: string, name: string, color?: string) {
  const trimmed = String(name).trim();
  if (!trimmed) throw new Error('标签名称不能为空');
  const exist = await prisma.paperTag.findFirst({ where: { subject, name: trimmed } });
  if (exist) throw new Error(`标签「${trimmed}」已存在`);
  return prisma.paperTag.create({ data: { subject, name: trimmed, color: color || '#3b82f6' } });
}

export async function renameTag(id: string, name: string, color?: string) {
  return prisma.paperTag.update({ where: { id }, data: { name: String(name).trim(), ...(color ? { color } : {}) } });
}

export async function deleteTag(id: string) {
  // 从所有试卷的 tagIds 移除
  const papers = await prisma.questionPaper.findMany({ where: { tagIds: { has: id } }, select: { id: true, tagIds: true } });
  for (const p of papers) {
    await prisma.questionPaper.update({ where: { id: p.id }, data: { tagIds: p.tagIds.filter((t) => t !== id) } });
  }
  await prisma.paperTag.delete({ where: { id } });
}

/** 试卷设标签 */
export async function setPaperTags(paperId: string, tagIds: string[]) {
  return prisma.questionPaper.update({ where: { id: paperId }, data: { tagIds } });
}

export const paperCategoryService = {
  ASSESSMENT_CATEGORY_NAME,
  ensureAssessmentCategory,
  ensureGeneralCategory,
  ensureExamCategories,
  getCategoryTree,
  createRootCategory,
  ensurePathCategories,
  renameCategory,
  deleteCategory,
  syncPaperCategoryField,
  listTags,
  createTag,
  renameTag,
  deleteTag,
  setPaperTags,
};
