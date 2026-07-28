import React from 'react';

/**
 * Table 组件 - 数据表格
 * 参照设计稿实现深色主题的表格样式
 */
export interface TableColumn<T = Record<string, unknown>> {
  key: string;
  title: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, record: T, index: number) => React.ReactNode;
}

export interface TableProps<T = Record<string, unknown>> {
  columns: TableColumn<T>[];
  data: T[];
  rowKey?: string | ((record: T) => string);
  loading?: boolean;
  emptyText?: string;
  onRowClick?: (record: T, index: number) => void;
  selectable?: boolean;
  selectedRows?: string[];
  onSelectionChange?: (selectedKeys: string[]) => void;
  className?: string;
}

export function Table<T = any>({
  columns,
  data,
  rowKey = 'id',
  loading = false,
  emptyText = '暂无数据',
  onRowClick,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  className = '',
}: TableProps<T>) {
  const getRowKey = (record: T, index: number): string => {
    if (typeof rowKey === 'function') {
      return rowKey(record);
    }
    return (record as any)[rowKey] || String(index);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allKeys = data.map((record, index) => getRowKey(record, index));
      onSelectionChange?.(allKeys);
    } else {
      onSelectionChange?.([]);
    }
  };

  const handleSelectRow = (key: string, checked: boolean) => {
    if (checked) {
      onSelectionChange?.([...selectedRows, key]);
    } else {
      onSelectionChange?.(selectedRows.filter((k) => k !== key));
    }
  };

  const isAllSelected =
    data.length > 0 && selectedRows.length === data.length;

  return (
    <div
      className={`w-full overflow-hidden rounded-xl border border-secondary-700 bg-secondary-800 shadow-sm ${className}`}
    >
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm text-white whitespace-nowrap">
          <thead className="bg-secondary-800 text-secondary-400">
            <tr>
              {selectable && (
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs w-[50px]">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 rounded border-secondary-600 bg-secondary-900 text-primary-500 focus:ring-primary-500 focus:ring-offset-secondary-900"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-6 py-4 font-semibold uppercase tracking-wider text-xs ${
                    column.width ? `w-[${column.width}]` : ''
                  } ${
                    column.align === 'right'
                      ? 'text-right'
                      : column.align === 'center'
                        ? 'text-center'
                        : ''
                  }`}
                >
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary-700">
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-6 py-12 text-center text-secondary-400"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined animate-spin">
                      progress_activity
                    </span>
                    加载中...
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-6 py-12 text-center text-secondary-400"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((record, index) => {
                const key = getRowKey(record, index);
                const isSelected = selectedRows.includes(key);
                return (
                  <tr
                    key={key}
                    className={`group hover:bg-secondary-700/50 transition-colors ${
                      onRowClick ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => onRowClick?.(record, index)}
                  >
                    {selectable && (
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleSelectRow(key, e.target.checked);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-secondary-600 bg-secondary-900 text-primary-500 focus:ring-primary-500 focus:ring-offset-secondary-900"
                        />
                      </td>
                    )}
                    {columns.map((column) => {
                      const value = (record as any)[column.key];
                      return (
                        <td
                          key={column.key}
                          className={`px-6 py-4 ${
                            column.align === 'right'
                              ? 'text-right'
                              : column.align === 'center'
                                ? 'text-center'
                                : ''
                          }`}
                        >
                          {column.render
                            ? column.render(value, record, index)
                            : value}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
