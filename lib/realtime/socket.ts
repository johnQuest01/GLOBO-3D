'use client';

import { io, type Socket } from 'socket.io-client';

import type {
  ClientToServer,
  ServerToClient,
} from '@/realtime/shared/protocol';

/**
 * Conexão com o servidor de realtime.
 *
 * O servidor NÃO é este app. Ele é um processo Node separado, always-on, que
 * vive fora da Vercel (`realtime/`) — função serverless não segura conexão
 * aberta. Por isso a URL vem de `NEXT_PUBLIC_REALTIME_URL` e não de um caminho
 * relativo.
 *
 * OS TIPOS VÊM DO SERVIDOR, do mesmo arquivo que ele usa
 * (`realtime/shared/protocol.ts`). Não é elegância: é o que faz um nome de
 * evento trocado quebrar na compilação em vez de virar um silêncio em
 * produção, com o cliente emitindo 'beacon:raise' e o servidor escutando
 * 'beacon:up'.
 */

export type RealtimeSocket = Socket<ServerToClient, ClientToServer>;

const URL = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();

/** Uma conexão por aba, e não uma por componente que precisar dela. */
let singleton: RealtimeSocket | null = null;

/** Sem a variável configurada, o app inteiro segue funcionando sem realtime. */
export const isRealtimeEnabled = Boolean(URL);

export function getSocket(): RealtimeSocket | null {
  if (!URL) return null;
  if (singleton) return singleton;

  singleton = io(URL, {
    // `websocket` direto, sem o polling primeiro: o polling só serve para
    // atravessar proxy antigo, e aqui ele custaria uma rodada de requisições
    // HTTP antes de qualquer coisa acontecer.
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    // Espera crescente entre tentativas. Reconectar a cada 100ms com o
    // servidor fora do ar transforma cada usuário num pequeno ataque.
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    withCredentials: true,
  });

  return singleton;
}

/** Fecha e esquece. Usado quando a pessoa sai da conta. */
export function closeSocket(): void {
  singleton?.close();
  singleton = null;
}
