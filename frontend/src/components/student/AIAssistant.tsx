// 训练舱 - 右侧 AI 对话框
import React, { useState, useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import type { ChatMessageData } from './ChatMessage';
import { sendAIMessage } from '../../services/studentTrainingService';

interface AIAssistantProps {
  sessionId?: string;
  questionId?: string;
  currentAnswer?: string;
  isCorrect?: boolean;
}

const AIAssistant: React.FC<AIAssistantProps> = ({
  sessionId,
  questionId,
  currentAnswer,
  isCorrect,
}) => {
  const [messages, setMessages] = useState<ChatMessageData[]>([
    {
      id: '1',
      role: 'assistant',
      message: '你好！我是你的 AI 学习助手。如果在答题过程中遇到困难，可以随时向我提问。我会通过启发式的方式引导你思考，而不是直接告诉你答案。',
      timestamp: new Date(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputMessage.trim() || isSending) return;

    // 检查是否有会话 ID
    if (!sessionId) {
      alert('请先开始训练会话');
      return;
    }

    const userMessage: ChatMessageData = {
      id: Date.now().toString(),
      role: 'user',
      message: inputMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setIsSending(true);

    try {
      // 构建上下文
      const context = questionId
        ? {
            questionId,
            answer: currentAnswer,
            isCorrect,
          }
        : undefined;

      // 调用 AI 服务
      const aiResponse = await sendAIMessage(sessionId, inputMessage, context);

      const assistantMessage: ChatMessageData = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        message: aiResponse,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: unknown) {
      console.error('发送消息失败:', error);
      
      // 提取错误消息
      let errorMsg = '抱歉，AI 助手暂时无法响应，请稍后再试。';
      const apiError = error as { response?: { data?: { error?: { message?: string } } } };
      if (apiError.response?.data?.error?.message) {
        errorMsg = apiError.response.data.error.message;
      }

      // 添加错误消息
      const aiErrorMessage: ChatMessageData = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        message: errorMsg,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiErrorMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full bg-gray-50 dark:bg-gray-900 lg:border-l border-gray-200 dark:border-gray-800 flex flex-col">
      {/* 头部 - 仅在桌面端显示（移动端由抽屉头部处理） */}
      <div className="hidden lg:block p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-white">AI 学习助手</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">启发式引导</p>
          </div>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isSending && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
        <div className="flex space-x-2">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="向 AI 助手提问..."
            className="flex-1 p-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
            rows={2}
            disabled={isSending || !sessionId}
          />
          <button
            onClick={handleSend}
            disabled={!inputMessage.trim() || isSending || !sessionId}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              !inputMessage.trim() || isSending || !sessionId
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          提示：按 Enter 发送，Shift + Enter 换行
        </p>
      </div>
    </div>
  );
};

export default AIAssistant;

