// FloatingAIButton 组件测试
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FloatingAIButton from '../FloatingAIButton';

// Mock AIAssistant 组件
vi.mock('../AIAssistant', () => ({
  default: () => <div data-testid="ai-assistant">AI Assistant</div>,
}));

describe('FloatingAIButton', () => {
  const defaultProps = {
    sessionId: 'test-session-id',
    questionId: 'test-question-id',
    currentAnswer: 'test answer',
    isCorrect: true,
  };

  it('应该渲染浮动按钮', () => {
    render(<FloatingAIButton {...defaultProps} />);
    
    const button = screen.getByLabelText('打开 AI 助手');
    expect(button).toBeDefined();
  });

  it('点击浮动按钮应该打开抽屉', () => {
    render(<FloatingAIButton {...defaultProps} />);
    
    const button = screen.getByLabelText('打开 AI 助手');
    fireEvent.click(button);
    
    // 验证抽屉标题显示
    expect(screen.getByText('AI 助教')).toBeDefined();
  });

  it('点击关闭按钮应该关闭抽屉', () => {
    render(<FloatingAIButton {...defaultProps} />);
    
    // 打开抽屉
    const openButton = screen.getByLabelText('打开 AI 助手');
    fireEvent.click(openButton);
    
    // 关闭抽屉
    const closeButton = screen.getByLabelText('关闭');
    fireEvent.click(closeButton);
    
    // 验证抽屉标题不再显示
    expect(screen.queryByText('AI 助教')).toBeNull();
  });

  it('点击遮罩层应该关闭抽屉', () => {
    render(<FloatingAIButton {...defaultProps} />);
    
    // 打开抽屉
    const openButton = screen.getByLabelText('打开 AI 助手');
    fireEvent.click(openButton);
    
    // 找到遮罩层（通过 class 查找）
    const overlay = document.querySelector('.bg-black\\/50');
    if (overlay) {
      fireEvent.click(overlay);
      
      // 验证抽屉关闭
      expect(screen.queryByText('AI 助教')).toBeNull();
    }
  });
});
