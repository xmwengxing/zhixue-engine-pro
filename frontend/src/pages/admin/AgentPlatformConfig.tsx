import React, { useState, useEffect, useCallback } from 'react';
import request, { type ApiResponse } from '../../utils/request';
import { getErrorMessage } from '../../types/error';

// ==================== 类型定义 ====================

type AgentDocType = 'FLOW' | 'INSTRUCTION' | 'CONSTRAINT' | 'STANDARD' | 'MEMORY_SPEC';

interface AgentDoc {
  id: string;
  type: AgentDocType;
  subject: string | null;
  title: string;
  content: string;
  version: number;
  enabled: boolean;
  priority: number;
  updatedAt: string;
  updatedBy?: string | null;
}

interface StudentMemoryRow {
  id: string;
  studentId: string;
  subject: string | null;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  studentName?: string;
}

interface MemoryLog {
  id: string;
  sessionId: string | null;
  content: string;
  summary: string | null;
  createdAt: string;
}

const AGENT_DOC_TYPES: AgentDocType[] = ['FLOW', 'INSTRUCTION', 'CONSTRAINT', 'STANDARD', 'MEMORY_SPEC'];

const TYPE_META: Record<AgentDocType, { label: string; desc: string; color: string }> = {
  CONSTRAINT: { label: '约束', desc: '全局行为红线，最高优先级，永不被裁剪', color: 'bg-red-500/15 text-red-400 border border-red-500/30' },
  INSTRUCTION: { label: '指令', desc: '角色设定与教学法', color: 'bg-blue-500/15 text-blue-400 border border-blue-500/30' },
  FLOW: { label: '流程', desc: '训练舱分阶段流程规范', color: 'bg-violet-500/15 text-violet-400 border border-violet-500/30' },
  STANDARD: { label: '标准', desc: '评分/输出规范', color: 'bg-amber-500/15 text-amber-400 border border-amber-500/30' },
  MEMORY_SPEC: { label: '记忆', desc: '学员记忆撰写规范', color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' },
};

// 常用科目（仅作输入联想，允许自由填写）
const SUBJECT_HINTS = ['小学数学', '初中数学', '高中数学', '小学语文', '初中语文', '高中语文', '小学英语', '初中英语', '高中英语'];

// ==================== 轻量 Markdown 预览（先转义后渲染，避免 XSS） ====================

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-[#0d1422] text-amber-300 text-[13px]">$1</code>');
}

function renderMarkdown(src: string): string {
  const lines = escapeHtml(src).split('\n');
  let html = '';
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };
  for (const line of lines) {
    if (/^### /.test(line)) {
      closeList();
      html += `<h3 class="text-base font-bold mt-3 mb-1 text-white">${renderInline(line.slice(4))}</h3>`;
    } else if (/^## /.test(line)) {
      closeList();
      html += `<h2 class="text-lg font-bold mt-3 mb-1 text-white">${renderInline(line.slice(3))}</h2>`;
    } else if (/^# /.test(line)) {
      closeList();
      html += `<h1 class="text-xl font-bold mt-3 mb-1 text-white">${renderInline(line.slice(2))}</h1>`;
    } else if (/^- /.test(line)) {
      if (!inList) {
        html += '<ul class="list-disc pl-5 my-1 space-y-0.5">';
        inList = true;
      }
      html += `<li>${renderInline(line.slice(2))}</li>`;
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      html += `<p class="my-1 leading-relaxed">${renderInline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

// ==================== 主组件 ====================

export const AgentPlatformConfig: React.FC = () => {
  const [tab, setTab] = useState<'docs' | 'memories'>('docs');

  return (
    <div className="flex flex-1 flex-col h-full min-h-screen bg-[#111722]">
      <div className="px-4 md:px-8 lg:px-12 flex-1 py-8">
        <div className="flex flex-col max-w-[1200px] flex-1 gap-6">
          {/* 标题 + Tab 切换 */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-white tracking-tight text-[32px] font-bold leading-tight">
                智能体平台配置
              </h1>
              <p className="text-[#92a4c9] text-sm mt-1">
                分层上下文（L1 约束 → L2 指令 → L3 流程 → L4 学员记忆 → L5 学科画像 → L6 任务状态）的文档化配置，以及 AI 生成的学员长期记忆管理。
              </p>
            </div>
            <div className="flex mb-1 rounded-lg bg-[#232f48] p-1">
              <button
                onClick={() => setTab('docs')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === 'docs' ? 'bg-primary text-white' : 'text-[#92a4c9] hover:text-white'
                }`}
              >
                智能体文档
              </button>
              <button
                onClick={() => setTab('memories')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === 'memories' ? 'bg-primary text-white' : 'text-[#92a4c9] hover:text-white'
                }`}
              >
                学员记忆
              </button>
            </div>
          </div>

          {tab === 'docs' ? <DocsPanel /> : <MemoriesPanel />}
        </div>
      </div>
    </div>
  );
};

// ==================== 文档面板 ====================

const DocsPanel: React.FC = () => {
  const [docs, setDocs] = useState<AgentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<AgentDocType | ''>('');
  const [filterSubject, setFilterSubject] = useState<string>('');
  const [filterEnabled, setFilterEnabled] = useState<string>('');
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<AgentDoc | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterType) params.set('type', filterType);
      if (filterSubject) params.set('subject', filterSubject);
      if (filterEnabled) params.set('enabled', filterEnabled);
      const q = params.toString();
      const res = await request.get<ApiResponse<AgentDoc[]>>(`/admin/agent-docs${q ? `?${q}` : ''}`);
      if (res.success) setDocs(res.data);
    } catch (e) {
      console.error('加载智能体文档失败', e);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterSubject, filterEnabled]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setShowEditor(true);
  };

  const openEdit = (doc: AgentDoc) => {
    setEditing(doc);
    setShowEditor(true);
  };

  const toggleEnabled = async (doc: AgentDoc) => {
    try {
      await request.put(`/admin/agent-docs/${doc.id}`, { enabled: !doc.enabled });
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, enabled: !doc.enabled } : d)));
    } catch (e) {
      alert(getErrorMessage(e, '操作失败'));
    }
  };

  const remove = async (doc: AgentDoc) => {
    if (!confirm(`确定删除文档「${doc.title}」？该操作不可恢复。`)) return;
    try {
      await request.delete(`/admin/agent-docs/${doc.id}`);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      alert(getErrorMessage(e, '删除失败'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#1a2332] border border-[#324467] px-4 py-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as AgentDocType | '')}
          className="bg-[#0d1422] border border-[#324467] text-white rounded-lg px-3 py-2 text-sm"
        >
          <option value="">全部类型</option>
          {AGENT_DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_META[t].label}（{t}）
            </option>
          ))}
        </select>
        <input
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
          placeholder="按科目筛选（留空=全局）"
          className="bg-[#0d1422] border border-[#324467] text-white rounded-lg px-3 py-2 text-sm w-56"
        />
        <select
          value={filterEnabled}
          onChange={(e) => setFilterEnabled(e.target.value)}
          className="bg-[#0d1422] border border-[#324467] text-white rounded-lg px-3 py-2 text-sm"
        >
          <option value="">启用状态：全部</option>
          <option value="true">仅启用</option>
          <option value="false">仅停用</option>
        </select>
        <div className="flex-1" />
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          新建文档
        </button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-[#92a4c9] py-10 text-center">加载中...</div>
      ) : docs.length === 0 ? (
        <div className="text-[#92a4c9] py-10 text-center">暂无文档，点击右上角「新建文档」开始配置。</div>
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center gap-4 rounded-xl bg-[#1a2332] border border-[#324467] px-5 py-4"
            >
              <span className={`text-xs font-bold px-2 py-1 rounded ${TYPE_META[doc.type].color}`}>
                {TYPE_META[doc.type].label}
              </span>
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center gap-2">
                  <p className="text-white font-bold">{doc.title}</p>
                  <span className="text-[11px] text-[#92a4c9] border border-[#324467] rounded px-1.5 py-0.5">
                    v{doc.version}
                  </span>
                </div>
                <p className="text-[#92a4c9] text-xs mt-0.5">
                  {doc.subject ? `科目：${doc.subject}` : '全局（不指定科目）'} ｜ 优先级 {doc.priority}
                </p>
              </div>
              <button
                onClick={() => toggleEnabled(doc)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  doc.enabled
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {doc.enabled ? 'visibility' : 'visibility_off'}
                </span>
                {doc.enabled ? '已启用' : '已停用'}
              </button>
              <button
                onClick={() => openEdit(doc)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#232f48] text-white hover:bg-[#324467] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
                编辑
              </button>
              <button
                onClick={() => remove(doc)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <DocEditor
          doc={editing}
          onClose={() => setShowEditor(false)}
          onSaved={() => {
            setShowEditor(false);
            load();
          }}
          saving={saving}
          setSaving={setSaving}
        />
      )}
    </div>
  );
};

// ==================== 文档编辑器 ====================

const DocEditor: React.FC<{
  doc: AgentDoc | null;
  onClose: () => void;
  onSaved: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
}> = ({ doc, onClose, onSaved, saving, setSaving }) => {
  const [type, setType] = useState<AgentDocType>(doc?.type ?? 'INSTRUCTION');
  const [subject, setSubject] = useState<string>(doc?.subject ?? '');
  const [title, setTitle] = useState<string>(doc?.title ?? '');
  const [content, setContent] = useState<string>(doc?.content ?? '');
  const [priority, setPriority] = useState<number>(doc?.priority ?? 100);
  const [enabled, setEnabled] = useState<boolean>(doc?.enabled ?? true);
  const [preview, setPreview] = useState<boolean>(false);

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      alert('标题与内容必填');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        type,
        subject: subject.trim() || null,
        title: title.trim(),
        content,
        priority: Number(priority) || 100,
        enabled,
      };
      if (doc) {
        await request.put(`/admin/agent-docs/${doc.id}`, payload);
      } else {
        await request.post('/admin/agent-docs', payload);
      }
      alert('保存成功');
      onSaved();
    } catch (e) {
      alert(getErrorMessage(e, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a2332] border border-[#324467] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#324467] flex items-center justify-between">
          <h2 className="text-white text-xl font-bold">{doc ? '编辑文档' : '新建文档'}</h2>
          <button onClick={onClose} className="text-[#92a4c9] hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#92a4c9] text-xs font-bold mb-1.5">类型</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AgentDocType)}
                className="w-full bg-[#0d1422] border border-[#324467] text-white rounded-lg px-3 py-2 text-sm"
              >
                {AGENT_DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_META[t].label}（{t}）— {TYPE_META[t].desc}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[#92a4c9] text-xs font-bold mb-1.5">
                科目（留空 = 全局生效）
              </label>
              <input
                list="subject-hints"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="如：初中数学"
                className="w-full bg-[#0d1422] border border-[#324467] text-white rounded-lg px-3 py-2 text-sm"
              />
              <datalist id="subject-hints">
                {SUBJECT_HINTS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#92a4c9] text-xs font-bold mb-1.5">标题</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="如：全局行为红线"
                className="w-full bg-[#0d1422] border border-[#324467] text-white rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-[#92a4c9] text-xs font-bold mb-1.5">优先级</label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full bg-[#0d1422] border border-[#324467] text-white rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-white text-sm cursor-pointer pb-2.5">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="size-4"
                />
                启用
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[#92a4c9] text-xs font-bold">
                内容（Markdown 语法，按 `## 阶段名` 在 FLOW 中分段）
              </label>
              <button
                onClick={() => setPreview((p) => !p)}
                className="text-[#92a4c9] hover:text-white text-xs flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {preview ? 'edit' : 'preview'}
                </span>
                {preview ? '编辑' : '预览'}
              </button>
            </div>
            {preview ? (
              <div
                className="w-full min-h-[300px] bg-[#0d1422] border border-[#324467] text-slate-200 rounded-lg px-4 py-3 text-sm overflow-auto"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full min-h-[300px] bg-[#0d1422] border border-[#324467] text-white rounded-lg px-4 py-3 text-sm font-mono"
                placeholder={'例如（FLOW）：\n## DIAGNOSTIC_TEST\n先做一次诊断测试...\n## PLANNING\n基于诊断结果制定计划...'}
              />
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#324467] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-[#232f48] text-white rounded-lg hover:bg-[#324467] transition-colors text-sm font-medium"
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-6 py-2.5 bg-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== 学员记忆面板 ====================

const MemoriesPanel: React.FC = () => {
  const [memories, setMemories] = useState<StudentMemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStudentId, setFilterStudentId] = useState<string>('');
  const [viewing, setViewing] = useState<{ row: StudentMemoryRow; logs: MemoryLog[] } | null>(null);
  const [editing, setEditing] = useState<StudentMemoryRow | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const q = filterStudentId ? `?studentId=${encodeURIComponent(filterStudentId)}` : '';
      const res = await request.get<ApiResponse<StudentMemoryRow[]>>(`/admin/student-memories${q}`);
      if (res.success) setMemories(res.data);
    } catch (e) {
      console.error('加载学员记忆失败', e);
    } finally {
      setLoading(false);
    }
  }, [filterStudentId]);

  useEffect(() => {
    load();
  }, [load]);

  const openView = async (row: StudentMemoryRow) => {
    try {
      const res = await request.get<ApiResponse<{ logs: MemoryLog[] }>>(
        `/admin/student-memories/${row.id}`
      );
      if (res.success) setViewing({ row, logs: res.data.logs ?? [] });
    } catch (e) {
      alert(getErrorMessage(e, '加载失败'));
    }
  };

  const openEdit = (row: StudentMemoryRow) => {
    setEditing(row);
    setEditContent(row.content);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editContent.trim()) {
      alert('内容不能为空');
      return;
    }
    try {
      setSaving(true);
      await request.put(`/admin/student-memories/${editing.id}`, { content: editContent });
      alert('保存成功');
      setEditing(null);
      load();
    } catch (e) {
      alert(getErrorMessage(e, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: StudentMemoryRow) => {
    if (!confirm(`确定删除「${row.studentName ?? row.studentId}」的该条记忆？`)) return;
    try {
      await request.delete(`/admin/student-memories/${row.id}`);
      setMemories((prev) => prev.filter((m) => m.id !== row.id));
    } catch (e) {
      alert(getErrorMessage(e, '删除失败'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#1a2332] border border-[#324467] px-4 py-3">
        <input
          value={filterStudentId}
          onChange={(e) => setFilterStudentId(e.target.value)}
          placeholder="按学员 ID 筛选（留空=全部）"
          className="bg-[#0d1422] border border-[#324467] text-white rounded-lg px-3 py-2 text-sm w-72"
        />
        <span className="text-[#92a4c9] text-xs">
          学员记忆由 AI 在每次会话结束后自动归纳，仅家长可读、学员不可见。
        </span>
      </div>

      {loading ? (
        <div className="text-[#92a4c9] py-10 text-center">加载中...</div>
      ) : memories.length === 0 ? (
        <div className="text-[#92a4c9] py-10 text-center">暂无学员记忆记录。</div>
      ) : (
        <div className="flex flex-col gap-3">
          {memories.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-4 rounded-xl bg-[#1a2332] border border-[#324467] px-5 py-4"
            >
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center gap-2">
                  <p className="text-white font-bold">{m.studentName ?? m.studentId}</p>
                  <span className="text-[11px] text-[#92a4c9] border border-[#324467] rounded px-1.5 py-0.5">
                    {m.subject ?? '通用'}
                  </span>
                  <span className="text-[11px] text-[#92a4c9] border border-[#324467] rounded px-1.5 py-0.5">
                    v{m.version}
                  </span>
                </div>
                <p className="text-[#92a4c9] text-xs mt-0.5 line-clamp-2">
                  {m.content.slice(0, 120)}
                  {m.content.length > 120 ? '…' : ''}
                </p>
              </div>
              <button
                onClick={() => openView(m)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#232f48] text-white hover:bg-[#324467] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">visibility</span>
                查看/历史
              </button>
              <button
                onClick={() => openEdit(m)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#232f48] text-white hover:bg-[#324467] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
                修订
              </button>
              <button
                onClick={() => remove(m)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a2332] border border-[#324467] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-[#324467] flex items-center justify-between">
              <h2 className="text-white text-xl font-bold">
                {viewing.row.studentName ?? viewing.row.studentId} 的记忆
              </h2>
              <button onClick={() => setViewing(null)} className="text-[#92a4c9] hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="px-6 py-5 overflow-y-auto space-y-4">
              <div>
                <p className="text-[#92a4c9] text-xs font-bold mb-1.5">当前记忆内容</p>
                <div
                  className="bg-[#0d1422] border border-[#324467] rounded-lg px-4 py-3 text-sm text-slate-200 whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(viewing.row.content) }}
                />
              </div>
              <div>
                <p className="text-[#92a4c9] text-xs font-bold mb-1.5">修订历史</p>
                {viewing.logs.length === 0 ? (
                  <p className="text-[#92a4c9] text-sm">暂无修订历史。</p>
                ) : (
                  <div className="space-y-2">
                    {viewing.logs.map((log) => (
                      <div
                        key={log.id}
                        className="bg-[#0d1422] border border-[#324467] rounded-lg px-3 py-2"
                      >
                        <p className="text-[#92a4c9] text-[11px]">
                          {new Date(log.createdAt).toLocaleString()} ｜ {log.summary ?? '（无摘要）'}
                        </p>
                        <p className="text-slate-300 text-sm mt-1 whitespace-pre-wrap">{log.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#324467] flex justify-end">
              <button
                onClick={() => {
                  openEdit(viewing.row);
                  setViewing(null);
                }}
                className="px-4 py-2.5 bg-primary text-white rounded-lg hover:opacity-90 text-sm font-medium"
              >
                前往修订
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a2332] border border-[#324467] rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-[#324467] flex items-center justify-between">
              <h2 className="text-white text-xl font-bold">修订记忆</h2>
              <button onClick={() => setEditing(null)} className="text-[#92a4c9] hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="px-6 py-5 overflow-y-auto">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[300px] bg-[#0d1422] border border-[#324467] text-white rounded-lg px-4 py-3 text-sm font-mono"
              />
            </div>
            <div className="px-6 py-4 border-t border-[#324467] flex justify-end gap-3">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2.5 bg-[#232f48] text-white rounded-lg hover:bg-[#324467] text-sm font-medium"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="px-6 py-2.5 bg-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentPlatformConfig;
