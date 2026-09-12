'use client';

import React, { FC, useEffect, useState } from 'react';

import {
  desligarAvisos,
  estadoDosAvisos,
  ligarAvisos,
  type EstadoDosAvisos,
} from '@/lib/push/avisos';

/**
 * Liga e desliga os avisos deste aparelho — um interruptor, e não um convite.
 *
 * POR QUE ELE PRECISOU EXISTIR. O convite que aparece dentro da conversa é
 * pedido uma vez e, se a pessoa dispensar, não volta — de propósito, porque um
 * convite que reaparece sempre é uma recusa com irritação junto. Mas isso
 * deixava quem dispensou (ou quem nunca chegou a abrir uma conversa) sem
 * NENHUM caminho para ligar depois. Foi o que aconteceu no primeiro uso: a
 * mensagem chegava para alguém que nunca tinha se inscrito, e do lado de fora
 * parecia que a notificação estava quebrada.
 *
 * Fica na lista de conversas, que é onde alguém vai procurar "por que não fui
 * avisado".
 */

const BotaoDeAvisos: FC = () => {
  const [estado, setEstado] = useState<EstadoDosAvisos | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => setEstado(estadoDosAvisos()), []);

  if (estado === null || estado === 'indisponivel') return null;

  const rotulo: Record<Exclude<EstadoDosAvisos, 'indisponivel'>, string> = {
    ligados: 'Avisos ligados',
    'pode-pedir': 'Avisar-me de novas mensagens',
    negados: 'Avisos bloqueados no navegador',
    'precisa-instalar': 'Adicione à Tela de Início para ser avisado',
  };

  const alternar = async () => {
    setOcupado(true);
    if (estado === 'ligados') {
      await desligarAvisos();
      setEstado(estadoDosAvisos() === 'ligados' ? 'pode-pedir' : estadoDosAvisos());
    } else if (estado === 'pode-pedir') {
      setEstado(await ligarAvisos());
    }
    setOcupado(false);
  };

  // Bloqueado no navegador e "precisa instalar" não viram botão: não há nada
  // que um toque aqui possa fazer. Viram explicação, que é o que serve.
  const clicavel = estado === 'ligados' || estado === 'pode-pedir';

  return (
    <button
      type="button"
      disabled={!clicavel || ocupado}
      onClick={alternar}
      className={`flex w-full items-center gap-2 border-b border-white/10 px-4 py-2.5 text-left text-xs
        ${clicavel ? 'text-white/70 hover:bg-white/[0.04]' : 'cursor-default text-white/40'}`}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className={estado === 'ligados' ? 'text-cyan-300' : ''}
      >
        <path
          d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {estado !== 'ligados' && <path d="M3 3l18 18" strokeLinecap="round" />}
      </svg>
      <span className="flex-1">{ocupado ? '…' : rotulo[estado]}</span>
      {estado === 'ligados' && <span className="text-[10px] text-white/35">tocar para desligar</span>}
    </button>
  );
};

export default BotaoDeAvisos;
