'use client';

import React, { FC } from 'react';

import type { Conversas } from '@/app/hooks/useConversas';
import type { Presence } from '@/realtime/shared/protocol';

/**
 * A lista de conversas.
 *
 * POR QUE ELA PRECISOU EXISTIR. Com a caixa postal, a mensagem chega mesmo com
 * a tela fechada — e sem uma lista, chegava sem que ninguém soubesse: ficava
 * guardada no aparelho, invisível, esperando a pessoa por acaso procurar o
 * remetente na lupa. A funcionalidade inteira dependia de um lugar onde o
 * recado APARECE.
 *
 * A ordem é por mensagem mais recente, como em qualquer aplicativo de conversa:
 * o que acabou de chegar é o que a pessoa está procurando.
 */

interface Props {
  aberto: boolean;
  onFechar: () => void;
  conversas: Conversas;
  naoLidasPorConversa: Record<string, number>;
  /** Quem esta escrevendo agora, por nickname. */
  digitando: Record<string, boolean>;
  presencaPorNickname: Record<string, Presence | null>;
  onAbrir: (com: string) => void;
  onApagar: (com: string) => void;
}

const quando = (t: number) => {
  const d = new Date(t);
  const hoje = new Date().toDateString() === d.toDateString();
  return hoje
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const resumo = (m: { tipo: string; texto?: string; de: string }) => {
  const prefixo = m.de === 'eu' ? 'Você: ' : '';
  if (m.tipo === 'imagem') return `${prefixo}foto`;
  if (m.tipo === 'audio') return `${prefixo}áudio`;
  if (m.tipo === 'video') return `${prefixo}vídeo`;
  return prefixo + (m.texto ?? '');
};

const ConversasPanel: FC<Props> = ({
  aberto,
  onFechar,
  conversas,
  naoLidasPorConversa,
  digitando,
  presencaPorNickname,
  onAbrir,
  onApagar,
}) => {
  if (!aberto) return null;

  const lista = Object.entries(conversas)
    .map(([com, msgs]) => ({ com, ultima: msgs[msgs.length - 1], total: msgs.length }))
    .filter((c) => c.ultima)
    .sort((a, b) => (b.ultima?.quando ?? 0) - (a.ultima?.quando ?? 0));

  return (
    <div className="fixed inset-0 z-[160] flex items-start justify-center pt-[10vh] sm:pt-[12vh]">
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-md"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Suas conversas"
        className="relative w-[min(94vw,30rem)] overflow-hidden rounded-3xl bg-white/[0.08] shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <h2 className="flex-1 text-[15px] font-semibold text-white">Conversas</h2>
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
          {lista.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-white/40">
              Nenhuma conversa ainda. Procure alguém na lupa para começar.
            </p>
          )}

          {lista.map(({ com, ultima }) => {
            const naoLidas = naoLidasPorConversa[com] ?? 0;
            const online = Boolean(presencaPorNickname[com]);
            return (
              <div
                key={com}
                className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0 hover:bg-white/[0.04]"
              >
                <button
                  type="button"
                  onClick={() => onAbrir(com)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="relative shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/80 to-blue-600/80 text-sm font-semibold text-white">
                      {com.charAt(0).toUpperCase()}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-slate-900 ${
                        online ? 'bg-emerald-400' : 'bg-slate-500'
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-[15px] font-medium text-white">@{com}</p>
                      <span className="ml-auto shrink-0 text-[10px] text-white/35">
                        {ultima ? quando(ultima.quando) : ''}
                      </span>
                    </div>
                    {/* Escrevendo agora vale mais que a última mensagem. */}
                    {digitando[com] ? (
                      <p className="truncate text-xs text-cyan-300">
                        digitando<span className="inline-block animate-pulse">…</span>
                      </p>
                    ) : (
                      <p
                        className={`truncate text-xs ${
                          naoLidas > 0 ? 'font-medium text-white/80' : 'text-white/45'
                        }`}
                      >
                        {ultima ? resumo(ultima) : ''}
                      </p>
                    )}
                  </div>
                </button>

                {naoLidas > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-[11px] font-semibold text-white">
                    {naoLidas > 99 ? '99+' : naoLidas}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onApagar(com)}
                  title="Apagar esta conversa deste aparelho"
                  aria-label={`Apagar conversa com ${com}`}
                  className="rounded-full p-1.5 text-white/30 hover:bg-white/10 hover:text-red-300"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        <p className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-white/35">
          O histórico fica só neste aparelho. Apagar aqui não apaga do outro lado.
        </p>
      </div>
    </div>
  );
};

export default ConversasPanel;
