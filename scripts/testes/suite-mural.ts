/**
 * O mural do globo: publicar, ver, denunciar e moderar.
 *
 * ESTA É A SUPERFÍCIE DE MAIOR RISCO DO APLICATIVO, e os testes seguem daí. Uma
 * conversa alcança uma pessoa; um post alcança estranhos do mundo inteiro, e o
 * aplicativo é aberto a partir dos 13 anos. Então a metade interessante desta
 * suíte não pergunta "o post aparece?" — pergunta o que acontece quando alguém
 * publica algo que não deveria:
 *
 *   · a comunidade consegue tirar do ar rápido?
 *   · uma pessoa sozinha consegue derrubar outra repetindo o gesto?
 *   · a decisão de quem modera dura, ou o grupo esconde de novo em seguida?
 *   · quem foi escondido fica sabendo?
 *
 * E a regra que o mural inteiro apoia: post morre em 24 horas, e quem decide
 * isso é a CONSULTA, nunca uma faxina que pode atrasar.
 */

import { Suite, esperarAte, igual, ok } from "./arnes";
import { Conta } from "./cliente";
import {
  ContaDeTeste,
  apagarConta,
  credenciaisDeAdmin,
  criarConta,
  sql,
} from "./contas";

interface Post {
  id: string;
  autor: string;
  kind: string;
  body: string | null;
  midiaChave: string | null;
  cartazChave: string | null;
  lat: number;
  lon: number;
  lugar: string | null;
  criadoEm: string;
  expiraEm: string;
  oculto?: boolean;
  denuncias?: number;
}

const MOSCOU = {
  country: "Rússia",
  state: "Moscovo",
  city: "Moscou",
  lat: 55.76,
  lon: 37.62,
};

