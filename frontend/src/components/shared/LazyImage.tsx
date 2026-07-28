/**
 * 懒加载图片组件
 * 使用 Intersection Observer API 实现图片懒加载
 */

import { useState, useEffect, useRef } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * 懒加载图片组件
 * 当图片进入视口时才开始加载
 */
export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  className = '',
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect fill="%23f0f0f0" width="400" height="300"/%3E%3C/svg%3E',
  onLoad,
  onError,
}) => {
  const [imageSrc, setImageSrc] = useState<string>(placeholder);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const currentImg = imgRef.current;
    
    // 检查浏览器是否支持 Intersection Observer
    if (!('IntersectionObserver' in window)) {
      // 不支持则直接加载图片
      // 使用 setTimeout 避免在 effect 中同步调用 setState
      const timer = setTimeout(() => setImageSrc(src), 0);
      return () => clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // 图片进入视口，开始加载
            setImageSrc(src);
            // 停止观察
            if (currentImg) {
              observer.unobserve(currentImg);
            }
          }
        });
      },
      {
        rootMargin: '50px', // 提前 50px 开始加载
        threshold: 0.01,
      }
    );

    if (currentImg) {
      observer.observe(currentImg);
    }

    return () => {
      if (currentImg) {
        observer.unobserve(currentImg);
      }
    };
  }, [src]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    // 图片加载失败，可以设置默认图片
    onError?.();
  };

  return (
    <img
      ref={imgRef}
      src={imageSrc}
      alt={alt}
      className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      onLoad={handleLoad}
      onError={handleError}
      loading="lazy" // 原生懒加载作为后备
    />
  );
};

/**
 * 背景图片懒加载组件
 */
interface LazyBackgroundProps {
  src: string;
  className?: string;
  children?: React.ReactNode;
}

export const LazyBackground: React.FC<LazyBackgroundProps> = ({
  src,
  className = '',
  children,
}) => {
  const [backgroundImage, setBackgroundImage] = useState<string>('none');
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentDiv = divRef.current;
    
    if (!('IntersectionObserver' in window)) {
      // 使用 setTimeout 避免在 effect 中同步调用 setState
      const timer = setTimeout(() => setBackgroundImage(`url(${src})`), 0);
      return () => clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setBackgroundImage(`url(${src})`);
            if (currentDiv) {
              observer.unobserve(currentDiv);
            }
          }
        });
      },
      {
        rootMargin: '50px',
        threshold: 0.01,
      }
    );

    if (currentDiv) {
      observer.observe(currentDiv);
    }

    return () => {
      if (currentDiv) {
        observer.unobserve(currentDiv);
      }
    };
  }, [src]);

  return (
    <div
      ref={divRef}
      className={className}
      style={{ backgroundImage }}
    >
      {children}
    </div>
  );
};
