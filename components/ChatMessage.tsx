
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, Role } from '../types';

interface ChatMessageProps {
  message: Message;
  isBotSpeaking?: boolean;
}

const avatarSrc = "https://unica-marketing.de/wp-content/uploads/tel-assist-un-1.webp";

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isBotSpeaking }) => {
  const isModel = message.role === Role.Model;

  if (isModel) {
    return (
      <div className="flex items-start space-x-4 max-w-2xl">
        <div className="relative">
            <img src={avatarSrc} alt="Support Avatar" className="h-8 w-8 rounded-full" />
            {isBotSpeaking && (
                <div className="absolute inset-0 rounded-full bg-blue-400 opacity-75 animate-ping"></div>
            )}
        </div>
        <div className="flex-1">
          <div className="bg-gray-200 rounded-lg p-3 text-gray-800">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node, ...props }) => (
                  <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" />
                ),
                ul: ({ node, ...props }) => <ul {...props} className="list-disc list-inside space-y-1 my-2" />,
                ol: ({ node, ...props }) => <ol {...props} className="list-decimal list-inside space-y-1 my-2" />,
                p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0" />,
                strong: ({ node, ...props }) => <strong {...props} className="font-semibold" />,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="max-w-2xl">
        <div className="bg-[#343541] rounded-lg p-3 text-white">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </div>
  );
};
