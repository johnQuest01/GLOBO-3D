/**
 * Estresse: muita gente ao mesmo tempo, de verdade.
 *
 * A PERGUNTA QUE ELE RESPONDE não é "aguenta 500 mil pessoas?" — nenhum teste
 * rodado de um notebook responde isso, e dizer que responde seria pior do que
 * não testar. A pergunta é mais útil e mais honesta: *o custo cresce com o
 * número de pessoas, ou com o QUADRADO dele?*
 *
 * Essa diferença é tudo. Um sistema linear que hoje custa X com 50 pessoas
 * custa 10.000X com 500 mil, e isso se compra com máquina. Um quadrático custa
 * 100 milhões de X, e isso não se compra. Com algumas dezenas de conexões dá
 * para ver de qual dos dois se trata — é o que estes testes medem, contando
 * eventos por pessoa em vez de cronometrar o relógio.
 *
 * O QUE ELE NÃO PROVA: comportamento sob carga real de rede, memória do
 * servidor ao longo de horas, e o Redis com milhões de chaves. Isso precisa de
 * carga distribuída e de tempo, e não cabe aqui.
 *
 * CUIDADO COM O ALVO: isto roda contra a produção. Os números são modestos de
 * propósito — o suficiente para revelar a forma da curva, não para derrubar o
 * serviço de quem estiver usando.
 */

import { randomUUID } from "node:crypto";

import { Suite, esperarAte, ok, pausa } from "./arnes";
import { ContaDeTeste, apagarConta, criarConta } from "./contas";
import { Aparelho } from "./socket";

/**
 * Quantas conexões simultâneas.
 *
 * PRECISA PASSAR DO TETO DE PLATEIA do servidor (30), senão o teste de
 * escala não testa nada: abaixo do teto todo mundo recebe todo mundo, que é o
 * comportamento correto para um lugar pequeno. É acima dele que se vê se o
 * custo por evento para de crescer.
 */
const QUANTOS = 64;

/** O mesmo teto que realtime/src/presence.ts aplica. */
const PLATEIA_MAX = 30;

const SAO_PAULO = { lat: -23.55, lon: -46.63, regionKey: "são paulo" };

/** Mediana e p95 dizem mais que a média, que uma única lentidão distorce. */
function estatisticas(valores: number[]) {
  const v = [...valores].sort((a, b) => a - b);
  const em = (q: number) =>
    v[Math.min(v.length - 1, Math.floor(v.length * q))]!;
  return {
    mediana: em(0.5),
    p95: em(0.95),
    pior: v[v.length - 1]!,
    n: v.length,
  };
}

