import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // 构建优化配置
  build: {
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    
    // 生成 sourcemap（生产环境可关闭）
    sourcemap: false,
    
    // 分块策略
    rollupOptions: {
      output: {
        // 手动分块
        manualChunks: {
          // React 核心库
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],

          // 状态管理
          'state-vendor': ['zustand'],

          // HTTP 客户端
          'http-vendor': ['axios'],

          // 图表库（独立分包，避免首屏体积过大）
          'charts-vendor': ['recharts'],

          // UI 组件库（如果使用）
          // 'ui-vendor': ['antd', '@ant-design/icons'],
        },
        
        // 分块文件命名
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
    
    // 压缩配置
    minify: 'esbuild', // 使用 esbuild 代替 terser（更快）
    
    // 分块大小警告限制（KB）
    chunkSizeWarningLimit: 1000,
  },
  
  // 开发服务器配置
  server: {
    // 端口说明：Windows 上 5173 常被 Hyper-V/WSL 动态保留（listen EACCES），
    // 故固定到非保留段；如本机 5173 可用可改回，或用管理员执行
    // netsh int ipv4 add excludedportrange protocol=tcp startport=5173 numberofports=100 释放
    port: 5373,
    host: true,
    
    // 代理配置（如果需要）
    // 后端地址可配置：VITE_DEV_PROXY=http://localhost:3200 npm run dev
    // （本机 3000 若被系统保留、后端跑在 3200 时使用；默认 3000）
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  
  // 预构建优化
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'zustand',
      'axios',
    ],
  },
})
