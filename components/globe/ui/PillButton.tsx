// components/ui/PillButton.tsx
'use client';

import React, { FC, ReactNode } from 'react';

// Define as props que o botão aceitará
interface PillButtonProps {
  // AQUI ESTÁ A CORREÇÃO:
  // A prop onClick DEVE aceitar o evento do mouse,
  // pois ela será passada diretamente para o <button> nativo.
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isActive: boolean;
  icon: ReactNode;
  activeIcon?: ReactNode; // Ícone opcional para o estado ativo
  children: ReactNode;
  variant: 'like' | 'save';
  className?: string;
  title?: string;
}

const PillButton: FC<PillButtonProps> = ({
  onClick,
  isActive,
  icon,
  activeIcon,
  children,
  variant,
  className = '',
  title,
}) => {
  // Define os estilos base comuns a todos os botões
  const baseClasses =
    'flex flex-1 items-center justify-center gap-1.5 py-1.5 px-3 text-sm font-semibold rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-gray-50';

  // Define os estilos específicos para cada variante de cor
  const variantClasses = {
    like: {
      active: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
      inactive:
        'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-400',
    },
    save: {
      active: 'bg-cyan-600 text-white hover:bg-cyan-700 focus:ring-cyan-500',
      inactive:
        'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-400',
    },
  };

  // Seleciona as classes corretas com base no estado 'isActive' e na 'variant'
  const stateClasses = isActive
    ? variantClasses[variant].active
    : variantClasses[variant].inactive;

  // Renderiza o ícone correto (ativo ou inativo)
  const currentIcon = isActive && activeIcon ? activeIcon : icon;

  return (
    <button
      type="button"
      // O onClick nativo do <button> passa o 'event'
      // O 'onClick' vindo das props (que agora aceita o 'event')
      // é passado diretamente.
      onClick={onClick}
      className={`${baseClasses} ${stateClasses} ${className}`}
      title={title}
    >
      {currentIcon}
      {children}
    </button>
  );
};

export default PillButton;