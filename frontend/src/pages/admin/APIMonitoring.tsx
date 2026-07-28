import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import request from '../../utils/request';
import type { ApiResponse } from '../../utils/request';

// API 指标数据类型
interface APIMetrics {
  totalCalls: number;
  totalTokens: number;
  avgLatency: number;
  errorRate: number;
  callsChange: number;
  tokensChange: number;
  p95Latency: number;
  lastHourErrors: number;
  yesterdayCalls: number;
  yesterdayTokens: number;
  estimatedCost: number;
}

// 服务商健康状态类型
interface ProviderHealth {
  id: string;
  name: string;
  shortName: string;
  latency: number | null;
  status: 'healthy' | 'degraded' | 'down';
  totalCalls: number;
  totalTokens: number;
  requestTokens: number;
  responseTokens: number;
  estimatedCost: number;
  errorRate: number;
}

// 服务商分布类型
interface ProviderDistribution {
  provider: string;
  tokens: number;
  percentage: number;
  color: string;
}

// 时间序列点
interface TimePoint {
  time: string;
  successCalls: number;
  errorCalls: number;
  totalTokens: number;
  avgResponseTime: number;
}

interface ProviderStat {
  providerId: string;
  providerName: string;
  providerType: string;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  errorRate: number;
  totalTokens: number;
  requestTokens: number;
  responseTokens: number;
  estimatedCost: number;
  avgResponseTime: number;
}

// 根据服务商类型获取颜色
const getProviderColor = (type: string): string => {
  const colors: Record<string, string> = {
    OPENAI: '#4913ec',
    CLAUDE: '#22d3ee',
    DEEPSEEK: '#818cf8',
    QWEN: '#f59e0b',
    GEMINI: '#10b981',
    ZHIPU: '#ec4899',
    DOUBAO: '#8b5cf6',
    WENXIN: '#3b82f6',
  };
  return colors[type] || '#94a3b8';
};

