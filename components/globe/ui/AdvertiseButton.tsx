// components/globe/ui/AdvertiseButton.tsx
'use client';

import React, { FC, useState, useEffect } from 'react';
// Use react-icons se preferir: import { FaBullhorn } from 'react-icons/fa';
import { BullhornIcon } from '@/app/icons/BullhornIcon'; // Ou use o ícone local

interface AdvertiseButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isVisible?: boolean;
  className?: string;
}

const messages = [
  { text: 'Anuncie aqui!', color: 'bg-gradient-to-r from-purple-500 via-pink-500 to-red-500' },
  { text: 'Seu anúncio aparecerá no globo 3d, para as pessoas do mundo inteiro.', color: 'bg-gradient-to-r from-green-400 via-cyan-500 to-blue-500' },
];

const AdvertiseButton: FC<AdvertiseButtonProps> = ({
  onClick,
  disabled = false,
  isVisible = true,
  className = '',
}) => {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prevIndex) => (prevIndex + 1) % messages.length);
    }, 5000); // Alterna a cada 5 segundos

    return () => clearInterval(interval);
  }, []);

  const currentMessage = messages[messageIndex];

  // Gradiente base para o efeito shimmer
  const shimmerGradient = `linear-gradient(to right, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)`;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={currentMessage.text}
      className={`
        absolute right-4 z-[100] p-0 rounded-lg shadow-lg overflow-hidden group
        text-white font-bold
        h-12 w-56  /* Tamanho retangular */
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-yellow-400
        disabled:opacity-50 disabled:cursor-not-allowed

        ${/* Fundo Neon Dinâmico */''}
        ${currentMessage.color}

        ${/* Lógica de transição e visibilidade */''}
        transition-all duration-300 ease-in-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}

        ${/* Classe de posicionamento */''}
        ${className}

        ${disabled ? 'animate-pulse' : ''}
      `}
    >
      {/* Container interno para layout e shimmer */}
      <div
        className="relative w-full h-full flex items-center justify-center px-4 py-2 animate-shimmer-horizontal"
        style={{
          backgroundImage: shimmerGradient,
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Ícone */}
        <BullhornIcon className="w-6 h-6 mr-3 flex-shrink-0 text-yellow-300 drop-shadow-lg" />

        {/* Texto com fade */}
        <span
          key={messageIndex} // Key força re-render e re-animação
          className="text-xs text-center leading-tight animate-in fade-in duration-500"
        >
          {currentMessage.text}
        </span>
      </div>
    </button>
  );
};

export default AdvertiseButton;