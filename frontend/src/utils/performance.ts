/**
 * 性能监控工具
 * 用于监控和优化前端性能
 */

/**
 * 性能指标接口
 */
export interface PerformanceMetrics {
  // 首次内容绘制
  FCP?: number;
  // 最大内容绘制
  LCP?: number;
  // 首次输入延迟
  FID?: number;
  // 累积布局偏移
  CLS?: number;
  // 首次字节时间
  TTFB?: number;
}

/**
 * 性能监控类
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics = {};

  private constructor() {
    this.initializeObservers();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * 初始化性能观察器
   */
  private initializeObservers() {
    // 检查浏览器支持
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
      return;
    }

    // 观察 FCP 和 LCP
    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.FCP = entry.startTime;
          }
        }
      });
      paintObserver.observe({ entryTypes: ['paint'] });

      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; loadTime?: number };
        this.metrics.LCP = lastEntry.renderTime || lastEntry.loadTime || 0;
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (error) {
      console.warn('性能观察器初始化失败:', error);
    }

    // 观察 FID
    try {
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const fidEntry = entry as PerformanceEntry & { processingStart?: number };
          this.metrics.FID = (fidEntry.processingStart || 0) - entry.startTime;
        }
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
    } catch (error) {
      console.warn('FID 观察器初始化失败:', error);
    }

    // 观察 CLS
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const clsEntry = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!clsEntry.hadRecentInput) {
            clsValue += clsEntry.value || 0;
            this.metrics.CLS = clsValue;
          }
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (error) {
      console.warn('CLS 观察器初始化失败:', error);
    }

    // 获取 TTFB
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      this.metrics.TTFB = timing.responseStart - timing.requestStart;
    }
  }

  /**
   * 获取性能指标
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * 上报性能指标
   */
  reportMetrics(endpoint?: string) {
    const metrics = this.getMetrics();
    
    // 打印到控制台
    console.log('性能指标:', metrics);

    // 如果提供了端点，发送到服务器
    if (endpoint) {
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metrics,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: Date.now(),
        }),
      }).catch((error) => {
        console.error('性能指标上报失败:', error);
      });
    }
  }
}

/**
 * 测量函数执行时间
 */
export function measureTime(name: string, fn: () => void) {
  const start = performance.now();
  fn();
  const end = performance.now();
  console.log(`${name} 执行时间: ${(end - start).toFixed(2)}ms`);
}

/**
 * 测量异步函数执行时间
 */
export async function measureAsyncTime(name: string, fn: () => Promise<void>) {
  const start = performance.now();
  await fn();
  const end = performance.now();
  console.log(`${name} 执行时间: ${(end - start).toFixed(2)}ms`);
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function (...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;

      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * 请求空闲回调
 */
export function requestIdleCallback(callback: () => void, timeout = 1000) {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout });
  } else {
    // 降级方案
    return setTimeout(callback, 1);
  }
}

/**
 * 预加载资源
 */
export function preloadResource(url: string, type: 'script' | 'style' | 'image' | 'font') {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = url;
  
  switch (type) {
    case 'script':
      link.as = 'script';
      break;
    case 'style':
      link.as = 'style';
      break;
    case 'image':
      link.as = 'image';
      break;
    case 'font':
      link.as = 'font';
      link.crossOrigin = 'anonymous';
      break;
  }
  
  document.head.appendChild(link);
}

/**
 * 预连接到域名
 */
export function preconnect(url: string) {
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = url;
  document.head.appendChild(link);
}

/**
 * 初始化性能监控
 */
export function initPerformanceMonitoring(reportEndpoint?: string) {
  const monitor = PerformanceMonitor.getInstance();

  // 页面加载完成后上报
  window.addEventListener('load', () => {
    setTimeout(() => {
      monitor.reportMetrics(reportEndpoint);
    }, 3000); // 延迟 3 秒确保所有指标都已收集
  });

  return monitor;
}
