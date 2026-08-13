import React, { useCallback, useEffect, useState } from 'react';
import request, { type ApiResponse } from '../../utils/request';
import { getErrorMessage } from '../../types/error';

interface WordItem {
  id: string;
  stage: string;
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
  createdAt?: string;
}

const inputCls =
  'w-full bg-[#111722] text-white text-sm rounded-lg px-3 py-2.5 border border-[#324467] focus:outline-none focus:border-primary placeholder:text-[#5b6b8c]';
const labelCls = 'text-[#92a4c9] text-xs font-medium mb-1.5 block';
const btnPrimary =
  'px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50';
const btnGhost =
  'px-3 py-1.5 rounded-lg border border-[#324467] text-[#92a4c9] text-xs hover:text-white hover:border-[#4a5a7a]';

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`bg-[#232f48] rounded-2xl p-6 w-full ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-[#92a4c9] hover:text-white">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 单词编辑/新增弹窗 */
const WordFormModal = ({
  word,
  stage,
  stages,
  onClose,
  onSaved,
}: {
  word: WordItem | null;
  stage: string;
  stages: string[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const isEdit = !!word;
  const [form, setForm] = useState({
    stage: word?.stage || stage || stages[0] || '',
    word: word?.word || '',
    phonetic: word?.phonetic || '',
    pos: word?.pos || '',
    meaning: word?.meaning || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!form.stage || !form.word.trim() || !form.meaning.trim()) {
      setErr('词库 / 单词 / 中文释义必填');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      if (isEdit && word) {
        await request.put<ApiResponse>(`/admin/word-bank/words/${word.id}`, {
          phonetic: form.phonetic,
          pos: form.pos,
          meaning: form.meaning.trim(),
        });
      } else {
        await request.post<ApiResponse>('/admin/word-bank/words', {
          stage: form.stage,
          word: form.word.trim(),
          phonetic: form.phonetic,
          pos: form.pos,
          meaning: form.meaning.trim(),
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
    <Modal title={isEdit ? `编辑单词：${word?.word}` : '新增单词'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div>
          <label className={labelCls}>词库 *</label>
          <select
            value={form.stage}
            disabled={isEdit}
            onChange={(e) => setForm({ ...form, stage: e.target.value })}
            className={inputCls}
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {!stages.includes(form.stage) && <option value={form.stage}>{form.stage}</option>}
          </select>
        </div>
        <div>
          <label className={labelCls}>单词 *</label>
          <input
            value={form.word}
            disabled={isEdit}
            onChange={(e) => setForm({ ...form, word: e.target.value })}
            className={inputCls}
            placeholder="如：abandon"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>音标</label>
            <input
              value={form.phonetic}
              onChange={(e) => setForm({ ...form, phonetic: e.target.value })}
              className={inputCls}
              placeholder="/əˈbændən/"
            />
          </div>
          <div>
            <label className={labelCls}>词性</label>
            <input
              value={form.pos}
              onChange={(e) => setForm({ ...form, pos: e.target.value })}
              className={inputCls}
              placeholder="v."
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>中文释义 *</label>
          <textarea
            value={form.meaning}
            onChange={(e) => setForm({ ...form, meaning: e.target.value })}
            className={inputCls}
            rows={3}
            placeholder="如：抛弃，放弃"
          />
        </div>
        <button onClick={() => void submit()} disabled={submitting} className={btnPrimary}>
          {submitting ? '保存中…' : isEdit ? '保存修改' : '新增单词'}
        </button>
      </div>
    </Modal>
  );
};

/** 导入词库弹窗（新增词库或追加；JSON 数组或 {words}） */
const ImportModal = ({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (stage: string) => void;
}) => {
  const [stage, setStage] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const submit = async () => {
    if (!stage.trim()) {
      setErr('请填写词库名称（如：高中、考研）');
      return;
    }
    let words: any[];
    try {
      const parsed = JSON.parse(text);
      words = Array.isArray(parsed) ? parsed : parsed.words;
      if (!Array.isArray(words) || words.length === 0) throw new Error('数组为空');
    } catch (e: any) {
      setErr('JSON 解析失败：' + e.message);
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await request.post<ApiResponse>('/admin/word-bank/import', {
        stage: stage.trim(),
        words,
      });
      const d = res.data || {};
      setResult(
        `导入完成：共 ${d.total} 条，新增 ${d.created}，更新 ${d.updated}，跳过 ${d.skipped}`
      );
      onDone(stage.trim());
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="导入词库（JSON）" onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        {err && <p className="text-red-400 text-sm">{err}</p>}
        {result && <p className="text-green-400 text-sm">{result}</p>}
        <div>
          <label className={labelCls}>词库名称 *（新词库自动创建；同名追加更新）</label>
          <input
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className={inputCls}
            placeholder="如：高中、考研、雅思"
          />
        </div>
        <div>
          <label className={labelCls}>
            {'JSON 内容 *（[{"word":"abandon","phonetic":"...","pos":"v.","meaning":"抛弃"}] 或 {"words":[...]}）'}
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={inputCls}
            rows={10}
            placeholder={JSON.stringify([
              { word: 'abandon', phonetic: '/əˈbændən/', pos: 'v.', meaning: '抛弃，放弃' },
              { word: 'ability', phonetic: '/əˈbɪləti/', pos: 'n.', meaning: '能力，才能' },
            ])}
          />
        </div>
        <button onClick={() => void submit()} disabled={submitting} className={btnPrimary}>
          {submitting ? '导入中…' : '开始导入'}
        </button>
        <p className="text-[#5b6b8c] text-xs">
          提示：与 seed-data/words-stage-*.json 相同格式，也可直接把该文件内容粘贴进来
        </p>
      </div>
    </Modal>
  );
};

const WordBankManagement: React.FC = () => {
  const [stages, setStages] = useState<Array<{ stage: string; count: number }>>([]);
  const [activeStage, setActiveStage] = useState('');
  const [keyword, setKeyword] = useState('');
  const [words, setWords] = useState<WordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editWord, setEditWord] = useState<WordItem | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [flash, setFlash] = useState('');
  const PAGE_SIZE = 20;

  const loadStages = useCallback(async () => {
    try {
      const res = await request.get<ApiResponse<{ stages: Array<{ stage: string; count: number }> }>>(
        '/admin/word-bank/stages'
      );
      const list = res.data?.stages || [];
      setStages(list);
      if (!activeStage && list.length > 0) setActiveStage(list[0].stage);
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  }, [activeStage]);

  const loadWords = useCallback(async () => {
    if (!activeStage) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ stage: activeStage, page: String(page), limit: String(PAGE_SIZE) });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const res = await request.get<ApiResponse<{ items: WordItem[]; total: number }>>(
        `/admin/word-bank/words?${params.toString()}`
      );
      setWords(res.data?.items || []);
      setTotal(res.data?.total || 0);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [activeStage, page, keyword]);

  useEffect(() => {
    void loadStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void loadWords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStage, page]);

  const delWord = async (w: WordItem) => {
    if (!window.confirm(`确定删除「${w.word}」吗？（删除后训练不再抽取该词）`)) return;
    try {
      await request.delete(`/admin/word-bank/words/${w.id}`);
      setFlash(`已删除「${w.word}」`);
      void loadWords();
      void loadStages();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  return (
    <div className="min-h-screen bg-[#111722] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">词库管理</h2>
          <p className="text-[#92a4c9] text-sm mt-1">
            单词数据用于背词/默写/听写/选择训练；新增词库或修改释义后，学员端下次任务立即生效
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditWord(null);
              setShowForm(true);
            }}
            className="px-4 py-2 rounded-lg bg-primary/15 text-primary border border-primary/40 text-sm hover:bg-primary/25"
          >
            + 新增单词
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="px-4 py-2 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/40 text-sm hover:bg-amber-500/25"
          >
            ⇧ 导入词库（JSON）
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm text-red-400">
          {err}
        </div>
      )}
      {flash && (
        <div className="mb-4 rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-2 text-sm text-green-400">
          {flash}
        </div>
      )}

      {/* 词库 tab */}
      <div className="flex flex-wrap gap-2 mb-4">
        {stages.map((s) => (
          <button
            key={s.stage}
            onClick={() => {
              setActiveStage(s.stage);
              setPage(1);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeStage === s.stage ? 'bg-primary text-white' : 'bg-[#232f48] text-[#92a4c9] hover:text-white'
            }`}
          >
            {s.stage}
            <span className="ml-1.5 text-xs opacity-70">{s.count}</span>
          </button>
        ))}
      </div>

      {/* 搜索 */}
      <div className="flex items-center gap-2 mb-4">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              void loadWords();
            }
          }}
          className={`${inputCls} max-w-xs`}
          placeholder="搜索单词或释义…"
        />
        <button onClick={() => { setPage(1); void loadWords(); }} className={btnGhost}>
          搜索
        </button>
        <span className="text-[#5b6b8c] text-xs ml-2">
          共 {total} 词 · 第 {page}/{Math.max(1, Math.ceil(total / PAGE_SIZE))} 页
        </span>
      </div>

      {/* 单词表格 */}
      <div className="rounded-xl bg-[#1a2332] border border-[#324467] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#232f48] text-[#92a4c9] text-xs">
              <th className="text-left px-4 py-3 font-medium w-10">#</th>
              <th className="text-left px-4 py-3 font-medium">单词</th>
              <th className="text-left px-4 py-3 font-medium w-44">音标</th>
              <th className="text-left px-4 py-3 font-medium w-16">词性</th>
              <th className="text-left px-4 py-3 font-medium">中文释义</th>
              <th className="text-right px-4 py-3 font-medium w-40">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#92a4c9]">
                  加载中…
                </td>
              </tr>
            ) : words.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#5b6b8c]">
                  该词库暂无单词，可点右上角「新增单词」或「导入词库」
                </td>
              </tr>
            ) : (
              words.map((w, i) => (
                <tr key={w.id} className="border-t border-[#1e2a40] hover:bg-[#232f48]/50">
                  <td className="px-4 py-3 text-[#5b6b8c] text-xs">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-4 py-3 text-white font-medium">{w.word}</td>
                  <td className="px-4 py-3 text-[#92a4c9] text-xs">{w.phonetic}</td>
                  <td className="px-4 py-3 text-[#92a4c9] text-xs">{w.pos}</td>
                  <td className="px-4 py-3 text-[#c3cfe6]">{w.meaning}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEditWord(w);
                        setShowForm(true);
                      }}
                      className="mr-2 px-2.5 py-1 rounded text-xs bg-primary/15 text-primary hover:bg-primary/25"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => void delWord(w)}
                      className="px-2.5 py-1 rounded text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {total > PAGE_SIZE && (
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className={btnGhost}
          >
            上一页
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / PAGE_SIZE)}
            className={btnGhost}
          >
            下一页
          </button>
        </div>
      )}

      {showForm && (
        <WordFormModal
          word={editWord}
          stage={activeStage}
          stages={stages.map((s) => s.stage)}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            setFlash(editWord ? '已保存修改' : '已新增单词');
            void loadWords();
            void loadStages();
          }}
        />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={(st) => {
            setActiveStage(st);
            setPage(1);
            void loadStages();
            void loadWords();
          }}
        />
      )}
    </div>
  );
};

export default WordBankManagement;
