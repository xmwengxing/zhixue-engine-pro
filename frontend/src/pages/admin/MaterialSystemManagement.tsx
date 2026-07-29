import React, { useState, useEffect, useCallback } from 'react';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

// 教材节点类型
type MaterialNodeType = 'VERSION' | 'GRADE' | 'SUBJECT' | 'TEXTBOOK' | 'UNIT' | 'CHAPTER';

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
  TEXTBOOK: '教材',
  UNIT: '单元',
  CHAPTER: '章节',
};

// 节点类型颜色映射
const NODE_TYPE_COLORS: Record<MaterialNodeType, string> = {
  VERSION: 'bg-blue-900/40 text-blue-300',
  GRADE: 'bg-emerald-900/40 text-emerald-300',
  SUBJECT: 'bg-orange-900/40 text-orange-300',
  TEXTBOOK: 'bg-cyan-900/40 text-cyan-300',
  UNIT: 'bg-purple-900/40 text-purple-300',
  CHAPTER: 'bg-pink-900/40 text-pink-300',
};

// 年级 / 学期 展示辅助
function gradeLabel(grade?: string | null): string {
  if (!grade) return '';
  const map: Record<string, string> = {
    '7': '七年级', '8': '八年级', '9': '九年级',
  };
  return map[grade] || `${grade}年级`;
}
function termLabel(term?: string | null): string {
  return term === 'UP' ? '上' : term === 'DOWN' ? '下' : '';
}

// 教材（TEXTBOOK 节点扁平化）接口 —— 教材总览表格使用
interface TextbookUnit {
  id?: string;
  seq: number;
  name: string;
}
interface Textbook {
  id: string;
  name: string;
  order: number;
  subject: string;
  version: string;
  grade: string;
  term: string;
  description: string;
  notes: string;
  keywords: string[];
  unitCount: number;
  units: TextbookUnit[];
}

