'use client';

import React, { FC } from 'react';
import { AnimationState } from '@/app/hooks/useAnimationControls';

interface AdminAnimationPopupProps {
  isOpen: boolean;
  onClose: () => void;
  animationState: AnimationState;
  toggleAnimation: (key: keyof AnimationState) => void;
  stopAllAnimations: () => void;
  startAllAnimations: () => void;
}

// Mapeia as chaves internas para nomes legíveis
const ANIMATION_NAMES: Record<keyof AnimationState, string> = {
  'missile-kiev-moscow': 'Míssil: Kiev ➔ Moscow',
  'missile-moscow-kiev': 'Míssil: Moscow ➔ Kiev',
  'airplane-travel': 'Avião de Viagem (Rotas)',
};

/**
 * Componente Toggle Switch para a UI.
 */
const ToggleSwitch: FC<{
  label: string;
  enabled: boolean;
  onChange: () => void;
}> = ({ label, enabled, onChange }) => (
  <div
    onClick={onChange}
    className="flex items-center justify-between p-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
  >
    <span className="font-medium text-gray-200">{label}</span>
    <div
      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${
        enabled ? 'bg-cyan-500' : 'bg-gray-500'
      }`}
    >
      <span
        className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </div>
  </div>
);

/**
 * Popup modal para o admin controlar as animações.
 */
const AdminAnimationPopup: FC<AdminAnimationPopupProps> = ({
  isOpen,
  onClose,
  animationState,
  toggleAnimation,
  stopAllAnimations,
  startAllAnimations,
}) => {
  if (!isOpen) {
    return null;
  }

  // Pega as chaves do estado para renderizar a lista
  const animationKeys = Object.keys(
    animationState,
  ) as Array<keyof AnimationState>;

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-[110]">
      {/* 1. Overlay */}
      <div
        className="absolute inset-0 bg-black/60 z-10 animate-in fade-in-0 duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 2. Modal Content */}
      <div className="relative z-20 w-[90vw] max-w-md">
        {/* --- CORREÇÃO DE ALTURA --- */}
        {/* max-h-[70vh] (70% da tela) alterado para max-h-[85vh] (85% da tela) */}
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-cyan-700 animate-in fade-in zoom-in-95 duration-300 flex flex-col max-h-[85vh]">
          {/* Cabeçalho */}
          <div className="p-4 border-b border-cyan-700 shrink-0">
            <h2 className="text-xl font-bold text-cyan-400">
              Controle de Animações (Admin)
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Gerencie animações em tempo real para todas as sessões.
            </p>
          </div>

          {/* Corpo Scrollável */}
          <div className="p-6 space-y-4 overflow-y-auto">
            {animationKeys.map((key) => (
              <ToggleSwitch
                key={key}
                label={ANIMATION_NAMES[key] || key}
                enabled={animationState[key]}
                onChange={() => toggleAnimation(key)}
              />
            ))}
          </div>

          {/* Rodapé com Ações Globais */}
          <div className="p-4 flex flex-col sm:flex-row justify-between items-center gap-3 border-t border-gray-700 bg-gray-900 rounded-b-xl shrink-0">
            <button
              type="button"
              onClick={stopAllAnimations}
              className="w-full sm:w-auto px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Parar Todas
            </button>
            <button
              type="button"
              onClick={startAllAnimations}
              className="w-full sm:w-auto px-5 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              Ativar Todas
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAnimationPopup;
