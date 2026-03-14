// components/globe/ui/UserProfileButton.tsx
'use client';

import React, { FC } from 'react';
import { UserIcon } from '@/app/icons/UserIcon'; // Importa o novo ícone

interface UserProfileButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isVisible?: boolean;
  className?: string;
}

/**
 * Botão flutuante para abrir o popup de perfil do usuário.
 */
const UserProfileButton: FC<UserProfileButtonProps> = ({
  onClick,
  disabled = false,
  isVisible = true,
  className = 'bottom-52', // Posição default
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Ver Perfil do Usuário"
      className={`absolute right-4 z-[100] p-4 rounded-full shadow-lg // --- CORREÇÃO: p-3 para p-4 ---
        bg-green-600 text-white
        hover:bg-green-700
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-green-500
        disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed

        ${/* Lógica de transição e visibilidade */ ''}
        transition-all duration-300 ease-in-out
        ${
          isVisible
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-10 pointer-events-none'
        }

        ${/* Classe de posicionamento */ ''}
        ${className}

        ${disabled ? 'animate-pulse' : ''}
        `}
    >
      <UserIcon className="w-5 h-5 sm:w-6 sm:h-6" />
    </button>
  );
};

export default UserProfileButton;
