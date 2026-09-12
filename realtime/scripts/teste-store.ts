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
  const strings = new Map<string, { valor: string; expiraEm: number | null }>();

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
      // O DEL do Redis apaga a chave seja ela do tipo que for. Este duble ja
      // apagou SO hash um dia, e o efeito foi pior que um teste falhando: as
      // chaves de string (apontador de cliente, nickname, pedido de conexao)
      // continuavam vivas depois do del, e o teste do `takeRequest` — o que
      // garante que um convite so pode ser aceito uma vez — passava sem provar
      // nada. Duble que diverge do original nao e teste, e falsa seguranca.
      const n =
        (hashes.delete(key) ? 1 : 0) +
        (strings.delete(key) ? 1 : 0) +
        (sets.delete(key) ? 1 : 0);
      return n > 0 ? 1 : 0;
    },
    async hgetall(key: string) {
      return vivo(key) ? { ...hashes.get(key)!.valor } : {};
    },
    async set(key: string, value: string, mode?: 'EX', ttl?: number) {
      strings.set(key, {
        valor: value,
        expiraEm: mode === 'EX' && ttl ? agora + ttl * 1000 : null,
      });
      return 'OK';
    },
    async get(key: string) {
      const e = strings.get(key);
      if (!e) return null;
      if (e.expiraEm !== null && e.expiraEm <= agora) {
        strings.delete(key);
        return null;
      }
      return e.valor;
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

  // -------------------------------------------------------------------------
  // Diretorio de nicknames — o indice que faz a lupa atravessar regioes
  // -------------------------------------------------------------------------
  console.log('\n=== diretorio de nicknames ===');

  const dir = createRedisStore(fakeRedis());

  // Duas pessoas em regioes DIFERENTES: e exatamente o caso que `listRegion`
  // nao cobre e que a busca precisa cobrir.
  const ana: Presence = { ...presenca('ana-id', 'minas gerais'), nickname: 'ana_mg' };
  const yuki: Presence = { ...presenca('yuki-id', 'tokyo'), nickname: 'yuki' };
  await dir.add('sa', ana);
  await dir.bindClient('ana-id', 'sa');
  await dir.bindNickname('ana_mg', 'ana-id');
  await dir.add('sy', yuki);
  await dir.bindClient('yuki-id', 'sy');
  await dir.bindNickname('yuki', 'yuki-id');

  checa('acha quem esta em outra regiao', await dir.clientOfNickname('yuki'), 'yuki-id');
  checa(
    'a busca nao diferencia maiuscula nem espaco',
    await dir.clientOfNickname('  YUKI '),
    'yuki-id',
  );
  checa('nickname que ninguem tem', await dir.clientOfNickname('fulano'), null);

  // O caminho completo da lupa: nickname -> clientId -> socketId -> presenca
  // com coordenada, que e o que o globo precisa para virar ate a pessoa.
  const socketDaYuki = await dir.socketOfClient((await dir.clientOfNickname('yuki'))!);
  checa(
    'do nickname ate a coordenada',
    (await dir.getPresence(socketDaYuki!))?.regionKey,
    'tokyo',
  );

  // Fechar UMA aba nao pode apagar o apontador de outra: o desindexar so vale
  // quando quem pede e o dono atual do nome.
  await dir.unbindNickname('yuki', 'outro-id');
  checa(
    'desindexar em nome de outro clientId nao apaga',
    await dir.clientOfNickname('yuki'),
    'yuki-id',
  );
  await dir.unbindNickname('yuki', 'yuki-id');
  checa('desindexar o proprio apaga', await dir.clientOfNickname('yuki'), null);

  checa('presenca de socket que nao existe', await dir.getPresence('nao-existe'), null);

  const memDir = createMemoryStore();
  await memDir.add('m9', { ...presenca('carla-id', 'ceará'), nickname: 'carlinha' });
  await memDir.bindClient('carla-id', 'm9');
  await memDir.bindNickname('carlinha', 'carla-id');
  checa(
    'memoria: mesmo contrato de diretorio',
    await memDir.clientOfNickname('CARLINHA'),
    'carla-id',
  );
  checa(
    'memoria: presenca por socket',
    (await memDir.getPresence('m9'))?.nickname,
    'carlinha',
  );
  await memDir.unbindNickname('carlinha', 'carla-id');
  checa('memoria: desindexa', await memDir.clientOfNickname('carlinha'), null);

  // -------------------------------------------------------------------------
  // Os ponteiros VENCEM. E' o defeito que passou para producao em 12/09/2026:
  // presenca era renovada pelo heartbeat, mas `client:` e `nick:` nao, entao
  // depois de tres minutos a pessoa sumia da busca sem sair do lugar.
  // -------------------------------------------------------------------------
  console.log('\n=== validade dos ponteiros (o bug do "sempre offline") ===');

  const vencimento = createRedisStore(fakeRedis());
  await vencimento.add('sv', { ...presenca('vera-id', 'bahia'), nickname: 'vera' });
  await vencimento.bindClient('vera-id', 'sv');
  await vencimento.bindNickname('vera', 'vera-id');

  checa('achada assim que entra', await vencimento.clientOfNickname('vera'), 'vera-id');

  // O TTL dos ponteiros e' PRESENCE_TTL_SEC * 4 = 180s.
  avancarSegundos(200);
  checa(
    'sem renovar, some da busca mesmo online',
    await vencimento.clientOfNickname('vera'),
    null,
  );

  // E' isto que o heartbeat passou a fazer.
  await vencimento.bindClient('vera-id', 'sv');
  await vencimento.bindNickname('vera', 'vera-id');
  avancarSegundos(100);
  checa(
    'renovando a cada batida, continua achavel',
    await vencimento.clientOfNickname('vera'),
    'vera-id',
  );
  checa(
    'e o apontador para a conexao tambem',
    await vencimento.socketOfClient('vera-id'),
    'sv',
  );

  // -------------------------------------------------------------------------
  // Pedido de conexao: uma vez, e so uma
  // -------------------------------------------------------------------------
  console.log('\n=== pedidos de conexao ===');

  const pedidos = createRedisStore(fakeRedis());
  const pedido = {
    requestId: 'r1',
    fromSocketId: 'sa',
    fromClientId: 'ana-id',
    toSocketId: 'sy',
    toClientId: 'yuki-id',
  };
  await pedidos.putRequest(pedido, 60);
  checa('o primeiro aceite recebe o pedido', (await pedidos.takeRequest('r1'))?.toClientId, 'yuki-id');
  // Se este falhar, dois aceites do MESMO convite viram duas conexoes.
  checa('o segundo aceite nao recebe nada', await pedidos.takeRequest('r1'), null);

  console.log(`\npassou: ${passou} | falhou: ${falhou}`);
  process.exit(falhou === 0 ? 0 : 1);
}

void main();
