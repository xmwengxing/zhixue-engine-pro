import { PrismaClient, MaterialNodeType } from '@prisma/client';

const prisma = new PrismaClient();

// 教材节点创建数据接口
interface CreateMaterialNodeData {
  name: string;
  type: MaterialNodeType;
  parentId?: string;
  order?: number;
  metadata?: {
    description?: string;
    keywords?: string[];
  };
}

// 教材节点更新数据接口
interface UpdateMaterialNodeData {
  name?: string;
  type?: MaterialNodeType;
  parentId?: string;
  order?: number;
  metadata?: {
    description?: string;
    keywords?: string[];
  };
}

/**
 * 获取所有教材节点（树形结构）
 */
export const getAllMaterials = async () => {
  // 获取所有教材节点
  const materials = await prisma.materialNode.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });

  // 构建树形结构
  const buildTree = (parentId: string | null = null): any[] => {
    return materials
      .filter((node) => node.parentId === parentId)
      .map((node) => ({
        ...node,
        children: buildTree(node.id),
      }));
  };

  return buildTree(null);
};

/**
 * 根据 ID 获取教材节点
 */
export const getMaterialById = async (id: string) => {
  const material = await prisma.materialNode.findUnique({
    where: { id },
    include: {
      parent: true,
      children: true,
    },
  });

  if (!material) {
    throw new Error('教材节点不存在');
  }

  return material;
};

/**
 * 创建教材节点
 */
export const createMaterial = async (data: CreateMaterialNodeData) => {
  // 验证父节点是否存在
  if (data.parentId) {
    const parent = await prisma.materialNode.findUnique({
      where: { id: data.parentId },
    });

    if (!parent) {
      throw new Error('父节点不存在');
    }
  }

  // 创建教材节点
  const material = await prisma.materialNode.create({
    data: {
      name: data.name,
      type: data.type,
      parentId: data.parentId || null,
      order: data.order || 0,
      metadata: data.metadata || {},
    },
  });

  return material;
};

/**
 * 更新教材节点
 */
export const updateMaterial = async (
  id: string,
  data: UpdateMaterialNodeData
) => {
  // 检查节点是否存在
  const existingMaterial = await prisma.materialNode.findUnique({
    where: { id },
  });

  if (!existingMaterial) {
    throw new Error('教材节点不存在');
  }

  // 如果更新父节点，验证父节点是否存在
  if (data.parentId !== undefined) {
    if (data.parentId === id) {
      throw new Error('节点不能设置自己为父节点');
    }

    if (data.parentId) {
      const parent = await prisma.materialNode.findUnique({
        where: { id: data.parentId },
      });

      if (!parent) {
        throw new Error('父节点不存在');
      }

      // 检查是否会形成循环引用
      const isDescendant = await checkIsDescendant(id, data.parentId);
      if (isDescendant) {
        throw new Error('不能将节点移动到其子节点下，会形成循环引用');
      }
    }
  }

  // 更新教材节点
  const material = await prisma.materialNode.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.parentId !== undefined && { parentId: data.parentId || null }),
      ...(data.order !== undefined && { order: data.order }),
      ...(data.metadata !== undefined && { metadata: data.metadata }),
    },
  });

  return material;
};

/**
 * 删除教材节点
 */
export const deleteMaterial = async (id: string) => {
  // 检查节点是否存在
  const material = await prisma.materialNode.findUnique({
    where: { id },
    include: {
      children: true,
      questions: true,
    },
  });

  if (!material) {
    throw new Error('教材节点不存在');
  }

  // 检查是否有子节点
  if (material.children.length > 0) {
    throw new Error('该节点存在子节点，无法删除。请先删除所有子节点。');
  }

  // 检查是否被题目引用
  if (material.questions.length > 0) {
    throw new Error(
      `该节点被 ${material.questions.length} 道题目引用，无法删除。请先删除或移动相关题目。`
    );
  }

  // 删除节点
  await prisma.materialNode.delete({
    where: { id },
  });

  return { success: true, message: '教材节点已删除' };
};

/**
 * 检查节点 A 是否是节点 B 的后代
 */
const checkIsDescendant = async (
  ancestorId: string,
  descendantId: string
): Promise<boolean> => {
  let currentId: string | null = descendantId;

  while (currentId) {
    if (currentId === ancestorId) {
      return true;
    }

    const node: { parentId: string | null } | null = await prisma.materialNode.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });

    currentId = node?.parentId || null;
  }

  return false;
};

/**
 * 批量导入教材数据
 */
export const importMaterials = async (materials: CreateMaterialNodeData[]) => {
  const results = [];

  for (const material of materials) {
    try {
      const created = await createMaterial(material);
      results.push({ success: true, material: created });
    } catch (error: any) {
      results.push({
        success: false,
        error: error.message,
        material: material.name,
      });
    }
  }

  return results;
};

// ============ 教材（TEXTBOOK）专有服务 ============
// 教材 = 一个学科+版本+年级+学期的组合；其下子节点 UNIT 为各单元。

