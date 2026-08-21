/**
 * Beacons: "estou aqui e quero conversar".
 *
 * É o primitivo que substitui o broadcast. Ninguém manda texto para a cidade
 * inteira; a pessoa acende um sinal no lugar dela, e quem se interessar PEDE
 * conexão. A diferença não é de estilo: broadcast é empurrar conteúdo para
 * quem não pediu, e beacon é anunciar disponibilidade. Um é spam por
 * construção, o outro é convite.
 *
 * UM BEACON POR PESSOA — e isso é garantido pelo IDENTIFICADOR, não por
 * apagar-e-inserir. A primeira versão fazia `remove` e depois `add`, e isso
 * tinha uma corrida real: três `beacon:raise` disparados no mesmo instante
 * liam `socket.data.beaconId` ainda vazio, nenhum apagava o do outro, e a
 * região ficava com três sinais da mesma pessoa — dois deles órfãos, que nem
 * o `disconnect` limpava. Foi visto acontecendo no teste de flood.
 *
 * Com o id derivado do clientId, acender de novo escreve NA MESMA CHAVE.
 * Não há corrida possível: o segundo simplesmente sobrescreve o primeiro.
 *
 * O TTL É OBRIGATÓRIO e curto. Sinal que não morre sozinho vira lixo no mapa:
 * a pessoa fecha o navegador e continua "disponível" para sempre.
 */

import type { Beacon } from '../shared/protocol.js';
import { ErrorCode } from '../shared/protocol.js';
import type { RealtimeServer, RealtimeSocket } from './presence.js';
import { permitir, type Limitador } from './safety.js';
import type { PresenceStore } from './store.js';

/** Limites do tempo de vida pedido pelo cliente. */
const TTL_MIN_SEC = 60;
const TTL_MAX_SEC = 60 * 60;
const TTL_PADRAO_SEC = 15 * 60;

const TOPICO_MAX = 80;

export function registerBeacons(
  io: RealtimeServer,
  socket: RealtimeSocket,
  store: PresenceStore,
  limitador: Limitador,
  log: (...args: unknown[]) => void,
): void {
  socket.on('beacon:raise', async (p) => {
    const { presence, clientId } = socket.data;
    if (!presence || !clientId) {
      socket.emit('error', {
        code: ErrorCode.NOT_JOINED,
        message: 'beacon:raise antes de presence:join.',
      });
      return;
    }

    if (!permitir(socket, limitador, 'beacon:raise')) return;

    const pedido = Number(p?.ttlSec);
    const ttlSec = Number.isFinite(pedido)
      ? Math.min(TTL_MAX_SEC, Math.max(TTL_MIN_SEC, Math.round(pedido)))
      : TTL_PADRAO_SEC;

    const topic =
      typeof p?.topic === 'string' && p.topic.trim()
        ? p.topic.trim().slice(0, TOPICO_MAX)
        : undefined;

    const beacon: Beacon = {
      // Derivado da pessoa, e não sorteado: ver o comentário do topo.
      beaconId: `b:${clientId}`,
      clientId,
      lat: presence.lat,
      lon: presence.lon,
      regionKey: presence.regionKey,
      expiresAt: Date.now() + ttlSec * 1000,
      ...(topic ? { topic } : {}),
    };

    await store.addBeacon(beacon, ttlSec);
    socket.data.beaconId = beacon.beaconId;
    socket.data.beaconRegionKey = beacon.regionKey;

    // Para a região inteira, INCLUSIVE quem acendeu: é assim que a própria
    // pessoa vê o próprio sinal aparecer no globo, sem o cliente ter que
    // adivinhar o beaconId que o servidor gerou.
    io.to(presence.regionKey).emit('beacon:new', beacon);

    log(
      `beacon ${beacon.beaconId.slice(0, 8)} de ${clientId} em ${presence.regionKey} por ${ttlSec}s`,
    );
  });

  socket.on('beacon:lower', async () => {
    await apagarBeaconDoSocket(io, socket, store);
  });

  // Fechar a aba apaga o sinal. Sem isto, o TTL ainda o mataria, mas até lá
  // haveria gente pedindo conexão para quem já foi embora.
  socket.on('disconnect', () => {
    void apagarBeaconDoSocket(io, socket, store);
  });
}

async function apagarBeaconDoSocket(
  io: RealtimeServer,
  socket: RealtimeSocket,
  store: PresenceStore,
): Promise<void> {
  const beaconId = socket.data.beaconId;
  // A região vem da cópia feita no acender, e não de `presence` — que no
  // `disconnect` já pode ter sido limpa pelo handler da presença.
  const regionKey =
    socket.data.beaconRegionKey ??
    socket.data.presence?.regionKey ??
    socket.data.regionKey;
  if (!beaconId || !regionKey) return;

  socket.data.beaconId = undefined;
  socket.data.beaconRegionKey = undefined;
  await store.removeBeacon(beaconId, regionKey);
  io.to(regionKey).emit('beacon:gone', { beaconId });
}
