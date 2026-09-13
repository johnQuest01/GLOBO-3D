/**
 * Notícias da região.
 *
 * O QUE ESTA SUÍTE PERSEGUE é a promessa que dá nome ao recurso: "notícia da
 * MINHA região". Se ela falhar, o que sobra é um mural global com título — e
 * ninguém precisa de mais um.
 *
 *   · uma notícia de bairro chega a quem mora longe?
 *   · quem não preencheu a cidade consegue publicar "para a minha cidade"?
 *   · o cliente consegue mentir sobre onde está para ler o bairro dos outros?
 *   · notícia vaza para o mural de 24 horas, ou o mural vaza para as notícias?
 *   · a busca acha o plural do que foi escrito no singular?
 */

import { Suite, igual, ok } from "./arnes";
import { Conta } from "./cliente";
import { ContaDeTeste, apagarConta, criarConta, sql } from "./contas";

interface Noticia {
  id: string;
  autor: string;
  titulo: string;
  corpo: string | null;
  categoria: string;
  alcance: string;
  pais: string | null;
  estado: string | null;
  cidade: string | null;
  oculto?: boolean;
}

const SP = {
  country: "Brasil",
  state: "São Paulo",
  city: "São Paulo",
  lat: -23.55,
  lon: -46.63,
};
const BH = {
  country: "Brasil",
  state: "Minas Gerais",
  city: "Belo Horizonte",
  lat: -19.92,
  lon: -43.94,
};
const MOSCOU = {
  country: "Rússia",
  state: "Moscovo",
  city: "Moscou",
  lat: 55.76,
  lon: 37.62,
};

