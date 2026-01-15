
import React, { useState } from 'react';
import { SendIcon } from './icons/SendIcon';

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, isLoading }) => {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(text);
    setText('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center p-2 border border-gray-300 rounded-lg bg-white shadow-sm"
    >
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Hier Frage stellen.."
        className="flex-1 border-none focus:ring-0 text-gray-800 placeholder-gray-400"
        disabled={isLoading}
      />
      <button
        type="submit"
        disabled={isLoading || !text.trim()}
        className="p-2 rounded-md text-gray-500 hover:text-gray-800 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
        aria-label="Nachricht senden"
      >
        <SendIcon className="h-6 w-6" />
      </button>
    </form>
  );
};
