// components/globe/ui/CoffeeButton.tsx
'use client';

import React, { FC } from 'react';
import { CoffeeIcon } from '@/app/icons/CoffeeIcon'; // Importa o ícone

interface CoffeeButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isVisible?: boolean;
  className?: string;
}

/**
 * Botão flutuante para abrir o popup de "Notícias Dinâmicas".
 */
const CoffeeButton: FC<CoffeeButtonProps> = ({
  onClick,
  disabled = false,
  isVisible = true,
  className = 'bottom-36', // Posição default
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Ver Notícias Dinâmicas"
      className={`absolute right-4 z-[100] p-3 rounded-full shadow-lg
      bg-white text-gray-900 /* Fundo branco, ícone escuro */
      hover:bg-gray-200
      focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-gray-400
      disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed

      ${/* Lógica de transição e visibilidade */''}
      transition-all duration-300 ease-in-out
      ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-10 pointer-events-none'
      }

      ${/* Classe de posicionamento */''}
      ${className}

      ${disabled ? 'animate-pulse' : ''}
      `}
    >
      <CoffeeIcon className="w-5 h-5 sm:w-6 sm:h-6" />
    </button>
  );
};

export default CoffeeButton;