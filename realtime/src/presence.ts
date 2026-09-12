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
  /**
   * A conta dona desta conexão, provada pelo token do aperto de mão
   * (ver src/auth.ts). Ausente em quem entrou sem login — que continua vendo
   * o globo, mas não tem nome público nem caixa postal.
   */
  userId?: string;
  clientId?: string;
  regionKey?: string;
  /**
   * O nome público, vindo do TOKEN — nunca do que o cliente enviou.
   *
   * É preenchido no aperto de mão (src/auth.ts) e sobrevive ao `disconnect`
   * pela mesma razão do `beaconRegionKey`: os handlers de saída rodam na ordem
   * de registro, e o da presença limpa `socket.data.presence` antes de os
   * outros rodarem. Sem uma cópia à parte, a limpeza do diretório não saberia
   * qual nickname desindexar.
   */
  nickname?: string;
  presence?: Presence;
  /** Beacon aceso por esta conexão, se houver. Um por pessoa. */
  beaconId?: string;
  /**
   * Em que região o beacon foi aceso.
   *
   * Guardado à parte de `presence` de propósito: no `disconnect`, os handlers
   * rodam na ordem em que foram registrados, e o da presença apaga
   * `socket.data.presence` antes de o do beacon rodar. Sem esta cópia, a
   * limpeza não sabia de qual região tirar o sinal e o beacon ficava órfão
   * até vencer o TTL — visto acontecendo no teste.
   */
  beaconRegionKey?: string;
  /**
   * Com quem esta conexão foi APRESENTADA. É esta lista que autoriza a
   * sinalização — ver signaling.ts.
   */
  peers?: Set<string>;
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
      // Do crachá, e não do payload: é isto que impede alguém de entrar
      // dizendo ser outra pessoa.
      ...(socket.data.nickname ? { nickname: socket.data.nickname } : {}),
    };

    socket.data.clientId = presence.clientId;
    socket.data.regionKey = presence.regionKey;
    socket.data.presence = presence;
    // `socket.data.nickname` NÃO é escrito aqui: ele veio do token e é a
    // fonte da verdade. Regravá-lo a partir da presença o apagaria para quem
    // entrou sem nickname, e abriria de volta a porta que o token fechou.

    await store.add(socket.id, presence);
    // O índice da lupa. Só quem tem conta tem nickname — quem entra sem login
    // aparece no globo, mas não é encontrável por nome.
    if (presence.nickname) {
      await store.bindNickname(presence.nickname, presence.clientId);
    }
    // De clientId para esta conexão: é assim que um pedido de conexão
    // endereçado à PESSOA encontra a aba aberta dela agora.
    await store.bindClient(presence.clientId, socket.id);
    await socket.join(presence.regionKey);

    // O snapshot vai só para quem entrou; o update vai para os outros. Se o
    // update fosse para a sala inteira incluindo o remetente, quem entra se
    // veria entrando.
    const [presences, beacons] = await Promise.all([
      store.listRegion(presence.regionKey),
      store.listBeacons(presence.regionKey),
    ]);
    socket.emit('presence:snapshot', { presences, beacons });
    socket.to(presence.regionKey).emit('presence:update', {
      kind: 'join',
      presence,
    });

    log(
      `join   ${socket.id} clientId=${presence.clientId} regiao=${presence.regionKey} (${presences.length} na regiao, ${beacons.length} beacon(s))`,
    );
  });

  socket.on('presence:heartbeat', async () => {
    const { regionKey, presence, nickname } = socket.data;
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

    /*
     * OS PONTEIROS TAMBÉM PRECISAM SER RENOVADOS, e esquecer disso custou caro.
     *
     * São três chaves com três vidas diferentes: a presença
     * (`presence:<socketId>`, 45s) é renovada pelo `touch` acima, mas
     * `client:<clientId>` e `nick:<nickname>` eram gravados SÓ no join, com
     * TTL de 180s. Passados três minutos, eles venciam com a pessoa ali,
     * conectada, batendo heartbeat — e o efeito não era um erro, era pior:
     *
     *   - a busca passava a dizer que ela estava OFFLINE;
     *   - o pedido de conexão respondia "essa pessoa não está disponível".
     *
     * No store de MEMÓRIA isso nunca aparecia, porque lá os ponteiros são
     * entradas de Map, sem expiração. O defeito só existe com Redis — ou seja,
     * só em produção, e só depois de três minutos. Foi relatado do celular
     * antes de qualquer teste daqui pegar.
     */
    if (presence.clientId) {
      await store.bindClient(presence.clientId, socket.id);
      if (nickname) await store.bindNickname(nickname, presence.clientId);
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
  const { regionKey, presence, nickname } = socket.data;
  if (!regionKey || !presence) return;

  socket.data.regionKey = undefined;
  socket.data.presence = undefined;
  // O nickname do crachá fica: sair da região não deixa de ser você. Ele só
  // some quando a conexão morre, junto com o resto do `socket.data`.

  if (presence.clientId) await store.unbindClient(presence.clientId, socket.id);
  if (nickname) await store.unbindNickname(nickname, presence.clientId);
  await store.remove(socket.id, regionKey);
  await socket.leave(regionKey);
  io.to(regionKey).emit('presence:update', { kind: 'leave', presence });
}
