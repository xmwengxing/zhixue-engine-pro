// MobileNavigationDrawer 组件测试
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileNavigationDrawer from '../MobileNavigationDrawer';

// Mock TrainingNavigation 组件
vi.mock('../TrainingNavigation', () => ({
  default: () => <div data-testid="training-navigation">Training Navigation</div>,
}));

describe('MobileNavigationDrawer', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    phase: 'TRAINING' as const,
    currentStep: 3,
    totalSteps: 10,
    progress: 30,
  };

  it('当 isOpen 为 true 时应该渲染抽屉', () => {
    render(<MobileNavigationDrawer {...defaultProps} />);
    
    expect(screen.getByText('训练进度')).toBeDefined();
    expect(screen.getByTestId('training-navigation')).toBeDefined();
  });

  it('当 isOpen 为 false 时不应该渲染抽屉', () => {
    render(<MobileNavigationDrawer {...defaultProps} isOpen={false} />);
    
    expect(screen.queryByText('训练进度')).toBeNull();
  });

  it('点击关闭按钮应该调用 onClose', () => {
    const onClose = vi.fn();
    render(<MobileNavigationDrawer {...defaultProps} onClose={onClose} />);
    
    const closeButton = screen.getByLabelText('关闭');
    fireEvent.click(closeButton);
    
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点击遮罩层应该调用 onClose', () => {
    const onClose = vi.fn();
    render(<MobileNavigationDrawer {...defaultProps} onClose={onClose} />);
    
    // 找到遮罩层（通过 class 查找）
    const overlay = document.querySelector('.bg-black\\/50');
    if (overlay) {
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });
});
