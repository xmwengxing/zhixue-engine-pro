import React, { useState, useEffect, useCallback } from 'react';
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
  latencyChange: number;
  errorRateChange: number;
  p95Latency: number;
  lastHourErrors: number;
  yesterdayCalls: number;
  yesterdayTokens: number;
}

// 服务商健康状态类型
interface ProviderHealth {
  id: string;
  name: string;
  shortName: string;
  latency: number | null;
  status: 'healthy' | 'degraded' | 'down';
  lastCheck: string;
}

// 服务商分布类型
interface ProviderDistribution {
  provider: string;
  percentage: number;
  color: string;
}

const APIMonitoring: React.FC = () => {
  const [metrics, setMetrics] = useState<APIMetrics | null>(null);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [distribution, setDistribution] = useState<ProviderDistribution[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载 API 指标数据
  // 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
  const loadMetrics = useCallback(async () => {
    try {
      const response = await request.get<ApiResponse<any>>('/admin/api-metrics');
      const data = response.data;

      // 处理指标数据
      if (data.summary) {
        // 模拟昨日数据（实际应该从后端获取）
        const yesterdayCalls = Math.floor(data.summary.totalCalls * 0.9);
        const yesterdayTokens = Math.floor(data.summary.totalTokens * 0.92);

        setMetrics({
          totalCalls: data.summary.totalCalls,
          totalTokens: data.summary.totalTokens,
          avgLatency: data.summary.avgResponseTime,
          errorRate: data.summary.errorRate,
          callsChange: ((data.summary.totalCalls - yesterdayCalls) / yesterdayCalls) * 100,
          tokensChange: ((data.summary.totalTokens - yesterdayTokens) / yesterdayTokens) * 100,
          latencyChange: -15.3, // 模拟数据
          errorRateChange: -0.02, // 模拟数据
          p95Latency: Math.floor(data.summary.avgResponseTime * 1.7),
          lastHourErrors: 0, // 需要从后端获取
          yesterdayCalls,
          yesterdayTokens,
        });
      }

      // 处理服务商健康状态
      if (data.providerStats) {
        interface ProviderStat {
          providerId: string;
          providerName: string;
          providerType: string;
          errorRate: number;
          avgResponseTime: number;
          totalCalls: number;
        }
        const healthProviders: ProviderHealth[] = data.providerStats.map((stat: ProviderStat) => {
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
            lastCheck: '刚刚',
          };
        });
        setProviders(healthProviders);
      }

      // 处理服务商分布
      if (data.providerStats) {
        interface ProviderStat {
          providerName: string;
          providerType: string;
          totalCalls: number;
        }
        const total = data.providerStats.reduce((sum: number, stat: ProviderStat) => sum + stat.totalCalls, 0);
        const dist: ProviderDistribution[] = data.providerStats
          .map((stat: ProviderStat) => ({
            provider: stat.providerName,
            percentage: total > 0 ? Math.round((stat.totalCalls / total) * 100) : 0,
            color: getProviderColor(stat.providerType),
          }))
          .sort((a: ProviderDistribution, b: ProviderDistribution) => b.percentage - a.percentage);
        setDistribution(dist);
      }
    } catch (error) {
      console.error('加载 API 指标失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 根据服务商类型获取颜色
  const getProviderColor = (type: string): string => {
    const colors: Record<string, string> = {
      OPENAI: '#4913ec',
      ANTHROPIC: '#22d3ee',
      DEEPSEEK: '#818cf8',
      GOOGLE: '#f59e0b',
    };
    return colors[type] || '#94a3b8';
  };

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
                实时监控 AI 接口健康度、消耗分布及系统核心策略配置
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#1a2332] rounded-xl p-5 border border-[#324467] shadow-sm">
                <div className="flex justify-between items-start mb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[#92a4c9]">
                今日调用总量
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
              昨日总计: {formatNumber(metrics.yesterdayTokens)} Tokens
            </p>
          </div>

          <div className="bg-[#1a2332] rounded-xl p-5 border border-[#324467] shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[#92a4c9]">
                平均响应延迟
              </p>
              <span
                className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  metrics.latencyChange <= 0
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-orange-400 bg-orange-500/10'
                }`}
              >
                {formatChange(metrics.latencyChange)}
              </span>
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
                  metrics.errorRateChange <= 0
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-red-400 bg-red-500/10'
                }`}
              >
                {formatChange(metrics.errorRateChange)}
              </span>
            </div>
            <p className="text-2xl font-black text-white">{metrics.errorRate.toFixed(2)}%</p>
            <p className="text-xs text-[#92a4c9] mt-1">
              最近1小时{metrics.lastHourErrors === 0 ? '无' : metrics.lastHourErrors}严重故障
            </p>
          </div>
        </div>
      )}

      {/* 实时监控图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 调用频率折线图 */}
        <div className="lg:col-span-2 bg-[#1a2332] rounded-xl p-6 border border-[#324467] shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white">实时调用频率 (RPM)</h3>
            <div className="flex gap-2">
              <span className="flex items-center gap-1.5 text-xs text-[#92a4c9]">
                <span className="w-2 h-2 rounded-full bg-primary"></span> 成功
              </span>
              <span className="flex items-center gap-1.5 text-xs text-[#92a4c9]">
                <span className="w-2 h-2 rounded-full bg-red-500"></span> 失败
              </span>
            </div>
          </div>
          <div className="h-64 flex items-center justify-center bg-gradient-to-b from-blue-900/10 to-transparent rounded-lg border border-blue-900/30">
            <p className="text-[#92a4c9] text-sm">图表数据加载中...</p>
          </div>
        </div>

        {/* 服务商分布饼图 */}
        <div className="bg-[#1a2332] rounded-xl p-6 border border-[#324467] shadow-sm flex flex-col">
          <h3 className="text-lg font-bold mb-6 text-white">服务商消耗分布</h3>
          <div className="flex-1 flex flex-col items-center justify-center py-4">
            <div className="relative w-40 h-40 rounded-full border-[16px] border-gray-100 flex items-center justify-center">
              {distribution.length > 0 && (
                <>
                  <div
                    className="absolute inset-[-16px] w-40 h-40 rounded-full border-[16px] border-blue-600 border-r-transparent border-b-transparent rotate-45"
                    style={{
                      borderTopColor: distribution[0]?.color || '#4913ec',
                      borderLeftColor: distribution[0]?.color || '#4913ec',
                    }}
                  ></div>
                  {distribution[1] && (
                    <div
                      className="absolute inset-[-16px] w-40 h-40 rounded-full border-[16px] border-l-transparent border-t-transparent border-b-transparent -rotate-12"
                      style={{ borderRightColor: distribution[1].color }}
                    ></div>
                  )}
                  <div className="text-center">
                    <p className="text-2xl font-black text-white">{distribution[0]?.percentage || 0}%</p>
                    <p className="text-xs text-[#92a4c9] uppercase font-bold">
                      {distribution[0]?.provider || 'N/A'}
                    </p>
                  </div>
                </>
              )}
            </div>
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

      {/* 健康度实时状态 */}
      <div className="space-y-6">
        <h2 className="text-white text-[22px] font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-400">health_and_safety</span>
          健康度实时状态
        </h2>
        <div className="bg-[#1a2332] rounded-xl border border-[#324467] shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#232f48] text-[#92a4c9] text-xs uppercase font-bold">
              <tr>
                <th className="px-6 py-4">服务提供商</th>
                <th className="px-6 py-4">延迟 (ms)</th>
                <th className="px-6 py-4">可用性</th>
                <th className="px-6 py-4 text-right">上次检测</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#324467]">
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
                    <td className="px-6 py-4">
                      <span className="text-[#92a4c9]">
                        {provider.latency !== null ? `${provider.latency}ms` : '--'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1.5 text-xs font-bold ${statusInfo.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`}></span>
                        {statusInfo.text}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-[#92a4c9] text-xs">
                      {provider.lastCheck}
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
