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

  // --- Beacons -----------------------------------------------------------
  addBeacon(beacon: Beacon, ttlSec: number): Promise<void>;
  removeBeacon(beaconId: string, regionKey: RegionKey): Promise<void>;
  listBeacons(regionKey: RegionKey): Promise<Beacon[]>;
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
const beaconKeyOf = (beaconId: string) => `beacon:${beaconId}`;
const beaconsOfRegion = (regionKey: RegionKey) => `beacons:${regionKey}`;
const requestKeyOf = (requestId: string) => `request:${requestId}`;
/** Bloqueio é simétrico, então a chave é o par ordenado. */
const blockKeyOf = (a: ClientId, b: ClientId) =>
  `block:${[a, b].sort().join('|')}`;

const beaconToHash = (b: Beacon): Record<string, string> => ({
  beaconId: b.beaconId,
  clientId: b.clientId,
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
  quit(): Promise<unknown>;
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
      if (socketIds.length === 0) return [];

      const presences: Presence[] = [];
      const mortos: string[] = [];

      for (const socketId of socketIds) {
        const hash = await redis.hgetall(presenceKeyOf(socketId));
        const presence = fromHash(hash);
        if (presence) presences.push(presence);
        else mortos.push(socketId);
      }

      // Limpeza preguiçosa dos socketIds cujo hash já expirou.
      if (mortos.length > 0) {
        await redis.srem(regionKeyOf(regionKey), ...mortos);
      }

      return presences;
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

      await redis.hset(key, beaconToHash(beacon));
      await redis.expire(key, ttlSec);
      await redis.sadd(beaconsOfRegion(beacon.regionKey), beacon.beaconId);
    },

    async removeBeacon(beaconId, regionKey) {
      await redis.del(beaconKeyOf(beaconId));
      await redis.srem(beaconsOfRegion(regionKey), beaconId);
    },

    async getBeacon(beaconId) {
      return beaconFromHash(await redis.hgetall(beaconKeyOf(beaconId)));
    },

    async listBeacons(regionKey) {
      const ids = await redis.smembers(beaconsOfRegion(regionKey));
      if (ids.length === 0) return [];

      const vivos: Beacon[] = [];
      const mortos: string[] = [];
      for (const id of ids) {
        const b = beaconFromHash(await redis.hgetall(beaconKeyOf(id)));
        if (b) vivos.push(b);
        else mortos.push(id);
      }
      // Mesma limpeza preguiçosa da presença: o Set não expira sozinho.
      if (mortos.length > 0) await redis.srem(beaconsOfRegion(regionKey), ...mortos);
      return vivos;
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
      beacons.clear();
      beaconsPorRegiao.clear();
      pedidos.clear();
      bloqueios.clear();
    },
  };
}
