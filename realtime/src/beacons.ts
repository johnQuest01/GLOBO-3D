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

import { celulaDe } from '../shared/celulas.js';
import type { Beacon } from '../shared/protocol.js';
import { BEACONS_MAX } from '../shared/protocol.js';
import { ErrorCode } from '../shared/protocol.js';
import { anunciarNaCelula, type RealtimeServer, type RealtimeSocket } from './presence.js';
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
      // Sem o nome, um ponto num pais distante nao diz nada — e nao da' para
      // abrir conversa, que e' enderecada por nickname.
      ...(socket.data.nickname ? { nickname: socket.data.nickname } : {}),
      ...(typeof p?.pais === 'string' && p.pais.trim()
        ? { pais: p.pais.trim().slice(0, 60) }
        : {}),
      ...(typeof p?.estado === 'string' && p.estado.trim()
        ? { estado: p.estado.trim().slice(0, 60) }
        : {}),
      lat: presence.lat,
      lon: presence.lon,
      regionKey: presence.regionKey,
      expiresAt: Date.now() + ttlSec * 1000,
      ...(topic ? { topic } : {}),
    };

    await store.addBeacon(beacon, ttlSec);
    socket.data.beaconId = beacon.beaconId;
    socket.data.beaconRegionKey = beacon.regionKey;

/*
     * O ANUNCIO AO VIVO E' DA CELULA; O MUNDO VEM POR BUSCA.
     *
     * O sinal e' publico e mundial — essa e' a graca da coisa. Mas ANUNCIAR
     * cada sinal para cada pessoa e' trabalho que cresce com o produto dos
     * dois numeros: com 25 mil sinais e 50 mil conexoes, sao 1,25 bilhao de
     * entregas por rodada. Nenhuma maquina resolve isso, e mais maquinas
     * pioram (o anuncio passa a atravessar o Redis entre elas).
     *
     * ATE AQUI O ANUNCIO ERA DA REGIAO, com o argumento de que "na regiao o
     * numero e' pequeno por definicao". Ele nao e': "sao paulo" e' uma regiao
     * so'. Medido no teste de estresse — 24 pessoas na mesma regiao acendendo
     * sinal deram 576 entregas, que e' 24 ao quadrado. O mesmo desenho com mil
     * pessoas numa cidade da' um milhao de entregas por rodada.
     *
     * Agora o anuncio vai para a CELULA (~2,2 km, ver shared/celulas.ts), que
     * e' onde "o numero e' pequeno" e' verdade. Ver o vizinho acender na hora
     * continua acontecendo — e e' o que faz o globo parecer vivo —, mas o
     * custo passa a depender de quanta gente ha' por perto, e nao de quanta
     * gente ha' na cidade.
     *
     * O mundo inteiro chega por `beacon:find`, que e' consulta: custo por
     * pessoa interessada, e so' enquanto ela esta olhando.
     */
    const celula = socket.data.celula ?? celulaDe(presence.lat, presence.lon);
    const anunciado = anunciarNaCelula(io, celula, (para) =>
      para.emit('beacon:new', beacon),
    );

    log(
      `beacon ${beacon.beaconId.slice(0, 8)} de ${clientId} em ${presence.regionKey}/${celula}` +
        ` por ${ttlSec}s${anunciado ? '' : ' (celula cheia: sem anuncio ao vivo)'}`,
    );
  });

  socket.on('beacon:find', async (p) => {
    if (!permitir(socket, limitador, 'beacon:find')) return;

    const pais =
      typeof p?.pais === 'string' && p.pais.trim() ? p.pais.trim().slice(0, 60) : undefined;
    const limite = Math.min(
      BEACONS_MAX,
      Math.max(1, Number.isFinite(Number(p?.limite)) ? Number(p?.limite) : BEACONS_MAX),
    );

    const resposta = await sinaisDoMundo(store, pais, limite);
    socket.emit('beacon:list', resposta);
  });

  socket.on('sugestoes:find', async (p) => {
    if (!permitir(socket, limitador, 'beacon:find')) return;

    const estado = typeof p?.estado === 'string' ? p.estado.trim().slice(0, 60) : '';
    const pais = typeof p?.pais === 'string' ? p.pais.trim().slice(0, 60) : '';
    const meuClientId = socket.data.clientId ?? '';

    socket.emit('sugestoes:list', await sugerir(store, estado, pais, meuClientId));
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
  /*
   * DA CELULA, como o acender — e e' obrigatorio que seja a mesma sala dos
   * dois lados. Anunciar o acender numa sala e o apagar em outra deixaria o
   * sinal aceso para sempre na tela de quem viu ele nascer.
   *
   * A celula e' recalculada da presenca quando `socket.data.celula` ja' foi
   * limpo: no `disconnect` os handlers rodam na ordem de registro, e o da
   * presenca pode ter passado antes deste.
   */
  const celula =
    socket.data.celula ??
    (socket.data.presence
      ? celulaDe(socket.data.presence.lat, socket.data.presence.lon)
      : null);
  if (celula) {
    anunciarNaCelula(io, celula, (para) => para.emit('beacon:gone', { beaconId }));
  }
}

/**
 * A resposta guardada por alguns segundos.
 *
 * E' O QUE FAZ A BUSCA ESCALAR. Sem isto, mil pessoas olhando a lista ao mesmo
 * tempo seriam mil consultas identicas ao Redis por rodada. Com isto, sao
 * mil respostas e UMA leitura: o que muda em tres segundos numa lista de
 * "quem quer conversar agora" nao justifica o custo de reler.
 *
 * O cache e' por processo, e nao compartilhado: cada maquina guarda a sua. E'
 * de proposito — compartilhar exigiria ir ao Redis para evitar ir ao Redis.
 */
const CACHE_MS = 3000;
const cache = new Map<string, { em: number; dados: { sinais: Beacon[]; total: number } }>();

async function sinaisDoMundo(
  store: PresenceStore,
  pais: string | undefined,
  limite: number,
): Promise<{ sinais: Beacon[]; total: number }> {
  const chave = `${pais ?? '*'}|${limite}`;
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.dados;

  const [sinais, total] = await Promise.all([
    store.listBeaconsGlobais(limite, pais),
    store.contarBeacons(pais),
  ]);

  const dados = { sinais, total };
  cache.set(chave, { em: Date.now(), dados });

  // O cache nao pode crescer sem fim: um pais por chave, mais as combinacoes
  // de limite. Cem entradas e' folga larga para qualquer uso real.
  if (cache.size > 100) {
    const maisVelha = [...cache.entries()].sort((a, b) => a[1].em - b[1].em)[0];
    if (maisVelha) cache.delete(maisVelha[0]);
  }

  return dados;
}

// ---------------------------------------------------------------------------
// Recomendacao
// ---------------------------------------------------------------------------

/** Quantos de cada camada a pessoa recebe. */
const DO_ESTADO = 6;
const DO_PAIS = 6;
const DO_MUNDO = 8;

/**
 * O tamanho do bolo de onde a escolha sai.
 *
 * MAIOR QUE O QUE SERA' MOSTRADO, e e' ai' que mora a defesa contra
 * sobrecarregar alguem: se o servidor lesse exatamente seis e mostrasse seis,
 * todas as pessoas do estado receberiam a MESMA lista, e as seis primeiras
 * levariam todos os convites do dia. Lendo quarenta e sorteando seis, cada
 * pessoa ve' um conjunto diferente e a atencao se espalha.
 */
const BOLO = 40;

/** Embaralha no lugar (Fisher-Yates). */
function embaralhar<T>(lista: T[]): T[] {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j]!, lista[i]!];
  }
  return lista;
}

