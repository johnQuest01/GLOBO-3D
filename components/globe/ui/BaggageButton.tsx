'use client';

import React, { FC } from 'react';
import { BaggageIcon } from '@/app/icons/BaggageIcon'; // Importa o ícone

interface BaggageButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isVisible?: boolean; // NOVO: Controla a visibilidade
  className?: string; // NOVO: Permite passar classes de posicionamento
}

/**
 * Botão flutuante para abrir o popup de bagagem.
 * ATUALIZADO: Agora aceita `isVisible` e `className`.
 */
const BaggageButton: FC<BaggageButtonProps> = ({
  onClick,
  disabled = false,
  isVisible = true, // Default é visível
  className = 'bottom-20', // Posição default (agora controlada pelo GlobeCanvas)
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Registrar Bagagem"
      className={`absolute right-4 z-[100] p-4 rounded-full shadow-lg // --- CORREÇÃO: p-3 para p-4 ---
      bg-indigo-600 text-white
      hover:bg-indigo-700
      focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500
      disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed

      ${/* Lógica de transição e visibilidade */ ''}
      transition-all duration-300 ease-in-out
      ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-10 pointer-events-none'
      }

      ${/* Classe de posicionamento vinda do GlobeCanvas */ ''}
      ${className}
     
      ${disabled ? 'animate-pulse' : ''}
      `}
    >
      <BaggageIcon className="w-5 h-5 sm:w-6 sm:h-6" />
    </button>
  );
};

export default BaggageButton;
