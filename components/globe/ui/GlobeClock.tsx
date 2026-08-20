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
 *
 * FORMATO: uma faixa horizontal única, com a mesma altura (h-9) e o mesmo
 * acabamento do seletor Padrão/Relógio, para os dois lerem como uma só linha
 * de interface no topo.
 *
 * O que some conforme a tela encolhe não é arbitrário — o relógio divide a
 * linha com o seletor, que fica ancorado à esquerda. Medido em 360px (a
 * largura de Android comum), a versão completa encostava no seletor com 1px
 * de folga. Então:
 *   - abaixo de `md` (768px) caem os rótulos "aqui" e a longitude do meio-dia.
 *     O degrau é `md` e não `sm` por um motivo medido: em 640px o seletor
 *     também cresce (ganha os textos "Padrão" e "Relógio"), então os dois
 *     inchavam na mesma largura e se encontravam — entre 640 e 705px o relógio
 *     era desenhado por cima do seletor. Em 768px sobram 32px entre eles;
 *   - abaixo de 400px caem os segundos, que são decorativos: o Sol anda
 *     0,004°/s e o terminador não se mexe visivelmente em um segundo;
 *   - abaixo de 360px (tela antiga, onde o seletor sozinho ocupa um terço da
 *     largura) sobra só o UTC, que é o horário que comanda a iluminação.
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

  const utcHoraMinuto = `${doisDigitos(agora.getUTCHours())}:${doisDigitos(
    agora.getUTCMinutes(),
  )}`;
  const utcSegundos = `:${doisDigitos(agora.getUTCSeconds())}`;

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
      className={`absolute z-40 flex h-9 items-center gap-1.5 whitespace-nowrap
        rounded-full bg-black/55 backdrop-blur-sm px-2.5 md:px-3.5
        shadow-lg ring-1 ring-white/10 select-none
        transition-all duration-300
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}
        ${className}`}
    >
      <span className="font-mono text-xs md:text-sm font-bold leading-none text-cyan-300 tabular-nums">
        {utcHoraMinuto}
        <span className="max-[399px]:hidden">{utcSegundos}</span>
      </span>
      <span className="text-[10px] font-semibold leading-none text-cyan-500/80">
        UTC
      </span>

      <span
        className="h-3.5 w-px bg-white/15 max-[359px]:hidden"
        aria-hidden="true"
      />

      <span className="font-mono text-xs md:text-sm leading-none text-white/80 tabular-nums max-[359px]:hidden">
        {local}
      </span>
      <span className="hidden text-[10px] leading-none text-white/50 md:inline">
        aqui
      </span>

      <span className="hidden h-3.5 w-px bg-white/15 md:block" aria-hidden="true" />

      <span className="hidden text-[10px] leading-none text-white/45 md:inline">
        meio-dia em {Math.abs(meioDiaEm).toFixed(0)}°{hemisferio}
      </span>
    </div>
  );
};

export default GlobeClock;
