import { useState, useEffect } from 'react';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

interface TextbookWithUnits {
  id: string;
  name: string;
  subject: string;
  version?: string;
  grade?: string;
  term?: string;
  units: Array<{ id: string; name: string }>;
}

interface PaperItem {
  id: string;
  title: string;
  _count?: { items?: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const SPECIAL_TYPE_OPTIONS = [
  { v: 'UNIT', label: '单元专项', desc: '按教材单元抽题巩固' },
  { v: 'KNOWLEDGE_POINT', label: '知识点专项', desc: '针对薄弱知识点定向练习' },
  { v: 'ERROR_BOOK', label: '错题本专项', desc: '自动选取未掌握错题重做' },
  { v: 'PAPER', label: '题库组卷', desc: '整卷或按难度/知识点随机组卷' },
] as const;

/**
 * 学员主动创建专项攻克任务（主动学习入口，功能与家长端一致）
 * 暗色主题，与学员任务中心一致。
 */
export const StudentSpecialTaskModal = ({ open, onClose, onCreated }: Props) => {
  const [subject, setSubject] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [specialType, setSpecialType] = useState<'UNIT' | 'KNOWLEDGE_POINT' | 'ERROR_BOOK' | 'PAPER'>('UNIT');
  const [textbooks, setTextbooks] = useState<TextbookWithUnits[]>([]);
  const [textbookId, setTextbookId] = useState('');
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [kpCandidates, setKpCandidates] = useState<string[]>([]);
  const [selectedKps, setSelectedKps] = useState<string[]>([]);
  const [manualKp, setManualKp] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [paperSource, setPaperSource] = useState<'RANDOM' | 'PAPER'>('RANDOM');
  const [papers, setPapers] = useState<PaperItem[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState('');
  const [difficultyMin, setDifficultyMin] = useState(1);
  const [difficultyMax, setDifficultyMax] = useState(5);
  const [paperKps, setPaperKps] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const inputCls =
    'w-full px-4 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white focus:outline-none focus:ring-2 focus:ring-primary/60';
  const labelCls = 'block text-sm font-medium text-[#92a4c9] mb-2';

  // 打开时加载教材（推导学科列表）
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await request.get<{ success: boolean; data: TextbookWithUnits[] }>(
          '/student/question-bank/textbooks'
        );
        const list = res.data || [];
        setTextbooks(list);
        const subs = [...new Set(list.map((t) => t.subject).filter(Boolean))];
        setSubjects(subs);
        if (subs.length > 0 && !subject) setSubject(subs[0]);
      } catch (err) {
        setError(getErrorMessage(err, '加载教材失败'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 学科切换：重置选择，加载薄弱点候选 / 试卷
  useEffect(() => {
    if (!open || !subject) return;
    setTextbookId('');
    setSelectedUnitIds([]);
    setSelectedKps([]);
    setPaperKps('');
    setSelectedPaperId('');
    setKpCandidates([]);
    setPapers([]);
    (async () => {
      try {
        const ls = await request.get<any>(
          `/student/learning-state?subject=${encodeURIComponent(subject)}`
        );
        const state = ls.data || {};
        const wp: any[] = Array.isArray(state.weakPoints) ? state.weakPoints : [];
        setKpCandidates(wp.map((w) => w.point).filter(Boolean));
      } catch {
        setKpCandidates([]);
      }
      try {
        const pr = await request.get<{ success: boolean; data: { papers: PaperItem[] } }>(
          `/student/question-bank/papers?category=EXERCISE&subject=${encodeURIComponent(subject)}`
        );
        setPapers(pr.data?.papers || []);
      } catch {
        setPapers([]);
      }
    })();
  }, [open, subject]);

  const activeTextbooks = textbooks.filter((t) => t.subject === subject);
  const activeUnits = activeTextbooks.find((t) => t.id === textbookId)?.units || [];

  const toggleChip = (list: string[], setList: (v: string[]) => void, v: string) => {
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };

  const addManualKp = () => {
    const k = manualKp.trim();
    if (!k) return;
    if (!selectedKps.includes(k)) setSelectedKps([...selectedKps, k]);
    setManualKp('');
  };

  const handleSubmit = async () => {
    if (!subject) {
      setError('请选择学科');
      return;
    }
    if (specialType === 'UNIT' && selectedUnitIds.length === 0) {
      setError('单元专项请至少选择一个单元');
      return;
    }
    if (specialType === 'KNOWLEDGE_POINT' && selectedKps.length === 0) {
      setError('知识点专项请至少选择一个知识点');
      return;
    }
    if (specialType === 'PAPER' && paperSource === 'PAPER' && !selectedPaperId) {
      setError('请选择试卷');
      return;
    }

    const body: any = { subject, specialType, questionCount };
    if (specialType === 'UNIT') body.unitIds = selectedUnitIds;
    if (specialType === 'KNOWLEDGE_POINT') body.knowledgePoints = selectedKps;
    if (specialType === 'PAPER') {
      if (paperSource === 'PAPER') {
        body.examConfig = { source: 'PAPER', paperId: selectedPaperId };
      } else {
        body.examConfig = {
          source: 'RANDOM',
          subject,
          questionCount,
          difficultyMin,
          difficultyMax,
          ...(paperKps.trim() ? { knowledgePoints: paperKps.split(/[,，]/).map((s) => s.trim()).filter(Boolean) } : {}),
        };
      }
    }

    setSaving(true);
    setError('');
    try {
      await request.post('/student/tasks/special', body);
      onCreated();
    } catch (err) {
      setError(getErrorMessage(err, '创建专项任务失败'));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-w-2xl w-full bg-[#232f48] border border-[#324467] rounded-lg shadow-xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-medium text-white">新建专项攻克任务</h3>
              <p className="text-sm text-[#5b6b8c] mt-0.5">主动发起短期专项练习，按自己的节奏攻克薄弱环节</p>
            </div>
            <button onClick={onClose} className="text-[#5b6b8c] hover:text-white text-xl leading-none">
              ×
            </button>
          </div>

          {/* 学科 */}
          <div className="mb-4">
            <label className={labelCls}>学科 <span className="text-red-500">*</span></label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls}>
              <option value="">请选择学科</option>
              {subjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {subjects.length === 0 && (
              <p className="text-xs text-amber-300 mt-1">暂无可用教材，请先由管理员在题库添加教材</p>
            )}
          </div>

          {/* 专项类型 */}
          <div className="mb-4">
            <label className={labelCls}>专项类型 <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              {SPECIAL_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setSpecialType(opt.v)}
                  className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    specialType === opt.v
                      ? 'border-purple-500 bg-purple-500/15 text-white'
                      : 'border-[#324467] bg-[#1a2332] text-[#92a4c9] hover:border-purple-500/60'
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs opacity-80 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 单元专项：教材 + 单元多选 */}
          {specialType === 'UNIT' && (
            <div className="space-y-3 mb-4">
              <div>
                <label className={labelCls}>教材</label>
                <select value={textbookId} onChange={(e) => { setTextbookId(e.target.value); setSelectedUnitIds([]); }} className={inputCls}>
                  <option value="">请选择教材</option>
                  {activeTextbooks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {textbookId && (
                <div>
                  <label className={labelCls}>单元（多选）</label>
                  {activeUnits.length === 0 ? (
                    <p className="text-xs text-[#5b6b8c]">该教材暂无单元</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {activeUnits.map((u) => {
                        const checked = selectedUnitIds.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => toggleChip(selectedUnitIds, setSelectedUnitIds, u.id)}
                            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                              checked
                                ? 'border-purple-500 bg-purple-500/15 text-purple-300'
                                : 'border-[#324467] text-[#92a4c9] hover:bg-[#1a2332]'
                            }`}
                          >
                            {checked ? '☑ ' : '☐ '}
                            {u.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 知识点专项：薄弱点候选 + 手动输入 */}
          {specialType === 'KNOWLEDGE_POINT' && (
            <div className="space-y-3 mb-4">
              <div>
                <label className={labelCls}>知识点（多选）</label>
                {kpCandidates.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {kpCandidates.map((kp) => {
                      const checked = selectedKps.includes(kp);
                      return (
                        <button
                          key={kp}
                          type="button"
                          onClick={() => toggleChip(selectedKps, setSelectedKps, kp)}
                          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                            checked
                              ? 'border-purple-500 bg-purple-500/15 text-purple-300'
                              : 'border-[#324467] text-[#92a4c9] hover:bg-[#1a2332]'
                          }`}
                        >
                          {checked ? '☑ ' : '☐ '}
                          {kp}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[#5b6b8c]">
                    暂无学情薄弱点记录，可在下方手动输入知识点
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  <input
                    value={manualKp}
                    onChange={(e) => setManualKp(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManualKp(); } }}
                    placeholder="手动输入知识点（回车添加）"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={addManualKp}
                    className="px-4 py-2 bg-[#1a2332] border border-[#324467] rounded-lg text-[#92a4c9] hover:text-white hover:border-purple-500/60 whitespace-nowrap"
                  >
                    添加
                  </button>
                </div>
                {selectedKps.length > 0 && (
                  <p className="text-xs text-[#5b6b8c] mt-2">已选 {selectedKps.length} 个</p>
                )}
              </div>
            </div>
          )}

          {/* 错题本专项 */}
          {specialType === 'ERROR_BOOK' && (
            <div className="p-4 bg-[#1a2332] rounded-lg border border-[#324467] mb-4">
              <p className="text-sm text-[#92a4c9]">
                将自动从你的错题本中选取「{subject}」学科未掌握的错题（最多按下方题量）。
              </p>
            </div>
          )}

          {/* 题库组卷 */}
          {specialType === 'PAPER' && (
            <div className="space-y-3 mb-4">
              <div className="flex gap-4">
                {(
                  [
                    { v: 'RANDOM', label: '随机组卷' },
                    { v: 'PAPER', label: '选择试卷' },
                  ] as const
                ).map((opt) => (
                  <label key={opt.v} className="flex items-center gap-2 text-sm text-[#92a4c9]">
                    <input
                      type="radio"
                      checked={paperSource === opt.v}
                      onChange={() => setPaperSource(opt.v)}
                      className="accent-purple-500"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {paperSource === 'RANDOM' ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>题量</label>
                      <input type="number" min={1} max={50} value={questionCount}
                        onChange={(e) => setQuestionCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                        className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>难度下限</label>
                      <select value={difficultyMin} onChange={(e) => setDifficultyMin(parseInt(e.target.value))} className={inputCls}>
                        {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} 星</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>难度上限</label>
                      <select value={difficultyMax} onChange={(e) => setDifficultyMax(parseInt(e.target.value))} className={inputCls}>
                        {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} 星</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>知识点（选填，逗号分隔）</label>
                    <input value={paperKps} onChange={(e) => setPaperKps(e.target.value)}
                      placeholder="如：全等三角形判定, 因式分解"
                      className={inputCls} />
                  </div>
                </>
              ) : (
                <div>
                  <label className={labelCls}>选择试卷</label>
                  {papers.length === 0 ? (
                    <p className="text-xs text-amber-300">该学科暂无已发布的习题试卷</p>
                  ) : (
                    <select value={selectedPaperId} onChange={(e) => setSelectedPaperId(e.target.value)} className={inputCls}>
                      <option value="">请选择试卷</option>
                      {papers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}（{p._count?.items ?? 0} 题）
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 题量（UNIT/KP/ERROR_BOOK 显示） */}
          {specialType !== 'PAPER' && (
            <div className="mb-4">
              <label className={labelCls}>题量（1-50）</label>
              <input type="number" min={1} max={50} value={questionCount}
                onChange={(e) => setQuestionCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                className={inputCls} />
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-[#324467] rounded-lg text-[#92a4c9] hover:text-white hover:border-primary/60 disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={saving || loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 disabled:opacity-50 flex items-center"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  创建中...
                </>
              ) : (
                '创建专项任务'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentSpecialTaskModal;
