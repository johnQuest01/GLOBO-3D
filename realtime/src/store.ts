/**
 * Onde a presença mora.
 *
 * Duas implementações atrás da mesma interface:
 *
 * - REDIS, que é o alvo. A presença precisa ser compartilhada entre instâncias,
 *   senão o servidor B não sabe quem está conectado no servidor A e o snapshot
 *   sai pela metade assim que houver mais de uma máquina.
 * - MEMÓRIA, só para desenvolvimento sem Redis instalado. Ela existe para o
 *   teste da Fase 1 não depender de você subir um Redis, e AVISA no console que
 *   está em modo degradado. Em produção, sem REDIS_URL, o servidor recusa subir
 *   (ver src/index.ts) — modo memória com duas instâncias é bug silencioso.
 *
 * MODELO DE DADOS (o mesmo nos dois):
 *   region:<regionKey>   Set de socketIds que estão naquela região
 *   presence:<socketId>  Hash com os dados da pessoa, com TTL
 *
 * O TTL fica no hash, não no Set — Redis não expira membro de Set
 * individualmente. Então o Set acumula socketId morto, e a limpeza é
 * preguiçosa: quem lê o snapshot descobre os hashes que sumiram e tira os
 * membros correspondentes. É barato e não precisa de varredura periódica.
 */

import type {
  Beacon,
  ClientId,
  Presence,
  RegionKey,
  SocketId,
} from '../shared/protocol.js';
import { PRESENCE_TTL_SEC } from '../shared/protocol.js';

/** Pedido de conexão esperando resposta. */
export interface PendingRequest {
  requestId: string;
  fromSocketId: SocketId;
  fromClientId: ClientId;
  toSocketId: SocketId;
  toClientId: ClientId;
}

export interface PresenceStore {
  readonly kind: 'redis' | 'memory';
  /** Grava a presença e coloca o socket na região. */
  add(socketId: SocketId, presence: Presence): Promise<void>;
  /** Renova o TTL. Devolve false se a presença já tinha expirado. */
  touch(socketId: SocketId, regionKey: RegionKey): Promise<boolean>;
  remove(socketId: SocketId, regionKey: RegionKey): Promise<void>;
  /** Todo mundo vivo na região, já sem os expirados. */
  listRegion(regionKey: RegionKey): Promise<Presence[]>;

  // --- Quem é quem -------------------------------------------------------
  /**
   * De `clientId` para a conexão atual.
   *
   * Existe porque o pedido de conexão aponta para a PESSOA (clientId), não
   * para a conexão (socketId) — o socketId muda a cada aba aberta, e ninguém
   * clicaria num identificador que morre.
   */
  bindClient(clientId: ClientId, socketId: SocketId): Promise<void>;
  unbindClient(clientId: ClientId, socketId: SocketId): Promise<void>;
  socketOfClient(clientId: ClientId): Promise<SocketId | null>;
  /** A presença de UMA conexão, sem varrer a região inteira. */
  getPresence(socketId: SocketId): Promise<Presence | null>;

  // --- Diretório de nicknames --------------------------------------------
  /**
   * O índice que faz a lupa funcionar ENTRE regiões.
   *
   * `listRegion` só enxerga a própria região — de propósito, senão cada pessoa
   * que entrasse acordaria o mundo inteiro. Mas procurar alguém pelo nome é
   * exatamente a operação que atravessa regiões: quem busca está em São Paulo
   * e a pessoa procurada, em Tóquio. Daí um índice próprio, plano, do nickname
   * para o clientId.
   *
   * TTL igual ao do apontador de cliente: nickname sem dono vivo não é achado,
   * é fantasma.
   */
  bindNickname(nickname: string, clientId: ClientId): Promise<void>;
  unbindNickname(nickname: string, clientId: ClientId): Promise<void>;
  clientOfNickname(nickname: string): Promise<ClientId | null>;

