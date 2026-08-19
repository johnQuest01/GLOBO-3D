'use client';

import React, { FC, useEffect, useState } from 'react';

/**
 * Relógio do modo Relógio.
 *
 * Existe para tornar visível o que o globo já está fazendo: o terminador é
 * desenhado a partir do horário UTC, e sem um relógio à vista não há como
 * perceber que a linha entre o dia e a noite corresponde a este instante.
 *
 * Mostra os dois horários porque servem a coisas diferentes — o UTC é o que
 * comanda a iluminação, o local é o que a pessoa reconhece.
 */

interface GlobeClockProps {
  isVisible?: boolean;
  className?: string;
}

function doisDigitos(valor: number): string {
  return valor.toString().padStart(2, '0');
}

const GlobeClock: FC<GlobeClockProps> = ({ isVisible = true, className = '' }) => {
  // Começa nulo e só preenche no cliente: renderizar a hora no servidor daria
  // divergência de hidratação, porque o relógio do servidor não é o do usuário.
  const [agora, setAgora] = useState<Date | null>(null);

  useEffect(() => {
    setAgora(new Date());
    const timer = window.setInterval(() => setAgora(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!agora) return null;

  const utc = `${doisDigitos(agora.getUTCHours())}:${doisDigitos(
    agora.getUTCMinutes(),
  )}:${doisDigitos(agora.getUTCSeconds())}`;

  const local = `${doisDigitos(agora.getHours())}:${doisDigitos(
    agora.getMinutes(),
  )}`;

  // Longitude onde é meio-dia agora — a mesma conta que posiciona o Sol.
  const horasUtc =
    agora.getUTCHours() + agora.getUTCMinutes() / 60 + agora.getUTCSeconds() / 3600;
  const meioDiaEm = (12 - horasUtc) * 15;
  const hemisferio = meioDiaEm >= 0 ? 'L' : 'O';

  return (
    <div
      className={`absolute z-40 rounded-2xl bg-black/55 backdrop-blur-sm
        px-3 py-2 shadow-lg ring-1 ring-white/10 select-none
        transition-all duration-300
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}
        ${className}`}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-lg font-bold leading-none text-cyan-300 tabular-nums">
          {utc}
        </span>
        <span className="text-[10px] font-semibold text-cyan-500/80">UTC</span>
      </div>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-sm leading-none text-white/80 tabular-nums">
          {local}
        </span>
        <span className="text-[10px] text-white/50">aqui</span>
      </div>

      <div className="mt-1.5 border-t border-white/10 pt-1 text-[10px] leading-tight text-white/45">
        meio-dia em {Math.abs(meioDiaEm).toFixed(0)}°{hemisferio}
      </div>
    </div>
  );
};

export default GlobeClock;
