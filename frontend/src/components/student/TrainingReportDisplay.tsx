// 训练报告展示组件
import React, { useState } from 'react';

interface TrainingReportDisplayProps {
  report: string; // Markdown 格式的报告内容
}

const TrainingReportDisplay: React.FC<TrainingReportDisplayProps> = ({ report }) => {
  const [isExporting, setIsExporting] = useState(false);

  // 导出报告为 PDF（简化版，实际需要使用 html2pdf 等库）
  const handleExport = () => {
    setIsExporting(true);
    
    // TODO: 实现 PDF 导出功能
    // 可以使用 html2pdf.js 或 jsPDF 库
    setTimeout(() => {
      alert('导出功能开发中...');
      setIsExporting(false);
    }, 1000);
  };

  // 简单的 Markdown 渲染（实际应使用 react-markdown 等库）
  const renderMarkdown = (markdown: string) => {
    // 这里是简化版的 Markdown 渲染
    // 实际项目中应该使用 react-markdown 或 marked 库
    const lines = markdown.split('\n');
    const elements: React.ReactNode[] = [];
    
    lines.forEach((line, index) => {
      // 标题
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={index} className="text-3xl font-bold text-gray-900 mt-8 mb-4">
            {line.substring(2)}
          </h1>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h2 key={index} className="text-2xl font-semibold text-gray-900 mt-6 mb-3">
            {line.substring(3)}
          </h2>
        );
      } else if (line.startsWith('### ')) {
        elements.push(
          <h3 key={index} className="text-xl font-semibold text-gray-800 mt-4 mb-2">
            {line.substring(4)}
          </h3>
        );
      }
      // 列表
      else if (line.startsWith('- ')) {
        elements.push(
          <li key={index} className="ml-6 text-gray-700 mb-1">
            {line.substring(2)}
          </li>
        );
      }
      // 粗体
      else if (line.includes('**')) {
        const parts = line.split('**');
        elements.push(
          <p key={index} className="text-gray-700 mb-2">
            {parts.map((part, i) => 
              i % 2 === 1 ? <strong key={i}>{part}</strong> : part
            )}
          </p>
        );
      }
      // 普通段落
      else if (line.trim()) {
        elements.push(
          <p key={index} className="text-gray-700 mb-2">
            {line}
          </p>
        );
      }
      // 空行
      else {
        elements.push(<div key={index} className="h-2" />);
      }
    });
    
    return elements;
  };

  // 模拟报告数据（用于可视化）
  const mockChartData = {
    diagnosticAccuracy: 65,
    examAccuracy: 85,
    improvement: 20,
    knowledgePoints: [
      { name: '四则运算', diagnostic: 60, exam: 90 },
      { name: '代数方程', diagnostic: 70, exam: 85 },
      { name: '几何图形', diagnostic: 65, exam: 80 },
      { name: '函数应用', diagnostic: 60, exam: 85 },
    ],
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* 头部 */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-blue-500 rounded-full">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">训练报告</h1>
        <p className="text-gray-600">恭喜你完成训练！以下是你的学习成果分析</p>
        
        {/* 导出按钮 */}
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {isExporting ? '导出中...' : '导出 PDF'}
        </button>
      </div>

      {/* 成绩概览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-blue-700 font-medium">诊断测试</span>
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-3xl font-bold text-blue-900">{mockChartData.diagnosticAccuracy}%</p>
          <p className="text-xs text-blue-600 mt-1">初始水平</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-green-700 font-medium">综合考试</span>
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-3xl font-bold text-green-900">{mockChartData.examAccuracy}%</p>
          <p className="text-xs text-green-600 mt-1">最终成绩</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-purple-700 font-medium">进步幅度</span>
            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p className="text-3xl font-bold text-purple-900">+{mockChartData.improvement}%</p>
          <p className="text-xs text-purple-600 mt-1">显著提升</p>
        </div>
      </div>

      {/* 知识点对比图表 */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          知识点掌握对比
        </h2>
        
        <div className="space-y-4">
          {mockChartData.knowledgePoints.map((kp, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{kp.name}</span>
                <div className="flex items-center space-x-4">
                  <span className="text-blue-600">诊断: {kp.diagnostic}%</span>
                  <span className="text-green-600">考试: {kp.exam}%</span>
                  <span className="text-purple-600">+{kp.exam - kp.diagnostic}%</span>
                </div>
              </div>
              <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
                {/* 诊断测试进度 */}
                <div
                  className="absolute top-0 left-0 h-full bg-blue-200 transition-all"
                  style={{ width: `${kp.diagnostic}%` }}
                />
                {/* 综合考试进度 */}
                <div
                  className="absolute top-0 left-0 h-full bg-green-500 opacity-70 transition-all"
                  style={{ width: `${kp.exam}%` }}
                />
                {/* 标签 */}
                <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-medium">
                  <span className="text-blue-800">诊断</span>
                  <span className="text-green-900">考试</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Markdown 报告内容 */}
      <div className="bg-white rounded-lg p-6 border border-gray-200 prose prose-sm max-w-none">
        {renderMarkdown(report)}
      </div>

      {/* 底部操作按钮 */}
      <div className="flex items-center justify-center space-x-4 pt-4">
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
        >
          返回首页
        </button>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="px-6 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isExporting ? '导出中...' : '下载报告'}
        </button>
      </div>

      {/* 鼓励信息 */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-6 border border-yellow-200 text-center">
        <svg className="w-12 h-12 mx-auto text-yellow-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">太棒了！</h3>
        <p className="text-gray-700">
          你已经完成了这次训练，取得了显著的进步。继续保持这种学习状态，你会越来越优秀！
        </p>
      </div>
    </div>
  );
};

export default TrainingReportDisplay;
