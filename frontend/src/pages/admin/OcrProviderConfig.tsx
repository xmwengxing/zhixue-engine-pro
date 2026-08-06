import React, { useState, useEffect } from 'react';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

// ============ 类型 ============
type OcrMethod = 'LOCAL_SERVICE' | 'LOCAL_VISION' | 'CUSTOM_API' | 'BAIDU_OCR' | 'PADDLE_OCR_VL';

interface OcrProvider {
  id: string;
  name: string;
  method: OcrMethod;
  endpoint: string;
  apiKey: string; // 后端已脱敏
  model: string | null;
  extra: any | null; // BAIDU_OCR: {secretKey(脱敏)}；PADDLE_OCR_VL: {model, 开关}
  isDefault: boolean;
  enableForRecognition: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

interface ProviderFormData {
  name: string;
  method: OcrMethod;
  endpoint: string;
  apiKey: string;
  model: string;
  secretKey: string; // 百度智能云 Secret Key
  paddleModel: string; // 飞桨模型名（PaddleOCR-VL-1.6）
  useDocOrientationClassify: boolean;
  useDocUnwarping: boolean;
  useChartRecognition: boolean;
  isDefault: boolean;
  enableForRecognition: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}

interface TestResult {
  ok: boolean;
  latency: number;
  error?: string;
  sample?: string;
}

// ============ 识别方式配置 ============
const METHOD_CONFIG: Record<OcrMethod, {
  name: string;
  desc: string;
  needApiKey: boolean;
  needModel: boolean;
  needSecretKey: boolean;
  needPaddleOptions: boolean;
  endpointPlaceholder: string;
}> = {
  LOCAL_SERVICE: {
    name: '本地 OCR 服务',
    desc: 'Unlimited-OCR 等本地 OCR 服务，仅需服务地址（用于管理员导入转化）',
    needApiKey: false,
    needModel: false,
    needSecretKey: false,
    needPaddleOptions: false,
    endpointPlaceholder: 'http://localhost:8080',
  },
  LOCAL_VISION: {
    name: '本地视觉模型',
    desc: 'Ollama 本地视觉模型（如 qwen-vl），需服务地址与模型名（用于管理员导入转化）',
    needApiKey: false,
    needModel: true,
    needSecretKey: false,
    needPaddleOptions: false,
    endpointPlaceholder: 'http://localhost:11434',
  },
  CUSTOM_API: {
    name: '自定义厂商视觉 API',
    desc: 'OpenAI 兼容视觉接口；可勾选用于学员/家长端非本地识别',
    needApiKey: true,
    needModel: true,
    needSecretKey: false,
    needPaddleOptions: false,
    endpointPlaceholder: 'https://api.openai.com/v1',
  },
  BAIDU_OCR: {
    name: '百度智能云官方 OCR API',
    desc: '百度智能云「文档解析 Unlimited-OCR」异步任务接口；需百度智能云控制台创建应用获取 API Key 与 Secret Key；支持图片/PDF/Office 文档转 Markdown；可勾选用于学员/家长端识别',
    needApiKey: true,
    needModel: false,
    needSecretKey: true,
    needPaddleOptions: false,
    endpointPlaceholder: 'https://aip.baidubce.com',
  },
  PADDLE_OCR_VL: {
    name: '飞桨 PaddleOCR-VL',
    desc: '飞桨 AI Studio PaddleOCR-VL 异步任务接口；需 Token（aistudio 鉴权）；可选开启方向分类/文档矫正/图表识别；可勾选用于学员/家长端识别',
    needApiKey: true,
    needModel: false,
    needSecretKey: false,
    needPaddleOptions: true,
    endpointPlaceholder: 'https://paddleocr.aistudio-app.com',
  },
};

const getMethodName = (m: OcrMethod) => METHOD_CONFIG[m]?.name || m;

const OcrProviderConfig: React.FC = () => {
  const [providers, setProviders] = useState<OcrProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<OcrProvider | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>({
    name: '',
    method: 'LOCAL_SERVICE',
    endpoint: '',
    apiKey: '',
    model: '',
    secretKey: '',
    paddleModel: 'PaddleOCR-VL-1.6',
    useDocOrientationClassify: false,
    useDocUnwarping: false,
    useChartRecognition: false,
    isDefault: false,
    enableForRecognition: false,
    status: 'ACTIVE',
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const res = await request.get<{ success: boolean; data: OcrProvider[] }>('/admin/ocr-providers');
      if (res.success) setProviders(res.data);
    } catch (e) {
      console.error('加载 OCR 服务商失败:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setFormData({
      name: '',
      method: 'LOCAL_SERVICE',
      endpoint: METHOD_CONFIG.LOCAL_SERVICE.endpointPlaceholder,
      apiKey: '',
      model: '',
      secretKey: '',
      paddleModel: 'PaddleOCR-VL-1.6',
      useDocOrientationClassify: false,
      useDocUnwarping: false,
      useChartRecognition: false,
      isDefault: false,
      enableForRecognition: false,
      status: 'ACTIVE',
    });
    setTestResult(null);
    setShowModal(true);
  };

  const openEdit = (p: OcrProvider) => {
    setEditing(p);
    setFormData({
      name: p.name,
      method: p.method,
      endpoint: p.endpoint,
      apiKey: p.apiKey, // 脱敏值，未改动则不回传
      model: p.model || '',
      secretKey: p.extra?.secretKey || '', // 脱敏值
      paddleModel: p.extra?.model || p.model || 'PaddleOCR-VL-1.6',
      useDocOrientationClassify: p.extra?.useDocOrientationClassify ?? false,
      useDocUnwarping: p.extra?.useDocUnwarping ?? false,
      useChartRecognition: p.extra?.useChartRecognition ?? false,
      isDefault: p.isDefault,
      enableForRecognition: p.enableForRecognition,
      status: p.status,
    });
    setTestResult(null);
    setShowModal(true);
  };

  const handleMethodChange = (m: OcrMethod) => {
    const cfg = METHOD_CONFIG[m];
    setFormData((f) => ({
      ...f,
      method: m,
      endpoint: cfg.endpointPlaceholder,
      // 切换方式时清空与新方式不匹配的字段
      apiKey: cfg.needApiKey ? f.apiKey : '',
      model: cfg.needModel ? f.model : '',
      secretKey: cfg.needSecretKey ? f.secretKey : '',
      enableForRecognition: ['CUSTOM_API', 'BAIDU_OCR', 'PADDLE_OCR_VL'].includes(m) ? f.enableForRecognition : false,
    }));
  };

  const handleTest = async () => {
    const cfg = METHOD_CONFIG[formData.method];
    if (!formData.endpoint) {
      alert('请先填写服务地址（Endpoint）');
      return;
    }
    if (cfg.needApiKey && !formData.apiKey) {
      alert('该方式需要填写 API Key / Token');
      return;
    }
    if (cfg.needModel && !formData.model) {
      alert('该方式需要填写模型名称');
      return;
    }
    if (cfg.needSecretKey && !formData.secretKey) {
      alert('该方式需要填写 Secret Key');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      // 编辑已保存的服务商：传 providerId 由后端用真实凭据测试（前端拿到的密钥是脱敏值）
      const res = await request.post<{ success: boolean; data: TestResult }>('/admin/ocr-providers/test', {
        providerId: editing?.id,
        method: formData.method,
        endpoint: formData.endpoint,
        apiKey: formData.apiKey || undefined,
        model: formData.model || undefined,
        extra: buildExtra(),
      });
      if (res.success) setTestResult(res.data);
    } catch (e: unknown) {
      setTestResult({ ok: false, latency: 0, error: getErrorMessage(e, '测试失败') });
    } finally {
      setTesting(false);
    }
  };

  /** 组装方式扩展配置（百度 Secret Key / 飞桨模型与开关） */
  const buildExtra = (): Record<string, unknown> => {
    if (formData.method === 'BAIDU_OCR') {
      const extra: Record<string, unknown> = {};
      if (formData.secretKey && formData.secretKey !== editing?.extra?.secretKey) {
        extra.secretKey = formData.secretKey;
      }
      return extra;
    }
    if (formData.method === 'PADDLE_OCR_VL') {
      return {
        model: formData.paddleModel.trim() || 'PaddleOCR-VL-1.6',
        useDocOrientationClassify: formData.useDocOrientationClassify,
        useDocUnwarping: formData.useDocUnwarping,
        useChartRecognition: formData.useChartRecognition,
      };
    }
    return {};
  };

  const handleSave = async () => {
    if (!formData.name || !formData.endpoint) {
      alert('请填写名称与服务地址');
      return;
    }
    const cfg = METHOD_CONFIG[formData.method];
    if (cfg.needApiKey && !formData.apiKey) {
      alert('该方式需要填写 API Key / Token');
      return;
    }
    if (cfg.needModel && !formData.model) {
      alert('该方式需要填写模型名称');
      return;
    }
    if (cfg.needSecretKey && !formData.secretKey && !editing?.extra?.secretKey) {
      alert('该方式需要填写 Secret Key');
      return;
    }
    try {
      // apiKey 为脱敏值且未改动时不回传，避免覆盖真实密钥
      const payload: Record<string, unknown> = {
        name: formData.name,
        method: formData.method,
        endpoint: formData.endpoint,
        model: formData.method === 'PADDLE_OCR_VL' ? null : (formData.model || null),
        isDefault: formData.isDefault,
        enableForRecognition: formData.enableForRecognition,
        status: formData.status,
      };
      if (formData.apiKey && formData.apiKey !== editing?.apiKey) {
        payload.apiKey = formData.apiKey;
      }
      const extra = buildExtra();
      if (Object.keys(extra).length > 0) payload.extra = extra;
      if (editing) {
        await request.put(`/admin/ocr-providers/${editing.id}`, payload);
      } else {
        await request.post('/admin/ocr-providers', payload);
      }
      setShowModal(false);
      loadProviders();
    } catch (e: unknown) {
      alert(getErrorMessage(e, '保存失败'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该识别服务商？')) return;
    try {
      await request.delete(`/admin/ocr-providers/${id}`);
      loadProviders();
    } catch (e: unknown) {
      alert(getErrorMessage(e, '删除失败'));
    }
  };

  const handleToggleStatus = async (p: OcrProvider) => {
    try {
      const next = p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await request.put(`/admin/ocr-providers/${p.id}`, { status: next });
      loadProviders();
    } catch (e: unknown) {
      alert(getErrorMessage(e, '操作失败'));
    }
  };

  const activeCount = providers.filter((p) => p.status === 'ACTIVE').length;
  const defaultProvider = providers.find((p) => p.isDefault && p.status === 'ACTIVE');
  const recognitionProvider = providers.find((p) => p.enableForRecognition && p.method === 'CUSTOM_API' && p.status === 'ACTIVE');

  return (
    <div className="min-h-screen bg-[#111722] p-6 lg:p-10">
      {/* 标题 */}
      <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
        <div className="space-y-2">
          <h2 className="text-white text-3xl font-bold tracking-tight">OCR / 视觉识别配置</h2>
          <p className="text-[#92a4c9] text-sm max-w-2xl">
            配置三种识别方式：本地 OCR 服务、本地视觉模型（Ollama）、自定义厂商视觉 API。
            管理员导入试卷时按默认方式识别；自定义厂商视觉 API 可勾选用于学员 / 家长端非本地识别。
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-primary hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2"
        >
          <span className="material-symbols-outlined">add</span>
          添加识别方式
        </button>
      </div>

      {/* 概览 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-[#232f48] border border-[#324467] p-6 rounded-xl">
          <p className="text-[#92a4c9] text-sm mb-1">活跃服务商</p>
          <span className="text-white text-2xl font-bold">{activeCount} / {providers.length}</span>
        </div>
        <div className="bg-[#232f48] border border-[#324467] p-6 rounded-xl">
          <p className="text-[#92a4c9] text-sm mb-1">默认导入方式</p>
          <span className="text-white text-2xl font-bold">
            {defaultProvider ? getMethodName(defaultProvider.method) : '未设置'}
          </span>
        </div>
        <div className="bg-[#232f48] border border-[#324467] p-6 rounded-xl">
          <p className="text-[#92a4c9] text-sm mb-1">学员/家长识别通道</p>
          <span className="text-white text-2xl font-bold">
            {recognitionProvider ? recognitionProvider.name : '未配置'}
          </span>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-white text-xl font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-[#3b82f6]">list_alt</span>
          已配置识别方式
        </h3>
        <button onClick={loadProviders} className="p-2 text-[#92a4c9] hover:text-white">
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#92a4c9]">加载中...</div>
      ) : providers.length === 0 ? (
        <div className="text-center py-12 text-[#92a4c9]">暂无配置，点击右上角添加</div>
      ) : (
        <div className="space-y-6">
          {providers.map((p) => {
            const cfg = METHOD_CONFIG[p.method];
            return (
              <div key={p.id} className="bg-[#232f48] border border-[#324467] rounded-xl overflow-hidden">
                <div className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#3b82f6]">document_scanner</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-white font-bold text-lg">{p.name}</h4>
                          {p.isDefault && (
                            <span className="text-[10px] bg-[#3b82f6]/20 text-[#3b82f6] px-2 py-0.5 rounded font-bold">默认</span>
                          )}
                          {p.enableForRecognition && (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-bold">识别通道</span>
                          )}
                        </div>
                        <div className="mt-1">
                          {p.status === 'ACTIVE' ? (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded uppercase font-bold">运行中</span>
                          ) : (
                            <span className="text-[10px] bg-slate-500/10 text-slate-400 px-2 py-0.5 rounded uppercase font-bold">已停用</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-wrap items-center gap-4 lg:gap-8 lg:justify-end">
                      <div className="flex flex-col min-w-[140px]">
                        <label className="text-[#5b6b8c] text-[10px] uppercase font-bold mb-1">识别方式</label>
                        <span className="text-[#92a4c9] text-sm">{cfg.name}</span>
                      </div>
                      {cfg.needModel && (
                        <div className="flex flex-col min-w-[140px]">
                          <label className="text-[#5b6b8c] text-[10px] uppercase font-bold mb-1">模型</label>
                          <span className="text-[#92a4c9] text-sm">{p.model}</span>
                        </div>
                      )}
                      <div className="flex flex-col items-center">
                        <label className="text-[#5b6b8c] text-[10px] uppercase font-bold mb-1">服务状态</label>
                        <button
                          onClick={() => handleToggleStatus(p)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer ${
                            p.status === 'ACTIVE' ? 'bg-primary' : 'bg-slate-600'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                            p.status === 'ACTIVE' ? 'translate-x-6' : 'translate-x-1'
                          }`}></span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-[#324467] grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[#92a4c9] text-xs font-medium">服务地址 (Endpoint)</label>
                      <input
                        className="w-full bg-[#1a2332] border border-[#324467] text-[#92a4c9] text-sm rounded-lg px-3 py-2"
                        readOnly value={p.endpoint}
                      />
                    </div>
                    {cfg.needApiKey && (
                      <div className="space-y-2">
                        <label className="text-[#92a4c9] text-xs font-medium">
                          {p.method === 'PADDLE_OCR_VL' ? 'Token' : 'API Key'}
                        </label>
                        <input
                          className="w-full bg-[#1a2332] border border-[#324467] text-[#92a4c9] text-xs rounded-lg px-3 py-2"
                          readOnly type="password" value={p.apiKey}
                        />
                      </div>
                    )}
                    {p.method === 'BAIDU_OCR' && p.extra?.secretKey && (
                      <div className="space-y-2">
                        <label className="text-[#92a4c9] text-xs font-medium">Secret Key</label>
                        <input
                          className="w-full bg-[#1a2332] border border-[#324467] text-[#92a4c9] text-xs rounded-lg px-3 py-2"
                          readOnly type="password" value={p.extra.secretKey}
                        />
                      </div>
                    )}
                    {p.method === 'PADDLE_OCR_VL' && (
                      <div className="space-y-2">
                        <label className="text-[#92a4c9] text-xs font-medium">解析选项</label>
                        <span className="text-[#92a4c9] text-xs block">
                          方向分类 {(p.extra?.useDocOrientationClassify ? '开' : '关')} · 矫正 {(p.extra?.useDocUnwarping ? '开' : '关')} · 图表 {(p.extra?.useChartRecognition ? '开' : '关')}
                        </span>
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-[#92a4c9] text-xs font-medium">创建时间</label>
                      <span className="text-[#92a4c9] text-sm block">
                        {new Date(p.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => openEdit(p)}
                      className="px-4 py-2 border border-[#324467] text-[#92a4c9] rounded-lg text-sm hover:bg-[#1a2332] hover:text-white transition-colors"
                    >
                      编辑配置
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="px-4 py-2 border border-red-500/30 text-red-400 rounded-lg text-sm hover:bg-red-500/10 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 添加/编辑 弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#232f48] border border-[#324467] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[#324467]">
              <h3 className="text-white text-xl font-bold">{editing ? '编辑识别方式' : '添加识别方式'}</h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-[#92a4c9] text-sm font-medium block mb-2">名称 *</label>
                <input
                  type="text"
                  className="w-full bg-[#1a2332] border border-[#324467] text-white rounded-lg px-4 py-2 focus:border-primary outline-none"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：本地 Unlimited-OCR"
                />
              </div>

              <div>
                <label className="text-[#92a4c9] text-sm font-medium block mb-2">识别方式 *</label>
                <select
                  className="w-full bg-[#1a2332] border border-[#324467] text-white rounded-lg px-4 py-2 focus:border-primary outline-none"
                  value={formData.method}
                  onChange={(e) => handleMethodChange(e.target.value as OcrMethod)}
                >
                  <option value="LOCAL_SERVICE">本地 OCR 服务（Unlimited-OCR 等）</option>
                  <option value="LOCAL_VISION">本地视觉模型（Ollama）</option>
                  <option value="CUSTOM_API">自定义厂商视觉 API（OpenAI 兼容）</option>
                  <option value="BAIDU_OCR">百度智能云官方 OCR API（文档解析）</option>
                  <option value="PADDLE_OCR_VL">飞桨 PaddleOCR-VL（异步任务）</option>
                </select>
                <p className="text-[#5b6b8c] text-xs mt-2">{METHOD_CONFIG[formData.method].desc}</p>
              </div>

              <div>
                <label className="text-[#92a4c9] text-sm font-medium block mb-2">服务地址 Endpoint *</label>
                <input
                  type="text"
                  className="w-full bg-[#1a2332] border border-[#324467] text-white rounded-lg px-4 py-2 focus:border-primary outline-none"
                  value={formData.endpoint}
                  onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                  placeholder={METHOD_CONFIG[formData.method].endpointPlaceholder}
                />
              </div>

              {METHOD_CONFIG[formData.method].needApiKey && (
                <div>
                  <label className="text-[#92a4c9] text-sm font-medium block mb-2">
                    {formData.method === 'PADDLE_OCR_VL' ? 'Token *' : formData.method === 'BAIDU_OCR' ? 'API Key *' : 'API Key *'}
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[#1a2332] border border-[#324467] text-white rounded-lg px-4 py-2 focus:border-primary outline-none"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder={
                      formData.method === 'PADDLE_OCR_VL'
                        ? '飞桨 AI Studio Token'
                        : editing
                          ? '（留空则不修改原密钥）'
                          : 'sk-...'
                    }
                  />
                  {editing && (
                    <p className="text-[#5b6b8c] text-xs mt-2">当前为脱敏值，留空表示不修改。</p>
                  )}
                  {formData.method === 'BAIDU_OCR' && (
                    <p className="text-[#5b6b8c] text-xs mt-2">
                      在<a className="text-blue-400 hover:underline" href="https://console.bce.baidu.com/ai/#/ai/ocr/overview/index" target="_blank" rel="noreferrer">百度智能云控制台 · 文字识别</a>创建应用后获取 API Key 与 Secret Key。
                    </p>
                  )}
                </div>
              )}

              {METHOD_CONFIG[formData.method].needSecretKey && (
                <div>
                  <label className="text-[#92a4c9] text-sm font-medium block mb-2">Secret Key *</label>
                  <input
                    type="password"
                    className="w-full bg-[#1a2332] border border-[#324467] text-white rounded-lg px-4 py-2 focus:border-primary outline-none"
                    value={formData.secretKey}
                    onChange={(e) => setFormData({ ...formData, secretKey: e.target.value })}
                    placeholder={editing ? '（留空则不修改原密钥）' : '百度智能云应用 Secret Key'}
                  />
                  {editing && (
                    <p className="text-[#5b6b8c] text-xs mt-2">当前为脱敏值，留空表示不修改。</p>
                  )}
                </div>
              )}

              {METHOD_CONFIG[formData.method].needPaddleOptions && (
                <>
                  <div>
                    <label className="text-[#92a4c9] text-sm font-medium block mb-2">模型名称</label>
                    <input
                      type="text"
                      className="w-full bg-[#1a2332] border border-[#324467] text-white rounded-lg px-4 py-2 focus:border-primary outline-none"
                      value={formData.paddleModel}
                      onChange={(e) => setFormData({ ...formData, paddleModel: e.target.value })}
                      placeholder="PaddleOCR-VL-1.6"
                    />
                  </div>
                  <div>
                    <label className="text-[#92a4c9] text-sm font-medium block mb-2">解析选项（可选）</label>
                    <div className="flex flex-col gap-2">
                      {(
                        [
                          { k: 'useDocOrientationClassify', label: '方向分类（竖版/旋转文档自动矫正）' },
                          { k: 'useDocUnwarping', label: '文档矫正（拍照弯曲页面拉平）' },
                          { k: 'useChartRecognition', label: '图表识别（表格/图表结构化）' },
                        ] as const
                      ).map((opt) => (
                        <label key={opt.k} className="flex items-center gap-3 text-[#92a4c9] text-sm">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={formData[opt.k]}
                            onChange={(e) => setFormData({ ...formData, [opt.k]: e.target.checked })}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {METHOD_CONFIG[formData.method].needModel && (
                <div>
                  <label className="text-[#92a4c9] text-sm font-medium block mb-2">模型名称 *</label>
                  <input
                    type="text"
                    className="w-full bg-[#1a2332] border border-[#324467] text-white rounded-lg px-4 py-2 focus:border-primary outline-none"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="例如：qwen2.5-vl-72b / gpt-4o"
                  />
                </div>
              )}

              {/* 测试连通性 */}
              <div className="border-t border-[#324467] pt-4">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="w-full bg-primary/10 border-2 border-primary/40 text-[#3b82f6] px-4 py-3 rounded-lg font-medium hover:bg-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {testing ? (
                    <>
                      <span className="material-symbols-outlined animate-spin">refresh</span>测试中...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">bolt</span>测试连通性
                    </>
                  )}
                </button>
                {testResult && (
                  <div className={`mt-3 p-4 rounded-lg border-2 ${
                    testResult.ok
                      ? 'bg-emerald-500/10 border-emerald-500/40'
                      : 'bg-red-500/10 border-red-500/40'
                  }`}>
                    <p className={`text-sm font-medium ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                      {testResult.ok
                        ? `✅ 连接成功！响应时间：${testResult.latency}ms`
                        : `❌ 连接失败：${testResult.error}`}
                    </p>
                    {testResult.ok && testResult.sample && (
                      <p className="text-xs text-[#92a4c9] mt-2">回显片段：{testResult.sample}</p>
                    )}
                  </div>
                )}
              </div>

              {/* 开关项 */}
              <div className="flex flex-col gap-3 border-t border-[#324467] pt-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  />
                  <span className="text-[#92a4c9] text-sm">设为默认导入方式（管理员导入试卷时优先使用）</span>
                </label>

                <label className={`flex items-center gap-3 ${['CUSTOM_API', 'BAIDU_OCR', 'PADDLE_OCR_VL'].includes(formData.method) ? 'cursor-pointer' : 'opacity-40'}`}>
                  <input
                    type="checkbox"
                    className="size-4 accent-emerald-500"
                    disabled={!['CUSTOM_API', 'BAIDU_OCR', 'PADDLE_OCR_VL'].includes(formData.method)}
                    checked={formData.enableForRecognition}
                    onChange={(e) => setFormData({ ...formData, enableForRecognition: e.target.checked })}
                  />
                  <span className="text-[#92a4c9] text-sm">
                    用于学员/家长端识别（仅云端方式可用：自定义厂商视觉 / 百度智能云 OCR / 飞桨 PaddleOCR-VL）
                  </span>
                </label>
              </div>

              <div>
                <label className="text-[#92a4c9] text-sm font-medium block mb-2">状态</label>
                <select
                  className="w-full bg-[#1a2332] border border-[#324467] text-white rounded-lg px-4 py-2 focus:border-primary outline-none"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                >
                  <option value="ACTIVE">启用</option>
                  <option value="INACTIVE">停用</option>
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-[#324467] flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-[#324467] text-[#92a4c9] rounded-lg hover:bg-[#1a2332] hover:text-white"
              >
                取消
              </button>
              <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OcrProviderConfig;
