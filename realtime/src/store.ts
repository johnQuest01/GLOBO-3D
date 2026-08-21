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

import type { Presence, RegionKey, SocketId } from '../shared/protocol.js';
import { PRESENCE_TTL_SEC } from '../shared/protocol.js';

export interface PresenceStore {
  readonly kind: 'redis' | 'memory';
  /** Grava a presença e coloca o socket na região. */
  add(socketId: SocketId, presence: Presence): Promise<void>;
  /** Renova o TTL. Devolve false se a presença já tinha expirado. */
  touch(socketId: SocketId, regionKey: RegionKey): Promise<boolean>;
  remove(socketId: SocketId, regionKey: RegionKey): Promise<void>;
  /** Todo mundo vivo na região, já sem os expirados. */
  listRegion(regionKey: RegionKey): Promise<Presence[]>;
  close(): Promise<void>;
}

const regionKeyOf = (regionKey: RegionKey) => `region:${regionKey}`;
const presenceKeyOf = (socketId: SocketId) => `presence:${socketId}`;

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

    async close() {
      presencas.clear();
      regioes.clear();
    },
  };
}
