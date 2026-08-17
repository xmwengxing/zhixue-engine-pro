#!/usr/bin/env bash
# ==========================================
# 服务器一键更新脚本（在服务器项目目录执行）
# 用法：cd /home/shijingtian/workspace/projects/zhixue-engine-pro && ./update.sh
# 流程：git pull 最新代码 → docker compose 重建 → 自动数据库同步 → 健康检查
# ==========================================
set -e

cd "$(dirname "$0")"

echo "▶ [1/5] 拉取最新代码..."
git pull origin main

echo "▶ [2/5] 构建并启动服务（首次/升级通用；自动 db push + 首次种子，幂等）..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo "▶ [3/5] 等待服务就绪..."
sleep 10

echo "▶ [4/5] 服务状态："
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

echo "▶ [5/5] 健康检查："
if curl -s -m 5 http://localhost/health | grep -q '"status"'; then
  echo "  ✔ 后端健康（http://localhost/health）"
else
  echo "  ⚠ 后端未就绪，稍后重试: curl http://localhost/health"
fi

echo "✔ 更新完成。如需停止服务: ./deploy.sh stop"
