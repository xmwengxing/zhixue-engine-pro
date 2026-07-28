/**
 * 虚拟滚动列表组件
 * 用于优化长列表性能，只渲染可见区域的项目
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number; // 额外渲染的项目数量
  className?: string;
}

/**
 * 虚拟滚动列表组件
 * @param items 数据列表
 * @param itemHeight 每个项目的高度（固定）
 * @param containerHeight 容器高度
 * @param renderItem 渲染函数
 * @param overscan 额外渲染的项目数量（默认 3）
 */
export function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 3,
  className = '',
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算可见范围
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);

  // 可见项目
  const visibleItems = items.slice(startIndex, endIndex);

  // 总高度
  const totalHeight = items.length * itemHeight;

  // 偏移量
  const offsetY = startIndex * itemHeight;

  // 滚动处理
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => (
            <div
              key={startIndex + index}
              style={{ height: itemHeight }}
            >
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 动态高度虚拟滚动列表组件
 * 适用于项目高度不固定的场景
 */
interface DynamicVirtualListProps<T> {
  items: T[];
  estimatedItemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
}

export function DynamicVirtualList<T>({
  items,
  estimatedItemHeight,
  containerHeight,
  renderItem,
  overscan = 3,
  className = '',
}: DynamicVirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [itemHeights, setItemHeights] = useState<Map<number, number>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // 测量项目高度
  useEffect(() => {
    // 使用 requestAnimationFrame 延迟状态更新
    const measureHeights = () => {
      const newHeights = new Map<number, number>();
      itemRefs.current.forEach((element, index) => {
        if (element) {
          newHeights.set(index, element.offsetHeight);
        }
      });
      setItemHeights(newHeights);
    };
    
    const rafId = requestAnimationFrame(measureHeights);
    return () => cancelAnimationFrame(rafId);
  }, [items]);

  // 计算项目位置
  const getItemOffset = (index: number): number => {
    let offset = 0;
    for (let i = 0; i < index; i++) {
      offset += itemHeights.get(i) || estimatedItemHeight;
    }
    return offset;
  };

  // 计算总高度
  const totalHeight = items.reduce((sum, _, index) => {
    return sum + (itemHeights.get(index) || estimatedItemHeight);
  }, 0);

  // 查找可见范围
  const findVisibleRange = (): [number, number] => {
    let startIndex = 0;
    let currentOffset = 0;

    // 查找起始索引
    for (let i = 0; i < items.length; i++) {
      const height = itemHeights.get(i) || estimatedItemHeight;
      if (currentOffset + height > scrollTop) {
        startIndex = Math.max(0, i - overscan);
        break;
      }
      currentOffset += height;
    }

    // 查找结束索引
    let endIndex = startIndex;
    currentOffset = getItemOffset(startIndex);
    while (endIndex < items.length && currentOffset < scrollTop + containerHeight) {
      currentOffset += itemHeights.get(endIndex) || estimatedItemHeight;
      endIndex++;
    }
    endIndex = Math.min(items.length, endIndex + overscan);

    return [startIndex, endIndex];
  };

  const [startIndex, endIndex] = findVisibleRange();
  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = getItemOffset(startIndex);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => {
            const actualIndex = startIndex + index;
            return (
              <div
                key={actualIndex}
                ref={(el) => {
                  if (el) {
                    itemRefs.current.set(actualIndex, el);
                  }
                }}
              >
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
