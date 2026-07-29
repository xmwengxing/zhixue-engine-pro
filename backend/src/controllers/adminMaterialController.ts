import { Request, Response } from 'express';
import * as materialService from '../services/adminMaterialService';
import { MaterialNodeType } from '@prisma/client';
import ExcelJS from 'exceljs';
import multer from 'multer';

/**
 * 获取所有教材节点（树形结构）
 * GET /api/admin/materials
 */
export const getMaterials = async (_req: Request, res: Response) => {
  try {
    const materials = await materialService.getAllMaterials();

    return res.json({
      success: true,
      data: materials,
    });
  } catch (error: any) {
    console.error('获取教材列表失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取教材列表失败',
      error: error.message,
    });
  }
};

/**
 * 根据 ID 获取教材节点
 * GET /api/admin/materials/:id
 */
export const getMaterialById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        message: '教材节点 ID 不能为空',
      });
    }
    
    const material = await materialService.getMaterialById(id);

    return res.json({
      success: true,
      data: material,
    });
  } catch (error: any) {
    console.error('获取教材节点失败:', error);
    return res.status(404).json({
      success: false,
      message: error.message || '获取教材节点失败',
    });
  }
};

/**
 * 创建教材节点
 * POST /api/admin/materials
 */
export const createMaterial = async (req: Request, res: Response) => {
  try {
    const { name, type, parentId, order, metadata } = req.body;

    // 验证必填字段
    if (!name || !type) {
      return res.status(400).json({
        success: false,
        message: '缺少必填字段：name 和 type',
      });
    }

    // 验证 type 是否有效
    if (!Object.values(MaterialNodeType).includes(type)) {
      return res.status(400).json({
        success: false,
        message: `无效的节点类型。有效值: ${Object.values(MaterialNodeType).join(', ')}`,
      });
    }

    const material = await materialService.createMaterial({
      name,
      type,
      parentId,
      order,
      metadata,
    });

    return res.status(201).json({
      success: true,
      message: '教材节点创建成功',
      data: material,
    });
  } catch (error: any) {
    console.error('创建教材节点失败:', error);
    return res.status(400).json({
      success: false,
      message: error.message || '创建教材节点失败',
    });
  }
};

/**
 * 更新教材节点
 * PUT /api/admin/materials/:id
 */
export const updateMaterial = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, parentId, order, metadata } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        message: '教材节点 ID 不能为空',
      });
    }

    // 验证 type 是否有效（如果提供）
    if (type && !Object.values(MaterialNodeType).includes(type)) {
      return res.status(400).json({
        success: false,
        message: `无效的节点类型。有效值: ${Object.values(MaterialNodeType).join(', ')}`,
      });
    }

    const material = await materialService.updateMaterial(id, {
      name,
      type,
      parentId,
      order,
      metadata,
    });

    return res.json({
      success: true,
      message: '教材节点更新成功',
      data: material,
    });
  } catch (error: any) {
    console.error('更新教材节点失败:', error);
    return res.status(400).json({
      success: false,
      message: error.message || '更新教材节点失败',
    });
  }
};

/**
 * 删除教材节点
 * DELETE /api/admin/materials/:id
 */
export const deleteMaterial = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        message: '教材节点 ID 不能为空',
      });
    }
    
    const result = await materialService.deleteMaterial(id);

    return res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    console.error('删除教材节点失败:', error);
    return res.status(400).json({
      success: false,
      message: error.message || '删除教材节点失败',
    });
  }
};

/**
 * 批量导入教材数据
 * POST /api/admin/materials/import
 */
