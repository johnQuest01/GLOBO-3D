"use client";

import React, { FC } from "react";

/**
 * A pausa — o freio do feed que otimiza tempo de tela.
 *
 * OS DOIS LADOS FORAM PEDIDOS JUNTOS, e é assim que precisam ser lidos: o feed
 * "Para você" aprende o que prende; esta tela devolve a pessoa para fora. Ela
 * aparece a cada vinte minutos seguidos de feed, e não é um aviso de canto que
 * o dedo ignora: cobre a tela, pausa o vídeo, e pede uma decisão.
 *
 * POR QUE "VER O GLOBO" É O BOTÃO PRINCIPAL, e não "sair". Sair é derrota —
 * ninguém escolhe. O globo é a parte do aplicativo que não vicia: é lento,
 * pede intenção, e é o motivo de o app existir. Devolver a pessoa para lá é
 * devolvê-la para o que ela veio fazer.
 *
 * O QUE ESTA TELA NÃO FAZ: bloquear. Um bloqueio de verdade (X minutos por
 * dia, e acabou) é uma decisão que só faz sentido com a pessoa escolhendo o
 * número — é o item de configurações do plano. Esta é a versão que não
 * precisa de configuração para já fazer diferença.
 */

interface Props {
  aberto: boolean;
  /** Minutos seguidos nesta sessão de feed. */
  minutosSeguidos: number;
  /** Minutos somados hoje, em qualquer sessão. */
  minutosHoje: number;
  /** Quantas publicações passaram pela tela nesta sessão. */
  publicacoesVistas: number;
  onVerOGlobo: () => void;
  onContinuar: () => void;
}

const PausaPanel: FC<Props> = ({
  aberto,
  minutosSeguidos,
  minutosHoje,
  publicacoesVistas,
  onVerOGlobo,
  onContinuar,
}) => {
  if (!aberto) return null;

  /*
   * A FRASE MUDA COM O TEMPO, porque a segunda pausa não pode ser igual à
   * primeira — a primeira informa, a segunda insiste, a terceira é franca.
   */
  const frase =
    minutosSeguidos >= 60
      ? "Uma hora seguida aqui. O mundo lá fora continua acontecendo."
      : minutosSeguidos >= 40
        ? "Quarenta minutos. Vale a pena ir ver um desses lugares de verdade?"
        : "Você está no feed há vinte minutos.";

  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pausa"
        className="relative w-full max-w-sm rounded-3xl bg-slate-900/95 p-6 text-center ring-1 ring-white/15"
      >
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/15 text-sky-300">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        <p className="mt-4 text-[17px] font-semibold leading-snug text-white">{frase}</p>

        {/*
          OS NÚMEROS SÃO OS DA PESSOA, não uma média. "Você viu 34 lugares" é
          verificável por ela mesma; "as pessoas passam 40 min" não é sobre
          ela e não convence ninguém.
        */}
        <p className="mt-2 text-[13px] leading-relaxed text-white/55">
          {publicacoesVistas} {publicacoesVistas === 1 ? "lugar" : "lugares"} passaram pela tela.
          {minutosHoje > minutosSeguidos && (
            <>
              {" "}
              Hoje, {minutosHoje} min no total.
            </>
          )}
        </p>

        <button
          type="button"
          onClick={onVerOGlobo}
          className="mt-5 w-full rounded-2xl bg-sky-600 py-3 text-[15px] font-semibold text-white hover:bg-sky-500"
        >
          Ver o globo
        </button>
        <button
          type="button"
          onClick={onContinuar}
          className="mt-2 w-full rounded-2xl py-2.5 text-[13px] font-medium text-white/45 hover:text-white/75"
        >
          Continuar mais um pouco
        </button>
      </div>
    </div>
  );
};

export default PausaPanel;