// 年级 / 学期 选项（教材总览筛选与表单用）
const GRADE_OPTIONS = [
  { value: '7', label: '七年级' },
  { value: '8', label: '八年级' },
  { value: '9', label: '九年级' },
];
const TERM_OPTIONS = [
  { value: 'UP', label: '上' },
  { value: 'DOWN', label: '下' },
];

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

  // 教材总览（表格）相关状态
  const [tab, setTab] = useState<'tree' | 'table'>('tree');
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [textbookLoading, setTextbookLoading] = useState(false);
  const [tbFilter, setTbFilter] = useState({ subject: '', version: '', grade: '', term: '' });
  const [showTbCreate, setShowTbCreate] = useState(false);
  const [showTbEdit, setShowTbEdit] = useState(false);
  const [showTbDelete, setShowTbDelete] = useState(false);
  const [editingTextbook, setEditingTextbook] = useState<Textbook | null>(null);
  const [tbForm, setTbForm] = useState({
    order: 0,
    subject: '',
    version: '',
    grade: '',
    term: 'UP' as 'UP' | 'DOWN',
    description: '',
    notes: '',
    units: [{ seq: 1, name: '' }] as { seq: number; name: string }[],
  });

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

  // 加载教材总览（表格）
  const loadTextbooks = useCallback(async () => {
    setTextbookLoading(true);
    try {
      const res = await request.get('/admin/materials/textbooks');
      if (res.success) setTextbooks(res.data || []);
    } catch (error: unknown) {
      console.error('加载教材总览失败:', error);
      alert(getErrorMessage(error, '加载教材总览失败'));
    } finally {
      setTextbookLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'table') loadTextbooks();
  }, [tab, loadTextbooks]);

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

  // ============ 教材总览（表格）CRUD ============

  // 从已加载教材列表派生的筛选选项
  const subjectOptions = Array.from(new Set(textbooks.map((t) => t.subject).filter(Boolean)));
  const versionOptions = Array.from(new Set(textbooks.map((t) => t.version).filter(Boolean)));

  const filteredTextbooks = textbooks.filter((t) => {
    if (tbFilter.subject && t.subject !== tbFilter.subject) return false;
    if (tbFilter.version && t.version !== tbFilter.version) return false;
    if (tbFilter.grade && t.grade !== tbFilter.grade) return false;
    if (tbFilter.term && t.term !== tbFilter.term) return false;
    return true;
  });

  const openTbCreate = () => {
    setTbForm({
      order: 0,
      subject: '',
      version: '',
      grade: '',
      term: 'UP',
      description: '',
      notes: '',
      units: [{ seq: 1, name: '' }],
    });
    setEditingTextbook(null);
    setShowTbCreate(true);
  };

  const openTbEdit = (t: Textbook) => {
    setTbForm({
      order: t.order,
      subject: t.subject,
      version: t.version,
      grade: t.grade,
      term: (t.term as 'UP' | 'DOWN') || 'UP',
      description: t.description,
      notes: t.notes,
      units: t.units.length
        ? t.units.map((u) => ({ seq: u.seq, name: u.name }))
        : [{ seq: 1, name: '' }],
    });
    setEditingTextbook(t);
    setShowTbEdit(true);
  };

  const openTbDelete = (t: Textbook) => {
    setEditingTextbook(t);
    setShowTbDelete(true);
  };

  const normalizeTbUnits = (): { seq: number; name: string }[] =>
    tbForm.units
      .filter((u) => u.name.trim())
      .map((u, i) => ({ seq: u.seq || i + 1, name: u.name.trim() }));

  const handleTbCreate = async () => {
    const units = normalizeTbUnits();
    if (!tbForm.subject || !tbForm.version || !tbForm.grade || !tbForm.term || units.length === 0) {
      alert('请填写学科、教材版本、年级、学期，并至少添加一个单元');
      return;
    }
    try {
      const res = await request.post('/admin/materials/textbooks', {
        subject: tbForm.subject,
        version: tbForm.version,
        grade: tbForm.grade,
        term: tbForm.term,
        description: tbForm.description,
        notes: tbForm.notes,
        order: tbForm.order,
        units,
      });
      if (res.success) {
        alert('教材创建成功');
        setShowTbCreate(false);
        loadTextbooks();
        loadMaterials();
      }
    } catch (error: unknown) {
      alert(getErrorMessage(error, '创建教材失败'));
    }
  };

  const handleTbUpdate = async () => {
    const units = normalizeTbUnits();
    if (!editingTextbook) return;
    try {
      const res = await request.put(`/admin/materials/textbooks/${editingTextbook.id}`, {
        subject: tbForm.subject,
        version: tbForm.version,
        grade: tbForm.grade,
        term: tbForm.term,
        description: tbForm.description,
        notes: tbForm.notes,
        order: tbForm.order,
        units,
      });
      if (res.success) {
        alert('教材更新成功');
        setShowTbEdit(false);
        loadTextbooks();
        loadMaterials();
      }
    } catch (error: unknown) {
      alert(getErrorMessage(error, '更新教材失败'));
    }
  };

  const handleTbDelete = async () => {
    if (!editingTextbook) return;
    try {
      const res = await request.delete(`/admin/materials/textbooks/${editingTextbook.id}`);
      if (res.success) {
        alert('教材已删除');
        setShowTbDelete(false);
        loadTextbooks();
        loadMaterials();
      }
    } catch (error: unknown) {
      alert(getErrorMessage(error, '删除教材失败'));
    }
  };

  // 渲染树形节点
  const renderTreeNode = (node: MaterialNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="select-none">
        <div
          className="flex items-center gap-2 py-2 px-3 hover:bg-[#232f48] rounded-lg transition-colors group"
          style={{ paddingLeft: `${level * 24 + 12}px` }}
        >
          {/* 展开/折叠图标 */}
          {hasChildren ? (
            <button
              onClick={() => toggleNode(node.id)}
              className="p-0.5 hover:bg-[#324467] rounded"
            >
              <span className="material-symbols-outlined text-[18px] text-[#92a4c9]">
                {isExpanded ? 'expand_more' : 'chevron_right'}
              </span>
            </button>
          ) : (
            <div className="w-6" />
          )}

          {/* 节点图标 */}
          <div
            className={`h-7 w-7 rounded flex items-center justify-center text-xs font-bold ${
              NODE_TYPE_COLORS[node.type] ?? 'bg-[#324467] text-[#92a4c9]'
            }`}
          >
            {node.name.substring(0, 2)}
          </div>

          {/* 节点名称 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate text-white">{node.name}</span>
              <span className="text-xs text-[#5b6b8c]">
                {NODE_TYPE_LABELS[node.type]}
              </span>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => openCreateModal(node)}
              className="p-1 hover:bg-[#324467] rounded"
              title="添加子节点"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">add</span>
            </button>
            <button
              onClick={() => openEditModal(node)}
              className="p-1 hover:bg-[#324467] rounded"
              title="编辑"
            >
              <span className="material-symbols-outlined text-[18px] text-[#92a4c9]">edit</span>
            </button>
            <button
              onClick={() => openDeleteModal(node)}
              className="p-1 hover:bg-red-900/20 rounded"
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
    <div className="p-8 bg-[#111722] min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white">教材体系管理</h2>
            <p className="text-[#5b6b8c] mt-1">
              管理和组织各年级、学科的教学资源、教材版本及单元架构
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowImportModal(true)}
              className="bg-[#232f48] hover:bg-[#324467] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
              导入教材
            </button>
            <button
              onClick={() => openTbCreate()}
              className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              新建教材
            </button>
          </div>
        </div>

        {/* Tab 切换：教材树 / 教材总览 */}
        <div className="flex gap-2 border-b border-[#324467] mb-4">
          <button
            onClick={() => setTab('tree')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'tree'
                ? 'border-primary text-primary'
                : 'border-transparent text-[#92a4c9] hover:text-white'
            }`}
          >
            教材树
          </button>
          <button
            onClick={() => setTab('table')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'table'
                ? 'border-primary text-primary'
                : 'border-transparent text-[#92a4c9] hover:text-white'
            }`}
          >
            教材总览
          </button>
        </div>

        {tab === 'tree' && (
        <div className="bg-[#232f48] rounded-xl border border-[#324467] p-4 shadow-sm">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-2 text-[#92a4c9]">加载中...</p>
            </div>
          ) : materials.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-[48px] text-[#5b6b8c]">
                folder_open
              </span>
              <p className="mt-2 text-[#92a4c9]">暂无教材数据</p>
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
        )}

        {tab === 'table' && (
          <div className="bg-[#232f48] rounded-xl border border-[#324467] p-4 shadow-sm">
            {/* 筛选栏 */}
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-xs text-[#5b6b8c] mb-1">学科</label>
                <select
                  value={tbFilter.subject}
                  onChange={(e) => setTbFilter({ ...tbFilter, subject: e.target.value })}
                  className="px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white text-sm"
                >
                  <option value="">全部</option>
                  {subjectOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#5b6b8c] mb-1">教材版本</label>
                <select
                  value={tbFilter.version}
                  onChange={(e) => setTbFilter({ ...tbFilter, version: e.target.value })}
                  className="px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white text-sm"
                >
                  <option value="">全部</option>
                  {versionOptions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#5b6b8c] mb-1">年级</label>
                <select
                  value={tbFilter.grade}
                  onChange={(e) => setTbFilter({ ...tbFilter, grade: e.target.value })}
                  className="px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white text-sm"
                >
                  <option value="">全部</option>
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#5b6b8c] mb-1">学期</label>
                <select
                  value={tbFilter.term}
                  onChange={(e) => setTbFilter({ ...tbFilter, term: e.target.value })}
                  className="px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white text-sm"
                >
                  <option value="">全部</option>
                  {TERM_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>{(t.label)}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => loadTextbooks()}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90"
              >
                查询
              </button>
              <button
                onClick={() => setTbFilter({ subject: '', version: '', grade: '', term: '' })}
                className="px-4 py-2 border border-[#324467] rounded-lg text-sm text-[#92a4c9] hover:bg-[#324467]"
              >
                重置
              </button>
              <button
                onClick={openTbCreate}
                className="ml-auto px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                新建教材
              </button>
            </div>

            {/* 表格 */}
            {textbookLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="mt-2 text-[#92a4c9]">加载中...</p>
              </div>
            ) : filteredTextbooks.length === 0 ? (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-[48px] text-[#5b6b8c]">menu_book</span>
                <p className="mt-2 text-[#92a4c9]">暂无教材数据</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-[#92a4c9]">
                  <thead className="text-xs uppercase bg-[#1a2332] text-[#5b6b8c]">
                    <tr>
                      <th className="px-4 py-3">序号</th>
                      <th className="px-4 py-3">教材版本</th>
                      <th className="px-4 py-3">学科</th>
                      <th className="px-4 py-3">年级（上下）</th>
                      <th className="px-4 py-3">单元总数</th>
                      <th className="px-4 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#324467]">
                    {filteredTextbooks.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-[#232f48]">
                        <td className="px-4 py-3 font-mono text-[#92a4c9]">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium">{t.version}</td>
                        <td className="px-4 py-3">{t.subject}</td>
                        <td className="px-4 py-3">{gradeLabel(t.grade)}{termLabel(t.term)}</td>
                        <td className="px-4 py-3">{t.unitCount}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => openTbEdit(t)}
                              className="px-2 py-1 text-blue-400 hover:bg-blue-900/20 rounded"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => openTbDelete(t)}
                              className="px-2 py-1 text-red-500 hover:bg-red-900/20 rounded"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 创建节点模态框 */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#232f48] rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold mb-4 text-white">创建教材</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
                      科目 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                      placeholder="例如：数学、语文、英语"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
                      教材版本 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.version}
                      onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                      className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                      placeholder="例如：人教版、苏教版"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
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
                          className="flex-1 px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                          placeholder={`第${index + 1}单元`}
                        />
                        {formData.units.length > 1 && (
                          <button
                            onClick={() => {
                              const newUnits = formData.units.filter((_, i) => i !== index);
                              setFormData({ ...formData, units: newUnits });
                            }}
                            className="px-3 py-2 text-red-500 hover:bg-red-900/20 rounded-lg"
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
                      className="w-full px-3 py-2 border border-dashed border-[#324467] rounded-lg hover:bg-[#324467] text-[#92a4c9] text-sm flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      添加单元
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-[#92a4c9]">备注</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                    rows={3}
                    placeholder="教材相关备注信息"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-[#92a4c9]">关键词（逗号分隔）</label>
                  <input
                    type="text"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                    placeholder="例如：代数, 方程, 计算"
                  />
                </div>

                {/* 高级选项（可折叠） */}
                <details className="border border-[#324467] rounded-lg p-3">
                  <summary className="cursor-pointer text-sm font-medium text-[#92a4c9]">
                    高级选项（节点类型和层级）
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-[#92a4c9]">节点名称</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                        placeholder="留空则自动生成"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-[#92a4c9]">节点类型</label>
                      <select
                        value={formData.type}
                        onChange={(e) =>
                          setFormData({ ...formData, type: e.target.value as MaterialNodeType })
                        }
                        className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                      >
                        <option value="VERSION">版本</option>
                        <option value="GRADE">年级</option>
                        <option value="SUBJECT">学科</option>
                        <option value="TEXTBOOK">教材</option>
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
                  className="flex-1 px-4 py-2 border border-[#324467] rounded-lg hover:bg-[#324467] text-[#92a4c9]"
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
            <div className="bg-[#232f48] rounded-xl p-6 w-full max-w-md shadow-xl">
              <h3 className="text-xl font-bold mb-4 text-white">编辑教材节点</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-[#92a4c9]">节点名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[#92a4c9]">节点类型</label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value as MaterialNodeType })
                    }
                    className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                  >
                    <option value="VERSION">版本</option>
                    <option value="GRADE">年级</option>
                    <option value="SUBJECT">学科</option>
                    <option value="TEXTBOOK">教材</option>
                    <option value="UNIT">单元</option>
                    <option value="CHAPTER">章节</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[#92a4c9]">描述（可选）</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[#92a4c9]">关键词（可选，逗号分隔）</label>
                  <input
                    type="text"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 border border-[#324467] rounded-lg hover:bg-[#324467] text-[#92a4c9]"
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
            <div className="bg-[#232f48] rounded-xl p-6 w-full max-w-md shadow-xl">
              <h3 className="text-xl font-bold mb-4 text-white">确认删除</h3>
              <p className="text-[#92a4c9] mb-6">
                确定要删除节点 <span className="font-semibold">{selectedNode.name}</span> 吗？
                <br />
                <span className="text-sm text-red-500">
                  注意：如果节点有子节点或被题目引用，将无法删除。
                </span>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2 border border-[#324467] rounded-lg hover:bg-[#324467] text-[#92a4c9]"
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
            <div className="bg-[#232f48] rounded-xl p-6 w-full max-w-2xl shadow-xl">
              <h3 className="text-xl font-bold mb-4 text-white">批量导入教材</h3>
              
              {!importResult ? (
                <div className="space-y-4">
                  {/* 说明 */}
                  <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-blue-400 text-[20px]">
                        info
                      </span>
                      <div className="text-sm text-blue-300">
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
                      className="w-full px-4 py-3 border-2 border-dashed border-[#324467] rounded-lg hover:bg-[#324467] text-[#92a4c9] flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[20px]">download</span>
                      下载导入模板
                    </button>
                  </div>

                  {/* 文件上传 */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-[#92a4c9]">
                      选择Excel文件
                    </label>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileChange}
                      className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
                    />
                    {importFile && (
                      <p className="mt-2 text-sm text-[#92a4c9]">
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
                        ? 'bg-green-900/20 border-green-800'
                        : 'bg-red-900/20 border-red-800'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`material-symbols-outlined text-[24px] ${
                          importResult.success
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        {importResult.success ? 'check_circle' : 'error'}
                      </span>
                      <div className="flex-1">
                        <p
                          className={`font-medium ${
                            importResult.success
                              ? 'text-green-300'
                              : 'text-red-300'
                          }`}
                        >
                          {importResult.message}
                        </p>
                        {importResult.data && (
                          <div className="mt-2 text-sm">
                            {importResult.success ? (
                              <div className="space-y-1">
                                <p>总计: {importResult.data.total} 条</p>
                                <p className="text-green-400">
                                  成功: {importResult.data.success} 条
                                </p>
                                {importResult.data.failed > 0 && (
                                  <p className="text-red-400">
                                    失败: {importResult.data.failed} 条
                                  </p>
                                )}
                              </div>
                            ) : (
                              importResult.data.errors && (
                                <ul className="list-disc list-inside mt-2 space-y-1 text-red-400">
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
                  className="flex-1 px-4 py-2 border border-[#324467] rounded-lg hover:bg-[#324467] text-[#92a4c9]"
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

        {/* 新建教材模态框 */}
        {showTbCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#232f48] rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold mb-4 text-white">新建教材</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-[#92a4c9]">序号</label>
                    <input
                      type="number"
                      value={tbForm.order}
                      onChange={(e) => setTbForm({ ...tbForm, order: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
                      学科 <span className="text-red-500">*</span>
                    </label>
                    <input
                      list="tb-subject-list"
                      value={tbForm.subject}
                      onChange={(e) => setTbForm({ ...tbForm, subject: e.target.value })}
                      className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                      placeholder="如：数学、英语"
                    />
                    <datalist id="tb-subject-list">
                      {subjectOptions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
                      教材版本 <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={tbForm.version}
                      onChange={(e) => setTbForm({ ...tbForm, version: e.target.value })}
                      className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                      placeholder="如：人教版"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
                        年级 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={tbForm.grade}
                        onChange={(e) => setTbForm({ ...tbForm, grade: e.target.value })}
                        className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                      >
                        <option value="">请选择</option>
                        {GRADE_OPTIONS.map((g) => (
                          <option key={g.value} value={g.value}>{g.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
                        学期 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={tbForm.term}
                        onChange={(e) => setTbForm({ ...tbForm, term: e.target.value as 'UP' | 'DOWN' })}
                        className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                      >
                        {TERM_OPTIONS.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[#92a4c9]">教材简介</label>
                  <textarea
                    value={tbForm.description}
                    onChange={(e) => setTbForm({ ...tbForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                    rows={3}
                    placeholder="教材定位、适用范围等"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
                    单元 <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    {tbForm.units.map((u, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="number"
                          value={u.seq}
                          onChange={(e) => {
                            const n = [...tbForm.units];
                            n[index] = { ...n[index], seq: Number(e.target.value) };
                            setTbForm({ ...tbForm, units: n });
                          }}
                          className="w-20 px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                          placeholder="序号"
                        />
                        <input
                          value={u.name}
                          onChange={(e) => {
                            const n = [...tbForm.units];
                            n[index] = { ...n[index], name: e.target.value };
                            setTbForm({ ...tbForm, units: n });
                          }}
                          className="flex-1 px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                          placeholder={`第 ${index + 1} 单元名称`}
                        />
                        {tbForm.units.length > 1 && (
                          <button
                            onClick={() =>
                              setTbForm({ ...tbForm, units: tbForm.units.filter((_, i) => i !== index) })
                            }
                            className="px-3 py-2 text-red-500 hover:bg-red-900/20 rounded-lg"
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        setTbForm({
                          ...tbForm,
                          units: [...tbForm.units, { seq: tbForm.units.length + 1, name: '' }],
                        })
                      }
                      className="w-full px-3 py-2 border border-dashed border-[#324467] rounded-lg hover:bg-[#324467] text-[#92a4c9] text-sm flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      添加单元
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowTbCreate(false)}
                  className="flex-1 px-4 py-2 border border-[#324467] rounded-lg hover:bg-[#324467] text-[#92a4c9]"
                >
                  取消
                </button>
                <button
                  onClick={handleTbCreate}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 编辑教材模态框 */}
        {showTbEdit && editingTextbook && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#232f48] rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold mb-4 text-white">
                编辑教材 · {editingTextbook.version} {gradeLabel(editingTextbook.grade)}{termLabel(editingTextbook.term)} {editingTextbook.subject}
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-[#92a4c9]">序号</label>
                    <input
                      type="number"
                      value={tbForm.order}
                      onChange={(e) => setTbForm({ ...tbForm, order: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
                      学科 <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={tbForm.subject}
                      onChange={(e) => setTbForm({ ...tbForm, subject: e.target.value })}
                      className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
                      教材版本 <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={tbForm.version}
                      onChange={(e) => setTbForm({ ...tbForm, version: e.target.value })}
                      className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
                        年级 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={tbForm.grade}
                        onChange={(e) => setTbForm({ ...tbForm, grade: e.target.value })}
                        className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                      >
                        <option value="">请选择</option>
                        {GRADE_OPTIONS.map((g) => (
                          <option key={g.value} value={g.value}>{g.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
                        学期 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={tbForm.term}
                        onChange={(e) => setTbForm({ ...tbForm, term: e.target.value as 'UP' | 'DOWN' })}
                        className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                      >
                        {TERM_OPTIONS.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[#92a4c9]">教材简介</label>
                  <textarea
                    value={tbForm.description}
                    onChange={(e) => setTbForm({ ...tbForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[#92a4c9]">
                    单元 <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    {tbForm.units.map((u, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="number"
                          value={u.seq}
                          onChange={(e) => {
                            const n = [...tbForm.units];
                            n[index] = { ...n[index], seq: Number(e.target.value) };
                            setTbForm({ ...tbForm, units: n });
                          }}
                          className="w-20 px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                          placeholder="序号"
                        />
                        <input
                          value={u.name}
                          onChange={(e) => {
                            const n = [...tbForm.units];
                            n[index] = { ...n[index], name: e.target.value };
                            setTbForm({ ...tbForm, units: n });
                          }}
                          className="flex-1 px-3 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white"
                          placeholder={`第 ${index + 1} 单元名称`}
                        />
                        {tbForm.units.length > 1 && (
                          <button
                            onClick={() =>
                              setTbForm({ ...tbForm, units: tbForm.units.filter((_, i) => i !== index) })
                            }
                            className="px-3 py-2 text-red-500 hover:bg-red-900/20 rounded-lg"
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        setTbForm({
                          ...tbForm,
                          units: [...tbForm.units, { seq: tbForm.units.length + 1, name: '' }],
                        })
                      }
                      className="w-full px-3 py-2 border border-dashed border-[#324467] rounded-lg hover:bg-[#324467] text-[#92a4c9] text-sm flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      添加单元
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowTbEdit(false)}
                  className="flex-1 px-4 py-2 border border-[#324467] rounded-lg hover:bg-[#324467] text-[#92a4c9]"
                >
                  取消
                </button>
                <button
                  onClick={handleTbUpdate}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 删除教材确认模态框 */}
        {showTbDelete && editingTextbook && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#232f48] rounded-xl p-6 w-full max-w-md shadow-xl">
              <h3 className="text-xl font-bold mb-4 text-white">确认删除教材</h3>
              <p className="text-[#92a4c9] mb-6">
                确定要删除教材{' '}
                <span className="font-semibold">
                  {editingTextbook.version} {gradeLabel(editingTextbook.grade)}{termLabel(editingTextbook.term)} {editingTextbook.subject}
                </span>{' '}
                吗？
                <br />
                <span className="text-sm text-red-500">
                  注意：若教材下单元已被题目引用，将无法删除，请先处理相关题目。
                </span>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowTbDelete(false)}
                  className="flex-1 px-4 py-2 border border-[#324467] rounded-lg hover:bg-[#324467] text-[#92a4c9]"
                >
                  取消
                </button>
                <button
                  onClick={handleTbDelete}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaterialSystemManagement;
