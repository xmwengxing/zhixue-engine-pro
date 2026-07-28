// 聊天消息组件
import React from 'react';

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  timestamp: Date;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  return (
    <div
      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[80%] rounded-lg p-3 ${
          message.role === 'user'
            ? 'bg-blue-500 text-white'
            : 'bg-white text-gray-800 border border-gray-200 shadow-sm'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.message}</p>
        <p
          className={`text-xs mt-1 ${
            message.role === 'user' ? 'text-blue-100' : 'text-gray-400'
          }`}
        >
          {message.timestamp.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
};

export default ChatMessage;
