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

/** O mesmo tempo, visto de fora: a presenca usa para devolver a vida cheia. */
export const TTL_DO_SINAL_SEC = TTL_PADRAO_SEC;

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

  /*
   * CAIR A CONEXÃO NÃO É IR EMBORA — e tratar as duas coisas como uma só era
   * o que fazia o sinal "não funcionar".
   *
   * Aqui o `disconnect` apagava o sinal na hora. No computador isso quase
   * nunca aparece; no celular é o comportamento normal do aparelho: bloquear
   * a tela, trocar de aplicativo ou passar por um túnel derruba o socket em
   * segundos. A pessoa acendia um sinal de quinze minutos, olhava para o lado,
   * e ele morria antes de ela voltar.
   *
   * Agora ele entra em CARÊNCIA: continua aceso por pouco tempo, e quem voltar
   * dentro dessa janela o encontra inteiro (ver `restaurarBeacon`). Quem foi
   * embora de verdade some em `CARENCIA_SEC`, que é bem menos que o TTL cheio
   * — o motivo do código antigo (ninguém deve chamar quem já saiu) continua
   * valendo, só que com um minuto e meio de tolerar a vida real.
   */
  socket.on('disconnect', () => {
    void porEmCarencia(socket, store);
  });
}

/** Quanto tempo um sinal sobrevive à queda da conexão. */
const CARENCIA_SEC = 90;

/**
 * Encurta a vida do sinal em vez de apagá-lo.
 *
 * Reescrever o mesmo `beaconId` com um TTL curto é o que dá a carência: a
 * chave é a mesma, então não há sinal duplicado, e o próprio armazenamento
 * se encarrega de apagá-lo se ninguém voltar.
 *
 * NÃO AVISA A REGIÃO que o sinal sumiu, de propósito: ele ainda está aceso.
 * O aviso sai quando a carência vencer e o sinal de fato deixar de existir.
 */
async function porEmCarencia(
  socket: RealtimeSocket,
  store: PresenceStore,
): Promise<void> {
  const beaconId = socket.data.beaconId;
  if (!beaconId) return;

  const beacon = await store.getBeacon(beaconId);
  if (!beacon) return;

  // Se o que resta já é menos que a carência, deixa como está: encurtar seria
  // uma coisa, esticar seria outra bem diferente.
  const restaSec = Math.round((beacon.expiresAt - Date.now()) / 1000);
  if (restaSec <= CARENCIA_SEC) return;

  await store.addBeacon(
    { ...beacon, expiresAt: Date.now() + CARENCIA_SEC * 1000 },
    CARENCIA_SEC,
  );
}

/**
 * A pessoa voltou: o sinal dela volta a valer o tempo cheio.
 *
 * Chamado no `presence:join`, que é por onde toda reconexão passa. Sem isto, a
 * carência só adiaria a morte do sinal em noventa segundos.
 */
export async function restaurarBeacon(
  socket: RealtimeSocket,
  store: PresenceStore,
  ttlSec: number,
): Promise<void> {
  const clientId = socket.data.clientId;
  const presence = socket.data.presence;
  if (!clientId || !presence) return;

  const beaconId = `b:${clientId}`;
  const beacon = await store.getBeacon(beaconId);
  if (!beacon) return;

  socket.data.beaconId = beaconId;
  socket.data.beaconRegionKey = presence.regionKey;

  await store.addBeacon(
    { ...beacon, expiresAt: Date.now() + ttlSec * 1000 },
    ttlSec,
  );
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
