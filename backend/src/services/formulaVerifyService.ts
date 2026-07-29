/**
 * 公式等价验证服务客户端
 *
 * 调用本地 Python(sympy) 微服务（services/formula-verify，默认端口 8001），
 * 判断学生提交的 LaTeX 公式与标准答案是否代数等价。
 * 微服务不可用时优雅降级：返回 null，调用方回退到 AI 批改或人工批改。
 */

const FORMULA_VERIFY_URL = process.env.FORMULA_VERIFY_URL || 'http://localhost:8001';
const REQUEST_TIMEOUT_MS = 8000;

export interface FormulaVerifyResult {
  equivalent: boolean;
  /** symbolic | symbolic_equation | numeric | parse_error | numeric_error */
  method: string;
  detail?: string | null;
}

/**
 * 验证两个 LaTeX 表达式是否等价。
 * @returns 验证结果；微服务不可用或超时返回 null（调用方需降级处理）
 */
export async function verifyFormula(
  studentLatex: string,
  expectedLatex: string,
  options?: { samples?: number; tol?: number }
): Promise<FormulaVerifyResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${FORMULA_VERIFY_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expr1: studentLatex,
        expr2: expectedLatex,
        samples: options?.samples ?? 15,
        tol: options?.tol ?? 1e-6,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[formulaVerify] 微服务返回 ${res.status}`);
      return null;
    }
    return (await res.json()) as FormulaVerifyResult;
  } catch (err) {
    // 服务未启动 / 超时 —— 降级
    console.warn('[formulaVerify] 微服务不可用，降级处理:', (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 检查微服务是否在线 */
export async function isFormulaServiceAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${FORMULA_VERIFY_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
