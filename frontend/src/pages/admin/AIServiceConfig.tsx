import React, { useState, useEffect } from 'react';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

// API 响应类型
interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
}

// AI 服务商类型
type AIProviderType = 'OPENAI' | 'CLAUDE' | 'DEEPSEEK' | 'QWEN' | 'GEMINI' | 'ZHIPU' | 'DOUBAO' | 'WENXIN' | 'CUSTOM' | 'OLLAMA';

interface AIProvider {
  id: string;
  name: string;
  type: AIProviderType;
  apiKey: string;
  endpoint: string;
  model: string;
  priority: number;
  status: 'ACTIVE' | 'INACTIVE';
  contextWindow?: number | null;
  maxTokens?: number | null;
  streamEnabled?: boolean;
  supportsReasoning?: boolean;
  createdAt: string;
  updatedAt: string;
}

// 服务商表单数据
interface ProviderFormData {
  name: string;
  type: AIProviderType;
  apiKey: string;
  endpoint: string;
  model: string;
  priority: number;
  status: 'ACTIVE' | 'INACTIVE';
  contextWindow?: number | null;
  maxTokens?: number | null;
  streamEnabled?: boolean;
  supportsReasoning?: boolean;
}

interface ModelOption {
  id: string;
  name: string;
  contextWindow?: number;
}

