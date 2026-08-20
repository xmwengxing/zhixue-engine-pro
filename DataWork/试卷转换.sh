#!/usr/bin/env bash
# ==========================================
# 试卷转换脚本（Linux / macOS / Git Bash / WSL）
# ==========================================
# 用法：bash 试卷转换.sh [学科] [选项]
# 示例：
#   bash 试卷转换.sh 数学          # 转换数学全部文件
#   bash 试卷转换.sh 历史 --limit 10
#   bash 试卷转换.sh --all         # 转换全部学科

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND="$PROJECT_ROOT/backend"

# ---------- 加载环境变量 ----------
ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi

# ---------- API Key 管理 ----------
if [ -z "${PADDLE_API_KEY:-}" ]; then
  echo "🔑 飞桨 PaddleOCR API Key 未配置"
  echo "   获取地址: https://paddleocr.aistudio.com.cn/"
  echo "   日额度: 20000 页（推荐使用）"
  echo ""
  read -rp "   请输入 API Key（留空跳过）: " KEY
  if [ -n "$KEY" ]; then
    echo "PADDLE_API_KEY=$KEY" > "$ENV_FILE"
    echo "   ✅ 已保存到 $ENV_FILE"
    export PADDLE_API_KEY="$KEY"
  else
    echo "   ⚠️  跳过（将尝试从 Docker DB 查询）"
  fi
  echo ""
fi

# ---------- 前置检查 ----------
command -v node >/dev/null 2>&1 || { echo "❌ 未找到 Node.js，请先安装"; exit 1; }
command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 || {
  echo "⚠️  未找到 Python，扫描件 OCR 功能不可用"
}

# ---------- 设置路径 ----------
export PAPER_ROOT="$SCRIPT_DIR/SourceData"
export OUT_DIR="$SCRIPT_DIR/OutputData"
export PYTHON_PATH="${PYTHON_PATH:-}"
if [ -z "$PYTHON_PATH" ]; then
  PYTHON_PATH="$(command -v python3 2>/dev/null || command -v python 2>/dev/null || echo python)"
  export PYTHON_PATH
fi

# ---------- 解析参数 ----------
SUBJECT="${1:-}"
EXTRA_ARGS=("$@")
if [ "$SUBJECT" = "--all" ]; then SUBJECT=""; fi
if [ "$SUBJECT" = "--help" ] || [ "$SUBJECT" = "-h" ]; then
  cat <<'EOF'
用法: bash 试卷转换.sh [学科] [选项]

示例:
  bash 试卷转换.sh 数学              # 转换数学
  bash 试卷转换.sh 历史 --limit 10   # 只转前10个
  bash 试卷转换.sh --all             # 转换全部学科
  bash 试卷转换.sh --retry           # 重试失败文件
EOF
  exit 0
fi

# ---------- 获取学科列表 ----------
if [ -z "$SUBJECT" ]; then
  if [ ! -d "$PAPER_ROOT" ]; then
    echo "❌ 源数据目录不存在: $PAPER_ROOT"
    echo "   请将试卷文件放入 SourceData/ 下按学科建子目录"
    exit 1
  fi
  SUBJECTS=()
  for d in "$PAPER_ROOT"/*/; do
    [ -d "$d" ] && SUBJECTS+=("$(basename "$d")")
  done
  [ ${#SUBJECTS[@]} -eq 0 ] && { echo "❌ SourceData 下未找到学科文件夹"; exit 1; }
  echo "📚 发现学科: ${SUBJECTS[*]}"
else
  SUBJECTS=("$SUBJECT")
fi

# ---------- 运行转换 ----------
cd "$BACKEND"
TOTAL_OK=0; TOTAL_Q=0

for SUBJ in "${SUBJECTS[@]}"; do
  echo ""
  echo "══════════════════════════════════════"
  echo "📄 开始转换: $SUBJ"
  echo "══════════════════════════════════════"

  node scripts/convert-papers-batch.mjs \
    --dir "$PAPER_ROOT" --subject "$SUBJ" --out "$OUT_DIR" \
    --progress "$OUT_DIR/progress-${SUBJ}.json" \
    --limit "${LIMIT:-99999}" "${EXTRA_ARGS[@]}"

  # 公式 OCR（数学/物理/化学/生物）
  if echo "$SUBJ" | grep -qiE '数学|物理|化学|生物'; then
    echo "🔬 开始公式 OCR: $SUBJ"
    if [ -z "${PADDLE_API_KEY:-}" ]; then
      echo "⚠️  未配置 API Key，跳过公式 OCR"
    else
      node scripts/ocr-formulas.mjs \
        --subject "$SUBJ" --progress-dir "$OUT_DIR" \
        --paper-root "$PAPER_ROOT" --ocr-usage "$OUT_DIR/ocr-usage.json"
    fi
  fi

  # 统计
  PF="$OUT_DIR/progress-${SUBJ}.json"
  if [ -f "$PF" ]; then
    OK=$(node -e "const p=JSON.parse(require('fs').readFileSync('$PF','utf8'));console.log(Object.values(p).filter(r=>r.parseStatus==='ok').length)")
    Q=$(node -e "const p=JSON.parse(require('fs').readFileSync('$PF','utf8'));console.log(Object.values(p).reduce((s,r)=>s+(r.questionCount||0),0))")
    echo "✅ $SUBJ: ${OK} 文件, ${Q} 题"
    TOTAL_OK=$((TOTAL_OK + OK)); TOTAL_Q=$((TOTAL_Q + Q))
  fi
done

echo ""
echo "══════════════════════════════════════"
echo "🎉 转换完成 | 文件: $TOTAL_OK | 题数: $TOTAL_Q"
echo "   产物目录: $OUT_DIR"
echo "══════════════════════════════════════"
