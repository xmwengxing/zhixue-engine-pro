#!/usr/bin/env bash
# ==========================================
# 试卷入库脚本（Linux / macOS / Git Bash / WSL）
# ==========================================
# 用法：bash 试卷入库.sh [学科] [选项]
# 示例：
#   bash 试卷入库.sh 数学          # 入库数学
#   bash 试卷入库.sh --all         # 入库全部学科
#   bash 试卷入库.sh --dry         # 只检查不写库

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND="$PROJECT_ROOT/backend"

# ---------- 帮助 ----------
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  cat <<'EOF'
用法: bash 试卷入库.sh [学科] [选项]

示例:
  bash 试卷入库.sh 数学           # 入库数学
  bash 试卷入库.sh --all          # 入库全部学科
  bash 试卷入库.sh --dry          # 只检查不写库
  bash 试卷入库.sh 数学 --dry     # 检查数学学科
EOF
  exit 0
fi

# ---------- 前置检查 ----------
command -v node >/dev/null 2>&1 || { echo "❌ 未找到 Node.js，请先安装"; exit 1; }

# ---------- 路径 ----------
export PROGRESS_DIR="$SCRIPT_DIR/OutputData"
export PAPER_ROOT="$SCRIPT_DIR/SourceData"

# ---------- 解析参数 ----------
SUBJECT=""
DRY=""
for arg in "$@"; do
  case "$arg" in
    --dry) DRY="--dry" ;;
    --all) SUBJECT="" ;;
    --help|-h) ;;
    *) [ -z "$SUBJECT" ] && SUBJECT="$arg" ;;
  esac
done

# ---------- 获取学科列表 ----------
if [ -z "$SUBJECT" ]; then
  [ ! -d "$PROGRESS_DIR" ] && { echo "❌ 产物目录不存在，请先运行试卷转换"; exit 1; }
  SUBJECTS=()
  for f in "$PROGRESS_DIR"/progress-*.json; do
    [ -f "$f" ] || continue
    SUBJ=$(basename "$f" | sed 's/^progress-//;s/\.json$//')
    echo "$SUBJ" | grep -q "^import$\|^formula$" && continue
    SUBJECTS+=("$SUBJ")
  done
  [ ${#SUBJECTS[@]} -eq 0 ] && { echo "❌ 未找到转换产物"; exit 1; }
  echo "📚 发现学科: ${SUBJECTS[*]}"
else
  SUBJECTS=("$SUBJECT")
fi

# ---------- 检查产物 ----------
echo ""
for SUBJ in "${SUBJECTS[@]}"; do
  PF="$PROGRESS_DIR/progress-${SUBJ}.json"
  if [ ! -f "$PF" ]; then
    echo "⚠️  未找到: $PF（跳过 $SUBJ）"
    continue
  fi
  OK=$(node -e "const p=JSON.parse(require('fs').readFileSync('$PF','utf8'));console.log(Object.values(p).filter(r=>r.parseStatus==='ok').length)")
  Q=$(node -e "const p=JSON.parse(require('fs').readFileSync('$PF','utf8'));console.log(Object.values(p).reduce((s,r)=>s+(r.questionCount||0),0))")
  echo "  $SUBJ: $OK 文件, $Q 题"
done

# ---------- 执行入库 ----------
cd "$BACKEND"
echo ""
echo "📥 开始入库..."

SUBJECTS_STR=$(IFS=,; echo "${SUBJECTS[*]}")
node scripts/import-papers-to-db.mjs \
  --subjects "$SUBJECTS_STR" \
  --progress-dir "$PROGRESS_DIR" \
  --paper-root "$PAPER_ROOT" \
  $DRY

echo ""
echo "🎉 入库完成"