export async function suiteNoticias(base: string): Promise<Suite> {
  const s = new Suite("notícias — alcance por região, mídia e busca");

  const contas: ContaDeTeste[] = [];
  const nova = async (
    apelido: string,
    lugar: Parameters<typeof criarConta>[2],
  ) => {
    const c = await criarConta(base, apelido, lugar);
    contas.push(c);
    return c;
  };

  s.aoFinal(async () => {
    for (const c of contas) await apagarConta(c.id);
  });

  try {
    const paulista = await nova("sp", SP);
    const vizinho = await nova("sp2", SP);
    const mineiro = await nova("mg", BH);
    const russa = await nova("ru", MOSCOU);

    const publicar = async (
      quem: ContaDeTeste,
      titulo: string,
      alcance: string,
      extra: Record<string, unknown> = {},
    ) => {
      const r = await quem.cliente.post<{
        noticia?: Noticia;
        errors?: Record<string, string>;
        reason?: string;
      }>("/api/noticias", { titulo, alcance, categoria: "outro", ...extra });
      return r;
    };

    const lerDe = async (quem: ContaDeTeste) =>
      (await quem.cliente.get<{ noticias: Noticia[] }>("/api/noticias")).corpo
        .noticias;

    // -----------------------------------------------------------------------
    // Publicar
    // -----------------------------------------------------------------------

    let daCidade = "";
    let doEstado = "";
    let doPais = "";

    await s.teste("publicar uma notícia da cidade", async () => {
      const r = await publicar(paulista, "Alagamento na Marginal", "cidade", {
        corpo: "A água subiu meio metro perto da ponte. Evitem a região.",
        categoria: "urgente",
      });
      igual(r.status, 200, `status ${JSON.stringify(r.corpo).slice(0, 200)}`);
      daCidade = r.corpo.noticia!.id;
      igual(r.corpo.noticia!.cidade, "São Paulo", "a cidade veio do perfil");
      igual(r.corpo.noticia!.categoria, "urgente", "o assunto");
      return `${r.corpo.noticia!.titulo} (${r.corpo.noticia!.alcance})`;
    });

    await s.teste("publicar uma do estado e uma do país", async () => {
      const e = await publicar(paulista, "Greve de ônibus no estado", "estado");
      igual(e.status, 200, "estado");
      doEstado = e.corpo.noticia!.id;

      const p = await publicar(paulista, "Feriado nacional confirmado", "pais");
      igual(p.status, 200, "país");
      doPais = p.corpo.noticia!.id;
    });

    await s.teste("sem título não publica", async () => {
      const r = await publicar(paulista, "   ", "cidade");
      igual(r.status, 400, "status");
      ok(r.corpo.errors?.titulo, "disse qual campo");
    });

    await s.teste("sem alcance não publica", async () => {
      const r = await paulista.cliente.post<{
        errors?: Record<string, string>;
      }>("/api/noticias", { titulo: "Sem alcance" });
      igual(r.status, 400, "status");
      ok(r.corpo.errors?.alcance, "disse qual campo");
    });

    await s.teste("quem não tem cidade não publica PARA a cidade", async () => {
      /*
       * A notícia não teria a quem chegar, e ficaria invisível sem ninguém
       * entender por quê. Recusar com uma frase é melhor que aceitar em
       * silêncio.
       */
      /*
       * O cadastro EXIGE cidade, então esta conta nasce completa e é esvaziada
       * no banco. É o estado real de quem entrou pelo Google e ainda não disse
       * onde mora — que é justamente quem esbarra nesta regra.
       */
      const semCidade = await nova("nc", SP);
      await sql`update users set city = null, state = null
                 where id = ${semCidade.id}::uuid`;
      const r = await publicar(semCidade, "De lugar nenhum", "cidade");
      igual(r.status, 400, "status");
      ok(r.corpo.errors?.alcance, "explicou o que falta");
      return r.corpo.errors!.alcance!;
    });

    await s.teste("chave de mídia fora do formato é recusada", async () => {
      const r = await publicar(paulista, "Com anexo falso", "cidade", {
        kind: "imagem",
        midiaChave: "../../etc/senha",
      });
      igual(r.status, 400, "status");
    });

    await s.teste("imagem sem arquivo é recusada", async () => {
      const r = await publicar(paulista, "Foto que não veio", "cidade", {
        kind: "imagem",
      });
      igual(r.status, 400, "status");
    });

    // -----------------------------------------------------------------------
    // O alcance — a promessa que dá nome ao recurso
    // -----------------------------------------------------------------------

    await s.teste("quem mora na cidade recebe as TRÊS", async () => {
      const lista = await lerDe(vizinho);
      const ids = new Set(lista.map((n) => n.id));
      ok(ids.has(daCidade), "a da cidade não chegou");
      ok(ids.has(doEstado), "a do estado não chegou");
      ok(ids.has(doPais), "a do país não chegou");
      return `${lista.length} notícias`;
    });

    await s.teste(
      "quem mora em OUTRO estado NÃO recebe a da cidade",
      async () => {
        const ids = new Set((await lerDe(mineiro)).map((n) => n.id));
        igual(
          ids.has(daCidade),
          false,
          "a notícia de bairro vazou para outro estado",
        );
        igual(ids.has(doEstado), false, "a do estado vazou para outro estado");
        ok(ids.has(doPais), "mas a do país tem de chegar");
      },
    );

    await s.teste(
      "quem mora em OUTRO PAÍS não recebe nenhuma das três",
      async () => {
        const ids = new Set((await lerDe(russa)).map((n) => n.id));
        for (const [rotulo, id] of [
          ["cidade", daCidade],
          ["estado", doEstado],
          ["país", doPais],
        ] as const) {
          igual(ids.has(id), false, `a do ${rotulo} atravessou a fronteira`);
        }
      },
    );

    await s.teste("O CLIENTE NÃO ESCOLHE ONDE ESTÁ", async () => {
      /*
       * Se desse para mandar "estou em São Paulo" no pedido, qualquer pessoa
       * leria o mural de bairro de qualquer lugar do mundo — e a promessa de
       * notícia regional viraria um mural global com título.
       */
      const r = await russa.cliente.get<{ noticias: Noticia[] }>(
        "/api/noticias?cidade=S%C3%A3o%20Paulo&estado=S%C3%A3o%20Paulo&pais=Brasil",
      );
      const ids = new Set(r.corpo.noticias.map((n) => n.id));
      igual(ids.has(daCidade), false, "mentir sobre o lugar funcionou");
    });

    // -----------------------------------------------------------------------
    // A separação do mural
    // -----------------------------------------------------------------------

    await s.teste("notícia NÃO aparece no mural de 24 horas", async () => {
      const mural = await vizinho.cliente.get<{ posts: { id: string }[] }>(
        "/api/posts",
      );
      const ids = new Set(mural.corpo.posts.map((p) => p.id));
      for (const id of [daCidade, doEstado, doPais]) {
        igual(ids.has(id), false, "uma notícia vazou para o mural");
      }
    });

    await s.teste("e o post do mural NÃO aparece nas notícias", async () => {
      const p = await paulista.cliente.post<{ post: { id: string } }>(
        "/api/posts",
        { kind: "texto", body: "isto é do mural, não é notícia" },
      );
      const ids = new Set((await lerDe(vizinho)).map((n) => n.id));
      igual(ids.has(p.corpo.post.id), false, "um post do mural virou notícia");
    });

    await s.teste("notícia NÃO vence em 24 horas", async () => {
      const [l] = (await sql`
        select expires_at > now() + interval '1 year' as longe
          from posts where id = ${daCidade}::uuid`) as { longe: boolean }[];
      ok(l!.longe, "a notícia recebeu prazo curto como o mural");
    });

    // -----------------------------------------------------------------------
    // Filtro, busca e página de alguém
    // -----------------------------------------------------------------------

    await s.teste("filtrar por assunto", async () => {
      const r = await vizinho.cliente.get<{ noticias: Noticia[] }>(
        "/api/noticias?assunto=urgente",
      );
      ok(r.corpo.noticias.length > 0, "não veio nada de urgente");
      ok(
        r.corpo.noticias.every((n) => n.categoria === "urgente"),
        "veio de outro assunto",
      );
    });

    await s.teste(
      "a busca acha o PLURAL do que foi escrito no singular",
      async () => {
        /*
         * É o mínimo para uma busca não parecer quebrada — e é o que o dicionário
         * `portuguese` do Postgres dá de graça, sem nenhum serviço à parte.
         */
        const r = await vizinho.cliente.get<{ noticias: Noticia[] }>(
          "/api/noticias?q=alagamentos",
        );
        ok(
          r.corpo.noticias.some((n) => n.id === daCidade),
          "procurar 'alagamentos' não achou 'Alagamento'",
        );
        return "alagamentos → Alagamento";
      },
    );

    await s.teste("a busca não devolve o que não casa", async () => {
      const r = await vizinho.cliente.get<{ noticias: Noticia[] }>(
        "/api/noticias?q=zebra",
      );
      igual(r.corpo.noticias.length, 0, "achou algo com 'zebra'");
    });

    await s.teste(
      "a página de alguém traz tudo o que aquela pessoa publicou",
      async () => {
        const r = await russa.cliente.get<{ noticias: Noticia[] }>(
          `/api/noticias?de=${paulista.nickname}`,
        );
        const ids = new Set(r.corpo.noticias.map((n) => n.id));
        /*
         * SEM FILTRO DE ALCANCE: aqui não se pergunta "o que chega até mim", se
         * abre a página de uma pessoa. A russa vê o arquivo dela inteiro, mesmo o
         * que nunca alcançaria Moscou.
         */
        ok(ids.has(daCidade), "faltou a da cidade");
        ok(ids.has(doPais), "faltou a do país");
        return `${r.corpo.noticias.length} na página de @${paulista.nickname}`;
      },
    );

    await s.teste("as minhas trazem as escondidas também", async () => {
      const r = await paulista.cliente.get<{ noticias: Noticia[] }>(
        "/api/noticias?minhas=1",
      );
      ok(r.corpo.noticias.length >= 3, `veio ${r.corpo.noticias.length}`);
    });

    // -----------------------------------------------------------------------
    // Apagar e moderar
    // -----------------------------------------------------------------------

    await s.teste("o autor apaga a própria notícia", async () => {
      const r = await publicar(paulista, "Vou apagar esta", "pais");
      const id = r.corpo.noticia!.id;
      igual(
        (await paulista.cliente.apagar(`/api/noticias?id=${id}`)).status,
        200,
        "apagou",
      );
      igual(
        (await lerDe(vizinho)).some((n) => n.id === id),
        false,
        "continuou na lista",
      );
    });

    await s.teste("ninguém apaga a notícia de outra pessoa", async () => {
      const r = await vizinho.cliente.apagar(`/api/noticias?id=${daCidade}`);
      igual(r.status, 404, "status");
      ok(
        (await lerDe(vizinho)).some((n) => n.id === daCidade),
        "a notícia sumiu",
      );
    });

    await s.teste("a DENÚNCIA vale para notícia também", async () => {
      // A moderação é a mesma do mural — é o ganho de as duas coisas viverem na
      // mesma tabela. Três pessoas diferentes tiram do ar.
      for (const quem of [vizinho, mineiro, russa]) {
        await quem.cliente.post("/api/posts/denunciar", {
          postId: doEstado,
          motivo: "spam",
        });
      }
      igual(
        (await lerDe(vizinho)).some((n) => n.id === doEstado),
        false,
        "a notícia denunciada continuou no ar",
      );

      const [l] = (await sql`
        select oculto_em, removido_em from posts where id = ${doEstado}::uuid`) as {
        oculto_em: string | null;
        removido_em: string | null;
      }[];
      ok(l!.oculto_em, "não marcou como oculta");
      igual(
        l!.removido_em,
        null,
        "removeu por volume — isso não pode acontecer",
      );
    });

    await s.teste(
      "e o AUTOR fica sabendo que a notícia saiu do ar",
      async () => {
        const r = await paulista.cliente.get<{ noticias: Noticia[] }>(
          "/api/noticias?minhas=1",
        );
        const minha = r.corpo.noticias.find((n) => n.id === doEstado);
        ok(minha, "sumiu até para o autor");
        igual(minha!.oculto, true, "não avisou que está fora do ar");
      },
    );

    await s.teste("sem sessão não se lê nem se publica", async () => {
      const anonimo = new Conta(base, "anonimo");
      igual((await anonimo.get("/api/noticias")).status, 401, "ler");
      igual(
        (await anonimo.post("/api/noticias", { titulo: "oi", alcance: "pais" }))
          .status,
        401,
        "publicar",
      );
    });
  } finally {
    await s.limpar();
  }

  return s;
}
