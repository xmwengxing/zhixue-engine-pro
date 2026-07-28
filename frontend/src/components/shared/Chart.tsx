import React from 'react';
import {
  RadarChart as RechartsRadar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  LineChart as RechartsLine,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

/**
 * RadarChart 组件 - 雷达图
 * 用于显示多维度数据对比
 */
export interface RadarChartProps {
  data: Array<{ subject: string; value: number; fullMark?: number }>;
  dataKey?: string;
  nameKey?: string;
  color?: string;
  height?: number;
  className?: string;
}

export const RadarChart: React.FC<RadarChartProps> = ({
  data,
  dataKey = 'value',
  nameKey = 'subject',
  color = '#3b82f6',
  height = 300,
  className = '',
}) => {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsRadar data={data}>
          <PolarGrid stroke="#475569" />
          <PolarAngleAxis
            dataKey={nameKey}
            tick={{ fill: '#94a3b8', fontSize: 12 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: '#64748b', fontSize: 10 }}
          />
          <Radar
            name="能力值"
            dataKey={dataKey}
            stroke={color}
            fill={color}
            fillOpacity={0.3}
          />
        </RechartsRadar>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * PieChart 组件 - 饼图/环形图
 * 用于显示占比数据
 */
export interface PieChartData {
  name: string;
  value: number;
  color?: string;
  [key: string]: string | number | undefined; // 添加索引签名以兼容 recharts
}

export interface PieChartProps {
  data: PieChartData[];
  innerRadius?: number; // 0 为饼图，>0 为环形图
  outerRadius?: number;
  height?: number;
  showLabel?: boolean;
  className?: string;
}

const DEFAULT_COLORS = [
  '#3b82f6', // primary
  '#22c55e', // success
  '#f59e0b', // warning
  '#ef4444', // error
  '#8b5cf6', // purple
  '#06b6d4', // cyan
];

export const PieChart: React.FC<PieChartProps> = ({
  data,
  innerRadius = 60,
  outerRadius = 100,
  height = 300,
  showLabel = true,
  className = '',
}) => {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsPie>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            label={
              showLabel
                ? (entry) => `${entry.name}: ${entry.value}`
                : undefined
            }
            labelLine={showLabel}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '0.5rem',
              color: '#fff',
            }}
          />
        </RechartsPie>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * LineChart 组件 - 折线图
 * 用于显示趋势数据
 */
export interface LineChartData {
  name: string;
  [key: string]: string | number;
}

export interface LineChartLine {
  dataKey: string;
  name: string;
  color?: string;
}

export interface LineChartProps {
  data: LineChartData[];
  lines: LineChartLine[];
  xAxisKey?: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  className?: string;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  lines,
  xAxisKey = 'name',
  height = 300,
  showGrid = true,
  showLegend = true,
  className = '',
}) => {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLine data={data}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#475569" />}
          <XAxis
            dataKey={xAxisKey}
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            stroke="#475569"
          />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} stroke="#475569" />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '0.5rem',
              color: '#fff',
            }}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{ color: '#94a3b8' }}
              iconType="line"
            />
          )}
          {lines.map((line, index) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              strokeWidth={2}
              dot={{ fill: line.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length] }}
            />
          ))}
        </RechartsLine>
      </ResponsiveContainer>
    </div>
  );
};
