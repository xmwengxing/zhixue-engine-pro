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
    port: 5173,
    host: true,
    
    // 代理配置（如果需要）
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
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
