/**
 * O feed "Para você" — o que otimiza tempo de tela — e a sua avaliação.
 *
 * ESTA SUÍTE FAZ DUAS COISAS que normalmente não andam juntas: prova que o
 * algoritmo funciona como foi desenhado, E prova o que ele faz de errado. As
 * duas são a mesma pergunta feita duas vezes: "o que sobe?". Quando a resposta
 * é "o que a pessoa olhou mais", o teste diz que funciona. Quando a resposta é
 * "o que provoca comentário sobe mesmo sem ninguém ter gostado", o teste diz —
 * com número — o que a objeção dizia com palavras.
 *
 * Os pesos estão em lib/db/paraVoce.ts, com nome. O último teste os imprime
 * ao lado do ranking que produzem.
 */

import { Suite, igual, ok } from "./arnes";
import { Conta } from "./cliente";
import { ContaDeTeste, apagarConta, criarConta, sql } from "./contas";

interface Post {
  id: string;
  autor: string;
  pais: string | null;
  body: string | null;
  curtidas: number;
  comentarios: number;
  nota?: number;
  parcelas?: {
    prende: number;
    social: number;
    afinidade: number;
    frescor: number;
    jaVisto: boolean;
  };
}

const MOSCOU = {
  country: "Rússia",
  state: "Moscovo",
  city: "Moscou",
  lat: 55.76,
  lon: 37.62,
};