export interface TextbookUnitInput {
  seq: number;
  name: string;
}

export interface CreateTextbookData {
  subject: string;
  version: string;
  grade: string; // "7" | "8" | "9" ...
  term: 'UP' | 'DOWN';
  description?: string;
  notes?: string;
  keywords?: string[];
  units: TextbookUnitInput[];
  order?: number;
}

export interface UpdateTextbookData {
  subject?: string;
  version?: string;
  grade?: string;
  term?: 'UP' | 'DOWN';
  description?: string;
  notes?: string;
  keywords?: string[];
  units?: TextbookUnitInput[];
  order?: number;
}

export interface TextbookFilter {
  subject?: string;
  version?: string;
  grade?: string;
  term?: string;
}

export function gradeLabel(grade?: string | null): string {
  if (!grade) return '';
  const map: Record<string, string> = {
    '1': '一年级', '2': '二年级', '3': '三年级', '4': '四年级',
    '5': '五年级', '6': '六年级', '7': '七年级', '8': '八年级', '9': '九年级',
  };
  return map[grade] || `${grade}年级`;
}

export function termLabel(term?: string | null): string {
  if (term === 'UP') return '上';
  if (term === 'DOWN') return '下';
  return '';
}

function textbookName(d: { subject: string; version: string; grade?: string | null; term?: string | null }): string {
  return `${d.subject}-${d.version}-${gradeLabel(d.grade)}${termLabel(d.term)}`;
}

async function getTextbookDetail(id: string) {
  const n = await prisma.materialNode.findUnique({
    where: { id },
    include: { children: { where: { type: 'UNIT' }, orderBy: { order: 'asc' } } },
  });
  if (!n) throw new Error('教材不存在');
  const m = n.metadata as any;
  const units = (n.children || []).map((c: any) => ({
    id: c.id,
    seq: (c.metadata as any)?.seq,
    name: (c.metadata as any)?.name ?? c.name,
  }));
  return {
    id: n.id,
    name: n.name,
    order: n.order,
    subject: m.subject,
    version: m.version,
    grade: m.grade,
    term: m.term,
    description: m.description || '',
    notes: m.notes || '',
    keywords: m.keywords || [],
    unitCount: units.length,
    units,
  };
}

/**
 * 扁平列出所有教材（教材体系表格用），支持筛选
 */
export const listTextbooks = async (filter?: TextbookFilter) => {
  const where: any = { type: 'TEXTBOOK' };
  const and: any[] = [];
  if (filter?.subject) and.push({ metadata: { path: ['subject'], equals: filter.subject } });
  if (filter?.version) and.push({ metadata: { path: ['version'], equals: filter.version } });
  if (filter?.grade) and.push({ metadata: { path: ['grade'], equals: filter.grade } });
  if (filter?.term) and.push({ metadata: { path: ['term'], equals: filter.term } });
  if (and.length) where.AND = and;

  const nodes = await prisma.materialNode.findMany({
    where,
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    include: { children: { where: { type: 'UNIT' }, orderBy: { order: 'asc' } } },
  });

  return nodes.map((n) => {
    const m = n.metadata as any;
    const units = (n.children || []).map((c: any) => ({
      id: c.id,
      seq: (c.metadata as any)?.seq,
      name: (c.metadata as any)?.name ?? c.name,
    }));
    return {
      id: n.id,
      name: n.name,
      order: n.order,
      subject: m.subject,
      version: m.version,
      grade: m.grade,
      term: m.term,
      description: m.description || '',
      notes: m.notes || '',
      keywords: m.keywords || [],
      unitCount: units.length,
      units,
    };
  });
};

/**
 * 获取某教材下的单元节点（单元多选下拉用）
 */
export const getUnitsByTextbook = async (textbookId: string) => {
  const tb = await prisma.materialNode.findUnique({ where: { id: textbookId } });
  if (!tb) throw new Error('教材不存在');
  const units = await prisma.materialNode.findMany({
    where: { parentId: textbookId, type: 'UNIT' },
    orderBy: { order: 'asc' },
  });
  return units.map((u) => ({
    id: u.id,
    seq: (u.metadata as any)?.seq,
    name: (u.metadata as any)?.name ?? u.name,
    textbookId,
  }));
};

/**
 * 创建教材：建 TEXTBOOK 节点 + 子 UNIT 节点（单元）
 */
