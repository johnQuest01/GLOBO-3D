'use client';

import React, { FC } from 'react';
import { AirplaneIcon } from '@/app/icons/AirplaneIcon';

interface FlightButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isVisible?: boolean; // NOVO: Controla a visibilidade
  className?: string; // NOVO: Permite passar classes de posicionamento (ex: "bottom-20")
}

/**
 * Botão flutuante para abrir o popup de viagem.
 * ATUALIZADO: Agora aceita `isVisible` e `className`.
 */
const FlightButton: FC<FlightButtonProps> = ({
  onClick,
  disabled = false,
  isVisible = true, // Default é visível
  className = 'bottom-4', // Posição default (agora controlada pelo GlobeCanvas)
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Planejar Viagem"
      className={`absolute right-4 z-[100] p-4 rounded-full shadow-lg // --- CORREÇÃO: p-3 para p-4 ---
        bg-cyan-600 text-white
        hover:bg-cyan-700
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-cyan-500
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
      <AirplaneIcon className="w-5 h-5 sm:w-6 sm:h-6" />
    </button>
  );
};

export default FlightButton;
