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
