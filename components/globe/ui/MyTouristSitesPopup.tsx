// components/globe/ui/MyTouristSitesPopup.tsx
'use client';
import React, { FC } from 'react';

interface MyTouristSitesPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const MyTouristSitesPopup: FC<MyTouristSitesPopupProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-[110]">
      <div
        className="absolute inset-0 bg-black/60 z-10"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-20 w-[90vw] max-w-md">
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-cyan-700 animate-in fade-in zoom-in-95 duration-300">
          <div className="p-4 border-b border-cyan-700">
            <h2 className="text-xl font-bold text-cyan-400">
              Meus Locais Turísticos
            </h2>
          </div>
          <div className="p-6">
            <p className="text-gray-300 text-center">
               Meus Locais Turísticos
            </p>
          </div>
          <div className="p-4 flex justify-end border-t border-gray-700 bg-gray-900 rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default MyTouristSitesPopup;