  // --- Beacons -----------------------------------------------------------
  addBeacon(beacon: Beacon, ttlSec: number): Promise<void>;
  removeBeacon(beaconId: string, regionKey: RegionKey): Promise<void>;
  listBeacons(regionKey: RegionKey): Promise<Beacon[]>;
  /**
   * Os sinais do mundo inteiro, dos mais recentes para os mais antigos.
   *
   * Existe separado de `listBeacons` porque as duas perguntas sao diferentes:
   * a da regiao serve ao globo local; esta serve a quem quer conversar com
   * alguem, em qualquer lugar — que e' o proposito do sinal.
   */
  /**
   * Os sinais do mundo, do mais recente para o mais antigo.
   *
   * `pais` filtra; sem ele, vem de qualquer lugar — que e' o caso comum e o
   * proposito da coisa: se ninguem de um pais estiver online, alguem de outro
   * estara'.
   */
  listBeaconsGlobais(limite: number, pais?: string): Promise<Beacon[]>;
  /** Quantos sinais existem ao todo (ou no pais). So' o numero. */
  contarBeacons(pais?: string): Promise<number>;
  getBeacon(beaconId: string): Promise<Beacon | null>;

  // --- Pedidos de conexão ------------------------------------------------
  /**
   * Guardado no store, e não na memória do processo, porque as duas pessoas
   * podem estar em instâncias diferentes: quem aceita não é atendido pela
   * mesma máquina que recebeu o pedido.
   */
  putRequest(req: PendingRequest, ttlSec: number): Promise<void>;
  /** Lê E apaga: um pedido só pode ser aceito uma vez. */
  takeRequest(requestId: string): Promise<PendingRequest | null>;

  // --- Bloqueios ---------------------------------------------------------
  block(clientId: ClientId, targetClientId: ClientId): Promise<void>;
  /** Vale nos DOIS sentidos: quem bloqueia também não recebe. */
  isBlocked(a: ClientId, b: ClientId): Promise<boolean>;

  close(): Promise<void>;
}

const regionKeyOf = (regionKey: RegionKey) => `region:${regionKey}`;
const presenceKeyOf = (socketId: SocketId) => `presence:${socketId}`;
const clientKeyOf = (clientId: ClientId) => `client:${clientId}`;
const nickKeyOf = (nickname: string) => `nick:${nickname.trim().toLowerCase()}`;
const beaconKeyOf = (beaconId: string) => `beacon:${beaconId}`;
const beaconsOfRegion = (regionKey: RegionKey) => `beacons:${regionKey}`;
/**
 * O indice MUNDIAL de sinais.
 *
 * E' um sorted set com o instante de acender como pontuacao, e nao um Set
 * comum: assim da' para pedir "os N mais recentes" sem ler todos, que e' a
 * unica forma de um indice global nao virar um problema quando houver muita
 * gente.
 */
const BEACONS_GLOBAIS = 'beacons:todos';
/** Um indice por pais, para "quem da Russia esta online agora". */
const beaconsDoPais = (pais: string) =>
  `beacons:pais:${pais.trim().toLowerCase().replace(/\s+/g, '-')}`;
const requestKeyOf = (requestId: string) => `request:${requestId}`;
/** Bloqueio é simétrico, então a chave é o par ordenado. */
const blockKeyOf = (a: ClientId, b: ClientId) =>
  `block:${[a, b].sort().join('|')}`;

const beaconToHash = (b: Beacon): Record<string, string> => ({
  beaconId: b.beaconId,
  clientId: b.clientId,
  ...(b.nickname ? { nickname: b.nickname } : {}),
  ...(b.pais ? { pais: b.pais } : {}),
  lat: String(b.lat),
  lon: String(b.lon),
  regionKey: b.regionKey,
  expiresAt: String(b.expiresAt),
  ...(b.topic ? { topic: b.topic } : {}),
});

function beaconFromHash(hash: Record<string, string>): Beacon | null {
  if (!hash || !hash.beaconId || !hash.regionKey) return null;
  const lat = Number(hash.lat);
  const lon = Number(hash.lon);
  const expiresAt = Number(hash.expiresAt);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // Expirado é o mesmo que inexistente. O TTL do Redis normalmente já apagou,
  // mas o dublê do teste e o store de memória contam com esta checagem.
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return null;
  return {
    beaconId: hash.beaconId,
    clientId: hash.clientId ?? '',
    lat,
    lon,
    regionKey: hash.regionKey,
    ...(hash.nickname ? { nickname: hash.nickname } : {}),
    ...(hash.pais ? { pais: hash.pais } : {}),
    expiresAt,
    ...(hash.topic ? { topic: hash.topic } : {}),
  };
}

