
import React from 'react';

interface QuickReplyButtonsProps {
  replies: string[];
  onSelect: (reply: string) => void;
}

export const QuickReplyButtons: React.FC<QuickReplyButtonsProps> = ({ replies, onSelect }) => {
  return (
    <div className="flex flex-col items-start space-y-2 max-w-2xl">
      {replies.map((reply) => (
        <button
          key={reply}
          onClick={() => onSelect(reply)}
          className="bg-white border border-gray-300 text-gray-700 text-left px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {reply}
        </button>
      ))}
    </div>
  );
};
