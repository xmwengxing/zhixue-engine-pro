import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initOfflineCache } from './utils/offlineCache'
import { initPerformanceMonitoring } from './utils/performance'

// 初始化离线缓存
initOfflineCache().catch((error) => {
  console.error('离线缓存初始化失败:', error);
});

// 初始化性能监控（仅在生产环境）
if (import.meta.env.PROD) {
  initPerformanceMonitoring();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