export async function suiteParaVoce(base: string): Promise<Suite> {
  const s = new Suite("para você — o feed que otimiza tempo de tela");

  const contas: ContaDeTeste[] = [];
  const nova = async (apelido: string, lugar?: typeof MOSCOU) => {
    const c = await criarConta(base, apelido, lugar);
    contas.push(c);
    return c;
  };
  /** A identidade do NAVEGADOR de quem lê — é por ela que a afinidade existe. */
  const cliente = `zzt_nav_${Math.random().toString(16).slice(2, 10)}`;

  s.aoFinal(async () => {
    await sql`delete from behavior_events where client_id = ${cliente}`;
    await sql`delete from affinity where client_id = ${cliente}`;
    for (const c of contas) {
      await sql`delete from posts where author_id = ${c.id}::uuid`;
      await apagarConta(c.id);
    }
  });

  try {
    const ana = await nova("ana");
    const bia = await nova("bia", MOSCOU);
    const leitor = await nova("leitor");

    const publicar = async (quem: ContaDeTeste, corpo: string) => {
      const r = await quem.cliente.post<{ post: Post }>("/api/posts", {
        kind: "texto",
        body: corpo,
      });
      igual(r.status, 200, "publicou");
      return r.corpo.post;
    };

    const feed = async () =>
      (
        await leitor.cliente.get<{ posts: Post[] }>(
          `/api/posts?de=paravoce&cliente=${cliente}`,
        )
      ).corpo.posts;

    const sinal = async (eventos: Record<string, unknown>[]) => {
      const r = await new Conta(base, "rastreio").post("/api/track", {
        clientId: cliente,
        events: eventos,
      });
      igual(r.status, 200, "sinal gravado");
    };

    const doBrasil = await publicar(ana, "por do sol em Sao Paulo");
    const daRussia = await publicar(bia, "neve em Moscou");

    // -----------------------------------------------------------------------
    // Funciona como desenhado
    // -----------------------------------------------------------------------

    await s.teste("sem histórico, o feed responde e cada post tem nota", async () => {
      const lista = await feed();
      ok(lista.length >= 2, `${lista.length} posts`);
      ok(
        lista.every((p) => typeof p.nota === "number" && p.parcelas),
        "todos com nota e parcelas",
      );
      return `${lista.length} posts, todos com nota`;
    });

    await s.teste("olhar uma publicação deixa marca nela", async () => {
      /*
       * Três vistas de 45 s. O contador mora na linha do post, e é dele que o
       * ranking lê — somar a tabela de eventos a cada leitura seria o custo
       * que cresce com o sucesso.
       */
      for (let i = 0; i < 3; i++) {
        await sinal([
          {
            kind: "post_view",
            refId: daRussia.id,
            regionKey: "Rússia",
            topic: `autor:${bia.nickname}`,
            dwellMs: 45_000,
          },
        ]);
      }
      const l = (await sql`
        select vistas, tempo_visto_seg from posts where id = ${daRussia.id}::uuid`) as {
        vistas: number;
        tempo_visto_seg: number;
      }[];
      igual(l[0]!.vistas, 3, "vistas");
      ok(Math.abs(l[0]!.tempo_visto_seg - 135) < 1, `tempo ${l[0]!.tempo_visto_seg}s`);
      return "3 vistas, 135 s";
    });

    await s.teste("uma passada de olho NÃO conta como vista", async () => {
      await sinal([{ kind: "post_view", refId: doBrasil.id, regionKey: "Brasil", dwellMs: 400 }]);
      const l = (await sql`
        select vistas from posts where id = ${doBrasil.id}::uuid`) as { vistas: number }[];
      igual(l[0]!.vistas, 0, "400 ms não é olhar, é rolar");
    });

    await s.teste("o que a pessoa olhou mais sobe para ela", async () => {
      const lista = await feed();
      const iR = lista.findIndex((p) => p.id === daRussia.id);
      const iB = lista.findIndex((p) => p.id === doBrasil.id);
      ok(iR >= 0 && iB >= 0, "os dois estão no feed");
      ok(iR < iB, `Rússia em ${iR}, Brasil em ${iB}`);
      const r = lista[iR]!;
      ok(r.parcelas!.prende > 0, "a parcela PRENDE está ligada");
      ok(r.parcelas!.afinidade > 0, "a afinidade com a Rússia está ligada");
      return `Rússia em ${iR + 1}º (prende ${r.parcelas!.prende.toFixed(2)}, afinidade ${r.parcelas!.afinidade.toFixed(2)})`;
    });

    await s.teste("o que já foi visto pesa metade", async () => {
      const lista = await feed();
      const r = lista.find((p) => p.id === daRussia.id)!;
      igual(r.parcelas!.jaVisto, true, "marcado como visto");
      const bruta = r.parcelas!.prende + r.parcelas!.social + r.parcelas!.afinidade + r.parcelas!.frescor;
      ok(Math.abs(r.nota! - bruta * 0.5) < 0.01, `nota ${r.nota!.toFixed(2)} = metade de ${bruta.toFixed(2)}`);
    });

    await s.teste("quem não tem histórico vê o que prende TODO MUNDO", async () => {
      /*
       * Outro navegador, sem afinidade nenhuma. A Rússia ainda sobe — não por
       * gosto dessa pessoa, mas porque prendeu OUTRAS. É o que torna um feed
       * destes coletivo: o que segura alguém passa a ser mostrado para todos.
       */
      const outro = `zzt_nav_${Math.random().toString(16).slice(2, 10)}`;
      const lista = (
        await leitor.cliente.get<{ posts: Post[] }>(`/api/posts?de=paravoce&cliente=${outro}`)
      ).corpo.posts;
      const r = lista.find((p) => p.id === daRussia.id)!;
      igual(r.parcelas!.afinidade, 0, "sem afinidade própria");
      ok(r.parcelas!.prende > 0, "mas a parcela PRENDE vem dos outros");
      return "o que prendeu alguém sobe para todos";
    });

    // -----------------------------------------------------------------------
    // O que ele faz de errado — com número
    // -----------------------------------------------------------------------

    await s.teste(
      "AVALIAÇÃO: a publicação que provoca resposta sobe acima da que não provoca",
      async () => {
        /*
         * Duas publicações novas, mesma pessoa, mesmo lugar, mesmo minuto. Uma
         * recebe cinco comentários de cinco pessoas; a outra, nada. Ninguém
         * curtiu nenhuma das duas. O algoritmo não sabe se os cinco
         * comentários são elogio ou briga — só sabe que houve resposta, e
         * resposta é o gesto mais caro, logo pesa mais.
         *
         * O teste PASSA se a comentada subir. Ele é a objeção, em número.
         */
        const quieta = await publicar(ana, "publicacao quieta");
        const provocadora = await publicar(ana, "publicacao que provoca");

        for (let i = 0; i < 5; i++) {
          const alguem = await nova(`resp${i}`);
          const r = await alguem.cliente.post("/api/comentarios", {
            post: provocadora.id,
            corpo: "discordo!",
          });
          igual(r.status, 200, `comentário ${i + 1}`);
        }

        const lista = await feed();
        const iQ = lista.findIndex((p) => p.id === quieta.id);
        const iP = lista.findIndex((p) => p.id === provocadora.id);
        ok(iP < iQ, `provocadora em ${iP + 1}º, quieta em ${iQ + 1}º`);
        const p = lista[iP]!;
        return `provocadora ${iP + 1}º (social ${p.parcelas!.social.toFixed(2)}) vs quieta ${iQ + 1}º — sem uma curtida sequer`;
      },
    );

    await s.teste("AVALIAÇÃO: os pesos, impressos ao lado do que produzem", async () => {
      const { PESOS } = await import("../../lib/db/paraVoce");
      const lista = (await feed()).slice(0, 5);
      const linhas = lista.map(
        (p, i) =>
          `${i + 1}º ${(p.body ?? "").padEnd(26)} nota ${p.nota!.toFixed(2)}  prende ${p.parcelas!.prende.toFixed(1)} social ${p.parcelas!.social.toFixed(1)} afin ${p.parcelas!.afinidade.toFixed(1)} fresc ${p.parcelas!.frescor.toFixed(1)}${p.parcelas!.jaVisto ? " (visto ×0.5)" : ""}`,
      );
      return `pesos ${JSON.stringify(PESOS)}\n        ${linhas.join("\n        ")}`;
    });
  } finally {
    await s.limpar();
  }

  return s;
}
