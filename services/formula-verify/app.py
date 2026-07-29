"""
公式等价验证微服务（Python + sympy）

提供 LaTeX 表达式的代数/数值等价判断，供后端公式批改调用。
解析器：sympy.parsing.latex.parse_latex（lark 后端，无 antlr 依赖，兼容 Python 3.13）。
启动：uvicorn app:app --host 0.0.0.0 --port 8001
"""
from typing import Optional
import random
import sympy as sp
from sympy.parsing.latex import parse_latex
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Formula Verify Service", version="1.0.0")


class VerifyRequest(BaseModel):
    expr1: str
    expr2: str
    samples: int = 15
    tol: float = 1e-6


class VerifyResponse(BaseModel):
    equivalent: bool
    method: str  # symbolic | symbolic_equation | numeric | parse_error | numeric_error
    detail: Optional[str] = None


def _parse(latex: str):
    """解析 LaTeX，返回 (表达式, 是否为方程)。优先 lark 后端（无 antlr 依赖）。"""
    s = latex.strip().strip("$").strip()
    expr = None
    try:
        expr = parse_latex(s, backend="lark")
    except Exception:
        pass
    # lark 后端偶尔返回未转换的 Tree（非 sympy 对象），视为失败
    if not isinstance(expr, sp.Basic):
        expr = parse_latex(s)  # 回退默认后端（需要 antlr4 runtime，若无则抛错）
    if not isinstance(expr, sp.Basic):
        raise ValueError(f"无法解析 LaTeX: {s}")
    # 方程（含 =）转为 左边-右边，便于统一比较
    if isinstance(expr, sp.Equality):
        return expr.lhs - expr.rhs, True
    return expr, False


def verify(expr1: str, expr2: str, samples: int = 15, tol: float = 1e-6):
    try:
        e1, is_eq1 = _parse(expr1)
        e2, is_eq2 = _parse(expr2)
    except Exception as e:  # 解析失败
        return False, "parse_error", str(e)

    # 1) 符号等价：化简差值是否恒为 0
    try:
        diff = sp.simplify(e1 - e2)
        if diff == 0:
            return True, "symbolic", None
    except Exception:
        pass

    # 1.5) 两边都是方程：差常数倍视为同一方程（如 2x+3=7 与 x=2）
    if is_eq1 and is_eq2:
        try:
            ratio = sp.simplify(e1 / e2)
            if ratio.is_constant() and not ratio.has(sp.zoo, sp.nan) and ratio != 0:
                return True, "symbolic_equation", None
        except Exception:
            pass

    free = list(e1.free_symbols | e2.free_symbols)

    # 2) 纯常数：直接比较数值
    if not free:
        try:
            v1 = float(e1.evalf())
            v2 = float(e2.evalf())
            return (abs(v1 - v2) < tol), "numeric", None
        except Exception as e:
            return False, "numeric_error", str(e)

    # 3) 数值采样：在多个随机点比较两个表达式的值
    for _ in range(samples):
        subs = {s: random.uniform(-5.0, 5.0) for s in free}
        try:
            v1 = float(e1.subs(subs).evalf())
            v2 = float(e2.subs(subs).evalf())
        except Exception as e:
            return False, "numeric_error", str(e)
        if abs(v1 - v2) > tol:
            return False, "numeric", None
    return True, "numeric", None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/verify", response_model=VerifyResponse)
def api_verify(req: VerifyRequest):
    equivalent, method, detail = verify(req.expr1, req.expr2, req.samples, req.tol)
    return VerifyResponse(equivalent=equivalent, method=method, detail=detail)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