export async function suiteMural(base: string): Promise<Suite> {
  const s = new Suite("mural — publicar, 24h, denúncia e moderação");

  const contas: ContaDeTeste[] = [];
  const nova = async (
    apelido: string,
    lugar?: Parameters<typeof criarConta>[2],
  ) => {
    const c = await criarConta(base, apelido, lugar);
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
    const autor = await nova("autor", MOSCOU);
    const leitor = await nova("leitor");

    const mural = async (quem: ContaDeTeste) =>
      (
        await quem.cliente.get<{ posts: Post[]; proximo: string | null }>(
          "/api/posts",
        )
      ).corpo;

    // -----------------------------------------------------------------------
    // Publicar
    // -----------------------------------------------------------------------

    let meuPost = "";

    await s.teste("publicar texto, e ele nasce NO LUGAR do autor", async () => {
      const r = await autor.cliente.post<{ post: Post }>("/api/posts", {
        kind: "texto",
        body: "Primeiro post do mural. Acentuação: coração, ñ, 🌍",
      });
      igual(r.status, 200, "status");
      meuPost = r.corpo.post.id;

      igual(r.corpo.post.lat, 55.76, "latitude do post");
      igual(r.corpo.post.lon, 37.62, "longitude do post");
      igual(r.corpo.post.autor, autor.nickname, "assinado");
      ok(r.corpo.post.body?.includes("🌍"), "o emoji sobreviveu");
      return `em ${r.corpo.post.lugar}`;
    });

    await s.teste(
      "o post aparece para OUTRA pessoa, do outro lado do mundo",
      async () => {
        const m = await mural(leitor);
        const achou = m.posts.find((p) => p.id === meuPost);
        ok(achou, "não apareceu no mural de quem está no Brasil");
        igual(achou!.autor, autor.nickname, "assinado");
      },
    );

    await s.teste("o post vem com prazo de 24 horas", async () => {
      const m = await mural(leitor);
      const p = m.posts.find((x) => x.id === meuPost)!;
      const horas =
        (Date.parse(p.expiraEm) - Date.parse(p.criadoEm)) / 3_600_000;
      ok(Math.abs(horas - 24) < 0.1, `o prazo veio de ${horas.toFixed(1)}h`);
      return `${horas.toFixed(0)} horas`;
    });

    await s.teste("a COORDENADA mandada pelo cliente é ignorada", async () => {
      /*
       * Se o navegador pudesse escolher onde o próprio post aparece, qualquer
       * pessoa plantaria conteúdo em cima de qualquer cidade do mundo. O
       * servidor lê a coordenada do perfil e descarta o que veio junto.
       */
      const r = await autor.cliente.post<{ post: Post }>("/api/posts", {
        kind: "texto",
        body: "tentando aparecer em outro lugar",
        lat: -23.55,
        lon: -46.63,
      });
      igual(r.corpo.post.lat, 55.76, "continuou em Moscou");
      await sql`delete from posts where id = ${r.corpo.post.id}::uuid`;
    });

    await s.teste("post vazio é recusado", async () => {
      const r = await autor.cliente.post("/api/posts", {
        kind: "texto",
        body: "   ",
      });
      igual(r.status, 400, "status");
    });

    await s.teste("tipo inventado é recusado", async () => {
      const r = await autor.cliente.post("/api/posts", {
        kind: "telepatia",
        body: "oi",
      });
      igual(r.status, 400, "status");
    });

    await s.teste("o cartaz do vídeo vai e volta", async () => {
      /*
       * O CARTAZ É O QUE APARECE NO CARTÃO DO GLOBO enquanto o vídeo desce.
       * Se ele não voltar na leitura, o cartão fica cinza pelos segundos em
       * que o vídeo carrega — e o toque no botão fica sem resposta, que é
       * justamente o gesto que o produto vende.
       */
      const chave = "m/2026-01-01/" + "c".repeat(32) + ".mp4";
      const cartaz = "m/2026-01-01/" + "d".repeat(32) + ".jpg";
      const r = await autor.cliente.post<{ post: Post }>("/api/posts", {
        kind: "video",
        midiaChave: chave,
        cartazChave: cartaz,
      });
      igual(r.status, 200, "status");
      igual(r.corpo.post.cartazChave, cartaz, "voltou na publicação");

      const lidos = await autor.cliente.get<{ posts: Post[] }>(
        "/api/posts?escopo=mundo",
      );
      const meu = lidos.corpo.posts.find((p) => p.id === r.corpo.post.id);
      igual(meu?.cartazChave, cartaz, "voltou na leitura");
      await sql`delete from posts where id = ${r.corpo.post.id}::uuid`;
      return "ida e volta";
    });

    await s.teste("cartaz torto some, mas o vídeo publica", async () => {
      /*
       * O cartaz é um extra. Recusar a publicação inteira por causa dele
       * transformaria um enfeite em requisito — e um navegador que falhou ao
       * gerar o quadro deixaria a pessoa sem conseguir publicar o vídeo.
       */
      const chave = "m/2026-01-01/" + "e".repeat(32) + ".mp4";
      const r = await autor.cliente.post<{ post: Post }>("/api/posts", {
        kind: "video",
        midiaChave: chave,
        cartazChave: "../../etc/senha",
      });
      igual(r.status, 200, "publicou assim mesmo");
      igual(r.corpo.post.cartazChave, null, "o cartaz torto não entrou");
      await sql`delete from posts where id = ${r.corpo.post.id}::uuid`;
      return "publicou sem o cartaz";
    });

    await s.teste("chave de mídia fora do formato é recusada", async () => {
      for (const chave of [
        "../../etc/senha",
        "qualquer-coisa.png",
        "m/x/y.png",
      ]) {
        const r = await autor.cliente.post("/api/posts", {
          kind: "imagem",
          midiaChave: chave,
        });
        igual(r.status, 400, `recusou "${chave}"`);
      }
      return "3 caminhos recusados";
    });

    await s.teste("imagem sem arquivo é recusada", async () => {
      const r = await autor.cliente.post("/api/posts", {
        kind: "imagem",
        body: "só texto",
      });
      igual(r.status, 400, "status");
    });

    await s.teste("quem não tem lugar no globo não publica", async () => {
      const semLugar = await nova("semlugar");
      await sql`update users set lat = null, lon = null where id = ${semLugar.id}::uuid`;
      const r = await semLugar.cliente.post<{ reason?: string }>("/api/posts", {
        kind: "texto",
        body: "de lugar nenhum",
      });
      igual(r.status, 409, "status");
      igual(
        r.corpo.reason,
        "sem-lugar",
        "o motivo, para a tela saber o que pedir",
      );
    });

    await s.teste("sem sessão não se lê nem se publica", async () => {
      const anonimo = new Conta(base, "anonimo");
      igual((await anonimo.get("/api/posts")).status, 401, "ler");
      igual(
        (await anonimo.post("/api/posts", { kind: "texto", body: "oi" }))
          .status,
        401,
        "publicar",
      );
    });

    // -----------------------------------------------------------------------
    // As 24 horas
    // -----------------------------------------------------------------------

    await s.teste("post vencido SOME do mural, sem faxina rodar", async () => {
      /*
       * Quem faz o post sumir é a consulta, e não uma tarefa de limpeza. Se
       * dependesse da faxina, um atraso dela deixaria conteúdo vencido no ar —
       * e num mural de 24 horas isso é a diferença entre a regra existir e não
       * existir. O teste envelhece a linha à mão e confere na hora.
       */
      const r = await autor.cliente.post<{ post: Post }>("/api/posts", {
        kind: "texto",
        body: "este vai vencer",
      });
      const id = r.corpo.post.id;

      ok(
        (await mural(leitor)).posts.some((p) => p.id === id),
        "não apareceu",
      );

      await sql`update posts set expires_at = now() - interval '1 minute'
                 where id = ${id}::uuid`;

      ok(
        !(await mural(leitor)).posts.some((p) => p.id === id),
        "o post vencido continuou no mural",
      );
      await sql`delete from posts where id = ${id}::uuid`;
      return "sumiu na consulta seguinte";
    });

    // -----------------------------------------------------------------------
    // Denúncia — a camada de baixo
    // -----------------------------------------------------------------------

    let denunciado = "";

    await s.teste("uma pessoa sozinha NÃO derruba ninguém", async () => {
      const r = await autor.cliente.post<{ post: Post }>("/api/posts", {
        kind: "texto",
        body: "post que vai ser denunciado",
      });
      denunciado = r.corpo.post.id;

      const d = await leitor.cliente.post<{ saiuDoAr: boolean }>(
        "/api/posts/denunciar",
        { postId: denunciado, motivo: "spam" },
      );
      igual(d.status, 200, "status");
      igual(d.corpo.saiuDoAr, false, "saiu do ar com uma denúncia só");
      ok(
        (await mural(leitor)).posts.some((p) => p.id === denunciado),
        "sumiu do mural com uma denúncia",
      );
    });

    await s.teste(
      "nem repetindo o gesto — uma pessoa, uma denúncia",
      async () => {
        /*
         * Sem isto, contar denúncias contaria cliques, e o limite seria alcançado
         * por uma pessoa sozinha insistindo. A garantia é da chave primária
         * composta, e não de uma consulta antes de inserir.
         */
        for (let i = 0; i < 5; i++) {
          await leitor.cliente.post("/api/posts/denunciar", {
            postId: denunciado,
            motivo: "spam",
          });
        }
        const [c] = (await sql`
        select count(*)::int as n from post_reports where post_id = ${denunciado}::uuid
      `) as { n: number }[];
        igual(c!.n, 1, "denúncias gravadas");
        ok(
          (await mural(leitor)).posts.some((p) => p.id === denunciado),
          "seis cliques da mesma pessoa derrubaram o post",
        );
        return "6 cliques, 1 denúncia";
      },
    );

    await s.teste("três pessoas diferentes tiram do ar", async () => {
      const b = await nova("b");
      const c = await nova("c");
      await b.cliente.post("/api/posts/denunciar", {
        postId: denunciado,
        motivo: "assedio",
      });
      const ultima = await c.cliente.post<{ saiuDoAr: boolean }>(
        "/api/posts/denunciar",
        {
          postId: denunciado,
          motivo: "crianca",
          detalhe: "parece menor de idade",
        },
      );
      igual(ultima.corpo.saiuDoAr, true, "não saiu do ar na terceira");
      ok(
        !(await mural(leitor)).posts.some((p) => p.id === denunciado),
        "continuou no mural depois de escondido",
      );
      return "escondido, não apagado";
    });

    await s.teste(
      "mas NÃO foi apagado — está na fila, e a linha existe",
      async () => {
        const [l] = (await sql`
        select oculto_em, removido_em from posts where id = ${denunciado}::uuid
      `) as { oculto_em: string | null; removido_em: string | null }[];
        ok(l!.oculto_em, "não marcou como oculto");
        igual(
          l!.removido_em,
          null,
          "removeu por volume — isso não pode acontecer",
        );
      },
    );

    await s.teste(
      "o AUTOR fica sabendo que o post dele saiu do ar",
      async () => {
        // Descobrir por acaso que um post seu sumiu é a pior forma de descobrir.
        const r = await autor.cliente.get<{ posts: Post[] }>(
          "/api/posts?meus=1",
        );
        const p = r.corpo.posts.find((x) => x.id === denunciado);
        ok(p, "o post sumiu até para o autor");
        igual(p!.oculto, true, "não disse que está oculto");
        ok((p!.denuncias ?? 0) >= 3, `denúncias: ${p!.denuncias}`);
      },
    );

    await s.teste("a resposta da denúncia não conta quanto falta", async () => {
      // "Faltam duas" convida a juntar mais duas, e a única pessoa que usaria
      // essa informação é quem está coordenando.
      const outro = await autor.cliente.post<{ post: Post }>("/api/posts", {
        kind: "texto",
        body: "outro post",
      });
      const d = await leitor.cliente.post<Record<string, unknown>>(
        "/api/posts/denunciar",
        { postId: outro.corpo.post.id, motivo: "spam" },
      );
      const bruto = JSON.stringify(d.corpo);
      ok(
        !/\b(total|faltam|restam)\b/i.test(bruto),
        `vazou a contagem: ${bruto}`,
      );
      await sql`delete from posts where id = ${outro.corpo.post.id}::uuid`;
    });

    await s.teste("não se denuncia sem sessão", async () => {
      const anonimo = new Conta(base, "anonimo");
      const r = await anonimo.post("/api/posts/denunciar", {
        postId: denunciado,
        motivo: "spam",
      });
      igual(r.status, 401, "status");
    });

    // -----------------------------------------------------------------------
    // Moderação — a camada de cima
    // -----------------------------------------------------------------------

    await s.teste(
      "a fila da moderação exige cookie de administrador",
      async () => {
        const r = await leitor.cliente.get("/api/admin/posts");
        igual(r.status, 401, "um usuário comum viu a fila");
        const acao = await leitor.cliente.post("/api/admin/posts", {
          postId: denunciado,
          acao: "restaurar",
        });
        igual(acao.status, 401, "um usuário comum decidiu sobre um post");
      },
    );

    await s.teste("ação inventada é recusada", async () => {
      const r = await leitor.cliente.post("/api/admin/posts", {
        postId: denunciado,
        acao: "apagar-tudo",
      });
      ok(r.status >= 400, `ficou ${r.status}`);
    });

    /*
     * A MODERAÇÃO É EXERCITADA PELA PORTA DE VERDADE, com o cookie assinado que
     * o painel usa. A primeira versão destes testes chamava a função do banco
     * direto — e isso testaria a regra pulando justamente quem pode aplicá-la,
     * que num painel com poder de tirar post do ar é a metade que importa.
     */
    const admin = new Conta(base, "admin");
    const credenciais = credenciaisDeAdmin();

    await s.teste("entrar no painel de moderação", async () => {
      if (!credenciais)
        throw new Error("sem ADMIN_EMAIL/ADMIN_PASSWORD no .env.local");
      const r = await admin.post("/api/admin/login", {
        email: credenciais.email,
        password: credenciais.senha,
      });
      igual(r.status, 200, "status");
      ok(admin.logada, "não veio cookie de administrador");
    });

    await s.teste("senha errada não abre o painel", async () => {
      const impostor = new Conta(base, "impostor");
      const r = await impostor.post("/api/admin/login", {
        email: credenciais?.email ?? "x@x.com",
        password: "senha-errada-de-proposito",
      });
      igual(r.status, 401, "status");
      igual(
        (await impostor.get("/api/admin/posts")).status,
        401,
        "e a fila continua fechada",
      );
    });

    await s.teste(
      "o post escondido aparece na fila, com os motivos",
      async () => {
        const r = await admin.get<{
          fila: { id: string; motivos: string[]; denuncias: number }[];
        }>("/api/admin/posts");
        igual(r.status, 200, "status");
        const meu = r.corpo.fila.find((x) => x.id === denunciado);
        ok(meu, "o post escondido não apareceu na fila");
        ok(meu!.denuncias >= 3, `denúncias: ${meu!.denuncias}`);
        // Os motivos importam: "spam" e "isto é uma criança" são a mesma contagem
        // e problemas completamente diferentes.
        ok(
          meu!.motivos.some((m) => m.startsWith("crianca")),
          `motivos: ${JSON.stringify(meu!.motivos)}`,
        );
        return `${meu!.denuncias} denúncias, motivos: ${meu!.motivos.join(", ")}`;
      },
    );

    await s.teste("restaurar devolve ao ar E marca como revisado", async () => {
      // Sem a segunda parte a decisão duraria até o próximo grupo se organizar,
      // e moderar não significaria nada.
      const r = await admin.post("/api/admin/posts", {
        postId: denunciado,
        acao: "restaurar",
      });
      igual(r.status, 200, "não restaurou");

      ok(
        (await mural(leitor)).posts.some((p) => p.id === denunciado),
        "não voltou ao mural",
      );

      const [l] = (await sql`
        select oculto_em, revisado_em from posts where id = ${denunciado}::uuid
      `) as { oculto_em: string | null; revisado_em: string | null }[];
      igual(l!.oculto_em, null, "continuou oculto");
      ok(l!.revisado_em, "não marcou como revisado");
    });

    await s.teste("e a comunidade NÃO consegue esconder de novo", async () => {
      // A decisão de quem modera fica por cima. Novas denúncias entram no
      // registro, mas não repõem a pausa sobre um caso já julgado.
      const d = await nova("d");
      const e = await nova("e");
      await d.cliente.post("/api/posts/denunciar", {
        postId: denunciado,
        motivo: "spam",
      });
      await e.cliente.post("/api/posts/denunciar", {
        postId: denunciado,
        motivo: "spam",
      });
      ok(
        (await mural(leitor)).posts.some((p) => p.id === denunciado),
        "o grupo escondeu um post já revisado",
      );
      return "cinco denúncias, e a decisão de cima prevaleceu";
    });

    await s.teste(
      "remover tira de vez, e a linha continua existindo",
      async () => {
        const r = await admin.post("/api/admin/posts", {
          postId: denunciado,
          acao: "remover",
        });
        igual(r.status, 200, "não removeu");

        ok(
          !(await mural(leitor)).posts.some((p) => p.id === denunciado),
          "o post removido continuou no mural",
        );

        const [l] = (await sql`
        select removido_em from posts where id = ${denunciado}::uuid
      `) as { removido_em: string | null }[];
        ok(l, "a linha foi apagada — a denúncia do outro lado perdeu o alvo");
        ok(l!.removido_em, "não marcou a remoção");
      },
    );

    // -----------------------------------------------------------------------
    // Apagar o próprio, e o mural em escala
    // -----------------------------------------------------------------------

    await s.teste("o autor apaga o próprio post", async () => {
      const r = await autor.cliente.post<{ post: Post }>("/api/posts", {
        kind: "texto",
        body: "vou apagar este",
      });
      const id = r.corpo.post.id;
      igual(
        (await autor.cliente.apagar(`/api/posts?id=${id}`)).status,
        200,
        "apagou",
      );
      ok(
        !(await mural(leitor)).posts.some((p) => p.id === id),
        "continuou no mural",
      );
    });

    await s.teste("ninguém apaga o post de outra pessoa", async () => {
      const r = await autor.cliente.post<{ post: Post }>("/api/posts", {
        kind: "texto",
        body: "este é meu",
      });
      const id = r.corpo.post.id;
      const tentativa = await leitor.cliente.apagar(`/api/posts?id=${id}`);
      // 404 e não 403: "existe, mas não é seu" transformaria a rota num jeito de
      // descobrir de quem é cada post.
      igual(tentativa.status, 404, "status");
      ok(
        (await mural(leitor)).posts.some((p) => p.id === id),
        "o post sumiu",
      );
      await sql`delete from posts where id = ${id}::uuid`;
    });

    await s.teste(
      "o mural tem TETO — não fica mais caro conforme cresce",
      async () => {
        const r = await leitor.cliente.get<{
          posts: Post[];
          proximo: string | null;
        }>("/api/posts");
        ok(
          r.corpo.posts.length <= 60,
          `veio ${r.corpo.posts.length}, acima do teto`,
        );
        return `${r.corpo.posts.length} posts, teto de 60`;
      },
    );

    await s.teste("o cursor pagina sem repetir nem embaralhar", async () => {
      const primeira = await leitor.cliente.get<{
        posts: Post[];
        proximo: string | null;
      }>("/api/posts");
      if (!primeira.corpo.proximo) return "mural pequeno demais para paginar";

      const segunda = await leitor.cliente.get<{ posts: Post[] }>(
        `/api/posts?antesDe=${encodeURIComponent(primeira.corpo.proximo)}`,
      );
      const idsA = new Set(primeira.corpo.posts.map((p) => p.id));
      const repetidos = segunda.corpo.posts.filter((p) => idsA.has(p.id));
      igual(repetidos.length, 0, "a segunda página repetiu posts da primeira");
      return `${primeira.corpo.posts.length} + ${segunda.corpo.posts.length}, sem repetição`;
    });

    await s.teste("post de conta banida some do mural", async () => {
      const r = await autor.cliente.post<{ post: Post }>("/api/posts", {
        kind: "texto",
        body: "post de quem vai ser banido",
      });
      const id = r.corpo.post.id;
      await sql`update users set banned_at = now() where id = ${autor.id}::uuid`;
      try {
        await esperarAte(
          async () => !(await mural(leitor)).posts.some((p) => p.id === id),
          "o post da conta banida sair do mural",
        );
      } finally {
        await sql`update users set banned_at = null where id = ${autor.id}::uuid`;
        await sql`delete from posts where id = ${id}::uuid`;
      }
    });
  } finally {
    await s.limpar();
  }

  return s;
}
