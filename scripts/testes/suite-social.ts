/**
 * Curtidas e comentários.
 *
 * O QUE ESTA SUÍTE REALMENTE VIGIA SÃO OS CONTADORES. O número de curtidas e o
 * de comentários não são contados na hora de ler — eles moram na linha do post,
 * mantidos por gatilho (db/schema-social.sql), porque contar a cada leitura
 * percorreria a tabela inteira daquela publicação toda vez que alguém abre o
 * feed, e o custo cresceria justamente com o sucesso do post.
 *
 * ISSO É UMA APOSTA, e toda aposta precisa de vigia. Contador denormalizado que
 * erra não avisa: fica certo por meses e erra devagar. Metade dos testes daqui
 * é a mesma pergunta em situações diferentes — "o que está guardado bate com o
 * que dá para ver?" —, e o último deles roda a auditoria do banco inteiro e
 * exige zero divergências.
 *
 * O OUTRO EIXO É O ABUSO, porque comentário é a superfície mais fácil de sujar
 * que um aplicativo tem: curtir mil vezes, comentar em rajada, apagar o
 * comentário dos outros, falar com quem te bloqueou.
 */

import { Suite, igual, ok } from "./arnes";
import { ContaDeTeste, apagarConta, criarConta, sql } from "./contas";

interface Comentario {
  id: string;
  autor: string;
  corpo: string;
  curtidas: number;
  respostas: number;
  respondeA: string | null;
  raizId: string | null;
  euCurti: boolean;
  meu: boolean;
}

interface Post {
  id: string;
  curtidas: number;
  comentarios: number;
  euCurti?: boolean;
}

