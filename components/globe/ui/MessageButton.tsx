'use client';

import React, { FC } from 'react';
import { MessageIcon } from '@/app/icons/MessageIcon';

interface MessageButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isVisible?: boolean;
  className?: string;
}

const MessageButton: FC<MessageButtonProps> = ({
  onClick,
  disabled = false,
  isVisible = true,
  className = 'bottom-[24.5rem]', // Posicionado logo acima do botão de perfil/anúncio
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Enviar Mensagem ao Mundo"
      className={`absolute right-4 z-[100] p-4 rounded-full shadow-lg
        bg-pink-600 text-white
        hover:bg-pink-700
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-pink-500
        disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed

        transition-all duration-300 ease-in-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}
        ${className}
        ${disabled ? 'animate-pulse' : ''}
      `}
    >
      <MessageIcon className="w-5 h-5 sm:w-6 sm:h-6" />
    </button>
  );
};

export default MessageButton;