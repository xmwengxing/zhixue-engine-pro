import { useState, useEffect } from 'react';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

/** 新建英语单词任务弹窗（学员自建） */
export const WordTaskCreateModal = ({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) => {
  const [mode, setMode] = useState<'DICTATION' | 'SPELLING'>('DICTATION');
  const [stage, setStage] = useState('初中');
  const [stages, setStages] = useState<Array<{ stage: string; count: number }>>([]);
  const [orderMode, setOrderMode] = useState<'SEQUENCE' | 'RANDOM'>('SEQUENCE');
  const [groupSize, setGroupSize] = useState(2);
  const [intervalSec, setIntervalSec] = useState(5);
  const [roundSize, setRoundSize] = useState(20);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const inputCls =
    'w-full px-4 py-2 border border-[#324467] rounded-lg bg-[#1a2332] text-white focus:outline-none focus:ring-2 focus:ring-purple-500/60';
  const labelCls = 'block text-sm font-medium text-[#92a4c9] mb-2';

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await request.get<{ success: boolean; data: Array<{ stage: string; count: number }> }>(
          '/student/word-bank/stages'
        );
        const list = (res.data || []).filter((s) => s.count > 0);
        setStages(list);
        if (list.length > 0 && !list.some((s) => s.stage === stage)) {
          setStage(list[0].stage);
        }
      } catch {
        setStages([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      await request.post('/student/tasks/special', {
        subject: '英语',
        specialType: 'WORD',
        wordConfig: {
          mode,
          stage,
          orderMode,
          groupSize,
          intervalSec,
          roundSize,
        },
      });
      onCreated();
    } catch (e) {
      setError(getErrorMessage(e, '创建单词任务失败'));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-w-lg w-full bg-[#232f48] border border-[#324467] rounded-lg shadow-xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-medium text-white">新建英语单词任务</h3>
              <p className="text-sm text-[#5b6b8c] mt-0.5">听写 / 默写，AI 词汇老师自动出题加深记忆</p>
            </div>
            <button onClick={onClose} className="text-[#5b6b8c] hover:text-white text-xl leading-none">
              ×
            </button>
          </div>

          <div className="space-y-4">
            {/* 模式 */}
            <div>
              <label className={labelCls}>模式</label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { v: 'DICTATION', label: '听写', desc: '播放发音，输入单词' },
                    { v: 'SPELLING', label: '默写', desc: '显示中文，输入英文' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setMode(opt.v)}
                    className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      mode === opt.v
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

            {/* 阶段 */}
            <div>
              <label className={labelCls}>阶段</label>
              <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputCls}>
                {stages.map((s) => (
                  <option key={s.stage} value={s.stage}>
                    {s.stage}（{s.count} 词）
                  </option>
                ))}
                {stages.length === 0 && <option value="初中">初中</option>}
              </select>
              {stages.length === 0 && (
                <p className="text-xs text-amber-300 mt-1">词库为空，请先由管理员导入词库</p>
              )}
            </div>

            {/* 抽词 */}
            <div>
              <label className={labelCls}>抽词方式</label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { v: 'SEQUENCE', label: '顺序' },
                    { v: 'RANDOM', label: '随机' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setOrderMode(opt.v)}
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                      orderMode === opt.v
                        ? 'border-purple-500 bg-purple-500/15 text-white'
                        : 'border-[#324467] bg-[#1a2332] text-[#92a4c9]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 每组单词数 */}
            <div>
              <label className={labelCls}>每组单词数</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setGroupSize(n)}
                    className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${
                      groupSize === n
                        ? 'border-purple-500 bg-purple-500/15 text-white'
                        : 'border-[#324467] bg-[#1a2332] text-[#92a4c9]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* 组间隔 */}
            <div>
              <label className={labelCls}>每组间隔（秒）</label>
              <input
                type="number"
                min={0}
                max={120}
                value={intervalSec}
                onChange={(e) => setIntervalSec(Math.max(0, Math.min(120, parseInt(e.target.value) || 0)))}
                className={inputCls}
              />
            </div>

            {/* 每轮词数 */}
            <div>
              <label className={labelCls}>
                每轮词数（完成后触发短语填空）：<span className="text-purple-300">{roundSize}</span>
              </label>
              <input
                type="range"
                min={1}
                max={50}
                value={roundSize}
                onChange={(e) => setRoundSize(parseInt(e.target.value))}
                className="w-full accent-purple-500"
              />
              <div className="flex justify-between text-[10px] text-[#5b6b8c]">
                <span>1</span>
                <span>25</span>
                <span>50</span>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 border border-[#324467] rounded-lg text-[#92a4c9] hover:text-white disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => void handleSubmit()}
                disabled={saving || stages.length === 0}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 disabled:opacity-50"
              >
                {saving ? '创建中...' : '创建单词任务'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WordTaskCreateModal;