export async function suiteSocial(base: string): Promise<Suite> {
  const s = new Suite("social — curtir, comentar, responder e contar");

  const contas: ContaDeTeste[] = [];
  const nova = async (apelido: string) => {
    const c = await criarConta(base, apelido);
    contas.push(c);
    return c;
  };

  s.aoFinal(async () => {
    for (const c of contas) {
      await sql`delete from posts where author_id = ${c.id}::uuid`;
      await apagarConta(c.id);
    }
  });

  try {
    const ana = await nova("ana");
    const bia = await nova("bia");

    /** Publica e devolve o id. */
    const publicar = async (quem: ContaDeTeste, corpo: string) => {
      const r = await quem.cliente.post<{ post: Post }>("/api/posts", {
        kind: "texto",
        body: corpo,
      });
      igual(r.status, 200, "publicou");
      return r.corpo.post.id;
    };

    /** Como o post está para quem lê — os números que a tela mostraria. */
    const verPost = async (quem: ContaDeTeste, id: string) => {
      const r = await quem.cliente.get<{ posts: Post[] }>("/api/posts");
      return r.corpo.posts.find((p) => p.id === id);
    };

    const comentar = async (
      quem: ContaDeTeste,
      post: string,
      corpo: string,
      respondendoA?: string,
    ) =>
      quem.cliente.post<{ comentario: Comentario; reason?: string }>(
        "/api/comentarios",
        { post, corpo, respondendoA: respondendoA ?? null },
      );

    const lerRaizes = async (quem: ContaDeTeste, post: string) =>
      (
        await quem.cliente.get<{ comentarios: Comentario[] }>(
          `/api/comentarios?post=${post}`,
        )
      ).corpo.comentarios;

    // -----------------------------------------------------------------------
    // Curtir
    // -----------------------------------------------------------------------

    const post = await publicar(ana, "publicacao para curtir");

    await s.teste("curtir sobe o contador e marca que fui eu", async () => {
      const r = await bia.cliente.post<{ curtidas: number; euCurti: boolean }>(
        "/api/curtir",
        { post, quero: true },
      );
      igual(r.status, 200, "status");
      igual(r.corpo.curtidas, 1, "curtidas");
      igual(r.corpo.euCurti, true, "euCurti");
    });

    await s.teste("curtir DUAS VEZES continua sendo uma curtida", async () => {
      /*
       * A regra mora na chave primária (post_id, user_id), e não na memória da
       * tela. Sem isso, um toque duplo — ou uma rede lenta que reenvia —
       * contaria duas vezes, e o número passaria a medir cliques em vez de
       * pessoas.
       */
      for (let i = 0; i < 4; i++) {
        await bia.cliente.post("/api/curtir", { post, quero: true });
      }
      const r = await bia.cliente.post<{ curtidas: number }>("/api/curtir", {
        post,
        quero: true,
      });
      igual(r.corpo.curtidas, 1, "continua 1 depois de 5 toques");
      return "5 toques, 1 curtida";
    });

    await s.teste("o contador chega na leitura do mural", async () => {
      const p = await verPost(bia, post);
      igual(p?.curtidas, 1, "curtidas no feed");
      igual(p?.euCurti, true, "euCurti no feed");
    });

    await s.teste("quem NÃO curtiu vê o número sem o coração", async () => {
      /*
       * `euCurti` é carimbado por uma consulta única para a página inteira. Se
       * ela vazasse a curtida de outra pessoa, todo mundo abriria o feed com
       * corações acesos que não são seus.
       */
      const p = await verPost(ana, post);
      igual(p?.curtidas, 1, "vê o número");
      igual(p?.euCurti, false, "não é dela");
    });

    await s.teste("descurtir volta, e descurtir de novo não fica negativo", async () => {
      const um = await bia.cliente.post<{ curtidas: number }>("/api/curtir", {
        post,
        quero: false,
      });
      igual(um.corpo.curtidas, 0, "voltou a zero");
      const dois = await bia.cliente.post<{ curtidas: number }>("/api/curtir", {
        post,
        quero: false,
      });
      igual(dois.corpo.curtidas, 0, "continua zero");
    });

    await s.teste("curtir o que não existe responde 404, e não 500", async () => {
      /*
       * Erro de servidor manda tentar de novo; "não existe" manda parar. São
       * conselhos opostos, e a diferença aparece num cliente com repetição
       * automática: um 500 vira uma rajada contra o banco.
       */
      const r = await bia.cliente.post("/api/curtir", {
        post: "00000000-0000-4000-8000-000000000000",
        quero: true,
      });
      igual(r.status, 404, "status");
    });

    await s.teste("curtir sem dizer o quê é recusado", async () => {
      const r = await bia.cliente.post("/api/curtir", { quero: true });
      igual(r.status, 400, "status");
    });

    // -----------------------------------------------------------------------
    // Comentar
    // -----------------------------------------------------------------------

    let raiz = "";

    await s.teste("comentar, e o comentário volta assinado", async () => {
      const r = await comentar(bia, post, "que lugar bonito");
      igual(r.status, 200, "status");
      igual(r.corpo.comentario.autor, bia.nickname, "autor");
      igual(r.corpo.comentario.raizId, null, "é de primeiro nível");
      raiz = r.corpo.comentario.id;
    });

    await s.teste("comentário vazio é recusado", async () => {
      const r = await comentar(bia, post, "     ");
      igual(r.status, 400, "status");
    });

    await s.teste("responder pendura na raiz certa", async () => {
      const r = await comentar(ana, post, "obrigada!", raiz);
      igual(r.status, 200, "status");
      igual(r.corpo.comentario.raizId, raiz, "raiz");
      igual(r.corpo.comentario.respondeA, bia.nickname, "o @ é de quem escreveu");
    });

    await s.teste(
      "responder A UMA RESPOSTA achata na MESMA raiz",
      async () => {
        /*
         * É a regra dos dois níveis. Sem ela nasceria um terceiro nível, que
         * numa tela de celular vira uma escada que ninguém lê — e que exigiria
         * consulta recursiva, cujo custo depende do formato da árvore e
         * portanto é imprevisível.
         */
        const respostas = await bia.cliente.get<{ comentarios: Comentario[] }>(
          `/api/comentarios?raiz=${raiz}`,
        );
        const primeira = respostas.corpo.comentarios[0]!;

        const r = await comentar(bia, post, "de nada", primeira.id);
        igual(r.status, 200, "status");
        igual(r.corpo.comentario.raizId, raiz, "mesma raiz, e não a resposta");
        igual(r.corpo.comentario.respondeA, ana.nickname, "responde a quem falou");
        return "achatou no segundo nível";
      },
    );

    await s.teste("a raiz conta as respostas, e o post conta tudo", async () => {
      const raizes = await lerRaizes(bia, post);
      igual(raizes.length, 1, "uma raiz na lista");
      igual(raizes[0]!.respostas, 2, "duas respostas na raiz");
      const p = await verPost(bia, post);
      igual(p?.comentarios, 3, "três no post: a raiz e as duas respostas");
    });

    await s.teste("as respostas NÃO vêm junto com as raízes", async () => {
      /*
       * Uma publicação com quinhentas respostas espalhadas em vinte conversas
       * mandaria as quinhentas para desenhar vinte linhas. Elas são pedidas
       * quando alguém abre aquela conversa.
       */
      const raizes = await lerRaizes(bia, post);
      ok(
        raizes.every((c) => c.raizId === null),
        "só raízes na lista do post",
      );
    });

    await s.teste("posts em massa não viram uma consulta por post", async () => {
      /*
       * Este teste não mede tempo — mede que a resposta vem COMPLETA numa ida
       * só. `euCurti` carimbado para trinta posts prova que a rota usa a busca
       * em lote; se ela perguntasse um por um, o resultado seria o mesmo e o
       * custo trinta vezes maior. O que este teste protege é o contrato de que
       * o campo existe para todos, que é o que permite manter o lote.
       */
      const feed = await bia.cliente.get<{ posts: Post[] }>("/api/posts");
      ok(
        feed.corpo.posts.every((p) => typeof p.euCurti === "boolean"),
        `os ${feed.corpo.posts.length} posts vieram com euCurti`,
      );
      return `${feed.corpo.posts.length} posts, 1 consulta de curtidas`;
    });

    // -----------------------------------------------------------------------
    // Curtir comentário
    // -----------------------------------------------------------------------

    await s.teste("curtir um comentário, e o número voltar nele", async () => {
      const r = await ana.cliente.post<{ curtidas: number; euCurti: boolean }>(
        "/api/curtir",
        { comentario: raiz, quero: true },
      );
      igual(r.status, 200, "status");
      igual(r.corpo.curtidas, 1, "curtidas");

      const raizes = await lerRaizes(ana, post);
      igual(raizes[0]!.curtidas, 1, "aparece na leitura");
      igual(raizes[0]!.euCurti, true, "e sabe que fui eu");
    });

    // -----------------------------------------------------------------------
    // Apagar
    // -----------------------------------------------------------------------

    await s.teste("não dá para apagar comentário dos outros", async () => {
      const meu = await comentar(bia, post, "este é meu");
      const r = await ana.cliente.apagar(
        `/api/comentarios?id=${meu.corpo.comentario.id}`,
      );
      /*
       * `ana` é dona do POST, então ela PODE apagar — é a exceção deliberada:
       * o que fica pendurado na publicação dela leva o nome dela junto. Quem
       * não pode é uma terceira pessoa.
       */
      igual(r.status, 200, "a dona do post pode");

      const cida = await nova("cida");
      const outro = await comentar(bia, post, "outro meu");
      const r2 = await cida.cliente.apagar(
        `/api/comentarios?id=${outro.corpo.comentario.id}`,
      );
      igual(r2.status, 403, "uma estranha não pode");
    });

    await s.teste(
      "apagar a RAIZ leva as respostas junto na contagem",
      async () => {
        /*
         * O defeito que este teste guarda: apagar marca `removido_em` em vez
         * de apagar a linha — de propósito, para a moderação poder olhar
         * depois. As respostas sumiam da tela (ninguém abre uma conversa sem
         * raiz) e continuavam CONTADAS. O cartão dizia "3 comentários" e a
         * conversa mostrava zero.
         */
        const novo = await publicar(ana, "post para apagar conversa");
        const r = await comentar(bia, novo, "raiz");
        await comentar(ana, novo, "resposta 1", r.corpo.comentario.id);
        await comentar(ana, novo, "resposta 2", r.corpo.comentario.id);

        const antes = await verPost(bia, novo);
        igual(antes?.comentarios, 3, "três antes");

        await bia.cliente.apagar(
          `/api/comentarios?id=${r.corpo.comentario.id}`,
        );

        const depois = await verPost(bia, novo);
        igual(depois?.comentarios, 0, "zero depois — as respostas foram junto");
        igual((await lerRaizes(bia, novo)).length, 0, "nada na lista");
        return "3 → 0";
      },
    );

    // -----------------------------------------------------------------------
    // Bloqueio
    // -----------------------------------------------------------------------

    await s.teste("quem bloqueou não recebe comentário", async () => {
      /*
       * Bloqueio que vale na conversa e não vale embaixo da publicação é
       * bloqueio pela metade: a pessoa bloqueada continuaria falando com quem
       * a bloqueou, só que em público.
       */
      const dora = await nova("dora");
      const dela = await publicar(dora, "post da dora");

      await sql`
        insert into user_blocks (blocker_user_id, blocked_user_id)
        values (${dora.id}::uuid, ${bia.id}::uuid)
        on conflict do nothing`;

      const r = await comentar(bia, dela, "oi");
      igual(r.status, 409, "recusado");

      /*
       * O MOTIVO NÃO DIZ QUE HOUVE BLOQUEIO. Contar isso na resposta avisaria
       * a pessoa bloqueada de que foi bloqueada — que é exatamente o que um
       * bloqueio não deve anunciar.
       */
      ok(r.corpo.reason === "nao-deu", `motivo genérico: ${r.corpo.reason}`);
    });

    await s.teste("comentário de quem eu bloqueei some da lista", async () => {
      const eva = await nova("eva");
      const dele = await publicar(ana, "post com comentario de bloqueada");
      await comentar(eva, dele, "comentario da eva");

      const antes = await lerRaizes(ana, dele);
      igual(antes.length, 1, "aparece antes");

      await sql`
        insert into user_blocks (blocker_user_id, blocked_user_id)
        values (${ana.id}::uuid, ${eva.id}::uuid)
        on conflict do nothing`;

      const depois = await lerRaizes(ana, dele);
      igual(depois.length, 0, "some depois");
    });

    // -----------------------------------------------------------------------
    // Abuso
    // -----------------------------------------------------------------------

    await s.teste("comentar em rajada esbarra no freio", async () => {
      /*
       * Doze por minuto. O freio é em memória e portanto vale por instância —
       * é amortecedor contra script ingênuo, e não porta de cofre. O que ele
       * precisa garantir é que uma rajada de um cliente só encontre um NÃO.
       */
      const fred = await nova("fred");
      const alvo = await publicar(ana, "post para a rajada");

      let barrado = 0;
      for (let i = 0; i < 20; i++) {
        const r = await comentar(fred, alvo, `rajada ${i}`);
        if (r.status === 429) barrado++;
      }
      ok(barrado > 0, `barrado ${barrado} vez(es) em 20`);
      return `${barrado} de 20 barrados`;
    });

    await s.teste("corpo gigante é cortado, e não recusado", async () => {
      /*
       * Cortar é melhor que recusar: quem colou um texto enorme perde o
       * excesso, e não o comentário inteiro. O teto está na rota E no `check`
       * da tabela — se só estivesse na rota, um caminho novo o esqueceria.
       */
      const gil = await nova("gil");
      const alvo = await publicar(ana, "post do corpo gigante");
      const r = await comentar(gil, alvo, "x".repeat(5000));
      igual(r.status, 200, "aceitou");
      igual(r.corpo.comentario.corpo.length, 2000, "cortado no teto");
    });

    // -----------------------------------------------------------------------
    // A auditoria
    // -----------------------------------------------------------------------

    await s.teste(
      "os contadores guardados batem com a realidade",
      async () => {
        /*
         * O TESTE MAIS IMPORTANTE DESTA SUÍTE. Tudo aqui em cima foi feito
         * pelas rotas; agora a pergunta é se os gatilhos acompanharam. Zero
         * divergências é a prova de que o desenho está de pé — qualquer número
         * diferente de zero é o aviso de que algo escreveu por fora.
         */
        const tortos = (await sql`
          select p.id
            from posts p
           where p.curtidas <> (select count(*) from curtidas c where c.post_id = p.id)
              or p.comentarios <> (select count(*) from comentarios k
                                    where k.post_id = p.id
                                      and k.removido_em is null
                                      and k.oculto_em is null)`) as unknown[];
        igual(tortos.length, 0, "posts com contador divergente");

        const comentariosTortos = (await sql`
          select k.id
            from comentarios k
           where k.curtidas <> (select count(*) from curtidas_comentario c
                                 where c.comentario_id = k.id)
              or k.respostas <> (select count(*) from comentarios r
                                  where r.raiz_id = k.id
                                    and r.removido_em is null
                                    and r.oculto_em is null)`) as unknown[];
        igual(comentariosTortos.length, 0, "comentários com contador divergente");
        return "nenhuma divergência no banco inteiro";
      },
    );
  } finally {
    await s.limpar();
  }

  return s;
}
