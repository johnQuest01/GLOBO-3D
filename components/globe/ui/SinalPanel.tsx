'use client';

import React, { FC } from 'react';

import type { Beacon } from '@/realtime/shared/protocol';

/**
 * O sinal de alguém, aberto.
 *
 * POR QUE ELE PRECISOU DE UMA TELA. Tocar num sinal disparava, na hora, um
 * pedido de conexão — sem dizer quem era a pessoa, o que ela queria conversar,
 * nem onde no mundo ela estava. Era um convite às cegas dos dois lados: quem
 * tocava não sabia para quem, e quem recebia via um pedido vindo do nada.
 *
 * Agora o toque abre isto. É pouca coisa na tela de propósito — o sinal é um
 * convite aberto, não um perfil —, mas é o bastante para decidir: o assunto
 * que a pessoa escreveu, de onde ela está chamando, e quanto tempo o sinal
 * ainda vale.
 *
 * DUAS PORTAS, e elas são diferentes: "Conversar" abre a caixa de mensagens,
 * que funciona mesmo se a pessoa sair no segundo seguinte; "Chamar em vídeo"
 * precisa dos dois ali, agora, e por isso só aparece quando há nickname e a
 * chamada é possível.
 */

interface Props {
  /** Nulo = fechado. */
  sinal: Beacon | null;
  onFechar: () => void;
  meuClientId: string;
  onConversar: (nickname: string) => void;
  onChamarVideo: (clientId: string) => void;
  /** Ver quem e' antes de chamar. So' faz sentido com nickname. */
  onVerPerfil?: (nickname: string) => void;
}

/** "faltam 12 min" — o sinal tem hora para acabar, e isso muda a decisão. */
function tempoQueResta(expiraEm: number): string {
  const seg = Math.max(0, Math.round((expiraEm - Date.now()) / 1000));
  if (seg < 60) return `${seg}s`;
  const min = Math.round(seg / 60);
  return min < 60 ? `${min} min` : `${Math.round(min / 60)} h`;
}

/** "são paulo" → "São Paulo". O mapa guarda em minúsculas. */
function comoNomeProprio(chave: string): string {
  return chave
    .split(' ')
    .map((p) => (p.length > 2 ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(' ');
}

const SinalPanel: FC<Props> = ({
  sinal,
  onFechar,
  meuClientId,
  onConversar,
  onChamarVideo,
  onVerPerfil,
}) => {
  if (!sinal) return null;

  const ehMeu = sinal.clientId === meuClientId;
  const nickname = sinal.nickname;

  return (
    <div className="fixed inset-0 z-[165] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-md"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sinal de quem quer conversar"
        className="relative w-full rounded-t-3xl bg-white/[0.08] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]
                   shadow-2xl ring-1 ring-white/15 backdrop-blur-xl sm:w-[min(92vw,24rem)] sm:rounded-3xl"
      >
        <div className="flex items-start gap-3">
          <span className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 ring-1 ring-cyan-400/40">
            <span className="absolute h-11 w-11 animate-ping rounded-full bg-cyan-400/20" />
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-cyan-300">
              <path d="M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0" strokeLinecap="round" />
              <circle cx="12" cy="16.5" r="1.6" />
            </svg>
          </span>

          <div className="min-w-0 flex-1">
            {nickname && !ehMeu && onVerPerfil ? (
              <button
                type="button"
                onClick={() => onVerPerfil(nickname)}
                className="block max-w-full truncate text-left text-[15px] font-semibold
                           text-white underline-offset-2 hover:underline"
              >
                @{nickname}
              </button>
            ) : (
              <p className="truncate text-[15px] font-semibold text-white">
                {ehMeu ? 'Este é o seu sinal' : nickname ? `@${nickname}` : 'Alguém no globo'}
              </p>
            )}
            <p className="mt-0.5 text-sm text-white/70">
              {sinal.topic ?? 'quer conversar'}
            </p>
            <p className="mt-1 text-[11px] text-white/40">
              {comoNomeProprio(sinal.regionKey)} · apaga em {tempoQueResta(sinal.expiresAt)}
            </p>
          </div>

          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="shrink-0 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {ehMeu ? (
          <p className="mt-5 rounded-xl bg-white/5 px-3 py-2.5 text-center text-xs text-white/50">
            Quem quiser conversar vai ver este sinal e pode te chamar.
          </p>
        ) : (
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              disabled={!nickname}
              onClick={() => nickname && onConversar(nickname)}
              className="flex-1 rounded-xl bg-cyan-600 py-3 font-semibold text-white
                         hover:bg-cyan-500 disabled:bg-white/10 disabled:text-white/30"
            >
              Conversar
            </button>

            <button
              type="button"
              onClick={() => onChamarVideo(sinal.clientId)}
              title="Chamar em vídeo"
              aria-label="Chamar em vídeo"
              className="rounded-xl bg-white/10 px-4 text-white/80 hover:bg-white/20"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path
                  d="M15 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3.5l6 3.5V7z"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}

        {!nickname && !ehMeu && (
          <p className="mt-2 text-center text-[11px] text-white/35">
            Esta pessoa ainda não escolheu um nome público, então só dá para
            chamar em vídeo enquanto ela estiver online.
          </p>
        )}
      </div>
    </div>
  );
};

export default SinalPanel;
