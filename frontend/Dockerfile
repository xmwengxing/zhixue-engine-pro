# ==========================================
# 多阶段构建 - 前端 Dockerfile
# ==========================================

# ==========================================
# 阶段 1: 构建阶段
# 说明：vite 7 要求 Node >= 20.19，故用 node:20-alpine（18 会构建失败）
# ==========================================
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖（用 npm install：package-lock.json 与 package.json 存在不同步
# 场景（如手工登记新依赖），npm ci --legacy-peer-deps 严格校验会直接失败）
RUN npm install --no-audit --no-fund

# 复制源代码
COPY . .

# 构建生产版本
# 注意：构建时会使用 .env.production 文件中的环境变量
RUN npm run build

# ==========================================
# 阶段 2: 生产阶段（使用 Nginx）
# ==========================================
FROM nginx:alpine AS production

# 复制自定义 Nginx 配置
COPY nginx.conf /etc/nginx/nginx.conf

# 从构建阶段复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 创建非 root 用户（Nginx 默认使用 nginx 用户）
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
