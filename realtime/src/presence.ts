/**
 * Presença: quem está no globo, e onde.
 *
 * Uma pessoa entra dizendo onde está; fica viva enquanto bate o heartbeat; sai
 * ao fechar a aba ou ao parar de bater. Nada aqui é broadcast de conteúdo — o
 * que trafega é "fulano está aqui", e só para a região dele.
 *
 * A REGIÃO É O RECORTE. Cada socket entra numa sala do Socket.io com o nome da
 * `regionKey`, e é para essa sala que o join/leave é anunciado. Sem isso, cada
 * pessoa que entrasse acordaria todo mundo no mundo inteiro.
 */

import type { Server, Socket } from 'socket.io';

import type {
  ClientToServer,
  Presence,
  ServerToClient,
} from '../shared/protocol.js';
import { ErrorCode } from '../shared/protocol.js';
import type { PresenceStore } from './store.js';

/** O que o servidor guarda por conexão. */
export interface SocketData {
  clientId?: string;
  regionKey?: string;
  presence?: Presence;
}

export type RealtimeServer = Server<
  ClientToServer,
  ServerToClient,
  Record<string, never>,
  SocketData
>;
export type RealtimeSocket = Socket<
  ClientToServer,
  ServerToClient,
  Record<string, never>,
  SocketData
>;

const coordenadaValida = (n: unknown, limite: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limite;

export function registerPresence(
  io: RealtimeServer,
  socket: RealtimeSocket,
  store: PresenceStore,
  log: (...args: unknown[]) => void,
): void {
  socket.on('presence:join', async (p) => {
    if (
      !p ||
      typeof p.clientId !== 'string' ||
      p.clientId.length === 0 ||
      typeof p.regionKey !== 'string' ||
      p.regionKey.length === 0 ||
      !coordenadaValida(p.lat, 90) ||
      !coordenadaValida(p.lon, 180)
    ) {
      socket.emit('error', {
        code: ErrorCode.BAD_PAYLOAD,
        message: 'presence:join precisa de clientId, regionKey, lat e lon validos.',
      });
      return;
    }

    // Entrar duas vezes é normal: o cliente reconecta e reenvia. Sai da região
    // anterior antes, senão fica um fantasma na sala antiga.
    if (socket.data.regionKey && socket.data.regionKey !== p.regionKey) {
      await sairDaRegiao(io, socket, store);
    }

    const presence: Presence = {
      clientId: p.clientId,
      lat: p.lat,
      lon: p.lon,
      regionKey: p.regionKey,
      ...(typeof p.name === 'string' && p.name.trim() ? { name: p.name.trim() } : {}),
    };

    socket.data.clientId = presence.clientId;
    socket.data.regionKey = presence.regionKey;
    socket.data.presence = presence;

    await store.add(socket.id, presence);
    await socket.join(presence.regionKey);

    // O snapshot vai só para quem entrou; o update vai para os outros. Se o
    // update fosse para a sala inteira incluindo o remetente, quem entra se
    // veria entrando.
    const presences = await store.listRegion(presence.regionKey);
    socket.emit('presence:snapshot', { presences, beacons: [] });
    socket.to(presence.regionKey).emit('presence:update', {
      kind: 'join',
      presence,
    });

    log(
      `join   ${socket.id} clientId=${presence.clientId} regiao=${presence.regionKey} (${presences.length} na regiao)`,
    );
  });

  socket.on('presence:heartbeat', async () => {
    const { regionKey, presence } = socket.data;
    if (!regionKey || !presence) {
      socket.emit('error', {
        code: ErrorCode.NOT_JOINED,
        message: 'heartbeat antes de presence:join.',
      });
      return;
    }

    const vivo = await store.touch(socket.id, regionKey);
    if (!vivo) {
      // Expirou (aba dormindo, rede caída). Regrava em vez de exigir um novo
      // join: o cliente já provou que está aqui.
      await store.add(socket.id, presence);
      socket.to(regionKey).emit('presence:update', { kind: 'join', presence });
      log(`revive ${socket.id} regiao=${regionKey}`);
    }
  });

  socket.on('presence:leave', async () => {
    await sairDaRegiao(io, socket, store);
    log(`leave  ${socket.id}`);
  });

  socket.on('disconnect', async (motivo) => {
    await sairDaRegiao(io, socket, store);
    log(`bye    ${socket.id} (${motivo})`);
  });
}

/**
 * Tira a presença do store, avisa a região e limpa o estado do socket.
 *
 * Idempotente de propósito: `presence:leave` seguido do `disconnect` é o
 * caminho normal quando o usuário fecha a aba, e o segundo não pode anunciar
 * uma saída que já foi anunciada.
 */
async function sairDaRegiao(
  io: RealtimeServer,
  socket: RealtimeSocket,
  store: PresenceStore,
): Promise<void> {
  const { regionKey, presence } = socket.data;
  if (!regionKey || !presence) return;

  socket.data.regionKey = undefined;
  socket.data.presence = undefined;

  await store.remove(socket.id, regionKey);
  await socket.leave(regionKey);
  io.to(regionKey).emit('presence:update', { kind: 'leave', presence });
}
