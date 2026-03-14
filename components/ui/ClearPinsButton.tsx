import React from 'react';
import TrashIcon from '@/app/icons/TrashIcon';

export type ClearPinsButtonProps = {
  onClick: () => void;
  isVisible: boolean;
  className?: string;
};

const ClearPinsButton: React.FC<ClearPinsButtonProps> = ({
  onClick,
  isVisible,
  className = '',
}) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    onPointerDown={(e) => e.stopPropagation()}
    title="Limpar todos os marcadores"
    className={`absolute z-40 p-3 sm:p-4 rounded-full text-white bg-red-600/80 hover:bg-red-500 transition-all duration-300 shadow-lg focus:outline-none focus:ring-2 focus:ring-red-400 ${
      // --- CORREÇÃO: p-2.5 para p-3 ---
      isVisible
        ? 'opacity-100 translate-y-0'
        : 'opacity-0 translate-y-10 pointer-events-none'
    } ${className}`}
  >
    <TrashIcon className="w-5 h-5 sm:w-6 sm:h-6" />
  </button>
);

export default ClearPinsButton;
