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

/**
 * 学习基础值到标签的映射
 */
export const LEARNING_FOUNDATION_VALUE_TO_LABEL = new Map(
  LEARNING_FOUNDATION_OPTIONS.map(lf => [lf.value, lf.label])
);

/**
 * 学习基础标签到值的映射
 */
export const LEARNING_FOUNDATION_LABEL_TO_VALUE = new Map(
  LEARNING_FOUNDATION_OPTIONS.map(lf => [lf.label, lf.value])
);

/**
 * 验证学习基础值是否有效
 */
export function isValidLearningFoundation(foundation: string): boolean {
  return LEARNING_FOUNDATION_VALUE_TO_LABEL.has(foundation);
}

/**
 * 获取学习基础标签
 */
export function getLearningFoundationLabel(value: string): string | undefined {
  return LEARNING_FOUNDATION_VALUE_TO_LABEL.get(value);
}

/**
 * 获取学习基础值
 */
export function getLearningFoundationValue(label: string): string | undefined {
  return LEARNING_FOUNDATION_LABEL_TO_VALUE.get(label);
}

/**
 * 学习基础等级枚举（用于类型检查）
 */
export enum LearningFoundationLevel {
  WEAK = 'WEAK',
  AVERAGE = 'AVERAGE',
  GOOD = 'GOOD',
  EXCELLENT = 'EXCELLENT',
}