const APIMonitoring: React.FC = () => {
  const [metrics, setMetrics] = useState<APIMetrics | null>(null);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [distribution, setDistribution] = useState<ProviderDistribution[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimePoint[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载 API 指标数据
  const loadMetrics = useCallback(async () => {
    try {
      const response = await request.get<ApiResponse<any>>('/admin/api-metrics');
      const data = response.data;

      // 处理指标数据（全部使用后端真实数据）
      if (data.summary) {
        const s = data.summary;
        const yesterdayCalls: number = s.yesterdayCalls ?? 0;
        const yesterdayTokens: number = s.yesterdayTokens ?? 0;
        const todayCalls: number = s.todayCalls ?? 0;
        const todayTokens: number = s.todayTokens ?? 0;

        setMetrics({
          totalCalls: s.totalCalls,
          totalTokens: s.totalTokens,
          avgLatency: s.avgResponseTime,
          errorRate: s.errorRate,
          callsChange:
            yesterdayCalls > 0 ? ((todayCalls - yesterdayCalls) / yesterdayCalls) * 100 : 0,
          tokensChange:
            yesterdayTokens > 0 ? ((todayTokens - yesterdayTokens) / yesterdayTokens) * 100 : 0,
          p95Latency: s.p95ResponseTime ?? 0,
          lastHourErrors: s.lastHourErrors ?? 0,
          yesterdayCalls,
          yesterdayTokens,
          estimatedCost: s.estimatedCost ?? 0,
        });
      }

      // 处理服务商健康状态与统计
      if (data.providerStats) {
        const stats: ProviderStat[] = data.providerStats;

        const healthProviders: ProviderHealth[] = stats.map((stat) => {
          let status: 'healthy' | 'degraded' | 'down' = 'healthy';
          if (stat.errorRate > 10) {
            status = 'down';
          } else if (stat.avgResponseTime > 800) {
            status = 'degraded';
          }

          return {
            id: stat.providerId,
            name: stat.providerName,
            shortName: stat.providerName.substring(0, 2).toUpperCase(),
            latency: Math.floor(stat.avgResponseTime),
            status,
            totalCalls: stat.totalCalls,
            totalTokens: stat.totalTokens,
            requestTokens: stat.requestTokens ?? 0,
            responseTokens: stat.responseTokens ?? 0,
            estimatedCost: stat.estimatedCost ?? 0,
            errorRate: stat.errorRate,
          };
        });
        setProviders(healthProviders);

        // Token 消耗分布（按 Token 数而非调用次数）
        const totalTokens = stats.reduce((sum, stat) => sum + stat.totalTokens, 0);
        const dist: ProviderDistribution[] = stats
          .map((stat) => ({
            provider: stat.providerName,
            tokens: stat.totalTokens,
            percentage: totalTokens > 0 ? Math.round((stat.totalTokens / totalTokens) * 100) : 0,
            color: getProviderColor(stat.providerType),
          }))
          .sort((a, b) => b.percentage - a.percentage);
        setDistribution(dist);
      }

      // 处理时间序列
      if (data.timeSeriesData) {
        interface RawPoint {
          timestamp: string;
          totalCalls: number;
          successCalls: number;
          errorCalls: number;
          totalTokens: number;
          avgResponseTime: number;
        }
        const points: TimePoint[] = (data.timeSeriesData as RawPoint[]).map((p) => ({
          time: new Date(p.timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
          }),
          successCalls: p.successCalls,
          errorCalls: p.errorCalls,
          totalTokens: p.totalTokens,
          avgResponseTime: Math.round(p.avgResponseTime),
        }));
        setTimeSeries(points);
      }
    } catch (error) {
      console.error('加载 API 指标失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
    // 每 30 秒刷新一次数据
    const interval = setInterval(loadMetrics, 30000);
    return () => clearInterval(interval);
  }, [loadMetrics]);

  // 一键测试连通性
  const handleConnectivityTest = async () => {
    try {
      await request.post('/admin/ai-providers/test-all');
      alert('连通性测试已启动，请稍后查看结果');
      loadMetrics();
    } catch (error) {
      console.error('连通性测试失败:', error);
      alert('连通性测试失败');
    }
  };

  // 导出数据
  const handleExportData = async () => {
    try {
      const response = await request.get('/admin/api-metrics/export', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `api-metrics-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('导出数据失败:', error);
      alert('导出数据失败');
    }
  };

  // 格式化数字
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  // 格式化变化百分比
  const formatChange = (change: number): string => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  };

  // 获取状态文本和样式
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'healthy':
        return { text: '正常', color: 'text-emerald-500', dotClass: 'bg-emerald-500 animate-pulse' };
      case 'degraded':
        return { text: '高延迟', color: 'text-orange-500', dotClass: 'bg-orange-500' };
      case 'down':
        return { text: '连接失败', color: 'text-red-500', dotClass: 'bg-red-500' };
      default:
        return { text: '未知', color: 'text-gray-500', dotClass: 'bg-gray-500' };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#111722]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-[#92a4c9]">加载中...</p>
        </div>
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: '#1a2332',
    border: '1px solid #324467',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '12px',
  };

  return (
    <div className="flex flex-1 flex-col h-full min-h-screen bg-[#111722]">
      <div className="px-4 md:px-8 lg:px-12 flex flex-1 justify-center py-8">
        <div className="flex flex-col max-w-[1200px] flex-1 gap-8">
          {/* 页面标题 */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-white tracking-tight text-[32px] font-bold leading-tight mb-2">
                全局API监控与配置
              </h1>
              <p className="text-[#92a4c9] text-sm">
                实时监控 AI 接口健康度、Token 消耗分布及成本估算
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleExportData}
                className="flex items-center gap-2 bg-[#232f48] hover:bg-[#324467] border border-[#324467] text-white px-4 py-2 rounded-lg font-bold text-sm transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">download</span>
                数据导出
              </button>
              <button
                onClick={handleConnectivityTest}
                className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:shadow-lg hover:shadow-blue-600/30 transition-all"
              >
                <span className="material-symbols-outlined text-lg">bolt</span>
                连通性一键测试
              </button>
            </div>
          </div>

          {/* 统计概览 */}
          {metrics && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-[#1a2332] rounded-xl p-5 border border-[#324467] shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#92a4c9]">
                    调用总量
                  </p>
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      metrics.callsChange >= 0
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : 'text-red-400 bg-red-500/10'
                    }`}
                  >
                    {formatChange(metrics.callsChange)}
                  </span>
                </div>
                <p className="text-2xl font-black text-white">{formatNumber(metrics.totalCalls)}</p>
                <p className="text-xs text-[#92a4c9] mt-1">
                  vs 昨日同期: {formatNumber(metrics.yesterdayCalls)}
                </p>
              </div>

              <div className="bg-[#1a2332] rounded-xl p-5 border border-[#324467] shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#92a4c9]">
                    总 Token 消耗
                  </p>
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      metrics.tokensChange >= 0
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : 'text-red-400 bg-red-500/10'
                    }`}
                  >
                    {formatChange(metrics.tokensChange)}
                  </span>
                </div>
                <p className="text-2xl font-black text-white">{formatNumber(metrics.totalTokens)}</p>
                <p className="text-xs text-[#92a4c9] mt-1">
                  昨日同期: {formatNumber(metrics.yesterdayTokens)} Tokens
                </p>
              </div>

              <div className="bg-[#1a2332] rounded-xl p-5 border border-[#324467] shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#92a4c9]">
                    估算成本
                  </p>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded text-blue-400 bg-blue-500/10">
                    估算
                  </span>
                </div>
                <p className="text-2xl font-black text-white">
                  ¥{metrics.estimatedCost.toFixed(2)}
                </p>
                <p className="text-xs text-[#92a4c9] mt-1">按供应商标准单价估算</p>
              </div>

              <div className="bg-[#1a2332] rounded-xl p-5 border border-[#324467] shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#92a4c9]">
                    平均响应延迟
                  </p>
                </div>
                <p className="text-2xl font-black text-white">{metrics.avgLatency}ms</p>
                <p className="text-xs text-[#92a4c9] mt-1">P95 延迟: {metrics.p95Latency}ms</p>
              </div>

              <div className="bg-[#1a2332] rounded-xl p-5 border border-[#324467] shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#92a4c9]">
                    系统错误率
                  </p>
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      metrics.errorRate <= 5
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : 'text-red-400 bg-red-500/10'
                    }`}
                  >
                    {metrics.errorRate <= 5 ? '健康' : '告警'}
                  </span>
                </div>
                <p className="text-2xl font-black text-white">{metrics.errorRate.toFixed(2)}%</p>
                <p className="text-xs text-[#92a4c9] mt-1">
                  最近1小时错误: {metrics.lastHourErrors} 次
                </p>
              </div>
            </div>
          )}

          {/* 实时监控图表 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 调用趋势图 */}
            <div className="lg:col-span-2 bg-[#1a2332] rounded-xl p-6 border border-[#324467] shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-white">调用趋势（按小时）</h3>
              </div>
              <div className="h-64">
                {timeSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeSeries}>
                      <defs>
                        <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4913ec" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#4913ec" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#324467" />
                      <XAxis dataKey="time" stroke="#92a4c9" fontSize={11} />
                      <YAxis stroke="#92a4c9" fontSize={11} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: '12px', color: '#92a4c9' }} />
                      <Area
                        type="monotone"
                        dataKey="successCalls"
                        name="成功调用"
                        stroke="#4913ec"
                        fill="url(#successGrad)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="errorCalls"
                        name="失败调用"
                        stroke="#ef4444"
                        fill="url(#errorGrad)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-[#92a4c9] text-sm">暂无调用数据</p>
                  </div>
                )}
              </div>
            </div>

            {/* Token 消耗分布饼图 */}
            <div className="bg-[#1a2332] rounded-xl p-6 border border-[#324467] shadow-sm flex flex-col">
              <h3 className="text-lg font-bold mb-2 text-white">Token 消耗分布</h3>
              <div className="flex-1 min-h-[200px]">
                {distribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribution as Array<ProviderDistribution & Record<string, string | number>>}
                        dataKey="tokens"
                        nameKey="provider"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={2}
                      >
                        {distribution.map((item, index) => (
                          <Cell key={index} fill={item.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number | string | undefined) => [
                          `${formatNumber(Number(value))} Tokens`,
                          '',
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-[#92a4c9] text-sm">暂无数据</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                {distribution.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: item.color }}
                    ></span>
                    <span className="text-xs text-[#92a4c9]">
                      {item.provider} ({item.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Token 消耗趋势 */}
          <div className="bg-[#1a2332] rounded-xl p-6 border border-[#324467] shadow-sm">
            <h3 className="text-lg font-bold text-white mb-6">Token 消耗趋势（按小时）</h3>
            <div className="h-56">
              {timeSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#324467" />
                    <XAxis dataKey="time" stroke="#92a4c9" fontSize={11} />
                    <YAxis stroke="#92a4c9" fontSize={11} tickFormatter={formatNumber} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number | string | undefined) => [
                        `${formatNumber(Number(value))} Tokens`,
                        'Token 消耗',
                      ]}
                    />
                    <Bar dataKey="totalTokens" name="Token 消耗" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-[#92a4c9] text-sm">暂无数据</p>
                </div>
              )}
            </div>
          </div>

          {/* 供应商消耗与健康度明细 */}
          <div className="space-y-6">
            <h2 className="text-white text-[22px] font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400">health_and_safety</span>
              供应商消耗与健康度明细
            </h2>
            <div className="bg-[#1a2332] rounded-xl border border-[#324467] shadow-sm overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[820px]">
                <thead className="bg-[#232f48] text-[#92a4c9] text-xs uppercase font-bold">
                  <tr>
                    <th className="px-6 py-4">服务提供商</th>
                    <th className="px-6 py-4">调用次数</th>
                    <th className="px-6 py-4">输入 Tokens</th>
                    <th className="px-6 py-4">输出 Tokens</th>
                    <th className="px-6 py-4">估算成本</th>
                    <th className="px-6 py-4">延迟 (ms)</th>
                    <th className="px-6 py-4">错误率</th>
                    <th className="px-6 py-4 text-right">可用性</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#324467]">
                  {providers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-[#92a4c9]">
                        暂无调用记录
                      </td>
                    </tr>
                  )}
                  {providers.map((provider) => {
                    const statusInfo = getStatusInfo(provider.status);
                    return (
                      <tr key={provider.id} className="hover:bg-[#232f48]/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-[#232f48] rounded flex items-center justify-center font-bold text-xs text-white">
                              {provider.shortName}
                            </div>
                            <span className="font-medium text-white">{provider.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {formatNumber(provider.totalCalls)}
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {formatNumber(provider.requestTokens)}
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {formatNumber(provider.responseTokens)}
                        </td>
                        <td className="px-6 py-4 text-white font-medium">
                          ¥{provider.estimatedCost.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-[#92a4c9]">
                          {provider.latency !== null ? `${provider.latency}ms` : '--'}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={
                              provider.errorRate > 10 ? 'text-red-400' : 'text-[#92a4c9]'
                            }
                          >
                            {provider.errorRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-bold ${statusInfo.color}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`}></span>
                            {statusInfo.text}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default APIMonitoring;
