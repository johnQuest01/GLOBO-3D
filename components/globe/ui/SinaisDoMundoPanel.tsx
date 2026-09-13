'use client';

import React, { FC, useEffect, useState } from 'react';

import type { Beacon } from '@/realtime/shared/protocol';

/**
 * "Quem quer conversar agora" — o mundo inteiro, sob demanda.
 *
 * POR QUE ELA É O CORAÇÃO DA IDEIA. O globo mostra quem está por perto, e isso
 * é bonito mas é pouco: se ninguém da Rússia estiver online neste minuto,
 * alguém da Nigéria está. Esta lista é onde essa promessa acontece — e é por
 * isso que ela busca no mundo, e não na região.
 *
 * POR QUE ELA PERGUNTA EM VEZ DE RECEBER. Se cada sinal aceso fosse anunciado
 * a cada pessoa conectada, o trabalho cresceria com o PRODUTO dos dois números:
 * com 25 mil sinais e 50 mil conexões seriam mais de um bilhão de entregas por
 * rodada. Perguntando, custa uma consulta por pessoa interessada — e só
 * enquanto ela está olhando esta tela.
 *
 * ATUALIZA SOZINHA A CADA 20 SEGUNDOS, porque "agora" envelhece: a lista é de
 * quem está disponível neste momento, e uma lista velha manda a pessoa chamar
 * quem já foi embora.
 */

const INTERVALO_MS = 20_000;

interface Props {
  aberto: boolean;
  onFechar: () => void;
  sinais: Beacon[];
  total: number;
  meuClientId: string;
  /** Pede a lista ao servidor. `pais` vazio = o mundo todo. */
  onBuscar: (pais?: string) => void;
  onAbrirSinal: (sinal: Beacon) => void;
}

const SinaisDoMundoPanel: FC<Props> = ({
  aberto,
  onFechar,
  sinais,
  total,
  meuClientId,
  onBuscar,
  onAbrirSinal,
}) => {
  const [pais, setPais] = useState('');

  useEffect(() => {
    if (!aberto) return;
    onBuscar(pais.trim() || undefined);
    const timer = window.setInterval(
      () => onBuscar(pais.trim() || undefined),
      INTERVALO_MS,
    );
    return () => window.clearInterval(timer);
  }, [aberto, pais, onBuscar]);

  if (!aberto) return null;

  const outros = sinais.filter((s) => s.clientId !== meuClientId);

  return (
    <div className="fixed inset-0 z-[162] flex items-start justify-center pt-[8vh]">
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-md"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quem quer conversar agora"
        className="relative w-[min(94vw,30rem)] overflow-hidden rounded-3xl bg-white/[0.08]
                   shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-white">
              Quem quer conversar agora
            </h2>
            <p className="text-[11px] text-white/45">
              {total > 0
                ? `${total} ${total === 1 ? 'pessoa' : 'pessoas'} no mundo${
                    total > outros.length ? ` · mostrando ${outros.length}` : ''
                  }`
                : 'ninguém com o sinal aceso agora'}
            </p>
          </div>
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

        {/*
          O FILTRO POR PAÍS é o que torna a lista utilizável quando ela é
          grande: procurar alguém de um lugar específico é o pedido mais comum,
          e sem isto a pessoa teria que rolar por milhares.
        */}
        <div className="border-b border-white/10 px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 focus-within:ring-cyan-400/50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-white/40">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
            </svg>
            <input
              value={pais}
              onChange={(e) => setPais(e.target.value)}
              placeholder="Filtrar por país (ex.: Rússia) — vazio = o mundo"
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
            />
            {pais && (
              <button
                type="button"
                onClick={() => setPais('')}
                aria-label="Limpar filtro"
                className="shrink-0 text-white/40 hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {outros.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-white/40">
              {pais
                ? `Ninguém de "${pais}" com o sinal aceso agora. Tente sem o filtro — o mundo é grande.`
                : 'Ninguém com o sinal aceso agora. Acenda o seu e espere.'}
            </p>
          )}

          {outros.map((s) => (
            <button
              key={s.beaconId}
              type="button"
              onClick={() => onAbrirSinal(s)}
              className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-3
                         text-left last:border-0 hover:bg-white/[0.05]"
            >
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 ring-1 ring-cyan-400/30">
                <span className="absolute h-10 w-10 animate-ping rounded-full bg-cyan-400/15" />
                <span className="text-sm font-semibold text-cyan-200">
                  {(s.nickname ?? '?').charAt(0).toUpperCase()}
                </span>
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-white">
                  {s.nickname ? `@${s.nickname}` : 'Alguém no globo'}
                </span>
                <span className="block truncate text-xs text-white/55">
                  {s.topic ?? 'quer conversar'}
                </span>
              </span>

              {s.pais && (
                <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/60">
                  {s.pais}
                </span>
              )}
            </button>
          ))}
        </div>

        <p className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-white/35">
          A lista se atualiza sozinha. Quem aparece aqui abriu o sinal e quer
          conversar.
        </p>
      </div>
    </div>
  );
};

export default SinaisDoMundoPanel;
