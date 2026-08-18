'use client';

import React, { FC } from 'react';

/**
 * Os dois estados do globo:
 *
 * - `padrao`  — o zoom manda. De longe o planeta aparece de noite, com as luzes
 *               das cidades acesas; ao aproximar, vira dia.
 * - `relogio` — a realidade manda. Metade escura e metade clara conforme a
 *               posição real do Sol agora, andando sozinha com o relógio.
 */
export type GlobeMode = 'padrao' | 'relogio';

interface GlobeModeToggleProps {
  mode: GlobeMode;
  onChange: (mode: GlobeMode) => void;
  isVisible?: boolean;
  className?: string;
}

const OPTIONS: {
  value: GlobeMode;
  label: string;
  title: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'padrao',
    label: 'Padrão',
    title: 'Padrão — de longe noite com luzes, de perto dia',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    value: 'relogio',
    label: 'Relógio',
    title: 'Relógio — dia e noite na posição real do Sol agora',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 7v5.2l3.4 2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

const GlobeModeToggle: FC<GlobeModeToggleProps> = ({
  mode,
  onChange,
  isVisible = true,
  className = '',
}) => (
  <div
    role="group"
    aria-label="Modo de exibição do globo"
    className={`absolute z-40 flex items-center gap-1 rounded-full
      bg-black/55 backdrop-blur-sm p-1 shadow-lg ring-1 ring-white/10
      transition-all duration-300
      ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}
      ${className}`}
  >
    {OPTIONS.map((option) => {
      const isActive = mode === option.value;
      return (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={isActive}
          onClick={(e) => {
            e.stopPropagation();
            onChange(option.value);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5
            text-xs font-semibold transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-cyan-400
            ${
              isActive
                ? 'bg-cyan-600 text-white shadow'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
        >
          {option.icon}
          <span className="hidden sm:inline">{option.label}</span>
        </button>
      );
    })}
  </div>
);

export default GlobeModeToggle;