function toHash(p: Presence): Record<string, string> {
  const hash: Record<string, string> = {
    clientId: p.clientId,
    lat: String(p.lat),
    lon: String(p.lon),
    regionKey: p.regionKey,
  };
  if (p.name) hash.name = p.name;
  return hash;
}

function fromHash(hash: Record<string, string>): Presence | null {
  // Hash incompleto e hash expirado dao no mesmo: a presenca nao vale. O
  // `hgetall` do Redis devolve objeto vazio para chave que ja morreu.
  if (!hash || !hash.clientId || !hash.regionKey) return null;
  const lat = Number(hash.lat);
  const lon = Number(hash.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    clientId: hash.clientId,
    lat,
    lon,
    regionKey: hash.regionKey,
    ...(hash.name ? { name: hash.name } : {}),
  };
}

// ---------------------------------------------------------------------------
// Redis
// ---------------------------------------------------------------------------

/** Só o que este store usa do ioredis — evita amarrar o tipo ao pacote. */
/**
 * Varias ordens numa viagem so'.
 *
 * Cada metodo devolve O PROPRIO pipeline — e' o que permite encadear. O tipo
 * declara o minimo que usamos, e nao a assinatura completa do ioredis: copiar
 * as sobrecargas dele amarraria este arquivo a versao dele, que e' justamente
 * o que esta interface existe para evitar.
 */
interface PipelineLike {
  hset(key: string, value: Record<string, string>): PipelineLike;
  hgetall(key: string): PipelineLike;
  expire(key: string, seconds: number): PipelineLike;
  sadd(key: string, member: string): PipelineLike;
  srem(key: string, ...members: string[]): PipelineLike;
  del(key: string): PipelineLike;
  zadd(key: string, score: number, member: string): PipelineLike;
  zrem(key: string, ...members: string[]): PipelineLike;
  exec(): Promise<[Error | null, unknown][] | null>;
}

interface RedisLike {
  hset(key: string, value: Record<string, string>): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  del(key: string): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  // Duas assinaturas, e não uma com parâmetros opcionais: é assim que o
  // ioredis declara o `set`, e uma versão "simplificada" com `mode?: string`
  // não é atribuível às sobrecargas dele.
  set(key: string, value: string): Promise<unknown>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  get(key: string): Promise<string | null>;

  // --- Indice mundial de sinais ------------------------------------------
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zrem(key: string, ...members: string[]): Promise<number>;
  /** Do maior para o menor: os sinais mais recentes primeiro. */
  zrevrange(key: string, inicio: number, fim: number): Promise<string[]>;
  zcard(key: string): Promise<number>;

  /**
   * Varias ordens numa viagem so'.
   *
   * O tipo e' o minimo que usamos, e nao a declaracao completa do ioredis:
   * copiar as sobrecargas dele aqui amarraria este arquivo a versao dele, que
   * e' justamente o que esta interface existe para evitar.
   */
  pipeline(): PipelineLike;

  quit(): Promise<unknown>;
}

/**
 * Le' varios hashes de uma vez, e limpa os que morreram.
 *
 * O LACO ANTIGO FAZIA UMA IDA AO REDIS POR ITEM. Com mil pessoas numa regiao
 * eram mil viagens sequenciais a cada vez que alguem entrava — e cada uma
 * esperando a anterior. O pipeline manda todas juntas e espera uma vez so'.
 *
 * A limpeza preguicosa continua: o indice (Set ou sorted set) nao expira
 * sozinho junto com o hash, entao quem le' e' quem varre.
 */
async function lerEmLote<T>(
  redis: RedisLike,
  ids: string[],
  chaveDe: (id: string) => string,
  converter: (hash: Record<string, string>) => T | null,
  limpar: (mortos: string[]) => Promise<unknown>,
): Promise<T[]> {
  if (ids.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const id of ids) pipeline.hgetall(chaveDe(id));
  const respostas = (await pipeline.exec()) ?? [];

  const vivos: T[] = [];
  const mortos: string[] = [];

  ids.forEach((id, i) => {
    const hash = (respostas[i]?.[1] ?? {}) as Record<string, string>;
    const item = converter(hash);
    if (item) vivos.push(item);
    else mortos.push(id);
  });

  if (mortos.length > 0) await limpar(mortos);
  return vivos;
}

