
import React from 'react';
import { DownloadIcon } from './icons/DownloadIcon';
import { BackIcon } from './icons/BackIcon';

const avatarSrc = "https://unica-marketing.de/wp-content/uploads/tel-assist-un-1.webp";

interface HeaderProps {
    onBack?: () => void;
    onDownload?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onBack, onDownload }) => {
  return (
    <header className="flex items-center justify-between p-4 bg-[#343541] shadow-md text-white flex-shrink-0">
      <div className="flex items-center">
        {onBack && (
            <button onClick={onBack} className="mr-4 p-2 rounded-full hover:bg-white/10" aria-label="Zurück">
                <BackIcon className="h-6 w-6" />
            </button>
        )}
        <img src={avatarSrc} alt="Support Avatar" className="h-10 w-10 mr-4 rounded-full" />
        <div>
          <h1 className="text-xl font-bold">UNICA KI-Support</h1>
        </div>
      </div>
      {onDownload && (
        <button onClick={onDownload} className="p-2 rounded-full hover:bg-white/10" aria-label="Chat herunterladen">
            <DownloadIcon className="h-6 w-6" />
        </button>
      )}
    </header>
  );
};