export const importMaterials = async (req: Request, res: Response) => {
  try {
    // 支持两种格式：直接数组或包含materials字段的对象
    const materials = Array.isArray(req.body) ? req.body : req.body.materials;

    if (!Array.isArray(materials) || materials.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATA',
          message: '请提供有效的教材数据数组',
        },
        errors: [], // 添加空的errors数组以满足测试期望
      });
    }

    // 验证数据
    const errors: any[] = [];
    const validMaterials: any[] = [];

    materials.forEach((material: any, index: number) => {
      // 验证必填字段
      if (!material.subject || !material.version || !material.unit) {
        errors.push({
          row: index + 1,
          message: '缺少必填字段：subject、version、unit',
          data: material,
        });
      } else {
        validMaterials.push(material);
      }
    });

    // 如果有验证错误，返回400
    if (errors.length > 0 && validMaterials.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '所有数据验证失败',
        },
        errors,
      });
    }

    // 导入有效数据
    const results = await materialService.importMaterials(validMaterials);

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    // 合并验证错误和导入错误
    const allErrors = [
      ...errors,
      ...results.filter((r) => !r.success).map((r, index) => ({
        row: index + 1,
        message: r.error || '导入失败',
        data: validMaterials[index],
      })),
    ];

    return res.status(allErrors.length > 0 ? 207 : 201).json({
      success: successCount > 0,
      message: `导入完成：成功 ${successCount} 条，失败 ${failCount + errors.length} 条`,
      data: {
        imported: successCount,
        failed: failCount + errors.length,
        results,
      },
      errors: allErrors.length > 0 ? allErrors : undefined,
    });
  } catch (error: any) {
    console.error('批量导入教材失败:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '批量导入教材失败',
        details: error.message,
      },
      errors: [], // 添加空的errors数组
    });
  }
};

/**
 * 下载教材导入模板
 * GET /api/admin/materials/template
 */
export const downloadTemplate = async (_req: Request, res: Response) => {
  try {
    // 创建工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('教材数据');

    // 设置表头
    worksheet.columns = [
      { header: '科目', key: 'subject', width: 15 },
      { header: '教材版本', key: 'version', width: 20 },
      { header: '单元', key: 'unit', width: 20 },
      { header: '备注', key: 'notes', width: 30 },
      { header: '关键词', key: 'keywords', width: 30 }
    ];

    // 添加示例数据
    worksheet.addRow({
      subject: '数学',
      version: '人教版',
      unit: '第一单元',
      notes: '加减法',
      keywords: '计算,基础'
    });
    worksheet.addRow({
      subject: '语文',
      version: '苏教版',
      unit: '第一单元',
      notes: '拼音',
      keywords: '声母,韵母'
    });

    // 设置表头样式
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // 生成Excel文件
    const buffer = await workbook.xlsx.writeBuffer();

    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=material_import_template.xlsx');

    return res.send(buffer);
  } catch (error: any) {
    console.error('下载模板失败:', error);
    return res.status(500).json({
      success: false,
      message: '下载模板失败',
      error: error.message,
    });
  }
};

// 配置 multer 用于文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 限制5MB
  },
  fileFilter: (_req, file, cb) => {
    // 只允许 Excel 文件
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel'
    ) {
      cb(null, true);
    } else {
      cb(new Error('只支持 Excel 文件格式 (.xlsx, .xls)'));
    }
  },
});

/**
 * 上传并导入教材Excel文件
 * POST /api/admin/materials/upload
 */
