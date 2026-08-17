# ==========================================
# 多阶段构建 - 后端 Dockerfile
# ==========================================

# ==========================================
# 阶段 1: 构建阶段
# ==========================================
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖（包括开发依赖，用于构建）
RUN npm config set registry https://registry.npmmirror.com
RUN npm ci --legacy-peer-deps

# 复制源代码
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 构建 TypeScript 代码
RUN npm run build

# ==========================================
# 阶段 2: 生产阶段
# ==========================================
FROM node:18-alpine AS production

# 安装 dumb-init（用于正确处理信号）
RUN apk add --no-cache dumb-init

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 设置工作目录
WORKDIR /app

# 从构建阶段复制必要文件
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
# 种子数据 + 初始化入口（教材体系 / 单词词库 / db push 同步）
COPY --from=builder --chown=nodejs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nodejs:nodejs /app/seed-data ./seed-data
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 创建日志和上传目录
RUN mkdir -p logs uploads && \
    chown -R nodejs:nodejs logs uploads

# 切换到非 root 用户
USER nodejs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 使用 dumb-init 启动应用；先执行初始化入口（db push + 首次种子），再启动服务
ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]

# 启动命令
CMD ["node", "dist/index.js"]
