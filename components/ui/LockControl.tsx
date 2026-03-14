import React from 'react';
import LockIcon from '@/app/icons/LockIcon';
import EyeOffIcon from '@/app/icons/EyeOffIcon';

export type LockControlProps = {
  isVisible: boolean;
  onLockClick: () => void;
  // --- CORREÇÃO: Adiciona a prop className opcional ---
  className?: string;
};

const LockControl: React.FC<LockControlProps> = ({
  isVisible,
  onLockClick,
  // --- CORREÇÃO: Aceita a prop className, com valor padrão '' ---
  className = '',
}) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onLockClick();
    }}
    onPointerDown={(e) => e.stopPropagation()}
    title={isVisible ? 'Ocultar UI' : 'Mostrar UI'}
    // --- CORREÇÃO: Mescla as classes internas com a className passada via props ---
    className={`absolute bottom-4 right-4 z-[60] p-3 rounded-full text-white bg-white/10 hover:bg-white/20 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white ${className}`}
  >
    {isVisible ? <LockIcon /> : <EyeOffIcon />}
  </button>
);

export default LockControl;