export function createRedisStore(redis: RedisLike): PresenceStore {
  return {
    kind: 'redis',

    async add(socketId, presence) {
      const key = presenceKeyOf(socketId);
      await redis.hset(key, toHash(presence));
      await redis.expire(key, PRESENCE_TTL_SEC);
      await redis.sadd(regionKeyOf(presence.regionKey), socketId);
    },

    async touch(socketId) {
      // `expire` devolve 0 quando a chave já não existe: é assim que sabemos
      // que a presença expirou e o cliente precisa entrar de novo.
      const renovado = await redis.expire(presenceKeyOf(socketId), PRESENCE_TTL_SEC);
      return renovado === 1;
    },

    async remove(socketId, regionKey) {
      await redis.del(presenceKeyOf(socketId));
      await redis.srem(regionKeyOf(regionKey), socketId);
    },

    async listRegion(regionKey) {
      const socketIds = await redis.smembers(regionKeyOf(regionKey));
      return lerEmLote(redis, socketIds, presenceKeyOf, fromHash, (mortos) =>
        redis.srem(regionKeyOf(regionKey), ...mortos),
      );
    },

    // --- Quem é quem -----------------------------------------------------

    async bindClient(clientId, socketId) {
      // Mesmo TTL da presença: se a pessoa sumiu, o apontador some junto.
      await redis.set(clientKeyOf(clientId), socketId, 'EX', PRESENCE_TTL_SEC * 4);
    },

    async unbindClient(clientId, socketId) {
      // Só apaga se ainda for ESTA conexão. Sem esta checagem, fechar uma aba
      // antiga derrubaria o apontador da aba nova que a pessoa acabou de abrir.
      const atual = await redis.get(clientKeyOf(clientId));
      if (atual === socketId) await redis.del(clientKeyOf(clientId));
    },

    async socketOfClient(clientId) {
      return (await redis.get(clientKeyOf(clientId))) ?? null;
    },

    async getPresence(socketId) {
      return fromHash(await redis.hgetall(presenceKeyOf(socketId)));
    },

    // --- Diretório -------------------------------------------------------

    async bindNickname(nickname, clientId) {
      await redis.set(nickKeyOf(nickname), clientId, 'EX', PRESENCE_TTL_SEC * 4);
    },

    async unbindNickname(nickname, clientId) {
      // Mesma checagem do unbindClient, e pela mesma razão: a pessoa pode ter
      // aberto outra aba: fechar a antiga não pode apagar o apontador da nova.
      const atual = await redis.get(nickKeyOf(nickname));
      if (atual === clientId) await redis.del(nickKeyOf(nickname));
    },

    async clientOfNickname(nickname) {
      return (await redis.get(nickKeyOf(nickname))) ?? null;
    },

    // --- Beacons ---------------------------------------------------------

    async addBeacon(beacon, ttlSec) {
      const key = beaconKeyOf(beacon.beaconId);

      // A mesma pessoa pode reacender em OUTRA região (mudou de lugar no
      // globo, ou abriu outra aba). Como o id é o mesmo, o hash é
      // sobrescrito — mas o Set da região antiga continuaria apontando para
      // ele, e a região antiga passaria a listar um beacon que agora está em
      // outro lugar.
      const anterior = beaconFromHash(await redis.hgetall(key));
      if (anterior && anterior.regionKey !== beacon.regionKey) {
        await redis.srem(beaconsOfRegion(anterior.regionKey), beacon.beaconId);
      }

      await redis
        .pipeline()
        .hset(key, beaconToHash(beacon))
        .expire(key, ttlSec)
        .sadd(beaconsOfRegion(beacon.regionKey), beacon.beaconId)
        // No indice mundial a pontuacao e' o instante: pedir "os mais
        // recentes" custa uma consulta so', por maior que ele fique.
        .zadd(BEACONS_GLOBAIS, Date.now(), beacon.beaconId)
        .exec();

      if (beacon.pais) {
        await redis.zadd(beaconsDoPais(beacon.pais), Date.now(), beacon.beaconId);
      }
    },

    async removeBeacon(beaconId, regionKey) {
      // O pais sai do hash ANTES de apaga-lo: depois nao ha' como saber de
      // qual indice tirar o id, e ele ficaria la' apontando para o nada.
      const anterior = beaconFromHash(await redis.hgetall(beaconKeyOf(beaconId)));

      const p = redis
        .pipeline()
        .del(beaconKeyOf(beaconId))
        .srem(beaconsOfRegion(regionKey), beaconId)
        .zrem(BEACONS_GLOBAIS, beaconId);
      if (anterior?.pais) p.zrem(beaconsDoPais(anterior.pais), beaconId);
      await p.exec();
    },

    async getBeacon(beaconId) {
      return beaconFromHash(await redis.hgetall(beaconKeyOf(beaconId)));
    },

    async listBeacons(regionKey) {
      const ids = await redis.smembers(beaconsOfRegion(regionKey));
      return lerEmLote(redis, ids, beaconKeyOf, beaconFromHash, (mortos) =>
        redis.srem(beaconsOfRegion(regionKey), ...mortos),
      );
    },

    async listBeaconsGlobais(limite, pais) {
      const chave = pais ? beaconsDoPais(pais) : BEACONS_GLOBAIS;
      // Do mais recente para o mais antigo, so' o teto pedido.
      const ids = await redis.zrevrange(chave, 0, Math.max(0, limite - 1));
      return lerEmLote(redis, ids, beaconKeyOf, beaconFromHash, (mortos) =>
        redis.zrem(chave, ...mortos),
      );
    },

    async contarBeacons(pais) {
      return redis.zcard(pais ? beaconsDoPais(pais) : BEACONS_GLOBAIS);
    },

    // --- Pedidos ---------------------------------------------------------

    async putRequest(req, ttlSec) {
      await redis.set(requestKeyOf(req.requestId), JSON.stringify(req), 'EX', ttlSec);
    },

    async takeRequest(requestId) {
      const cru = await redis.get(requestKeyOf(requestId));
      if (!cru) return null;
      // Apaga ANTES de devolver: dois aceites simultâneos do mesmo pedido não
      // podem virar duas conexões.
      await redis.del(requestKeyOf(requestId));
      try {
        return JSON.parse(cru) as PendingRequest;
      } catch {
        return null;
      }
    },

    // --- Bloqueios -------------------------------------------------------

    async block(clientId, targetClientId) {
      // Sem expiração: bloqueio que vence sozinho não é bloqueio.
      await redis.set(blockKeyOf(clientId, targetClientId), '1');
    },

    async isBlocked(a, b) {
      return (await redis.get(blockKeyOf(a, b))) !== null;
    },

    async close() {
      await redis.quit();
    },
  };
}

