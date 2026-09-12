'use client';

import React, { FC, useEffect, useState } from 'react';

import {
  estadoDosAvisos,
  ligarAvisos,
  type EstadoDosAvisos,
} from '@/lib/push/avisos';

/**
 * "Quer saber quando responderem?"
 *
 * APARECE QUANDO A PESSOA ABRE UMA CONVERSA, e não quando ela abre o site. A
 * diferença decide se a permissão será dada: pedir na chegada é pedir a quem
 * ainda não sabe o que o site faz, e o navegador grava a recusa PARA SEMPRE —
 * nem nós nem ela conseguimos reabrir a caixa depois, só as configurações do
 * navegador. Numa conversa aberta, a pergunta se explica sozinha.
 *
 * E APARECE UMA VEZ. Se a pessoa dispensar, fica dispensado neste aparelho; um
 * convite que reaparece toda vez é o mesmo que uma recusa, com irritação junto.
 */

const DISPENSADO = 'globoAvisosDispensado';

interface Props {
  /** Só faz sentido com uma conversa na tela. */
  visivel: boolean;
}

const ConviteDeAvisos: FC<Props> = ({ visivel }) => {
  const [estado, setEstado] = useState<EstadoDosAvisos | null>(null);
  const [dispensado, setDispensado] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setEstado(estadoDosAvisos());
    try {
      setDispensado(localStorage.getItem(DISPENSADO) === 'sim');
    } catch {
      setDispensado(false);
    }
  }, [visivel]);

  if (!visivel || dispensado || estado === null) return null;
  // Já ligados, negados de vez, ou navegador sem suporte: não há o que oferecer.
  if (estado === 'ligados' || estado === 'negados' || estado === 'indisponivel') {
    return null;
  }

  const dispensar = () => {
    try {
      localStorage.setItem(DISPENSADO, 'sim');
    } catch {
      /* sem localStorage o convite volta na próxima vez; não é motivo para travar */
    }
    setDispensado(true);
  };

  if (estado === 'precisa-instalar') {
    return (
      <div className="mx-3 mb-2 rounded-2xl bg-white/[0.07] px-4 py-3 ring-1 ring-white/10">
        <p className="text-sm text-white/80">
          Para receber aviso de mensagem no iPhone, toque em{' '}
          <span className="font-semibold text-white">Compartilhar</span> e depois em{' '}
          <span className="font-semibold text-white">Adicionar à Tela de Início</span>.
        </p>
        <p className="mt-1 text-xs text-white/45">
          É exigência do Safari: só app instalado pode avisar.
        </p>
        <button
          type="button"
          onClick={dispensar}
          className="mt-2 text-xs text-white/50 underline-offset-2 hover:underline"
        >
          Agora não
        </button>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-2 flex items-center gap-3 rounded-2xl bg-cyan-500/10 px-4 py-3 ring-1 ring-cyan-400/25">
      <p className="min-w-0 flex-1 text-sm text-white/85">
        Quer saber quando responderem, mesmo com o app fechado?
      </p>
      <button
        type="button"
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          const fim = await ligarAvisos();
          setEstado(fim);
          if (fim === 'ligados' || fim === 'negados') dispensar();
          setOcupado(false);
        }}
        className="shrink-0 rounded-full bg-cyan-600 px-4 py-1.5 text-sm font-semibold
                   text-white hover:bg-cyan-500 disabled:bg-white/10 disabled:text-white/30"
      >
        {ocupado ? '…' : 'Avisar'}
      </button>
      <button
        type="button"
        onClick={dispensar}
        aria-label="Agora não"
        className="shrink-0 rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
};

export default ConviteDeAvisos;
