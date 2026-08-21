/**
 * Teste do store de presença — sem Redis instalado.
 *
 * O `createRedisStore` recebe uma interface estreita (`RedisLike`) e não o
 * cliente do ioredis. Isso não é enfeite de arquitetura: é o que permite
 * exercitar o código REAL do store contra um dublê que imita o pouco que ele
 * usa — inclusive a parte que só acontece com o tempo passando, como um hash
 * expirar e o Set ficar com um membro morto.
 *
 * O que este teste NÃO cobre: o Redis de verdade. Comportamento de rede,
 * reconexão e semântica exata do servidor Redis só um Redis prova. Isto aqui
 * prova a lógica que escrevemos.
 *
 *   npm run test:store
 */

import { createMemoryStore, createRedisStore } from '../src/store.js';
import type { Presence } from '../shared/protocol.js';

// ---------------------------------------------------------------------------
// Dublê de Redis: um Map com TTL, e um relógio que eu controlo
// ---------------------------------------------------------------------------

let agora = 0;
const avancarSegundos = (s: number) => {
  agora += s * 1000;
};

function fakeRedis() {
  const hashes = new Map<string, { valor: Record<string, string>; expiraEm: number | null }>();
  const sets = new Map<string, Set<string>>();

  const vivo = (k: string) => {
    const e = hashes.get(k);
    if (!e) return false;
    if (e.expiraEm !== null && e.expiraEm <= agora) {
      hashes.delete(k); // é o que o Redis faz: chave vencida deixa de existir
      return false;
    }
    return true;
  };

  return {
    async hset(key: string, value: Record<string, string>) {
      hashes.set(key, { valor: { ...value }, expiraEm: null });
      return Object.keys(value).length;
    },
    async expire(key: string, seconds: number) {
      if (!vivo(key)) return 0; // o Redis devolve 0 para chave inexistente
      hashes.get(key)!.expiraEm = agora + seconds * 1000;
      return 1;
    },
    async sadd(key: string, member: string) {
      const s = sets.get(key) ?? new Set<string>();
      s.add(member);
      sets.set(key, s);
      return 1;
    },
    async srem(key: string, ...members: string[]) {
      const s = sets.get(key);
      if (!s) return 0;
      let n = 0;
      for (const m of members) if (s.delete(m)) n++;
      return n;
    },
    async smembers(key: string) {
      return [...(sets.get(key) ?? [])];
    },
    async del(key: string) {
      return hashes.delete(key) ? 1 : 0;
    },
    async hgetall(key: string) {
      return vivo(key) ? { ...hashes.get(key)!.valor } : {};
    },
    async quit() {
      return 'OK';
    },
    /** Só para o teste espiar o Set por dentro. */
    _tamanhoDoSet(key: string) {
      return sets.get(key)?.size ?? 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Verificação
// ---------------------------------------------------------------------------

let passou = 0;
let falhou = 0;

function checa(rotulo: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(
    ok ? `PASS  ${rotulo}` : `FALHA ${rotulo}\n      esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(real)}`,
  );
  ok ? passou++ : falhou++;
}

const presenca = (clientId: string, regionKey = 'minas gerais'): Presence => ({
  clientId,
  lat: -19.9,
  lon: -43.9,
  regionKey,
});

async function main() {
  console.log('=== store em Redis (com dublê) ===');
  const redis = fakeRedis();
  const store = createRedisStore(redis);

  await store.add('s1', presenca('ana'));
  await store.add('s2', presenca('bruno'));
  checa(
    'duas presencas na regiao',
    (await store.listRegion('minas gerais')).map((p) => p.clientId).sort(),
    ['ana', 'bruno'],
  );

  checa('regiao vazia devolve lista vazia', await store.listRegion('acre'), []);

  checa('heartbeat renova uma presenca viva', await store.touch('s1', 'minas gerais'), true);

  // 30s: dentro do TTL de 45s dos dois.
  avancarSegundos(30);
  checa(
    'ninguem expira antes do TTL',
    (await store.listRegion('minas gerais')).length,
    2,
  );

  // A Ana bate o heartbeat; o Bruno some do mapa.
  await store.touch('s1', 'minas gerais');
  avancarSegundos(20); // Ana: 20s desde a batida. Bruno: 50s, acima dos 45.

  checa(
    'quem parou de bater expira, quem bateu fica',
    (await store.listRegion('minas gerais')).map((p) => p.clientId),
    ['ana'],
  );

  // ESTE é o ponto delicado: o Redis expira o hash, mas o socketId morto
  // continuaria no Set para sempre se ninguem o tirasse.
  checa(
    'a leitura limpa o socketId morto do Set',
    redis._tamanhoDoSet('region:minas gerais'),
    1,
  );

  checa(
    'heartbeat de presenca ja expirada devolve false',
    await store.touch('s2', 'minas gerais'),
    false,
  );

  await store.remove('s1', 'minas gerais');
  checa('remove esvazia a regiao', await store.listRegion('minas gerais'), []);
  checa('remove tira do Set tambem', redis._tamanhoDoSet('region:minas gerais'), 0);

  console.log('\n=== store em memoria (dev) — mesmo contrato ===');
  const mem = createMemoryStore();
  await mem.add('m1', presenca('carla', 'são paulo'));
  checa(
    'memoria: presenca aparece na regiao dela',
    (await mem.listRegion('são paulo')).map((p) => p.clientId),
    ['carla'],
  );
  checa('memoria: outra regiao nao vaza', await mem.listRegion('minas gerais'), []);
  checa('memoria: heartbeat de quem existe', await mem.touch('m1', 'são paulo'), true);
  checa(
    'memoria: heartbeat de quem nunca entrou',
    await mem.touch('inexistente', 'são paulo'),
    false,
  );
  await mem.remove('m1', 'são paulo');
  checa('memoria: remove esvazia', await mem.listRegion('são paulo'), []);

  console.log(`\npassou: ${passou} | falhou: ${falhou}`);
  process.exit(falhou === 0 ? 0 : 1);
}

void main();