// ---------------------------------------------------------------------------
// Memória (apenas desenvolvimento)
// ---------------------------------------------------------------------------

export function createMemoryStore(): PresenceStore {
  /** socketId -> presença + quando expira. */
  const presencas = new Map<SocketId, { presence: Presence; expiraEm: number }>();
  const regioes = new Map<RegionKey, Set<SocketId>>();
  const clientes = new Map<ClientId, SocketId>();
  /** nickname em minúsculas -> clientId. O índice plano da busca. */
  const apelidos = new Map<string, ClientId>();
  const beacons = new Map<string, Beacon>();
  const beaconsPorRegiao = new Map<RegionKey, Set<string>>();
  const pedidos = new Map<string, { req: PendingRequest; expiraEm: number }>();
  const bloqueios = new Set<string>();

  const vivo = (entrada: { expiraEm: number }) => entrada.expiraEm > Date.now();

  return {
    kind: 'memory',

    async add(socketId, presence) {
      presencas.set(socketId, {
        presence,
        expiraEm: Date.now() + PRESENCE_TTL_SEC * 1000,
      });
      const regiao = regioes.get(presence.regionKey) ?? new Set<SocketId>();
      regiao.add(socketId);
      regioes.set(presence.regionKey, regiao);
    },

    async touch(socketId) {
      const entrada = presencas.get(socketId);
      if (!entrada || !vivo(entrada)) return false;
      entrada.expiraEm = Date.now() + PRESENCE_TTL_SEC * 1000;
      return true;
    },

    async remove(socketId, regionKey) {
      presencas.delete(socketId);
      regioes.get(regionKey)?.delete(socketId);
    },

    async listRegion(regionKey) {
      const regiao = regioes.get(regionKey);
      if (!regiao) return [];

      const saida: Presence[] = [];
      for (const socketId of [...regiao]) {
        const entrada = presencas.get(socketId);
        if (entrada && vivo(entrada)) saida.push(entrada.presence);
        else {
          presencas.delete(socketId);
          regiao.delete(socketId);
        }
      }
      return saida;
    },

    async bindClient(clientId, socketId) {
      clientes.set(clientId, socketId);
    },

    async unbindClient(clientId, socketId) {
      if (clientes.get(clientId) === socketId) clientes.delete(clientId);
    },

    async socketOfClient(clientId) {
      return clientes.get(clientId) ?? null;
    },

    async getPresence(socketId) {
      const entrada = presencas.get(socketId);
      if (!entrada || !vivo(entrada)) return null;
      return entrada.presence;
    },

    async bindNickname(nickname, clientId) {
      apelidos.set(nickname.trim().toLowerCase(), clientId);
    },

    async unbindNickname(nickname, clientId) {
      const chave = nickname.trim().toLowerCase();
      if (apelidos.get(chave) === clientId) apelidos.delete(chave);
    },

    async clientOfNickname(nickname) {
      return apelidos.get(nickname.trim().toLowerCase()) ?? null;
    },

    async addBeacon(beacon) {
      const anterior = beacons.get(beacon.beaconId);
      if (anterior && anterior.regionKey !== beacon.regionKey) {
        beaconsPorRegiao.get(anterior.regionKey)?.delete(beacon.beaconId);
      }
      beacons.set(beacon.beaconId, beacon);
      const r = beaconsPorRegiao.get(beacon.regionKey) ?? new Set<string>();
      r.add(beacon.beaconId);
      beaconsPorRegiao.set(beacon.regionKey, r);
    },

    async removeBeacon(beaconId, regionKey) {
      beacons.delete(beaconId);
      beaconsPorRegiao.get(regionKey)?.delete(beaconId);
    },

    async getBeacon(beaconId) {
      const b = beacons.get(beaconId);
      if (!b) return null;
      if (b.expiresAt <= Date.now()) {
        beacons.delete(beaconId);
        beaconsPorRegiao.get(b.regionKey)?.delete(beaconId);
        return null;
      }
      return b;
    },

    async listBeacons(regionKey) {
      const ids = beaconsPorRegiao.get(regionKey);
      if (!ids) return [];
      const saida: Beacon[] = [];
      for (const id of [...ids]) {
        const b = beacons.get(id);
        if (b && b.expiresAt > Date.now()) saida.push(b);
        else {
          beacons.delete(id);
          ids.delete(id);
        }
      }
      return saida;
    },

    async contarBeacons(pais) {
      let n = 0;
      for (const b of beacons.values()) {
        if (b.expiresAt <= Date.now()) continue;
        if (!pais || b.pais === pais) n += 1;
      }
      return n;
    },

    async listBeaconsGlobais(limite, pais) {
      // Em memoria nao ha indice: sao poucos sinais por definicao (isto so'
      // roda em desenvolvimento), entao varrer e ordenar custa nada.
      const vivos: Beacon[] = [];
      for (const [id, b] of beacons) {
        if (b.expiresAt <= Date.now()) beacons.delete(id);
        else if (!pais || b.pais === pais) vivos.push(b);
      }
      return vivos.sort((a, b) => b.expiresAt - a.expiresAt).slice(0, limite);
    },

    async putRequest(req, ttlSec) {
      pedidos.set(req.requestId, { req, expiraEm: Date.now() + ttlSec * 1000 });
    },

    async takeRequest(requestId) {
      const e = pedidos.get(requestId);
      pedidos.delete(requestId);
      if (!e || !vivo(e)) return null;
      return e.req;
    },

    async block(clientId, targetClientId) {
      bloqueios.add(blockKeyOf(clientId, targetClientId));
    },

    async isBlocked(a, b) {
      return bloqueios.has(blockKeyOf(a, b));
    },

    async close() {
      presencas.clear();
      regioes.clear();
      clientes.clear();
      apelidos.clear();
      beacons.clear();
      beaconsPorRegiao.clear();
      pedidos.clear();
      bloqueios.clear();
    },
  };
}
