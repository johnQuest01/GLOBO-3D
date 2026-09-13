'use client';

import React, { FC, useEffect, useState } from 'react';

/**
 * "Aceito conversa de qualquer pessoa do mundo."
 *
 * POR QUE ELE EXISTE JUNTO COM A RECOMENDAÇÃO, e não depois. Recomendar alguém
 * é mostrar o nome dessa pessoa a estranhos e convidá-los a chamá-la. Um
 * aplicativo que faz isso sem oferecer a saída está decidindo pela pessoa — e a
 * primeira a se arrepender seria justamente quem ele deveria proteger.
 *
 * O QUE DESLIGAR FAZ, dito na própria tela: você some das recomendações e para
 * de receber a PRIMEIRA mensagem de quem não te conhece. Quem já conversou com
 * você continua conversando; isso é conversa em andamento, não porta aberta.
 *
 * O ESTADO VEM DO SERVIDOR ao abrir. Um interruptor que não sabe se está ligado
 * é um interruptor que a pessoa desliga sem querer.
 */

const BotaoAbertoAConversas: FC = () => {
  const [aberto, setAberto] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch('/api/users/aberto');
        if (!r.ok) return;
        const d = (await r.json()) as { aberto?: boolean };
        if (vivo && typeof d.aberto === 'boolean') setAberto(d.aberto);
      } catch {
        /* sem resposta: o interruptor não aparece, em vez de mentir */
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (aberto === null) return null;

  const alternar = async () => {
    setOcupado(true);
    const novo = !aberto;
    try {
      const r = await fetch('/api/users/aberto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aberto: novo }),
      });
      if (r.ok) setAberto(novo);
    } catch {
      /* falhou: fica como estava, sem fingir que mudou */
    } finally {
      setOcupado(false);
    }
  };

  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={alternar}
      className="flex w-full items-start gap-2 border-b border-white/10 px-4 py-2.5 text-left
                 text-xs text-white/70 transition-colors hover:bg-white/[0.04]"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className={`mt-0.5 shrink-0 ${aberto ? 'text-cyan-300' : 'text-white/40'}`}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
        {!aberto && <path d="M3 3l18 18" strokeLinecap="round" />}
      </svg>

      <span className="flex-1">
        <span className="block">
          {ocupado
            ? '…'
            : aberto
              ? 'Aberto a conversas do mundo todo'
              : 'Fechado para quem você não conhece'}
        </span>
        <span className="mt-0.5 block text-[11px] text-white/35">
          {aberto
            ? 'Você aparece nas recomendações. Toque para sair delas.'
            : 'Você não aparece nas recomendações e não recebe primeira mensagem de estranhos.'}
        </span>
      </span>
    </button>
  );
};

export default BotaoAbertoAConversas;
