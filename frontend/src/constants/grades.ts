/**
 * 年级选单常量定义
 * 包含小学、初中、高中所有年级
 */

export interface GradeOption {
  value: string;
  label: string;
  category: 'PRIMARY' | 'MIDDLE' | 'HIGH';
}

/**
 * 标准化年级选单
 * 格式: 学段_年级_学期
 */
export const GRADE_OPTIONS: GradeOption[] = [
  // 小学
  { value: 'PRIMARY_1_1', label: '一年级上', category: 'PRIMARY' },
  { value: 'PRIMARY_1_2', label: '一年级下', category: 'PRIMARY' },
  { value: 'PRIMARY_2_1', label: '二年级上', category: 'PRIMARY' },
  { value: 'PRIMARY_2_2', label: '二年级下', category: 'PRIMARY' },
  { value: 'PRIMARY_3_1', label: '三年级上', category: 'PRIMARY' },
  { value: 'PRIMARY_3_2', label: '三年级下', category: 'PRIMARY' },
  { value: 'PRIMARY_4_1', label: '四年级上', category: 'PRIMARY' },
  { value: 'PRIMARY_4_2', label: '四年级下', category: 'PRIMARY' },
  { value: 'PRIMARY_5_1', label: '五年级上', category: 'PRIMARY' },
  { value: 'PRIMARY_5_2', label: '五年级下', category: 'PRIMARY' },
  { value: 'PRIMARY_6_1', label: '六年级上', category: 'PRIMARY' },
  { value: 'PRIMARY_6_2', label: '六年级下', category: 'PRIMARY' },
  
  // 初中
  { value: 'MIDDLE_1_1', label: '初一上', category: 'MIDDLE' },
  { value: 'MIDDLE_1_2', label: '初一下', category: 'MIDDLE' },
  { value: 'MIDDLE_2_1', label: '初二上', category: 'MIDDLE' },
  { value: 'MIDDLE_2_2', label: '初二下', category: 'MIDDLE' },
  { value: 'MIDDLE_3_1', label: '初三上', category: 'MIDDLE' },
  { value: 'MIDDLE_3_2', label: '初三下', category: 'MIDDLE' },
  
  // 高中
  { value: 'HIGH_1_1', label: '高一上', category: 'HIGH' },
  { value: 'HIGH_1_2', label: '高一下', category: 'HIGH' },
  { value: 'HIGH_2_1', label: '高二上', category: 'HIGH' },
  { value: 'HIGH_2_2', label: '高二下', category: 'HIGH' },
  { value: 'HIGH_3_1', label: '高三上', category: 'HIGH' },
  { value: 'HIGH_3_2', label: '高三下', category: 'HIGH' },
];

/**
 * 按学段分组的年级选单
 */
export const GRADE_OPTIONS_BY_CATEGORY = {
  PRIMARY: GRADE_OPTIONS.filter(g => g.category === 'PRIMARY'),
  MIDDLE: GRADE_OPTIONS.filter(g => g.category === 'MIDDLE'),
  HIGH: GRADE_OPTIONS.filter(g => g.category === 'HIGH'),
};

/**
 * 学段标签
 */
export const CATEGORY_LABELS = {
  PRIMARY: '小学',
  MIDDLE: '初中',
  HIGH: '高中',
};