export const uploadAndImport = [
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '请上传文件',
        });
      }

      // 解析Excel文件
      const workbook = new ExcelJS.Workbook();
      // @ts-ignore - Buffer 类型兼容性问题
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        return res.status(400).json({
          success: false,
          message: 'Excel文件中没有工作表',
        });
      }

      // 将工作表转换为JSON数据
      const data: any[] = [];
      const headers: string[] = [];
      
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          // 第一行是表头
          row.eachCell((cell) => {
            headers.push(cell.value?.toString() || '');
          });
        } else {
          // 数据行
          const rowData: any = {};
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1];
            if (header) {
              rowData[header] = cell.value;
            }
          });
          if (Object.keys(rowData).length > 0) {
            data.push(rowData);
          }
        }
      });

      if (data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Excel文件中没有数据',
        });
      }

      // 验证和转换数据
      const errors: string[] = [];
      const validData: any[] = [];

      data.forEach((row: any, index: number) => {
        const rowNum = index + 2; // Excel行号从2开始（第1行是表头）

        // 验证必填字段
        if (!row['科目'] || !row['教材版本'] || !row['单元']) {
          errors.push(`第${rowNum}行: 缺少必填字段（科目、教材版本、单元）`);
        } else {
          validData.push({
            subject: String(row['科目']).trim(),
            version: String(row['教材版本']).trim(),
            unit: String(row['单元']).trim(),
            notes: row['备注'] ? String(row['备注']).trim() : '',
            keywords: row['关键词'] 
              ? String(row['关键词']).split(',').map((k: string) => k.trim()).filter(Boolean)
              : [],
          });
        }
      });

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: '数据验证失败',
          errors,
        });
      }

      // 批量创建教材节点
      const results = await materialService.importMaterialsFromExcel(validData);

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      return res.json({
        success: true,
        message: `导入完成：成功 ${successCount} 条，失败 ${failCount} 条`,
        data: {
          total: data.length,
          success: successCount,
          failed: failCount,
          results,
        },
      });
    } catch (error: any) {
      console.error('上传导入失败:', error);
      return res.status(500).json({
        success: false,
        message: error.message || '上传导入失败',
      });
    }
  },
];

// ============ 教材（TEXTBOOK）专有接口 ============

export const listTextbooks = async (req: Request, res: Response) => {
  try {
    const { subject, version, grade, term } = req.query;
    const textbooks = await materialService.listTextbooks({
      subject: typeof subject === 'string' ? subject : undefined,
      version: typeof version === 'string' ? version : undefined,
      grade: typeof grade === 'string' ? grade : undefined,
      term: typeof term === 'string' ? term : undefined,
    });
    return res.json({ success: true, data: textbooks });
  } catch (error: any) {
    console.error('获取教材列表失败:', error);
    return res.status(500).json({ success: false, message: error.message || '获取教材列表失败' });
  }
};

export const createTextbook = async (req: Request, res: Response) => {
  try {
    const { subject, version, grade, term, description, notes, keywords, units, order } = req.body;
    const textbook = await materialService.createTextbook({
      subject,
      version,
      grade,
      term,
      description,
      notes,
      keywords: Array.isArray(keywords) ? keywords : (keywords ? String(keywords).split(',').map((k: string) => k.trim()).filter(Boolean) : []),
      units: Array.isArray(units) ? units : [],
      order,
    });
    return res.status(201).json({ success: true, message: '教材创建成功', data: textbook });
  } catch (error: any) {
    console.error('创建教材失败:', error);
    return res.status(400).json({ success: false, message: error.message || '创建教材失败' });
  }
};

export const updateTextbook = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { subject, version, grade, term, description, notes, keywords, units, order } = req.body;
    const textbook = await materialService.updateTextbook(id, {
      subject,
      version,
      grade,
      term,
      description,
      notes,
      keywords: Array.isArray(keywords) ? keywords : (keywords ? String(keywords).split(',').map((k: string) => k.trim()).filter(Boolean) : undefined),
      units: Array.isArray(units) ? units : undefined,
      order,
    });
    return res.json({ success: true, message: '教材更新成功', data: textbook });
  } catch (error: any) {
    console.error('更新教材失败:', error);
    return res.status(400).json({ success: false, message: error.message || '更新教材失败' });
  }
};

export const deleteTextbook = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const result = await materialService.deleteTextbook(id);
    return res.json({ success: true, message: result.message });
  } catch (error: any) {
    console.error('删除教材失败:', error);
    return res.status(400).json({ success: false, message: error.message || '删除教材失败' });
  }
};

export const getTextbookUnits = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const units = await materialService.getUnitsByTextbook(id);
    return res.json({ success: true, data: units });
  } catch (error: any) {
    console.error('获取教材单元失败:', error);
    return res.status(404).json({ success: false, message: error.message || '获取教材单元失败' });
  }
};
