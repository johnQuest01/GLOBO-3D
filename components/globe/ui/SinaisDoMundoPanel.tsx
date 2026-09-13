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
  /** Pede as recomendacoes: quem escolhe e' o servidor. */
  onBuscarSugestoes: () => void;
  sugestoes: { doEstado: Beacon[]; doPais: Beacon[]; doMundo: Beacon[] };
  onAbrirSinal: (sinal: Beacon) => void;
}

/** Uma pessoa na lista. */
const Pessoa: FC<{ sinal: Beacon; onAbrir: (s: Beacon) => void }> = ({ sinal, onAbrir }) => (
  <button
    type="button"
    onClick={() => onAbrir(sinal)}
    className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-3
               text-left last:border-0 hover:bg-white/[0.05]"
  >
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 ring-1 ring-cyan-400/30">
      <span className="absolute h-10 w-10 animate-ping rounded-full bg-cyan-400/15" />
      <span className="text-sm font-semibold text-cyan-200">
        {(sinal.nickname ?? '?').charAt(0).toUpperCase()}
      </span>
    </span>

    <span className="min-w-0 flex-1">
      <span className="block truncate text-[15px] font-medium text-white">
        {sinal.nickname ? `@${sinal.nickname}` : 'Alguém no globo'}
      </span>
      <span className="block truncate text-xs text-white/55">
        {sinal.topic ?? 'quer conversar'}
      </span>
    </span>

    {sinal.pais && (
      <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/60">
        {sinal.pais}
      </span>
    )}
  </button>
);

/**
 * Uma camada da recomendacao.
 *
 * Mostra o titulo mesmo quando esta vazia, de proposito: "ninguem do seu estado
 * agora" e' informacao — some a camada e a pessoa fica sem saber se procurou.
 */
const Camada: FC<{
  titulo: string;
  vazio: string;
  sinais: Beacon[];
  meuClientId: string;
  onAbrir: (s: Beacon) => void;
}> = ({ titulo, vazio, sinais, meuClientId, onAbrir }) => {
  const lista = sinais.filter((s) => s.clientId !== meuClientId);
  return (
    <div>
      <p className="bg-white/[0.03] px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
        {titulo}
      </p>
      {lista.length === 0 ? (
        <p className="px-4 py-4 text-center text-xs text-white/30">{vazio}</p>
      ) : (
        lista.map((s) => <Pessoa key={s.beaconId} sinal={s} onAbrir={onAbrir} />)
      )}
    </div>
  );
};

const SinaisDoMundoPanel: FC<Props> = ({
  aberto,
  onFechar,
  sinais,
  total,
  meuClientId,
  onBuscar,
  onBuscarSugestoes,
  sugestoes,
  onAbrirSinal,
}) => {
  const [pais, setPais] = useState('');
  /**
   * Duas abas, e a recomendacao vem primeiro.
   *
   * A lista crua e' util para quem procura alguem de um lugar; a recomendacao
   * e' util para quem so' quer conversar — que e' a maioria, e quem abre esta
   * tela sem saber o que procurar.
   */
  const [aba, setAba] = useState<'para-voce' | 'todos'>('para-voce');

  useEffect(() => {
    if (!aberto) return;

    const pedir = () => {
      if (aba === 'para-voce') onBuscarSugestoes();
      else onBuscar(pais.trim() || undefined);
    };

    pedir();
    const timer = window.setInterval(pedir, INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [aberto, aba, pais, onBuscar, onBuscarSugestoes]);

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

        {/* As duas abas. */}
        <div className="flex gap-1 border-b border-white/10 px-3 py-2">
          {(
            [
              ['para-voce', 'Para você'],
              ['todos', 'Todos'],
            ] as const
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              type="button"
              onClick={() => setAba(chave)}
              className={`flex-1 rounded-xl py-1.5 text-sm transition-colors ${
                aba === chave
                  ? 'bg-white/15 font-medium text-white'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {/*
          O FILTRO POR PAÍS só aparece na aba "Todos": na recomendação, quem
          escolhe é o servidor, e um filtro ali brigaria com a escolha dele.
          Procurar alguém de um lugar específico é o pedido mais comum quando a
          lista é grande — sem isto a pessoa teria que rolar por milhares.
        */}
        {aba === 'todos' && (
          <div className="border-b border-white/10 px-4 py-2.5">
            <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 focus-within:ring-cyan-400/50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-white/40">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
              </svg>
              <input
                value={pais}
                onChange={(e) => setPais(e.target.value)}
                placeholder="Filtrar por país — vazio = o mundo"
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
        )}

        <div className="max-h-[52vh] overflow-y-auto">
          {aba === 'para-voce' ? (
            <>
              <Camada
                titulo="No seu estado"
                vazio="Ninguém do seu estado agora."
                sinais={sugestoes.doEstado}
                meuClientId={meuClientId}
                onAbrir={onAbrirSinal}
              />
              <Camada
                titulo="No seu país"
                vazio="Ninguém do seu país agora."
                sinais={sugestoes.doPais}
                meuClientId={meuClientId}
                onAbrir={onAbrirSinal}
              />
              <Camada
                titulo="Pelo mundo"
                vazio="Ninguém no mundo agora. Acenda o seu sinal e espere."
                sinais={sugestoes.doMundo}
                meuClientId={meuClientId}
                onAbrir={onAbrirSinal}
              />
            </>
          ) : (
            <>
              {outros.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-white/40">
                  {pais
                    ? `Ninguém de "${pais}" com o sinal aceso agora. Tente sem o filtro — o mundo é grande.`
                    : 'Ninguém com o sinal aceso agora. Acenda o seu e espere.'}
                </p>
              )}
              {outros.map((s) => (
                <Pessoa key={s.beaconId} sinal={s} onAbrir={onAbrirSinal} />
              ))}
            </>
          )}
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
