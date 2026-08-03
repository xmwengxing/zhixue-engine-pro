// 训练舱右侧栏 - AI 助手
import React, { useState, useRef, useEffect } from 'react';
import type { TrainingSession, Question } from '../../pages/student/TrainingCabin';

interface TrainingRightPanelProps {
  session: TrainingSession;
  currentQuestion: Question | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const TrainingRightPanel: React.FC<TrainingRightPanelProps> = ({
  session,
  currentQuestion,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 考试模式：综合考试进行中，AI 助教暂时收起（交卷后自动解锁）
  const isExamMode = session.phase === 'FINAL_EXAM';
  const isAIDisabled = isExamMode;

  // 交卷后的「逐题精讲」数据：后端 finalExamData.results.evaluations
  const examEvaluations = session.finalExamData?.results?.evaluations ?? [];
  const wrongQuestions = examEvaluations.filter((e) => !e.isCorrect);
  // 考试已结束且拿到判分结果 → 进入考后精讲模式
  const isExamReview = session.phase === 'COMPLETED' && examEvaluations.length > 0;

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 发送消息（可传入 override 直接发送，用于快捷提问 / 逐题精讲）
  const handleSendMessage = async (override?: string) => {
    const outgoing = (override ?? inputMessage).trim();
    if (!outgoing || isSending || isAIDisabled) {
      return;
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: outgoing,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsSending(true);

    try {
      // 调用 API 发送消息
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/student/training/chat/${session.id}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          message: outgoing,
          context: {
            questionId: currentQuestion?.id,
            mode: isExamReview ? 'EXAM_REVIEW' : undefined,
          },
        }),
      });
      
      if (!response.ok) {
        // 后端错误统一形如 { error: { code, message } }，兼容平铺 message
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData?.error?.message || errorData?.message || '发送消息失败'
        );
      }
      
      const data = await response.json();
      
