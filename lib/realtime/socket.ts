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
 *
 * O CRACHÁ. Antes de conectar, esta aba pede um token curto a
 * `/api/realtime/token` — que só o app Next consegue emitir, porque só ele tem
 * o cookie de sessão e o banco. O token vai no aperto de mão, e é dele que o
 * servidor de realtime tira quem você é. Sem ele a conexão acontece igual,
 * porém anônima: aparece no globo, mas não tem nome público nem caixa postal.
 */

export type RealtimeSocket = Socket<ServerToClient, ClientToServer>;

const URL = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();

/** Uma conexão por aba, e não uma por componente que precisar dela. */
let singleton: RealtimeSocket | null = null;

/** Sem a variável configurada, o app inteiro segue funcionando sem realtime. */
export const isRealtimeEnabled = Boolean(URL);

/**
 * Pega um crachá novo.
 *
 * Devolve null em qualquer tropeço — sem sessão, servidor sem configuração,
 * rede fora. Null significa "siga anônimo", nunca "não conecte": o globo não
 * depende disto para funcionar.
 */
async function pegarToken(): Promise<string | null> {
  try {
    const r = await fetch('/api/realtime/token', { cache: 'no-store' });
    if (!r.ok) return null;
    const dados = (await r.json()) as { token?: string };
    return dados.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Abre (ou devolve) a conexão.
 *
 * É assíncrona porque o token vem antes do socket: conectar primeiro e
 * autenticar depois deixaria uma janela em que os eventos chegam sem dono, e
 * o servidor teria que tratar os dois casos em cada handler.
 */
export async function connectSocket(): Promise<RealtimeSocket | null> {
  if (!URL) return null;
  if (singleton) return singleton;

  const token = await pegarToken();

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
    ...(token ? { auth: { token } } : {}),
  });

  /*
   * O TOKEN VENCE EM CINCO MINUTOS; a reconexão pode acontecer horas depois.
   *
   * Sem isto, a aba que ficou a noite inteira aberta reconectaria apresentando
   * um crachá vencido e voltaria anônima — sumindo da busca e da caixa postal
   * sem nenhum aviso na tela. Então cada tentativa de reconectar busca um
   * crachá novo antes de tentar.
   */
  singleton.io.on('reconnect_attempt', () => {
    void pegarToken().then((novo) => {
      if (novo && singleton) singleton.auth = { token: novo };
    });
  });

  return singleton;
}

/**
 * A conexão JÁ ABERTA, ou null.
 *
 * Existe para quem só quer emitir um evento e não pode (nem deve) esperar:
 * quem abre a conexão é o hook de realtime, uma vez só.
 */
export function getSocket(): RealtimeSocket | null {
  return singleton;
}

/** Fecha e esquece. Usado quando a pessoa sai da conta. */
export function closeSocket(): void {
  singleton?.close();
  singleton = null;
}