/**
 * Escolhe quem mostrar, em tres camadas.
 *
 * PERTO PRIMEIRO, porque conversa com quem esta no mesmo estado tem fuso,
 * lingua e assunto em comum — e' onde a conversa tem mais chance de acontecer.
 * MAS SEMPRE COM GENTE DE LONGE, porque e' isso que um globo promete, e uma
 * lista so' de vizinhos nao precisaria de globo nenhum.
 *
 * SEM REPETIR entre as camadas: quem ja' apareceu como "do seu estado" nao
 * aparece de novo como "do seu pais".
 */
async function sugerir(
  store: PresenceStore,
  estado: string,
  pais: string,
  meuClientId: string,
): Promise<{ doEstado: Beacon[]; doPais: Beacon[]; doMundo: Beacon[] }> {
  const [candidatosEstado, candidatosPais, candidatosMundo] = await Promise.all([
    estado ? store.listBeaconsDoEstado(estado, BOLO) : Promise.resolve([]),
    pais ? store.listBeaconsGlobais(BOLO, pais) : Promise.resolve([]),
    store.listBeaconsGlobais(BOLO),
  ]);

  const jaVistos = new Set<string>([meuClientId]);

  const escolher = (candidatos: Beacon[], quantos: number): Beacon[] => {
    const novos = candidatos.filter((b) => !jaVistos.has(b.clientId));
    const sorteados = embaralhar(novos).slice(0, quantos);
    for (const b of sorteados) jaVistos.add(b.clientId);
    return sorteados;
  };

  const doEstado = escolher(candidatosEstado, DO_ESTADO);
  const doPais = escolher(candidatosPais, DO_PAIS);
  // O mundo entra por ultimo e ja' sem quem apareceu perto — senao, para quem
  // mora num lugar movimentado, "o mundo" seria a propria cidade de novo.
  const doMundo = escolher(
    candidatosMundo.filter((b) => !pais || b.pais !== pais),
    DO_MUNDO,
  );

  return { doEstado, doPais, doMundo };
}
