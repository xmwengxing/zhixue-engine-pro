import { useState, useRef, useEffect } from 'react';
import { FormulaEditor } from './MathFormula';

/**
 * P1 交互题输入组件（零第三方依赖，原生实现）
 * - SortingInput：拖拽排序（HTML5 drag & drop + 上下按钮兜底）
 * - MatchingInput：点击连线（左列选项 ↔ 右列序号，SVG 画线）
 * - ProofStepsInput：证明题分步输入（每步文本 + 公式）
 */

// ============ 排序题 ============

export function SortingInput({
  items,
  value,
  onChange,
}: {
  items: string[];
  value?: Record<string, unknown>;
  onChange: (answerData: Record<string, unknown>, inputMethod: string) => void;
}) {
  const [order, setOrder] = useState<string[]>(() => {
    const v = Array.isArray(value?.order) && value.order.length ? (value.order as string[]) : items;
    return [...v];
  });
  const dragIdx = useRef<number | null>(null);

  const emit = (next: string[]) => {
    setOrder(next);
    onChange({ order: next }, 'drag');
  };

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...order];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    emit(next);
  };

  const shift = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= order.length) return;
    move(idx, to);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-[#5b6b8c]">拖动调整顺序（或使用 ▲▼ 按钮）</p>
      {order.map((item, idx) => (
        <div
          key={`${idx}-${item}`}
          draggable
          onDragStart={() => (dragIdx.current = idx)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIdx.current !== null) move(dragIdx.current, idx);
            dragIdx.current = null;
          }}
          onDragEnd={() => (dragIdx.current = null)}
          className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[#324467] bg-[#1a2332] cursor-grab active:cursor-grabbing select-none"
        >
          <span className="material-symbols-outlined text-[#5b6b8c] text-lg">drag_indicator</span>
          <span className="flex-1 text-[#e2e8f5] text-sm">{item}</span>
          <span className="text-[#5b6b8c] text-xs">第 {idx + 1} 位</span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={idx === 0}
              onClick={() => shift(idx, -1)}
              className="px-2 py-1 rounded border border-[#324467] text-[#92a4c9] hover:text-white disabled:opacity-30"
              title="上移"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={idx === order.length - 1}
              onClick={() => shift(idx, 1)}
              className="px-2 py-1 rounded border border-[#324467] text-[#92a4c9] hover:text-white disabled:opacity-30"
              title="下移"
            >
              ▼
            </button>
          </div>
        </div>
      ))}
      {order.length === 0 && <p className="text-sm text-[#5b6b8c]">无可排序项</p>}
    </div>
  );
}

// ============ 连线题 ============

interface Pair {
  left: string;
  right: string;
}

