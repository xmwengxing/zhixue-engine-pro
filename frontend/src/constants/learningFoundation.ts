/**
 * 学习基础选单常量定义
 * 定义四个等级: 薄弱、一般、良好、优秀
 */

export interface LearningFoundationOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * 标准化学习基础选单
 */
export const LEARNING_FOUNDATION_OPTIONS: LearningFoundationOption[] = [
  { 
    value: 'WEAK', 
    label: '薄弱',
    description: '基础知识掌握不牢固，需要加强基础训练'
  },
  { 
    value: 'AVERAGE', 
    label: '一般',
    description: '基础知识基本掌握，需要巩固提高'
  },
  { 
    value: 'GOOD', 
    label: '良好',
    description: '基础知识掌握较好，可以进行拓展学习'
  },
  { 
    value: 'EXCELLENT', 
    label: '优秀',
    description: '基础知识掌握扎实，可以挑战高难度内容'
  },
];