export const createTextbook = async (data: CreateTextbookData) => {
  if (!data.subject || !data.version || !data.grade || !data.term) {
    throw new Error('缺少必填字段：subject / version / grade / term');
  }
  if (!data.units || data.units.length === 0) {
    throw new Error('教材至少需要一个单元');
  }
  const textbook = await prisma.materialNode.create({
    data: {
      name: textbookName(data),
      type: 'TEXTBOOK',
      order: data.order ?? 0,
      metadata: {
        subject: data.subject,
        version: data.version,
        grade: data.grade,
        term: data.term,
        description: data.description || '',
        notes: data.notes || '',
        keywords: data.keywords || [],
      },
    },
  });
  for (const u of data.units) {
    await prisma.materialNode.create({
      data: {
        name: `${u.seq}. ${u.name}`,
        type: 'UNIT',
        parentId: textbook.id,
        order: u.seq,
        metadata: {
          seq: u.seq,
          name: u.name,
          subject: data.subject,
          version: data.version,
          grade: data.grade,
          term: data.term,
        },
      },
    });
  }
  return getTextbookDetail(textbook.id);
};

/**
 * 更新教材：同步元信息 + 子单元（增/改/删）
 */
export const updateTextbook = async (id: string, data: UpdateTextbookData) => {
  const existing = await prisma.materialNode.findUnique({
    where: { id },
    include: { children: { where: { type: 'UNIT' }, orderBy: { order: 'asc' } } },
  });
  if (!existing || existing.type !== 'TEXTBOOK') throw new Error('教材不存在');

  const subject = data.subject ?? (existing.metadata as any).subject;
  const version = data.version ?? (existing.metadata as any).version;
  const grade = data.grade ?? (existing.metadata as any).grade;
  const term = data.term ?? (existing.metadata as any).term;

  await prisma.materialNode.update({
    where: { id },
    data: {
      name: textbookName({ subject, version, grade, term }),
      order: data.order ?? existing.order,
      metadata: {
        subject,
        version,
        grade,
        term,
        description: (data.description ?? (existing.metadata as any).description) || '',
        notes: (data.notes ?? (existing.metadata as any).notes) || '',
        keywords: (data.keywords ?? (existing.metadata as any).keywords) || [],
      },
    },
  });

  if (data.units) {
    const existingUnits = existing.children;
    const incomingSeqs = new Set(data.units.map((u) => u.seq));
    // 删除被移除的单元（仅当无题目引用）
    for (const cu of existingUnits) {
      const seq = (cu.metadata as any)?.seq;
      if (!incomingSeqs.has(seq)) {
        const ref = await prisma.question.count({ where: { materialNodeId: cu.id } });
        if (ref > 0) {
          throw new Error(`单元「${cu.name}」已被 ${ref} 道题目引用，无法删除，请先处理相关题目`);
        }
        await prisma.materialNode.delete({ where: { id: cu.id } });
      }
    }
    // 新增或更新
    for (const u of data.units) {
      const found = existingUnits.find((c) => (c.metadata as any)?.seq === u.seq);
      if (found) {
        await prisma.materialNode.update({
          where: { id: found.id },
          data: {
            name: `${u.seq}. ${u.name}`,
            order: u.seq,
            metadata: { seq: u.seq, name: u.name, subject, version, grade, term },
          },
        });
      } else {
        await prisma.materialNode.create({
          data: {
            name: `${u.seq}. ${u.name}`,
            type: 'UNIT',
            parentId: id,
            order: u.seq,
            metadata: { seq: u.seq, name: u.name, subject, version, grade, term },
          },
        });
      }
    }
  }

  return getTextbookDetail(id);
};

/**
 * 删除教材：级联删除子单元（若子单元被题目引用则拒绝）
 */
export const deleteTextbook = async (id: string) => {
  const tb = await prisma.materialNode.findUnique({
    where: { id },
    include: { children: { where: { type: 'UNIT' }, include: { questions: true } } },
  });
  if (!tb || tb.type !== 'TEXTBOOK') throw new Error('教材不存在');
  for (const c of tb.children) {
    if (c.questions.length > 0) {
      throw new Error(`教材下单元「${c.name}」被 ${c.questions.length} 道题目引用，请先处理相关题目`);
    }
  }
  await prisma.materialNode.deleteMany({ where: { parentId: id } });
  await prisma.materialNode.delete({ where: { id } });
  return { success: true, message: '教材已删除' };
};

/**
 * 从Excel数据批量导入教材
 */
export const importMaterialsFromExcel = async (
  data: Array<{
    subject: string;
    version: string;
    unit: string;
    notes?: string;
    keywords?: string[];
  }>
) => {
  const results = [];

  for (const item of data) {
    try {
      // 生成节点名称
      const name = `${item.subject}-${item.version}-${item.unit}`;

      // 创建教材节点
      const material = await prisma.materialNode.create({
        data: {
          name,
          type: 'UNIT', // 默认为单元类型
          order: 0,
          metadata: {
            subject: item.subject,
            version: item.version,
            unit: item.unit,
            notes: item.notes || '',
            keywords: item.keywords || [],
          },
        },
      });

      results.push({
        success: true,
        material: {
          id: material.id,
          name: material.name,
          subject: item.subject,
          version: item.version,
          unit: item.unit,
        },
      });
    } catch (error: any) {
      results.push({
        success: false,
        error: error.message,
        data: item,
      });
    }
  }

  return results;
};
