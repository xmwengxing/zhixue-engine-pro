import React, { useState, useEffect, useCallback } from 'react';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

// 教材节点类型
type MaterialNodeType = 'VERSION' | 'GRADE' | 'SUBJECT' | 'UNIT' | 'CHAPTER';

// 教材节点接口
interface MaterialNode {
  id: string;
  name: string;
  type: MaterialNodeType;
  parentId: string | null;
  order: number;
  metadata: {
    description?: string;
    keywords?: string[];
  };
  createdAt: string;
  updatedAt: string;
  children?: MaterialNode[];
}

// 节点类型中文映射
const NODE_TYPE_LABELS: Record<MaterialNodeType, string> = {
  VERSION: '版本',
  GRADE: '年级',
  SUBJECT: '学科',
  UNIT: '单元',
  CHAPTER: '章节',
};

// 节点类型颜色映射
const NODE_TYPE_COLORS: Record<MaterialNodeType, string> = {
  VERSION: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
  GRADE: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
  SUBJECT: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400',
  UNIT: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
  CHAPTER: 'bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-400',
};

const MaterialSystemManagement: React.FC = () => {
  const [materials, setMaterials] = useState<MaterialNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<MaterialNode | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    data?: any;
  } | null>(null);

  // 表单数据
  const [formData, setFormData] = useState({
    name: '',
    type: 'VERSION' as MaterialNodeType,
    parentId: '',
    order: 0,
    description: '',
    keywords: '',
    // 新增教材创建字段
    subject: '',
    version: '',
    units: [''],
    notes: '',
  });

  // 加载教材数据
  // 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
  const loadMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const response = await request.get('/admin/materials');

      if (response.success) {
        setMaterials(response.data);
      }
    } catch (error: unknown) {
      console.error('加载教材数据失败:', error);
      alert(getErrorMessage(error, '加载教材数据失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  // 切换节点展开/折叠
  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // 打开创建节点模态框
  const openCreateModal = (parentNode?: MaterialNode) => {
    setFormData({
      name: '',
      type: 'VERSION',
      parentId: parentNode?.id || '',
      order: 0,
      description: '',
      keywords: '',
      // 新增教材创建字段
      subject: '',
      version: '',
      units: [''],
      notes: '',
    });
    setSelectedNode(parentNode || null);
    setShowCreateModal(true);
  };

  // 打开编辑节点模态框
  const openEditModal = (node: MaterialNode) => {
    setFormData({
      name: node.name,
      type: node.type,
      parentId: node.parentId || '',
      order: node.order,
      description: node.metadata.description || '',
      keywords: node.metadata.keywords?.join(', ') || '',
      // 新增教材创建字段
      subject: (node.metadata as any).subject || '',
      version: (node.metadata as any).version || '',
      units: (node.metadata as any).units || [''],
      notes: (node.metadata as any).notes || '',
    });
    setSelectedNode(node);
    setShowEditModal(true);
  };

  // 打开删除确认模态框
  const openDeleteModal = (node: MaterialNode) => {
    setSelectedNode(node);
    setShowDeleteModal(true);
  };

  // 下载导入模板
  const handleDownloadTemplate = async () => {
    try {
      const response = await request.get('/admin/materials/template', {
        responseType: 'blob',
      });

      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'material_import_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      console.error('下载模板失败:', error);
      alert(getErrorMessage(error, '下载模板失败'));
    }
  };

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 验证文件类型
      if (
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel'
      ) {
        setImportFile(file);
        setImportResult(null);
      } else {
        alert('请选择Excel文件（.xlsx 或 .xls）');
        e.target.value = '';
      }
    }
  };

  // 上传并导入文件
  const handleUploadImport = async () => {
    if (!importFile) {
      alert('请先选择文件');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const response = await request.post('/admin/materials/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.success) {
        setImportResult({
          success: true,
          message: response.message,
          data: response.data,
        });
        // 刷新教材列表
        loadMaterials();
      }
    } catch (error: any) {
      console.error('导入失败:', error);
      const errorMsg = error.response?.data?.message || getErrorMessage(error, '导入失败');
      const errors = error.response?.data?.errors;
      
      setImportResult({
        success: false,
        message: errorMsg,
        data: errors ? { errors } : null,
      });
    } finally {
      setImporting(false);
    }
  };

  // 关闭导入模态框
  const closeImportModal = () => {
    setShowImportModal(false);
    setImportFile(null);
    setImportResult(null);
  };

  // 创建节点
  const handleCreate = async () => {
    try {
      const response = await request.post(
        '/admin/materials',
        {
          name: formData.name,
          type: formData.type,
          parentId: formData.parentId || null,
          order: formData.order,
          metadata: {
            description: formData.description,
            keywords: formData.keywords.split(',').map((k) => k.trim()).filter(Boolean),
            // 新增教材字段
            subject: formData.subject,
            version: formData.version,
            units: formData.units.filter(u => u.trim()),
            notes: formData.notes,
          },
        }
      );

      if (response.success) {
        alert('创建成功');
        setShowCreateModal(false);
        loadMaterials();
      }
    } catch (error: unknown) {
      console.error('创建节点失败:', error);
      alert(getErrorMessage(error, '创建节点失败'));
    }
  };

  // 更新节点
  const handleUpdate = async () => {
    if (!selectedNode) return;

    try {
      const response = await request.put(
        `/admin/materials/${selectedNode.id}`,
        {
          name: formData.name,
          type: formData.type,
          parentId: formData.parentId || null,
          order: formData.order,
          metadata: {
            description: formData.description,
            keywords: formData.keywords.split(',').map((k) => k.trim()).filter(Boolean),
            // 新增教材字段
            subject: formData.subject,
            version: formData.version,
            units: formData.units.filter(u => u.trim()),
            notes: formData.notes,
          },
        }
      );

      if (response.success) {
        alert('更新成功');
        setShowEditModal(false);
        loadMaterials();
      }
    } catch (error: unknown) {
      console.error('更新节点失败:', error);
      alert(getErrorMessage(error, '更新节点失败'));
    }
  };

  // 删除节点
  const handleDelete = async () => {
    if (!selectedNode) return;

    try {
      const response = await request.delete(`/admin/materials/${selectedNode.id}`);

      if (response.success) {
        alert('删除成功');
        setShowDeleteModal(false);
        loadMaterials();
      }
    } catch (error: unknown) {
      console.error('删除节点失败:', error);
      alert(getErrorMessage(error, '删除节点失败'));
    }
  };

  // 渲染树形节点
  const renderTreeNode = (node: MaterialNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="select-none">
        <div
          className="flex items-center gap-2 py-2 px-3 hover:bg-slate-50 dark:hover:bg-surface-dark rounded-lg transition-colors group"
          style={{ paddingLeft: `${level * 24 + 12}px` }}
        >
          {/* 展开/折叠图标 */}
          {hasChildren ? (
            <button
              onClick={() => toggleNode(node.id)}
              className="p-0.5 hover:bg-slate-200 dark:hover:bg-border-dark rounded"
            >
              <span className="material-symbols-outlined text-[18px]">
                {isExpanded ? 'expand_more' : 'chevron_right'}
              </span>
            </button>
          ) : (
            <div className="w-6" />
          )}

          {/* 节点图标 */}
          <div
            className={`h-7 w-7 rounded flex items-center justify-center text-xs font-bold ${
              NODE_TYPE_COLORS[node.type]
            }`}
          >
            {node.name.substring(0, 2)}
          </div>

          {/* 节点名称 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{node.name}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {NODE_TYPE_LABELS[node.type]}
              </span>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => openCreateModal(node)}
              className="p-1 hover:bg-slate-200 dark:hover:bg-border-dark rounded"
              title="添加子节点"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">add</span>
            </button>
            <button
              onClick={() => openEditModal(node)}
              className="p-1 hover:bg-slate-200 dark:hover:bg-border-dark rounded"
              title="编辑"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button
              onClick={() => openDeleteModal(node)}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
              title="删除"
            >
              <span className="material-symbols-outlined text-[18px] text-red-500">delete</span>
            </button>
          </div>
        </div>

        {/* 子节点 */}
        {isExpanded && hasChildren && (
          <div>{node.children!.map((child) => renderTreeNode(child, level + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">教材体系管理</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              管理和组织各年级、学科的教学资源、教材版本及单元架构
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowImportModal(true)}
              className="bg-slate-100 dark:bg-surface-dark hover:bg-slate-200 dark:hover:bg-border-dark px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
              导入教材
            </button>
            <button
              onClick={() => openCreateModal()}
              className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              创建教材
            </button>
          </div>
        </div>

        {/* 教材树形结构 */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-2 text-slate-500">加载中...</p>
            </div>
          ) : materials.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-[48px] text-slate-300">
                folder_open
              </span>
              <p className="mt-2 text-slate-500">暂无教材数据</p>
              <button
                onClick={() => openCreateModal()}
                className="mt-4 text-primary hover:underline text-sm"
              >
                创建第一个教材节点
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {materials.map((node) => renderTreeNode(node))}
            </div>
          )}
        </div>

        {/* 创建节点模态框 */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">创建教材</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                      科目 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                      placeholder="例如：数学、语文、英语"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                      教材版本 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.version}
                      onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                      placeholder="例如：人教版、苏教版"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                    单元 <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    {formData.units.map((unit, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={unit}
                          onChange={(e) => {
                            const newUnits = [...formData.units];
                            newUnits[index] = e.target.value;
                            setFormData({ ...formData, units: newUnits });
                          }}
                          className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                          placeholder={`第${index + 1}单元`}
                        />
                        {formData.units.length > 1 && (
                          <button
                            onClick={() => {
                              const newUnits = formData.units.filter((_, i) => i !== index);
                              setFormData({ ...formData, units: newUnits });
                            }}
                            className="px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        setFormData({ ...formData, units: [...formData.units, ''] });
                      }}
                      className="w-full px-3 py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 text-sm flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      添加单元
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">备注</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    rows={3}
                    placeholder="教材相关备注信息"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">关键词（逗号分隔）</label>
                  <input
                    type="text"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    placeholder="例如：代数, 方程, 计算"
                  />
                </div>

                {/* 高级选项（可折叠） */}
                <details className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
                    高级选项（节点类型和层级）
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">节点名称</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                        placeholder="留空则自动生成"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">节点类型</label>
                      <select
                        value={formData.type}
                        onChange={(e) =>
                          setFormData({ ...formData, type: e.target.value as MaterialNodeType })
                        }
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                      >
                        <option value="VERSION">版本</option>
                        <option value="GRADE">年级</option>
                        <option value="SUBJECT">学科</option>
                        <option value="UNIT">单元</option>
                        <option value="CHAPTER">章节</option>
                      </select>
                    </div>
                  </div>
                </details>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!formData.subject || !formData.version || formData.units.filter(u => u.trim()).length === 0}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 编辑节点模态框 */}
        {showEditModal && selectedNode && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-xl">
              <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">编辑教材节点</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">节点名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">节点类型</label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value as MaterialNodeType })
                    }
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="VERSION">版本</option>
                    <option value="GRADE">年级</option>
                    <option value="SUBJECT">学科</option>
                    <option value="UNIT">单元</option>
                    <option value="CHAPTER">章节</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">描述（可选）</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">关键词（可选，逗号分隔）</label>
                  <input
                    type="text"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                >
                  取消
                </button>
                <button
                  onClick={handleUpdate}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 删除确认模态框 */}
        {showDeleteModal && selectedNode && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-xl">
              <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">确认删除</h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                确定要删除节点 <span className="font-semibold">{selectedNode.name}</span> 吗？
                <br />
                <span className="text-sm text-red-500">
                  注意：如果节点有子节点或被题目引用，将无法删除。
                </span>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 导入教材模态框 */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-2xl shadow-xl">
              <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">批量导入教材</h3>
              
              {!importResult ? (
                <div className="space-y-4">
                  {/* 说明 */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[20px]">
                        info
                      </span>
                      <div className="text-sm text-blue-800 dark:text-blue-300">
                        <p className="font-medium mb-1">导入说明：</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>请先下载模板，按照模板格式填写教材数据</li>
                          <li>必填字段：科目、教材版本、单元</li>
                          <li>选填字段：备注、关键词（多个关键词用逗号分隔）</li>
                          <li>支持 .xlsx 和 .xls 格式</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* 下载模板 */}
                  <div>
                    <button
                      onClick={handleDownloadTemplate}
                      className="w-full px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[20px]">download</span>
                      下载导入模板
                    </button>
                  </div>

                  {/* 文件上传 */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                      选择Excel文件
                    </label>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileChange}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
                    />
                    {importFile && (
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                        已选择: {importFile.name}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* 导入结果 */
                <div className="space-y-4">
                  <div
                    className={`border rounded-lg p-4 ${
                      importResult.success
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`material-symbols-outlined text-[24px] ${
                          importResult.success
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {importResult.success ? 'check_circle' : 'error'}
                      </span>
                      <div className="flex-1">
                        <p
                          className={`font-medium ${
                            importResult.success
                              ? 'text-green-800 dark:text-green-300'
                              : 'text-red-800 dark:text-red-300'
                          }`}
                        >
                          {importResult.message}
                        </p>
                        {importResult.data && (
                          <div className="mt-2 text-sm">
                            {importResult.success ? (
                              <div className="space-y-1">
                                <p>总计: {importResult.data.total} 条</p>
                                <p className="text-green-700 dark:text-green-400">
                                  成功: {importResult.data.success} 条
                                </p>
                                {importResult.data.failed > 0 && (
                                  <p className="text-red-700 dark:text-red-400">
                                    失败: {importResult.data.failed} 条
                                  </p>
                                )}
                              </div>
                            ) : (
                              importResult.data.errors && (
                                <ul className="list-disc list-inside mt-2 space-y-1 text-red-700 dark:text-red-400">
                                  {importResult.data.errors.map((err: string, idx: number) => (
                                    <li key={idx}>{err}</li>
                                  ))}
                                </ul>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 按钮 */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={closeImportModal}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                >
                  {importResult ? '关闭' : '取消'}
                </button>
                {!importResult && (
                  <button
                    onClick={handleUploadImport}
                    disabled={!importFile || importing}
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {importing ? (
                      <>
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        导入中...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[20px]">upload</span>
                        开始导入
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaterialSystemManagement;
