import { useEffect, useRef } from 'react';
import { MathfieldElement, renderMathInElement } from 'mathlive';

/**
 * 题干/文本中的 LaTeX 渲染器（P0：答题区方案）
 * 自动扫描 `\(...\)` / `$$...$$` / `$...$` 公式片段并用 MathLive 渲染，其余按纯文本显示。
 * 未含公式时原样输出文本（兼容无公式题干）。
 */
export function LatexText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 先按纯文本填充（防注入），再让 renderMathInElement 扫描分隔符渲染公式
    el.textContent = text || '';
    try {
      renderMathInElement(el, {
        skipTags: ['math-field', 'noscript', 'style', 'textarea', 'pre', 'code'],
        // 默认分隔符即 \(...\) / $$...$$ / $...$，保持默认即可
      });
    } catch {
      /* 渲染失败保持纯文本 */
    }
  }, [text]);

  return <span ref={ref} className={className} />;
}

/**
 * 公式编辑器（封装 MathLive `<math-field>`）
 * - 所见即所得 + 虚拟键盘（移动端友好）
 * - 输出 LaTeX 字符串
 */
export function FormulaEditor({
  value = '',
  placeholder = '输入公式…',
  onChange,
  disabled,
}: {
  value?: string;
  placeholder?: string;
  onChange: (latex: string) => void;
  disabled?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mfRef = useRef<MathfieldElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!mfRef.current) {
      const mf = new MathfieldElement({
        mathVirtualKeyboardPolicy: 'manual',
        smartMode: true,
        letterShapeStyle: 'tex',
      });
      mf.addEventListener('input', () => onChangeRef.current(mf.value));
      mf.addEventListener('change', () => onChangeRef.current(mf.value));
      host.appendChild(mf);
      mfRef.current = mf;
    }
    const mf = mfRef.current;
    if (mf.value !== valueRef.current) {
      mf.value = valueRef.current;
    }
    if (disabled) mf.setAttribute('read-only', '');
    else mf.removeAttribute('read-only');
  }, [disabled]);

  return (
    <div
      ref={hostRef}
      className="w-full rounded-lg border border-[#324467] bg-[#1a2332] px-3 py-2 min-h-[52px] [&>math-field]:w-full [&>math-field]:bg-transparent [&>math-field]:text-[#e2e8f5] [&>math-field]:text-lg"
      data-placeholder={placeholder}
    />
  );
}
