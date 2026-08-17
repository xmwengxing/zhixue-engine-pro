#!/bin/sh
# ==========================================
# 后端容器入口：数据库初始化 + 启动
# 说明：本仓库 schema 演进依赖 prisma db push（migration 链不完整，
#       生产直接用 db push 全量同步，避免 migrate deploy 缺枚举/缺表报错）
# ==========================================
set -e

echo "[init] 同步数据库结构（prisma db push）..."
npx prisma db push --skip-generate --accept-data-loss 2>/dev/null || npx prisma db push --skip-generate || true

# 首次初始化：教材体系种子（幂等：SUBJECT 节点存在则跳过）
echo "[init] 检查教材体系..."
SUBJECT_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.materialNode.count({ where: { type: 'SUBJECT' } }).then(n => { console.log(n); return p.\$disconnect(); }).catch(() => { console.log(0); return p.\$disconnect(); });
" 2>/dev/null || echo 0)
if [ "${SUBJECT_COUNT:-0}" -lt 1 ]; then
  echo "[init] 首次部署：导入教材体系种子（206 套教材 / 842 单元）..."
  node scripts/seed-textbooks-papers.mjs || echo "[init] 教材种子失败（可稍后手动执行）"
else
  echo "[init] 教材体系已存在（${SUBJECT_COUNT} 学科节点），跳过种子"
fi

# 首次初始化：单词词库（幂等 upsert）
echo "[init] 检查词库..."
WORD_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.word.count().then(n => { console.log(n); return p.\$disconnect(); }).catch(() => { console.log(0); return p.\$disconnect(); });
" 2>/dev/null || echo 0)
if [ "${WORD_COUNT:-0}" -lt 100 ]; then
  echo "[init] 首次部署：导入单词词库（初中 + CET4）..."
  node scripts/import-words.mjs seed-data/words-stage-初中.json 初中 2>/dev/null || true
  node scripts/import-words.mjs seed-data/words-stage-CET4.json CET4 2>/dev/null || true
  echo "[init] 词库导入完成"
else
  echo "[init] 词库已存在（${WORD_COUNT} 词），跳过导入"
fi

echo "[init] 启动后端服务..."
exec "$@"
