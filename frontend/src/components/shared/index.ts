/**
 * 通用组件统一导出
 * 方便其他模块导入使用
 */

// 布局组件
export { Layout } from './Layout';
export { Sidebar } from './Sidebar';
export { Header } from './Header';
export { Footer } from './Footer';
export { PageContainer } from './PageContainer';

// 表单组件
export { Input } from './Input';
export { Select } from './Select';
export { Button } from './Button';
export { Form, FormGroup, FormActions } from './Form';
export { DatePicker } from './DatePicker';
export { Textarea } from './Textarea';

// 数据展示组件
export { Table } from './Table';
export { Card, StatCard } from './Card';
export { RadarChart, PieChart, LineChart } from './Chart';
export { Badge, StatusBadge } from './Badge';
export { Progress, CircularProgress } from './Progress';

// 反馈组件
export { default as Modal } from './Modal';
export { default as Toast, ToastContainer } from './Toast';
export type { ToastType } from './Toast';
export { default as Loading, Skeleton, LoadingDots, LoadingBar } from './Loading';
export {
  default as Empty,
  EmptySearch,
  EmptyList,
  EmptyError,
  EmptyNetwork,
  EmptyPermission,
} from './Empty';

// 其他组件
export { LazyImage, LazyBackground } from './LazyImage';
export { VirtualList, DynamicVirtualList } from './VirtualList';
export { OfflineIndicator } from './OfflineIndicator';