      const aiMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('发送消息失败:', error);
      // 失败不弹窗打断，直接以助手气泡的形式提示，保留上下文
      setMessages(prev => [
        ...prev,
        {
          id: `msg-err-${Date.now()}`,
          role: 'assistant',
          content: `抱歉，我这边暂时没能回复（${
            error instanceof Error ? error.message : '网络异常'
          }）。你可以稍后再问一次。`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // 处理回车发送
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 快捷提问按钮（考后精讲阶段换成复盘导向的问题）
  const quickQuestions = isExamReview
    ? [
        '帮我把这次考试的错题逐题讲一遍',
        '我这次暴露出哪些薄弱知识点？',
        '接下来我该怎么针对性练习？',
        '这次比诊断测试时进步了吗？',
      ]
    : [
        '这道题怎么做？',
        '我不理解题意',
        '能给我一些提示吗？',
        '这个知识点是什么？',
      ];

  const handleQuickQuestion = (question: string) => {
    setInputMessage(question);
  };

  // 逐题精讲：点击直接发问，AI 针对该题讲解
  const handleExplainQuestion = (index: number, stem: string) => {
    const brief = stem.length > 40 ? `${stem.slice(0, 40)}…` : stem;
    void handleSendMessage(`请帮我讲解综合考试第 ${index + 1} 题：${brief}`);
  };

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex-shrink-0 p-4 border-b border-[#324467] bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">
              {isExamReview ? 'AI 考后精讲' : 'AI 学习助手'}
            </h3>
            <p className="text-xs text-[#92a4c9]">
              {isExamMode
                ? '考试模式 · 交卷后自动解锁'
                : isExamReview
                ? '已解锁 · 可逐题精讲'
                : '随时为你答疑解惑'}
            </p>
          </div>
          {isExamMode ? (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">
              考试中
            </span>
          ) : (
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          )}
        </div>
      </div>

      {/* 考试模式提示卡（替代生硬的"已禁用"） */}
      {isExamMode && (
        <div className="flex-shrink-0 m-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-start space-x-3">
            <span className="text-lg leading-none mt-0.5">📝</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-300">考试模式进行中</p>
              <p className="text-xs text-yellow-200/90 mt-1 leading-relaxed">
                综合考试是检验这段训练成果的环节，所以我先安静一会儿，由你独立作答，这样结果才准确。
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-yellow-200/80">
                <li className="flex items-start">
                  <span className="mr-1.5">•</span>
                  <span>不确定的题先按思路作答，交卷后我会逐题带你复盘</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-1.5">•</span>
                  <span>做题过程会被完整记录，错题自动进错题本</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-1.5">•</span>
                  <span className="text-yellow-300 font-medium">交卷后我会立刻解锁，为你逐题精讲</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 交卷后：AI 解锁 + 逐题精讲入口 */}
      {isExamReview && (
        <div className="flex-shrink-0 m-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="flex items-start space-x-3">
            <span className="text-lg leading-none mt-0.5">🎉</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-300">考试已结束，AI 精讲已解锁</p>
              <p className="text-xs text-green-200/85 mt-1">
                共 {examEvaluations.length} 题
                {wrongQuestions.length > 0
                  ? `，其中 ${wrongQuestions.length} 题需要复盘。点下面任意一题，我马上讲给你听。`
                  : '，全部答对！可以问我怎么继续拔高。'}
              </p>

              {wrongQuestions.length > 0 && (
                <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {wrongQuestions.map((item) => (
                    <button
                      key={item.questionIndex}
                      onClick={() =>
                        handleExplainQuestion(item.questionIndex, item.question?.stem || '')
                      }
                      disabled={isSending}
                      className="w-full text-left px-3 py-2 rounded-lg bg-[#232f48] border border-[#324467] hover:border-green-500/50 hover:bg-[#1a2332] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex-shrink-0 text-[10px] font-semibold text-red-300 bg-red-500/15 border border-red-500/30 rounded px-1.5 py-0.5">
                          第 {item.questionIndex + 1} 题
                        </span>
                        <span className="text-xs text-[#c3cfe6] truncate">
                          {item.question?.knowledgePoint || item.question?.stem || '错题精讲'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isAIDisabled && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <svg className="w-16 h-16 text-[#92a4c9]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <div>
              <p className="text-[#92a4c9] font-medium">
                {isExamReview ? 'AI 精讲已就位' : 'AI 助手在线'}
              </p>
              <p className="text-sm text-[#5b6b8c] mt-1">
                {isExamReview ? '想从哪道题开始复盘？' : '遇到困难？随时向我提问'}
              </p>
            </div>

            {/* 快捷提问按钮 */}
            {(currentQuestion || isExamReview) && (
              <div className="w-full max-w-xs space-y-2">
                <p className="text-xs text-[#5b6b8c] text-left">快捷提问：</p>
                {quickQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleQuickQuestion(question)}
                    className="w-full text-left px-3 py-2 text-sm text-[#c3cfe6] bg-[#232f48] border border-[#324467] rounded-lg hover:bg-[#1a2332] hover:border-[#324467] transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-[#1a2332] text-white'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              <p
                className={`text-xs mt-2 ${
                  message.role === 'user' ? 'text-blue-100' : 'text-[#5b6b8c]'
                }`}
              >
                {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex justify-start">
            <div className="bg-[#1a2332] rounded-lg px-4 py-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-[#5b6b8c] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-[#5b6b8c] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-[#5b6b8c] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="flex-shrink-0 p-4 border-t border-[#324467] bg-[#232f48]">
        {!isAIDisabled ? (
          <div className="space-y-2">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入你的问题... (Shift+Enter 换行)"
              disabled={isSending}
              className="w-full px-3 py-2 border border-[#324467] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-[#1a2332] disabled:cursor-not-allowed"
              rows={3}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#5b6b8c]">
                {isExamReview
                  ? '考试已结束，我可以直接讲解答案与思路'
                  : 'AI 会引导你思考，而不是直接给答案'}
              </p>
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim() || isSending}
                className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:bg-[#324467] disabled:cursor-not-allowed transition-colors"
              >
                {isSending ? '发送中...' : '发送'}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 space-y-1">
            <p className="text-sm text-[#92a4c9]">考试模式 · AI 已暂时收起</p>
            <p className="text-xs text-[#5b6b8c]">交卷后自动解锁，为你逐题精讲</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingRightPanel;