const AIServiceConfig: React.FC = () => {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>({
    name: '',
    type: 'OPENAI',
    apiKey: '',
    endpoint: '',
    model: '',
    priority: 0,
    status: 'ACTIVE',
    contextWindow: null,
    maxTokens: null,
    streamEnabled: false,
    supportsReasoning: false,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: 'healthy' | 'degraded' | 'down' | null;
    latency: number | null;
    error: string | null;
    message: string;
  } | null>(null);
  // 识别模型
  const [identifying, setIdentifying] = useState(false);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);

  // 加载服务商列表
  const loadProviders = async () => {
    try {
      setLoading(true);
      const response = await request.get<ApiResponse<AIProvider[]>>('/admin/ai-providers');
      if (response.success) {
        setProviders(response.data);
      }
    } catch (error) {
      console.error('加载 AI 服务商失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  // 打开添加弹窗
  const handleAdd = () => {
    setEditingProvider(null);
    setFormData({
      name: '',
      type: 'OPENAI',
      apiKey: '',
      endpoint: '',
      model: '',
      priority: providers.length,
      status: 'ACTIVE',
      contextWindow: null,
      maxTokens: null,
      streamEnabled: false,
      supportsReasoning: false,
    });
    setTestResult(null);
    setModelOptions([]);
    setShowModelSelect(false);
    setIdentifyError(null);
    setShowAddModal(true);
  };

  // 打开编辑弹窗
  const handleEdit = (provider: AIProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      type: provider.type,
      apiKey: provider.apiKey,
      endpoint: provider.endpoint,
      model: provider.model,
      priority: provider.priority,
      status: provider.status,
      contextWindow: provider.contextWindow ?? null,
      maxTokens: provider.maxTokens ?? null,
      streamEnabled: !!provider.streamEnabled,
      supportsReasoning: !!provider.supportsReasoning,
    });
    setTestResult(null);
    setModelOptions([]);
    setShowModelSelect(false);
    setIdentifyError(null);
    setShowAddModal(true);
  };

  // 识别模型：调用后端 /ai-providers/models 拉取真实模型列表
  const handleIdentifyModels = async () => {
    if (!formData.endpoint) {
      setIdentifyError('请先填写 API Endpoint');
      return;
    }
    setIdentifying(true);
    setIdentifyError(null);
    setShowModelSelect(false);
    try {
      const response = await request.post<ApiResponse<ModelOption[]>>('/admin/ai-providers/models', {
        type: formData.type,
        apiKey: formData.apiKey,
        endpoint: formData.endpoint,
      });
      if (response.success && response.data?.length) {
        setModelOptions(response.data);
        setShowModelSelect(true);
      } else if (response.success) {
        setIdentifyError('该端点未返回可用模型');
      } else {
        setIdentifyError(response.message || '获取模型列表失败');
      }
    } catch (error: unknown) {
      setIdentifyError(getErrorMessage(error, '获取模型列表失败'));
    } finally {
      setIdentifying(false);
    }
  };

  // 选中模型后自动填入 model（+ 上下文长度）
  const handleSelectModel = (m: ModelOption) => {
    setFormData((prev) => ({
      ...prev,
      model: m.id,
      contextWindow: m.contextWindow ?? prev.contextWindow ?? null,
    }));
    setShowModelSelect(false);
  };

  // 测试连接
  const handleTestConnection = async () => {
    // 验证必填字段
    if (!formData.apiKey || !formData.endpoint || !formData.model) {
      alert('请填写 API Key、Endpoint 和模型名称');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const response = await request.post<ApiResponse<any>>('/admin/ai-providers/test', {
        type: formData.type,
        apiKey: formData.apiKey,
        endpoint: formData.endpoint,
        model: formData.model,
      });

      if (response.success) {
        const result = response.data;
        setTestResult({
          status: result.status,
          latency: result.latency,
          error: result.error,
          message: result.status === 'healthy' 
            ? `✅ 连接成功！响应时间：${result.latency}ms` 
            : result.status === 'degraded'
            ? `⚠️ 连接成功但响应较慢（${result.latency}ms）`
            : `❌ 连接失败：${result.error}`,
        });
      }
    } catch (error: unknown) {
      console.error('测试连接失败:', error);
      setTestResult({
        status: 'down',
        latency: null,
        error: getErrorMessage(error, '测试失败'),
        message: `❌ 测试失败：${getErrorMessage(error, '未知错误')}`,
      });
    } finally {
      setTesting(false);
    }
  };

  // 保存服务商
  const handleSave = async () => {
    try {
      // 修复：编辑时若 apiKey 是后端掩码值（含 "..."），不把它写回，避免覆盖真实密钥
      const payload: any = { ...formData };
      if (editingProvider && typeof payload.apiKey === 'string' && payload.apiKey.includes('...')) {
        delete payload.apiKey;
      }
      if (editingProvider) {
        // 更新
        await request.put(`/admin/ai-providers/${editingProvider.id}`, payload);
      } else {
        // 创建
        await request.post('/admin/ai-providers', payload);
      }
      setShowAddModal(false);
      loadProviders();
    } catch (error: unknown) {
      console.error('保存 AI 服务商失败:', error);
      alert(getErrorMessage(error, '保存失败'));
    }
  };

  // 删除服务商
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个 AI 服务商吗？')) {
      return;
    }

    try {
      await request.delete(`/admin/ai-providers/${id}`);
      loadProviders();
    } catch (error: unknown) {
      console.error('删除 AI 服务商失败:', error);
      alert(getErrorMessage(error, '删除失败'));
    }
  };

  // 切换服务商状态
  const handleToggleStatus = async (provider: AIProvider) => {
    try {
      const newStatus = provider.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await request.put(`/admin/ai-providers/${provider.id}`, {
        status: newStatus,
      });
      loadProviders();
    } catch (error: unknown) {
      console.error('切换服务商状态失败:', error);
      alert(getErrorMessage(error, '操作失败'));
    }
  };

  // 服务商类型配置
  const providerTypeConfig: Record<AIProviderType, { name: string; endpoint: string; models: string[] }> = {
    OPENAI: {
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    CLAUDE: {
      name: 'Anthropic Claude',
      endpoint: 'https://api.anthropic.com/v1',
      models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307']
    },
    DEEPSEEK: {
      name: 'DeepSeek',
      endpoint: 'https://api.deepseek.com/v1',
      models: ['deepseek-chat', 'deepseek-coder']
    },
    QWEN: {
      name: '通义千问',
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long']
    },
    GEMINI: {
      name: 'Google Gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash']
    },
    ZHIPU: {
      name: '智谱 AI',
      endpoint: 'https://open.bigmodel.cn/api/paas/v4',
      models: ['glm-4-plus', 'glm-4-0520', 'glm-4-air', 'glm-4-flash']
    },
    DOUBAO: {
      name: '豆包',
      endpoint: 'https://ark.cn-beijing.volces.com/api/v3',
      models: ['doubao-pro-32k', 'doubao-lite-32k']
    },
    WENXIN: {
      name: '文心一言',
      endpoint: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
      models: ['ernie-4.0-turbo-8k', 'ernie-3.5-8k', 'ernie-speed-128k']
    },
    OLLAMA: {
      name: '本地 Ollama',
      endpoint: 'http://localhost:11434',
      models: [] // 走"识别模型"按钮从 /api/tags 拉取
    },
    CUSTOM: {
      name: '自定义',
      endpoint: '',
      models: []
    }
  };

  // 获取服务商类型显示名称
  const getProviderTypeName = (type: string) => {
    return providerTypeConfig[type as AIProviderType]?.name || type;
  };

  // 处理服务商类型变更
  const handleTypeChange = (newType: AIProviderType) => {
    const config = providerTypeConfig[newType];
    setFormData({
      ...formData,
      type: newType,
      endpoint: config.endpoint,
      model: config.models[0] || '',
    });
  };

  // 获取状态显示
  const getStatusBadge = (status: string) => {
    if (status === 'ACTIVE') {
      return (
        <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded uppercase font-bold tracking-wider">
          运行中
        </span>
      );
    }
    return (
      <span className="text-[10px] bg-slate-500/10 text-slate-500 px-2 py-0.5 rounded uppercase font-bold tracking-wider">
        已停用
      </span>
    );
  };

  // 统计信息
  const activeCount = providers.filter(p => p.status === 'ACTIVE').length;
  const totalCount = providers.length;

  return (
    <div className="p-6 lg:p-10 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* 页面标题 */}
      <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
        <div className="space-y-2">
          <h2 className="text-slate-900 dark:text-white text-3xl font-bold tracking-tight">多AI服务商配置</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-2xl">
            集成全球顶尖大模型服务，支持动态链路切换、多模型负载均衡及流式响应优化。
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20"
        >
          <span className="material-symbols-outlined">add</span>
          添加新服务商
        </button>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-xl shadow-sm">
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">系统全局状态</p>
          <div className="flex items-center gap-2">
            <div className="size-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-slate-900 dark:text-white text-2xl font-bold uppercase">Healthy</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-xl shadow-sm">
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">活跃服务商</p>
          <span className="text-slate-900 dark:text-white text-2xl font-bold">
            {activeCount} / {totalCount}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-xl shadow-sm">
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">配置状态</p>
          <span className="text-slate-900 dark:text-white text-2xl font-bold">
            {totalCount > 0 ? '已配置' : '未配置'}
          </span>
        </div>
      </div>

      {/* 服务商列表 */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-slate-900 dark:text-white text-xl font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-600">list_alt</span>
          已配置服务商清单
        </h3>
        <button
          onClick={loadProviders}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">加载中...</div>
      ) : providers.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          暂无配置的 AI 服务商，点击上方按钮添加
        </div>
      ) : (
        <div className="space-y-6">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden transition-all hover:border-blue-600/50 shadow-sm"
            >
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="size-12 rounded-lg bg-blue-50 dark:bg-white/5 flex items-center justify-center">
                      <span className="material-symbols-outlined text-blue-600">
                        cloud_sync
                      </span>
                    </div>
                    <div>
                      <h4 className="text-slate-900 dark:text-white font-bold text-lg">{provider.name}</h4>
                      {getStatusBadge(provider.status)}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-wrap items-center gap-4 lg:gap-8 lg:justify-end">
                    <div className="flex flex-col min-w-[140px]">
                      <label className="text-slate-500 dark:text-slate-500 text-[10px] uppercase font-bold mb-1">
                        服务商类型
                      </label>
                      <span className="text-slate-900 dark:text-slate-200 text-sm">
                        {getProviderTypeName(provider.type)}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-[140px]">
                      <label className="text-slate-500 dark:text-slate-500 text-[10px] uppercase font-bold mb-1">
                        当前模型
                      </label>
                      <span className="text-slate-900 dark:text-slate-200 text-sm">{provider.model}</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {provider.type === 'OLLAMA' && (
                          <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded">本地</span>
                        )}
                        {provider.supportsReasoning && (
                          <span className="text-[10px] bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded">推理</span>
                        )}
                        {provider.streamEnabled && (
                          <span className="text-[10px] bg-sky-500/10 text-sky-500 px-1.5 py-0.5 rounded">流式</span>
                        )}
                        {provider.contextWindow ? (
                          <span className="text-[10px] bg-slate-500/10 text-slate-400 px-1.5 py-0.5 rounded">
                            上下文 {provider.contextWindow.toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col min-w-[180px]">
                      <label className="text-slate-500 dark:text-slate-500 text-[10px] uppercase font-bold mb-1">
                        API Key
                      </label>
                      <input
                        className="w-full bg-slate-100 dark:bg-slate-900 border-none text-slate-600 dark:text-slate-400 text-xs rounded-lg py-1.5 px-3"
                        readOnly
                        type="password"
                        value={provider.apiKey}
                      />
                    </div>

                    <div className="flex flex-col items-center">
                      <label className="text-slate-500 dark:text-slate-500 text-[10px] uppercase font-bold mb-1">
                        服务状态
                      </label>
                      <button
                        onClick={() => handleToggleStatus(provider)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer ${
                          provider.status === 'ACTIVE' ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                            provider.status === 'ACTIVE' ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        ></span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 详细信息 */}
                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-slate-600 dark:text-slate-300 text-xs font-medium">
                      API Endpoint
                    </label>
                    <input
                      className="w-full bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm rounded-lg"
                      readOnly
                      type="text"
                      value={provider.endpoint}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-slate-600 dark:text-slate-300 text-xs font-medium">优先级</label>
                    <span className="text-slate-900 dark:text-white text-sm block">
                      {provider.priority} (数字越小优先级越高)
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-slate-600 dark:text-slate-300 text-xs font-medium">创建时间</label>
                    <span className="text-slate-600 dark:text-slate-400 text-sm block">
                      {new Date(provider.createdAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => handleEdit(provider)}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    编辑配置
                  </button>
                  <button
                    onClick={() => handleDelete(provider.id)}
                    className="px-4 py-2 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-500 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加/编辑弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-slate-900 dark:text-white text-xl font-bold">
                {editingProvider ? '编辑 AI 服务商' : '添加 AI 服务商'}
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-slate-700 dark:text-slate-300 text-sm font-medium block mb-2">
                  服务商名称 *
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：OpenAI 主服务"
                />
              </div>

              <div>
                <label className="text-slate-700 dark:text-slate-300 text-sm font-medium block mb-2">
                  服务商类型 *
                </label>
                <select
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2"
                  value={formData.type}
                  onChange={(e) => handleTypeChange(e.target.value as AIProviderType)}
                >
                  <option value="OPENAI">OpenAI</option>
                  <option value="CLAUDE">Anthropic Claude</option>
                  <option value="DEEPSEEK">DeepSeek</option>
                  <option value="QWEN">通义千问</option>
                  <option value="GEMINI">Google Gemini</option>
                  <option value="ZHIPU">智谱 AI</option>
                  <option value="DOUBAO">豆包</option>
                  <option value="WENXIN">文心一言</option>
                  <option value="OLLAMA">本地 Ollama</option>
                  <option value="CUSTOM">自定义</option>
                </select>
              </div>

              <div>
                <label className="text-slate-700 dark:text-slate-300 text-sm font-medium block mb-2">
                  API Key *
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </div>

              <div>
                <label className="text-slate-700 dark:text-slate-300 text-sm font-medium block mb-2">
                  API Endpoint *
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2"
                  value={formData.endpoint}
                  onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </div>

              <div>
                <label className="text-slate-700 dark:text-slate-300 text-sm font-medium block mb-2">
                  模型名称 *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="gpt-4o"
                  />
                  <button
                    type="button"
                    onClick={handleIdentifyModels}
                    disabled={identifying || !formData.endpoint}
                    className="shrink-0 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 flex items-center gap-1"
                    title="从服务端拉取该端点上的真实模型列表"
                  >
                    {identifying ? (
                      <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                    ) : (
                      <span className="material-symbols-outlined text-sm">search</span>
                    )}
                    识别模型
                  </button>
                </div>

                {showModelSelect && modelOptions.length > 0 && (
                  <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-lg max-h-44 overflow-y-auto">
                    {modelOptions.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => handleSelectModel(m)}
                        className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex justify-between items-center gap-2"
                      >
                        <span className="truncate">{m.name}</span>
                        {m.contextWindow ? (
                          <span className="text-[10px] text-slate-400 shrink-0">
                            上下文 {m.contextWindow.toLocaleString()}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
                {identifyError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">{identifyError}</p>
                )}
                {providerTypeConfig[formData.type].models.length > 0 && !showModelSelect && (
                  <p className="text-slate-500 dark:text-slate-400 text-xs mt-2">
                    常用模型：{providerTypeConfig[formData.type].models.join('、')}
                  </p>
                )}
              </div>

              {/* 输出最大 token（留空=官方默认） */}
              <div>
                <label className="text-slate-700 dark:text-slate-300 text-sm font-medium block mb-2">
                  输出最大 token（留空 = 官方默认）
                </label>
                <input
                  type="number"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2"
                  value={formData.maxTokens ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, maxTokens: e.target.value ? parseInt(e.target.value) : null })
                  }
                  placeholder="例如 2500"
                />
              </div>

              {/* 上下文长度（自动探测/可选） */}
              <div>
                <label className="text-slate-700 dark:text-slate-300 text-sm font-medium block mb-2">
                  上下文长度（自动探测，可手动覆盖）
                </label>
                <input
                  type="number"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2"
                  value={formData.contextWindow ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, contextWindow: e.target.value ? parseInt(e.target.value) : null })
                  }
                  placeholder="例如 32768（用于约束输出与注入 Ollama num_ctx）"
                />
              </div>

              {/* 流式响应开关 */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-slate-700 dark:text-slate-300 text-sm font-medium block">
                    流式响应
                  </label>
                  <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                    开启后对话类接口可逐字返回（当前训练舱答题流程仍走整块返回，不影响稳定性）
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, streamEnabled: !formData.streamEnabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer ${
                    formData.streamEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      formData.streamEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  ></span>
                </button>
              </div>

              {/* 测试连接按钮和结果 */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing || !formData.apiKey || !formData.endpoint || !formData.model}
                  className="w-full bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-4 py-3 rounded-lg font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {testing ? (
                    <>
                      <span className="material-symbols-outlined animate-spin">refresh</span>
                      测试中...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">bolt</span>
                      测试 API 连接
                    </>
                  )}
                </button>

                {testResult && (
                  <div
                    className={`mt-3 p-4 rounded-lg border-2 ${
                      testResult.status === 'healthy'
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                        : testResult.status === 'degraded'
                        ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}
                  >
                    <p
                      className={`text-sm font-medium ${
                        testResult.status === 'healthy'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : testResult.status === 'degraded'
                          ? 'text-orange-700 dark:text-orange-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {testResult.message}
                    </p>
                    {testResult.error && testResult.status === 'down' && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                        错误详情：{testResult.error}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-slate-700 dark:text-slate-300 text-sm font-medium block mb-2">
                  优先级（数字越小优先级越高）
                </label>
                <input
                  type="number"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })
                  }
                />
              </div>

              <div>
                <label className="text-slate-700 dark:text-slate-300 text-sm font-medium block mb-2">状态</label>
                <select
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2"
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as 'ACTIVE' | 'INACTIVE',
                    })
                  }
                >
                  <option value="ACTIVE">启用</option>
                  <option value="INACTIVE">停用</option>
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIServiceConfig;
