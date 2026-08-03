import React, { useState, useEffect, useCallback } from 'react';
import request from '../../utils/request';
import { getErrorMessage } from '../../types/error';

// API 响应类型
interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
}

// 科目教学指令类型
interface SubjectInstruction {
  id: string;
  subject: string;
  systemPrompt: string;
  examples: Array<{ question: string; response: string }>;
  providerId?: string;
  updatedAt: string;
}

// AI 服务商类型
interface AIProvider {
  id: string;
  name: string;
  type: string;
  status: string;
}

const SubjectInstructionConfig: React.FC = () => {
  const [instructions, setInstructions] = useState<SubjectInstruction[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [customSubjects, setCustomSubjects] = useState<Array<{ name: string; icon: string }>>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [formData, setFormData] = useState({
    subject: '',
    systemPrompt: '',
    examples: [] as Array<{ question: string; response: string }>,
    providerId: '',
  });

  // 预定义科目列表
  const predefinedSubjects = [
    { name: '小学数学', icon: 'calculate' },
    { name: '初中数学', icon: 'calculate' },
    { name: '高中数学', icon: 'calculate' },
    { name: '小学语文', icon: 'language_chinese_dayi' },
    { name: '初中语文', icon: 'language_chinese_dayi' },
    { name: '高中语文', icon: 'language_chinese_dayi' },
    { name: '小学英语', icon: 'translate' },
    { name: '初中英语', icon: 'translate' },
    { name: '高中英语', icon: 'translate' },
    { name: '物理', icon: 'experiment' },
    { name: '化学', icon: 'science' },
    { name: '生物', icon: 'biotech' },
    { name: '历史', icon: 'history_edu' },
    { name: '地理', icon: 'public' },
    { name: '政治', icon: 'gavel' },
  ];

  // 加载所有科目指令
  // 使用 useCallback 包装异步函数，避免 React Hooks 依赖项警告
  const loadInstructions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await request.get<ApiResponse<SubjectInstruction[]>>('/admin/ai-instructions');
      if (response.success) {
        setInstructions(response.data);
        // 如果有数据，默认选中第一个
        if (response.data.length > 0 && !selectedSubject) {
          selectSubject(response.data[0].subject);
        }
      }
    } catch (error) {
      console.error('加载科目指令失败:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedSubject]);

  // 加载 AI 服务商列表
  const loadProviders = async () => {
    try {
      const response = await request.get<ApiResponse<AIProvider[]>>('/admin/ai-providers');
      if (response.success) {
        // 只显示活跃的服务商
        const activeProviders = response.data.filter((p: AIProvider) => p.status === 'ACTIVE');
        setProviders(activeProviders);
      }
    } catch (error) {
      console.error('加载 AI 服务商失败:', error);
    }
  };

  useEffect(() => {
    loadInstructions();
    loadProviders();
  }, [loadInstructions]);

  // 选择科目
  const selectSubject = async (subject: string) => {
    setSelectedSubject(subject);
    
    try {
      const response = await request.get<ApiResponse<SubjectInstruction>>(`/admin/ai-instructions?subject=${subject}`);
      if (response.success && response.data) {
        const instruction = response.data;
        setFormData({
          subject: instruction.subject,
          systemPrompt: instruction.systemPrompt,
          examples: instruction.examples || [],
          providerId: instruction.providerId || '',
        });
      } else {
        // 如果没有配置，初始化空表单
        setFormData({
          subject,
          systemPrompt: '',
          examples: [],
          providerId: '',
        });
      }
    } catch (error: any) {
      // 404 表示该科目还未配置，这是正常情况
      if (error?.response?.status === 404) {
        console.log(`科目 "${subject}" 尚未配置，初始化空表单`);
        setFormData({
          subject,
          systemPrompt: '',
          examples: [],
          providerId: '',
        });
      } else {
        console.error('加载科目指令详情失败:', error);
        // 初始化空表单
        setFormData({
          subject,
          systemPrompt: '',
          examples: [],
          providerId: '',
        });
      }
    }
  };

  // 保存配置
  const handleSave = async () => {
    if (!formData.subject || !formData.systemPrompt) {
      alert('请填写科目名称和系统提示词');
      return;
    }

    try {
      setSaving(true);
      await request.put(`/admin/ai-instructions/${formData.subject}`, {
        systemPrompt: formData.systemPrompt,
        examples: formData.examples,
        providerId: formData.providerId || null,
      });
      alert('保存成功');
      loadInstructions();
    } catch (error: unknown) {
      console.error('保存科目指令失败:', error);
      alert(getErrorMessage(error, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  // 删除配置
  const handleDelete = async () => {
    if (!selectedSubject) return;
    
    if (!confirm(`确定要删除 ${selectedSubject} 的 AI 配置吗？删除后将无法恢复。`)) {
      return;
    }

    try {
      await request.delete(`/admin/ai-instructions/${selectedSubject}`);
      alert('删除成功');
      // 清空表单
      setFormData({
        subject: '',
        systemPrompt: '',
        examples: [],
        providerId: '',
      });
      setSelectedSubject(null);
      // 重新加载列表
      loadInstructions();
    } catch (error: unknown) {
      console.error('删除科目指令失败:', error);
      alert(getErrorMessage(error, '删除失败'));
    }
  };

  // 添加自定义科目
  const handleAddSubject = () => {
    if (!newSubjectName.trim()) {
      alert('请输入科目名称');
      return;
    }

    // 检查是否已存在
    const allSubjects = [...predefinedSubjects, ...customSubjects];
    if (allSubjects.some(s => s.name === newSubjectName.trim())) {
      alert('该科目已存在');
      return;
    }

    // 添加到自定义科目列表
    const newSubject = { name: newSubjectName.trim(), icon: 'school' };
    setCustomSubjects([...customSubjects, newSubject]);
    setShowAddSubjectModal(false);
    setNewSubjectName('');
    
    // 自动选中新添加的科目
    selectSubject(newSubject.name);
  };

  // 从列表中移除科目（仅限自定义科目）
  const handleRemoveSubject = (subjectName: string) => {
    if (!confirm(`确定要从列表中移除 ${subjectName} 吗？如果该科目已配置，配置数据不会被删除。`)) {
      return;
    }

    setCustomSubjects(customSubjects.filter(s => s.name !== subjectName));
    
    // 如果当前选中的是被删除的科目，清空选择
    if (selectedSubject === subjectName) {
      setSelectedSubject(null);
      setFormData({
        subject: '',
        systemPrompt: '',
        examples: [],
        providerId: '',
      });
    }
  };

  // 添加示例对话
  const addExample = () => {
    setFormData({
      ...formData,
      examples: [...formData.examples, { question: '', response: '' }],
    });
  };

  // 删除示例对话
  const removeExample = (index: number) => {
    const newExamples = formData.examples.filter((_, i) => i !== index);
    setFormData({ ...formData, examples: newExamples });
  };

  // 更新示例对话
  const updateExample = (index: number, field: 'question' | 'response', value: string) => {
    const newExamples = [...formData.examples];
    newExamples[index][field] = value;
    setFormData({ ...formData, examples: newExamples });
  };

  // 检查科目是否已配置
  const isSubjectConfigured = (subject: string) => {
    return instructions.some((inst) => inst.subject === subject);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 左侧科目列表 */}
      <aside className="w-80 flex flex-col bg-[#232f48] border-r border-[#324467]">
        <div className="p-6 pb-2">
          <h1 className="text-white text-lg font-bold">科目智能体</h1>
          <p className="text-[#92a4c9] text-sm">管理与配置各学科 AI 老师</p>
        </div>

        {/* 新增科目按钮 */}
        <div className="px-4 pb-2">
          <button
            onClick={() => setShowAddSubjectModal(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增科目
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {/* 预定义科目 */}
          {predefinedSubjects.map((subject) => {
            const isSelected = selectedSubject === subject.name;
            const isConfigured = isSubjectConfigured(subject.name);

            return (
              <div
                key={subject.name}
                onClick={() => selectSubject(subject.name)}
                className={`flex items-center justify-between gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-[#324467]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex items-center justify-center size-10 rounded-lg ${
                      isSelected
                        ? 'bg-primary/20 text-primary'
                        : 'bg-[#1a2332] text-[#5b6b8c]'
                    }`}
                  >
                    <span className="material-symbols-outlined">{subject.icon}</span>
                  </div>
                  <div>
                    <p
                      className={`text-sm font-bold ${
                        isSelected ? 'text-primary' : 'text-white'
                      }`}
                    >
                      {subject.name} AI
                    </p>
                    <p
                      className={`text-xs ${
                        isSelected ? 'text-primary/70' : 'text-[#5b6b8c]'
                      }`}
                    >
                      {isConfigured ? '已配置' : '未配置'}
                    </p>
                  </div>
                </div>
                {isSelected && (
                  <span className="material-symbols-outlined text-primary text-sm">
                    chevron_right
                  </span>
                )}
              </div>
            );
          })}

          {/* 自定义科目 */}
          {customSubjects.length > 0 && (
            <>
              <div className="pt-4 pb-2 px-2">
                <p className="text-xs font-bold text-[#5b6b8c] uppercase">自定义科目</p>
              </div>
              {customSubjects.map((subject) => {
                const isSelected = selectedSubject === subject.name;
                const isConfigured = isSubjectConfigured(subject.name);

                return (
                  <div
                    key={subject.name}
                    className={`flex items-center justify-between gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-primary/10 border border-primary/20'
                        : 'hover:bg-[#324467]'
                    }`}
                  >
                    <div
                      onClick={() => selectSubject(subject.name)}
                      className="flex items-center gap-3 flex-1"
                    >
                      <div
                        className={`flex items-center justify-center size-10 rounded-lg ${
                          isSelected
                            ? 'bg-primary/20 text-primary'
                            : 'bg-[#1a2332] text-[#5b6b8c]'
                        }`}
                      >
                        <span className="material-symbols-outlined">{subject.icon}</span>
                      </div>
                      <div>
                        <p
                          className={`text-sm font-bold ${
                            isSelected ? 'text-primary' : 'text-white'
                          }`}
                        >
                          {subject.name} AI
                        </p>
                        <p
                          className={`text-xs ${
                            isSelected ? 'text-primary/70' : 'text-[#5b6b8c]'
                          }`}
                        >
                          {isConfigured ? '已配置' : '未配置'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSubject(subject.name);
                      }}
                      className="text-red-500 hover:text-red-600 p-1"
                      title="从列表中移除"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </aside>

      {/* 右侧配置面板 */}
      <main className="flex-1 flex flex-col bg-[#111722] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[#5b6b8c]">加载中...</div>
          </div>
        ) : !selectedSubject ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[#5b6b8c]">请选择一个科目进行配置</div>
          </div>
        ) : (
          <>
            {/* 页面标题 */}
            <div className="flex flex-wrap justify-between items-end gap-3 px-8 py-6 border-b border-[#324467]">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <p className="text-white text-3xl font-bold">
                    {selectedSubject} AI 配置
                  </p>
                  {isSubjectConfigured(selectedSubject) && (
                    <span className="bg-green-500/10 text-green-500 text-[10px] font-bold px-2 py-0.5 rounded border border-green-500/20 uppercase">
                      已配置
                    </span>
                  )}
                </div>
                <p className="text-[#92a4c9] text-base">
                  配置 {selectedSubject} 辅导智能体的启发式教学规则及提示词。
                </p>
              </div>
              <div className="flex items-center gap-3">
                {isSubjectConfigured(selectedSubject) && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                    删除配置
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
                >
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  {saving ? '保存中...' : '保存配置'}
                </button>
              </div>
            </div>

            {/* 配置表单 */}
            <div className="px-8 py-6 space-y-6">
              {/* AI 服务商选择 */}
              <div className="bg-[#232f48] rounded-xl border border-[#324467] p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-primary">cloud_sync</span>
                  <h2 className="text-white text-xl font-bold">
                    AI 服务商
                  </h2>
                </div>
                <p className="text-[#92a4c9] text-sm mb-4">
                  选择该科目使用的 AI 服务商。如不选择，将使用系统默认服务商。
                </p>
                <select
                  className="w-full bg-[#1a2332] border-[#324467] text-white rounded-lg px-4 py-3"
                  value={formData.providerId}
                  onChange={(e) =>
                    setFormData({ ...formData, providerId: e.target.value })
                  }
                >
                  <option value="">使用系统默认服务商</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} ({provider.type})
                    </option>
                  ))}
                </select>
                {providers.length === 0 && (
                  <p className="text-amber-500 text-xs mt-2">
                    ⚠️ 暂无可用的 AI 服务商，请先在"AI 服务配置"中添加服务商
                  </p>
                )}
              </div>

              {/* 系统提示词 */}
              <div className="bg-[#232f48] rounded-xl border border-[#324467] p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-primary">psychology</span>
                  <h2 className="text-white text-xl font-bold">
                    系统提示词 (System Prompt)
                  </h2>
                </div>
                <p className="text-[#92a4c9] text-sm mb-4">
                  定义 AI 老师的角色、教学风格和行为准则。这将影响 AI 的所有回复。
                </p>
                <textarea
                  className="w-full bg-[#1a2332] border-[#324467] text-white rounded-lg px-4 py-3 min-h-[300px] font-mono text-sm"
                  value={formData.systemPrompt}
                  onChange={(e) =>
                    setFormData({ ...formData, systemPrompt: e.target.value })
                  }
                  placeholder={`例如：
你是一位经验丰富的${selectedSubject}老师，擅长启发式教学。你的教学风格是：
1. 不直接给出答案，而是通过提问引导学生思考
2. 善于发现学生的思维误区，并用简单的例子帮助理解
3. 鼓励学生自己动手尝试，培养独立解决问题的能力
4. 语言亲切友好，让学生感到轻松愉快

当学生遇到困难时，你会：
- 先了解学生的思路
- 指出思路中的问题
- 提供相关的知识点提示
- 鼓励学生重新尝试`}
                />
              </div>

              {/* 示例对话 */}
              <div className="bg-[#232f48] rounded-xl border border-[#324467] p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">chat</span>
                    <h2 className="text-white text-xl font-bold">
                      示例对话
                    </h2>
                  </div>
                  <button
                    onClick={addExample}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a2332] text-white text-sm font-bold rounded-lg hover:bg-[#324467] transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    添加示例
                  </button>
                </div>
                <p className="text-[#92a4c9] text-sm mb-6">
                  提供一些典型的问答示例，帮助 AI 更好地理解期望的回复风格。
                </p>

                {formData.examples.length === 0 ? (
                  <div className="text-center py-8 text-[#5b6b8c]">
                    暂无示例对话，点击上方按钮添加
                  </div>
                ) : (
                  <div className="space-y-4">
                    {formData.examples.map((example, index) => (
                      <div
                        key={index}
                        className="border border-[#324467] rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[#92a4c9] text-sm font-bold">
                            示例 {index + 1}
                          </span>
                          <button
                            onClick={() => removeExample(index)}
                            className="text-red-500 hover:text-red-600"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              delete
                            </span>
                          </button>
                        </div>

                        <div>
                          <label className="text-[#92a4c9] text-xs font-bold block mb-2">
                            学生问题
                          </label>
                          <textarea
                            className="w-full bg-[#1a2332] border-[#324467] text-white rounded-lg px-3 py-2 text-sm"
                            rows={2}
                            value={example.question}
                            onChange={(e) =>
                              updateExample(index, 'question', e.target.value)
                            }
                            placeholder="输入学生的问题..."
                          />
                        </div>

                        <div>
                          <label className="text-[#92a4c9] text-xs font-bold block mb-2">
                            AI 回复
                          </label>
                          <textarea
                            className="w-full bg-[#1a2332] border-[#324467] text-white rounded-lg px-3 py-2 text-sm"
                            rows={3}
                            value={example.response}
                            onChange={(e) =>
                              updateExample(index, 'response', e.target.value)
                            }
                            placeholder="输入期望的 AI 回复..."
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* 新增科目弹窗 */}
      {showAddSubjectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#232f48] rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="p-6 border-b border-[#324467]">
              <h2 className="text-xl font-bold text-white">
                新增自定义科目
              </h2>
            </div>
            <div className="p-6">
              <label className="block text-sm font-bold text-[#92a4c9] mb-2">
                科目名称
              </label>
              <input
                type="text"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddSubject()}
                placeholder="例如：编程、美术、音乐等"
                className="w-full px-4 py-3 bg-[#1a2332] border border-[#324467] rounded-lg text-white"
                autoFocus
              />
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button
                onClick={() => {
                  setShowAddSubjectModal(false);
                  setNewSubjectName('');
                }}
                className="flex-1 px-4 py-2.5 bg-[#1a2332] text-white rounded-lg hover:bg-[#324467] transition-all"
              >
                取消
              </button>
              <button
                onClick={handleAddSubject}
                className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubjectInstructionConfig;