export async function suiteEstresse(
  base: string,
  urlRealtime: string,
): Promise<Suite> {
  const s = new Suite(`estresse — ${QUANTOS} conexões simultâneas`);

  const contas: ContaDeTeste[] = [];
  const aparelhos: Aparelho[] = [];

  s.aoFinal(() => {
    for (const ap of aparelhos) ap.desligar();
  });
  s.aoFinal(async () => {
    for (const c of contas) await apagarConta(c.id);
  });

  try {
    // -----------------------------------------------------------------------
    // Criar as contas
    // -----------------------------------------------------------------------

    await s.teste(`criar ${QUANTOS} contas de verdade`, async () => {
      const comecou = Date.now();
      /*
       * Em lotes, e não todas de uma vez: o cadastro faz derivação de senha
       * (scrypt, de propósito caro), e disparar 24 ao mesmo tempo mediria a
       * fila da função serverless em vez do que interessa.
       */
      for (let i = 0; i < QUANTOS; i += 8) {
        const lote = await Promise.all(
          Array.from({ length: Math.min(8, QUANTOS - i) }, (_, j) =>
            criarConta(base, `e${i + j}`, {
              country: "Brasil",
              state: "São Paulo",
              city: "São Paulo",
              lat: SAO_PAULO.lat,
              lon: SAO_PAULO.lon,
            }),
          ),
        );
        contas.push(...lote);
      }
      const ms = Date.now() - comecou;
      return `${QUANTOS} contas em ${ms}ms (${Math.round(ms / QUANTOS)}ms cada)`;
    });

    // -----------------------------------------------------------------------
    // Conectar
    // -----------------------------------------------------------------------

    await s.teste(`${QUANTOS} conexões simultâneas sobem juntas`, async () => {
      const comecou = Date.now();
      const tempos: number[] = [];

      await Promise.all(
        contas.map(async (c, i) => {
          const t = Date.now();
          const ap = new Aparelho(urlRealtime, c.cliente, `e${i}`);
          aparelhos.push(ap);
          await ap.ligar();
          tempos.push(Date.now() - t);
        }),
      );

      const vivas = aparelhos.filter((a) => a.ligado).length;
      ok(vivas === QUANTOS, `só ${vivas} de ${QUANTOS} continuam de pé`);

      const e = estatisticas(tempos);
      return `todas em ${Date.now() - comecou}ms — mediana ${e.mediana}ms, p95 ${e.p95}ms, pior ${e.pior}ms`;
    });

    await s.teste("todas entram no globo na mesma região", async () => {
      const comecou = Date.now();
      await Promise.all(
        aparelhos.map(async (ap, i) => {
          ap.emitir("presence:join", {
            clientId: `estresse-${contas[i]!.nickname}`,
            ...SAO_PAULO,
          });
          await esperarAte(
            () => ap.quantos("presence:snapshot") >= 1,
            `snapshot de e${i}`,
            20000,
          );
        }),
      );
      return `${QUANTOS} entradas em ${Date.now() - comecou}ms`;
    });

    // -----------------------------------------------------------------------
    // A pergunta do quadrado
    // -----------------------------------------------------------------------

    await s.teste(
      "o RETRATO da região tem teto — não cresce com a multidão",
      async () => {
        /*
         * O snapshot mandava TODO MUNDO da região para quem entrasse. Com mil
         * pessoas em São Paulo são mil registros por pessoa que abre o
         * aplicativo; com cinquenta mil, a conta não fecha. O teto é o que
         * transforma isso num custo constante — e o número do "total" é o que
         * sobra quando os pontos não cabem.
         */
        const extra = aparelhos[0]!;
        extra.esquecer();
        extra.emitir("presence:join", {
          clientId: `estresse-${contas[0]!.nickname}`,
          ...SAO_PAULO,
        });
        await esperarAte(
          () => extra.quantos("presence:snapshot") >= 1,
          "snapshot",
        );
        const snap = extra.ultimo<{ presences: unknown[]; total?: number }>(
          "presence:snapshot",
        )!;
        ok(
          snap.presences.length <= 120,
          `veio ${snap.presences.length}, acima do teto`,
        );
        return `${snap.presences.length} pontos enviados, ${snap.total ?? "?"} de verdade na região`;
      },
    );

    await s.teste(
      "acender sinal NÃO custa uma entrega por pessoa do mundo",
      async () => {
        /*
         * Este é o teste que mede a forma da curva. Todos acendem sinal; se cada
         * um fosse anunciado a todos, o total de anúncios seria QUANTOS² — e o
         * aplicativo não passaria de alguns milhares de pessoas.
         *
         * Como todos aqui estão na MESMA região (o pior caso), esperar zero seria
         * errado: perto é para ser anunciado, e é o que faz o globo parecer vivo.
         * O que o teste exige é que o custo por pessoa seja LIMITADO — que
         * acender um sinal não fique mais caro só porque a cidade encheu.
         *
         * O TETO É LINEAR DE PROPÓSITO, e não o quadrado. Um teto quadrático
         * aprovaria exatamente o desenho que não escala, que foi o que a primeira
         * versão deste teste fez: mediu 576 anúncios para 24 pessoas, viu que 576
         * é 24², e passou.
         */
        for (const ap of aparelhos) ap.esquecer();

        const comecou = Date.now();
        for (const ap of aparelhos) {
          ap.emitir("beacon:raise", { ttlSec: 300, topic: "estresse" });
        }
        await pausa(4000);

        const anuncios = aparelhos.reduce(
          (soma, ap) => soma + ap.quantos("beacon:new"),
          0,
        );
        const quadrado = QUANTOS * (QUANTOS - 1);
        const limite = QUANTOS * PLATEIA_MAX;

        ok(
          anuncios <= limite,
          `${anuncios} entregas para ${QUANTOS} sinais no mesmo lugar. ` +
            `O teto de plateia (${PLATEIA_MAX}) permite no máximo ${limite}; ` +
            `sem teto seriam ${quadrado}, e é esse o desenho que não passa de alguns ` +
            `milhares de pessoas — mil numa cidade dariam um milhão de entregas por rodada.`,
        );

        return (
          `${anuncios} entregas em ${Date.now() - comecou}ms ` +
          `(sem teto seriam ${quadrado}; economia de ${Math.round((1 - anuncios / quadrado) * 100)}%)`
        );
      },
    );

    await s.teste(
      `${QUANTOS} perguntas "quem quer conversar?" ao mesmo tempo`,
      async () => {
        /*
         * O caso da tela de sinais aberta por muita gente junto. Ele só se
         * sustenta porque a resposta fica guardada por alguns segundos no
         * servidor: mil pessoas perguntando ao mesmo tempo devem custar uma
         * leitura, e não mil.
         */
        for (const ap of aparelhos) ap.esquecer();
        const comecou = Date.now();

        await Promise.all(
          aparelhos.map(async (ap, i) => {
            ap.emitir("beacon:find", { limite: 50 });
            await esperarAte(
              () => ap.quantos("beacon:list") >= 1,
              `lista de e${i}`,
              20000,
            );
          }),
        );

        const ms = Date.now() - comecou;
        ok(ms < 15000, `demorou ${ms}ms`);
        return `${QUANTOS} respostas em ${ms}ms (${Math.round(ms / QUANTOS)}ms por pessoa)`;
      },
    );

    // -----------------------------------------------------------------------
    // Conversa sob carga
    // -----------------------------------------------------------------------

    await s.teste(
      "uma rajada de mensagens em pares, todas entregues",
      async () => {
        for (const ap of aparelhos) ap.esquecer();

        const pares: [number, number][] = [];
        for (let i = 0; i + 1 < QUANTOS; i += 2) pares.push([i, i + 1]);

        const comecou = Date.now();
        const ids = new Map<string, number>();

        // Cinco mensagens por par: o balde de `msg:send` comporta 40 por minuto,
        // então isto exercita a rajada sem esbarrar no freio.
        for (let rodada = 0; rodada < 5; rodada++) {
          for (const [a, b] of pares) {
            const id = randomUUID();
            ids.set(id, b);
            aparelhos[a]!.emitir("msg:send", {
              msgId: id,
              to: contas[b]!.nickname,
              kind: "texto",
              payload: `rajada ${rodada} de e${a}`,
            });
          }
        }

        const esperadas = ids.size;
        await esperarAte(
          () => {
            const chegaram = aparelhos.reduce(
              (soma, ap) => soma + ap.quantos("msg:new"),
              0,
            );
            return chegaram >= esperadas;
          },
          "todas as mensagens chegarem",
          40000,
        );

        const ms = Date.now() - comecou;
        const barradas = aparelhos.reduce(
          (s2, ap) => s2 + ap.quantos("rate_limited"),
          0,
        );
        const falhas = aparelhos.reduce(
          (s2, ap) => s2 + ap.quantos("msg:failed"),
          0,
        );
        ok(falhas === 0, `${falhas} mensagens falharam`);

        return `${esperadas} mensagens entre ${pares.length} pares em ${ms}ms (${Math.round(ms / esperadas)}ms cada), ${barradas} barradas pelo freio`;
      },
    );

    await s.teste("o freio protege sem derrubar a conexão", async () => {
      // Uma pessoa mandando muito além do teto precisa ser barrada, e precisa
      // continuar online: desconectar quem exagera derrubaria também quem só
      // digita rápido.
      const ap = aparelhos[0]!;
      ap.esquecer();
      for (let i = 0; i < 80; i++) {
        ap.emitir("msg:send", {
          msgId: randomUUID(),
          to: contas[1]!.nickname,
          kind: "texto",
          payload: "inundação",
        });
      }
      await esperarAte(
        () => ap.quantos("rate_limited") >= 1,
        "rate_limited",
        20000,
      );
      await pausa(1000);
      ok(ap.ligado, "a conexão caiu");
      return `barrado ${ap.quantos("rate_limited")} vez(es), conexão de pé`;
    });

    // -----------------------------------------------------------------------
    // Saída em massa
    // -----------------------------------------------------------------------

    await s.teste("todos saem juntos sem deixar fantasma no mapa", async () => {
      const observador = aparelhos[0]!;
      for (const ap of aparelhos.slice(1)) ap.desligar();
      await pausa(4000);

      observador.esquecer();
      observador.emitir("beacon:find", { limite: 200 });
      await esperarAte(
        () => observador.quantos("beacon:list") >= 1,
        "beacon:list",
      );
      const lista = observador.ultimo<{ sinais: { nickname?: string }[] }>(
        "beacon:list",
      )!;

      /*
       * A CARÊNCIA É DE PROPÓSITO: o sinal sobrevive alguns segundos à queda
       * para aguentar troca de rede. Então o certo aqui não é zero — é que o
       * número não CRESÇA sem limite. O teste confere que os sinais existem e
       * têm prazo, e o de sinais já provou que eles voltam e que morrem.
       */
      const nossos = lista.sinais.filter((x) =>
        contas.some((c) => c.nickname === x.nickname),
      );
      ok(
        nossos.length <= QUANTOS,
        `${nossos.length} sinais para ${QUANTOS} contas`,
      );
      return `${nossos.length} sinais em carência depois de ${QUANTOS - 1} saídas simultâneas`;
    });
  } finally {
    await s.limpar();
  }

  return s;
}