export function MatchingInput({
  items,
  value,
  onChange,
}: {
  items: string[];
  value?: Record<string, unknown>;
  onChange: (answerData: Record<string, unknown>, inputMethod: string) => void;
}) {
  const [pairs, setPairs] = useState<Pair[]>(() =>
    Array.isArray(value?.pairs) ? (value.pairs as Pair[]) : []
  );
  const [selLeft, setSelLeft] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgBox, setSvgBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const rightItems = items.map((_, i) => `①${['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][i] || `(${i + 1})`}`);

  const emit = (next: Pair[]) => {
    setPairs(next);
    onChange({ pairs: next }, 'click');
  };

  const clickLeft = (idx: number) => {
    if (selLeft === idx) {
      setSelLeft(null);
      return;
    }
    setSelLeft(idx);
  };

  const clickRight = (idx: number) => {
    if (selLeft === null) return;
    const left = items[selLeft];
    const right = `${idx + 1}`;
    const next = pairs.filter((p) => p.left !== left); // 同一左项只保留一条连线
    next.push({ left, right });
    emit(next);
    setSelLeft(null);
  };

  const removePair = (i: number) => {
    emit(pairs.filter((_, idx) => idx !== i));
  };

  // 更新 SVG 尺寸（连线坐标用）
  useEffect(() => {
    const measure = () => {
      const el = svgRef.current?.parentElement;
      if (el) setSvgBox({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [pairs]);

  const rowH = 48;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#5b6b8c]">先点击左侧选项，再点击右侧序号完成连线；再次点击左侧可取消</p>
      <div className="relative">
        <div className="grid grid-cols-2 gap-8 relative">
          {/* 左列 */}
          <div className="space-y-2">
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                onClick={() => clickLeft(i)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  selLeft === i
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : pairs.some((p) => p.left === it)
                      ? 'border-green-500/50 bg-green-500/10 text-[#c3cfe6]'
                      : 'border-[#324467] bg-[#1a2332] text-[#c3cfe6] hover:border-blue-500/50'
                }`}
              >
                {it}
              </button>
            ))}
          </div>
          {/* 右列 */}
          <div className="space-y-2">
            {rightItems.map((r, i) => {
              const paired = pairs.find((p) => p.right === `${i + 1}`);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => clickRight(i)}
                  className={`w-full text-center px-4 py-3 rounded-lg border transition-colors ${
                    paired
                      ? 'border-green-500/50 bg-green-500/10 text-[#c3cfe6]'
                      : 'border-[#324467] bg-[#1a2332] text-[#92a4c9] hover:border-blue-500/50'
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>
        {/* 连线层（SVG 覆盖） */}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ height: items.length * (rowH + 8) }}
        >
          {pairs.map((p, i) => {
            const li = items.indexOf(p.left);
            const ri = parseInt(p.right, 10) - 1;
            if (li < 0 || ri < 0) return null;
            const x1 = Math.max(0, svgBox.w / 2 - 16);
            const x2 = Math.max(0, svgBox.w / 2 + 16);
            const y1 = li * (rowH + 8) + rowH / 2;
            const y2 = ri * (rowH + 8) + rowH / 2;
            return (
              <g key={i}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3b82f6" strokeWidth="2" />
                <circle cx={x1} cy={y1} r="3" fill="#3b82f6" />
                <circle cx={x2} cy={y2} r="3" fill="#3b82f6" />
              </g>
            );
          })}
        </svg>
      </div>
      {pairs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pairs.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 border border-green-500/40 text-xs text-[#92a4c9]">
              {p.left} → {p.right}
              <button type="button" onClick={() => removePair(i)} className="text-red-400 hover:text-red-300 ml-1">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ 证明题分步输入 ============

export function ProofStepsInput({
  value,
  onChange,
}: {
  value?: Record<string, unknown>;
  onChange: (answerData: Record<string, unknown>, inputMethod: string) => void;
}) {
  const [steps, setSteps] = useState<Array<{ text?: string; latex?: string }>>(() =>
    Array.isArray(value?.steps) ? (value.steps as Array<{ text?: string; latex?: string }>) : []
  );

  const emit = (next: Array<{ text?: string; latex?: string }>) => {
    setSteps(next);
    onChange({ steps: next }, 'keyboard');
  };

  const addStep = () => {
    emit([...steps, { text: '', latex: '' }]);
  };

  const updateStep = (idx: number, patch: Partial<{ text: string; latex: string }>) => {
    const next = steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    emit(next);
  };

  const removeStep = (idx: number) => {
    emit(steps.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#5b6b8c]">分步写出证明过程：每一步可用文字或公式（如 ∵/∴ 符号请写在文字里）</p>
      {steps.map((s, i) => (
        <div key={i} className="p-3 rounded-lg border border-[#324467] bg-[#1a2332] space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#5b6b8c] shrink-0">第 {i + 1} 步</span>
            <button
              type="button"
              onClick={() => removeStep(i)}
              className="ml-auto text-xs text-red-400 hover:text-red-300"
            >
              删除
            </button>
          </div>
          <input
            value={s.text || ''}
            onChange={(e) => updateStep(i, { text: e.target.value })}
            placeholder="推理文字，如：∵ ∠1 = ∠2（已知）"
            className="w-full px-3 py-2 rounded-lg border border-[#324467] bg-[#111722] text-[#e2e8f5] focus:outline-none focus:border-blue-500"
          />
          <FormulaEditor
            value={s.latex || ''}
            placeholder="（可选）公式步骤"
            onChange={(latex) => updateStep(i, { latex })}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addStep}
        className="px-4 py-2 rounded-lg border border-dashed border-[#324467] text-[#92a4c9] hover:text-white hover:border-blue-500/60"
      >
        ＋ 添加步骤
      </button>
    </div>
  );
}
