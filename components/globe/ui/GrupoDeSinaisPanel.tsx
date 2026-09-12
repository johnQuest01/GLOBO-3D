'use client';

import React, { FC } from 'react';

import type { Beacon, Presence } from '@/realtime/shared/protocol';

/**
 * Quem está chamando naquele ponto do globo.
 *
 * POR QUE ESTA LISTA PRECISOU EXISTIR. Quando o globo cabe na tela, um estado
 * inteiro ocupa poucos pixels: dez sinais acesos em São Paulo não cabem
 * separados, viram um marcador só com a contagem. Sem uma lista, aquele "10"
 * seria um beco — a pessoa veria que há gente e não teria como chamar ninguém,
 * a não ser aproximando o globo até os dez se separarem, o que é trabalho que
 * o aplicativo deveria poupar.
 *
 * O QUE MOSTRA DE CADA UM: o assunto que a pessoa escreveu ao acender o sinal,
 * quando escreveu. É a única coisa que ela decidiu tornar pública ali — e é o
 * bastante para escolher com quem falar. Nome e conta não aparecem: o sinal é
 * um convite aberto, não um cartão de visita.
 */

interface Props {
  /** Nulo = fechado. */
  itens: Beacon[] | null;
  onFechar: () => void;
  meuClientId: string;
  /** Quem já está online, para a lista dizer isso sem consultar de novo. */
  presencaPorClientId?: Record<string, Presence | null>;
  onChamar: (clientId: string) => void;
}

const GrupoDeSinaisPanel: FC<Props> = ({
  itens,
  onFechar,
  meuClientId,
  onChamar,
}) => {
  if (!itens || itens.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[165] flex items-start justify-center pt-[12vh]">
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-md"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quem está chamando aqui"
        className="relative w-[min(94vw,26rem)] overflow-hidden rounded-3xl bg-white/[0.08]
                   shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <h2 className="flex-1 text-[15px] font-semibold text-white">
            {itens.length} querem conversar aqui
          </h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {itens.map((b) => {
            const ehMeu = b.clientId === meuClientId;
            return (
              <div
                key={b.beaconId}
                className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0"
              >
                <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-cyan-400" />

                <p className="min-w-0 flex-1 truncate text-sm text-white/80">
                  {ehMeu ? 'Este é o seu sinal' : (b.topic ?? 'quer conversar')}
                </p>

                {!ehMeu && (
                  <button
                    type="button"
                    onClick={() => onChamar(b.clientId)}
                    className="shrink-0 rounded-full bg-cyan-600 px-4 py-1.5 text-sm
                               font-semibold text-white hover:bg-cyan-500"
                  >
                    Chamar
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-white/35">
          Aproxime o globo para ver cada sinal no seu lugar.
        </p>
      </div>
    </div>
  );
};

export default GrupoDeSinaisPanel;
