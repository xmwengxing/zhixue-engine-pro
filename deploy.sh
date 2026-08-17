#!/usr/bin/env bash
# ==========================================
# 生产部署一键脚本（启 / 停 / 重启 / 状态 / 日志）
# 用法:
#   ./deploy.sh start     # 首次部署/升级：构建并启动（自动 db push + 首次种子）
#   ./deploy.sh stop      # 停止全部服务并释放端口（保留数据卷，可随时 start 恢复）
#   ./deploy.sh restart   # 重启（stop + start）
#   ./deploy.sh status    # 查看各服务健康状态
#   ./deploy.sh logs      # 实时查看后端/前端/数据库日志
#   ./deploy.sh down      # 同 stop（别名）
# ==========================================
set -e

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

case "${1:-help}" in
  start)
    echo "▶ 构建并启动（首次会自动完成数据库初始化与种子导入）..."
    $COMPOSE up -d --build
    echo "✔ 启动完成。验证: curl http://localhost/health"
    ;;
  stop|down)
    echo "⏹ 停止全部服务并释放端口（数据卷保留）..."
    $COMPOSE down
    echo "✔ 已停止，端口已释放。重新启动: ./deploy.sh start"
    ;;
  restart)
    echo "⏹ 停止..."
    $COMPOSE down
    echo "▶ 重新启动..."
    $COMPOSE up -d --build
    echo "✔ 已重启。"
    ;;
  status)
    $COMPOSE ps
    ;;
  logs)
    $COMPOSE logs -f --tail=100
    ;;
  *)
    echo "用法: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
