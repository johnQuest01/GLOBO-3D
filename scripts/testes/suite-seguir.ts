/**
 * Seguir lugares e pessoas.
 *
 * O QUE ESTA SUÍTE PERSEGUE não é "o filtro filtra" — é o que acontece nas
 * bordas, que é onde uma função de seguir costuma decepcionar:
 *
 *   · assinei Lagos e ninguém de Lagos publicou hoje. Minha tela fica em
 *     branco? (não pode ficar — é o que mais mata produto);
 *   · assinei bem demais. Continuo vendo o resto do mundo, ou virei uma bolha?
 *   · bloqueei alguém e sigo o país dele. O bloqueio vale no mural também?
 *   · "Santiago" existe em vários países. Assinar uma traz as três?
 *   · e o placar: dá para descobrir quantas pessoas seguem alguém?
 */

import { Suite, igual, ok } from "./arnes";
import { Conta } from "./cliente";
import { ContaDeTeste, apagarConta, criarConta, sql } from "./contas";

interface PostSeguido {
  id: string;
  autor: string;
  pais: string | null;
  estado: string | null;
  cidade: string | null;
  porque: "lugar" | "pessoa" | "mundo";
}

interface OQueSigo {
  lugares: { tipo: string; valor: string; pais: string | null }[];
  pessoas: string[];
  limites: { lugares: number; pessoas: number };
}

const MOSCOU = {
  country: "Rússia",
  state: "Moscovo",
  city: "Moscou",
  lat: 55.76,
  lon: 37.62,
};
const TOQUIO = {
  country: "Japão",
  state: "Tokyo",
  city: "Tóquio",
  lat: 35.68,
  lon: 139.69,
};
const LIMA = {
  country: "Peru",
  state: "Lima",
  city: "Lima",
  lat: -12.04,
  lon: -77.04,
};

export async function suiteSeguir(base: string): Promise<Suite> {
  const s = new Suite("seguir — lugares, pessoas e o mural que sai disso");

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
    for (const c of contas) await apagarConta(c.id);
  });

  try {
    const eu = await nova("eu");
    const russa = await nova("russa", MOSCOU);
    const japones = await nova("japones", TOQUIO);
    const peruana = await nova("peruana", LIMA);

    const publicar = async (quem: ContaDeTeste, texto: string) => {
      const r = await quem.cliente.post<{ post: { id: string } }>(
        "/api/posts",
        {
          kind: "texto",
          body: texto,
        },
      );
      igual(r.status, 200, `${quem.nickname} publicou`);
      return r.corpo.post.id;
    };

    const meuMural = async () =>
      (await eu.cliente.get<{ posts: PostSeguido[] }>("/api/posts?de=seguindo"))
        .corpo.posts;

    const sigo = async () =>
      (await eu.cliente.get<OQueSigo>("/api/seguir")).corpo;

    const daRussa = await publicar(russa, "Boa noite de Moscou");
    const doJapones = await publicar(japones, "Konbanwa de Tóquio");
    const daPeruana = await publicar(peruana, "Buenas noches de Lima");

    // -----------------------------------------------------------------------
    // Seguir um lugar
    // -----------------------------------------------------------------------

    await s.teste("no começo não sigo nada", async () => {
      const r = await sigo();
      igual(r.lugares.length, 0, "lugares");
      igual(r.pessoas.length, 0, "pessoas");
      ok(r.limites.lugares > 0 && r.limites.pessoas > 0, "os tetos vieram");
      return `tetos: ${r.limites.lugares} lugares, ${r.limites.pessoas} pessoas`;
    });

    await s.teste("seguir um PAÍS traz o post de lá", async () => {
      const r = await eu.cliente.post("/api/seguir", {
        tipo: "lugar",
        camada: "pais",
        valor: "Rússia",
      });
      igual(r.status, 200, "status");

      const mural = await meuMural();
      const post = mural.find((p) => p.id === daRussa);
      ok(post, "o post da Rússia não veio");
      igual(post!.porque, "lugar", "veio pelo lugar assinado");
    });

    await s.teste("seguir uma CIDADE traz o post de lá", async () => {
      await eu.cliente.post("/api/seguir", {
        tipo: "lugar",
        camada: "cidade",
        valor: "Tóquio",
        pais: "Japão",
      });
      const post = (await meuMural()).find((p) => p.id === doJapones);
      ok(post, "o post de Tóquio não veio");
      igual(post!.porque, "lugar", "veio pelo lugar");
    });

    await s.teste("seguir duas vezes o mesmo lugar conta uma", async () => {
      for (let i = 0; i < 4; i++) {
        await eu.cliente.post("/api/seguir", {
          tipo: "lugar",
          camada: "pais",
          valor: "Rússia",
        });
      }
      const russias = (await sigo()).lugares.filter(
        (l) => l.valor === "Rússia",
      );
      igual(russias.length, 1, "assinaturas da Rússia");
    });

    await s.teste("deixar de seguir tira da lista", async () => {
      await eu.cliente.apagarCom("/api/seguir", {
        tipo: "lugar",
        camada: "cidade",
        valor: "Tóquio",
        pais: "Japão",
      });
      const toquio = (await sigo()).lugares.filter((l) => l.valor === "Tóquio");
      igual(toquio.length, 0, "ainda seguia Tóquio");
    });

    await s.teste("deixar de seguir o que não seguia não dá erro", async () => {
      const r = await eu.cliente.apagarCom("/api/seguir", {
        tipo: "lugar",
        camada: "pais",
        valor: "Nunca segui isto",
      });
      igual(r.status, 200, "status");
    });

    // -----------------------------------------------------------------------
    // Seguir uma pessoa
    // -----------------------------------------------------------------------

    await s.teste("seguir uma PESSOA traz o post dela", async () => {
      const r = await eu.cliente.post("/api/seguir", {
        tipo: "pessoa",
        nickname: peruana.nickname,
      });
      igual(r.status, 200, "status");

      const post = (await meuMural()).find((p) => p.id === daPeruana);
      ok(post, "o post da pessoa seguida não veio");
      igual(post!.porque, "pessoa", "veio pela pessoa");
    });

    await s.teste("não dá para seguir a si mesmo", async () => {
      const r = await eu.cliente.post("/api/seguir", {
        tipo: "pessoa",
        nickname: eu.nickname,
      });
      igual(r.status, 404, "status");
      igual((await sigo()).pessoas.includes(eu.nickname), false, "seguiu a si");
    });

    await s.teste("não dá para seguir quem não existe", async () => {
      const r = await eu.cliente.post("/api/seguir", {
        tipo: "pessoa",
        nickname: "naoexisteninguemcomesse",
      });
      igual(r.status, 404, "status");
    });

    await s.teste("conta banida some de quem eu sigo", async () => {
      await sql`update users set banned_at = now() where id = ${peruana.id}::uuid`;
      try {
        const lista = (await sigo()).pessoas;
        igual(lista.includes(peruana.nickname), false, "continuou na lista");
      } finally {
        await sql`update users set banned_at = null where id = ${peruana.id}::uuid`;
      }
    });

    // -----------------------------------------------------------------------
    // O que impede a função de decepcionar
    // -----------------------------------------------------------------------

    await s.teste("O MURAL NUNCA FICA VAZIO — o mundo preenche", async () => {
      /*
       * Assinar um lugar onde ninguém publicou hoje não pode devolver uma tela
       * em branco. É o defeito que mata mais produto que qualquer erro, porque
       * a pessoa conclui que o aplicativo está morto.
       */
      const solitaria = await nova("sozinha");
      await solitaria.cliente.post("/api/seguir", {
        tipo: "lugar",
        camada: "pais",
        valor: "Groenlândia",
      });
      const mural = (
        await solitaria.cliente.get<{ posts: PostSeguido[] }>(
          "/api/posts?de=seguindo",
        )
      ).corpo.posts;

      ok(mural.length > 0, "assinou um lugar vazio e a tela ficou em branco");
      ok(
        mural.every((p) => p.porque === "mundo"),
        "veio algo que não era do mundo",
      );
      return `${mural.length} posts, todos do mundo`;
    });

    await s.teste("O MUNDO ENTRA SEMPRE — seguir não vira bolha", async () => {
      /*
       * Quem assinou o bastante para encher o mural não pode deixar de ver o
       * resto do planeta. O globo existe exatamente para o contrário disso.
       */
      const mural = await meuMural();
      const doMundo = mural.filter((p) => p.porque === "mundo");
      ok(
        doMundo.length > 0,
        "o mural de quem segue não tinha nada de fora do assinado",
      );
      return `${mural.length} posts: ${mural.length - doMundo.length} assinados, ${doMundo.length} do mundo`;
    });

    await s.teste(
      "o mural vem em ordem de tempo, sem emenda no meio",
      async () => {
        // Assinados primeiro e depois o mundo teria uma costura visível, com a
        // data voltando para trás no meio da lista.
        const mural = await meuMural();
        for (let i = 1; i < mural.length; i++) {
          const anterior = mural[i - 1] as unknown as { criadoEm: string };
          const atual = mural[i] as unknown as { criadoEm: string };
          ok(
            Date.parse(anterior.criadoEm) >= Date.parse(atual.criadoEm),
            `a data voltou atrás na posição ${i}`,
          );
        }
        return `${mural.length} posts em ordem`;
      },
    );

    await s.teste("o mural de quem segue não repete post", async () => {
      const mural = await meuMural();
      const ids = new Set(mural.map((p) => p.id));
      igual(ids.size, mural.length, "veio post repetido");
    });

    await s.teste(
      "eu não apareço no meu próprio mural de seguindo",
      async () => {
        const meu = await publicar(eu, "post meu, não quero ver de volta");
        const mural = await meuMural();
        igual(
          mural.some((p) => p.id === meu),
          false,
          "o meu post veio no meu mural",
        );
      },
    );

    await s.teste("BLOQUEIO vale no mural, e não só na conversa", async () => {
      /*
       * Um bloqueio que vale na conversa e não vale no mural é um bloqueio pela
       * metade: a pessoa continuaria vendo, todo dia, quem ela pediu para não
       * ver.
       */
      await sql`
        insert into user_blocks (blocker_user_id, blocked_user_id)
        values (${eu.id}::uuid, ${russa.id}::uuid)
        on conflict do nothing`;
      try {
        const mural = await meuMural();
        igual(
          mural.some((p) => p.autor === russa.nickname),
          false,
          "quem eu bloqueei apareceu no mural",
        );
      } finally {
        await sql`delete from user_blocks
                   where blocker_user_id = ${eu.id}::uuid
                     and blocked_user_id = ${russa.id}::uuid`;
      }
    });

    await s.teste("o bloqueio vale nos DOIS sentidos", async () => {
      // Quem me bloqueou também não aparece para mim — senão o bloqueio seria
      // uma informação a mais sobre quem bloqueou.
      await sql`
        insert into user_blocks (blocker_user_id, blocked_user_id)
        values (${russa.id}::uuid, ${eu.id}::uuid)
        on conflict do nothing`;
      try {
        const mural = await meuMural();
        igual(
          mural.some((p) => p.autor === russa.nickname),
          false,
          "quem me bloqueou apareceu no meu mural",
        );
      } finally {
        await sql`delete from user_blocks
                   where blocker_user_id = ${russa.id}::uuid
                     and blocked_user_id = ${eu.id}::uuid`;
      }
    });

    // -----------------------------------------------------------------------
    // Não há placar
    // -----------------------------------------------------------------------

    await s.teste("o perfil mostra QUANTOS seguem", async () => {
      await eu.cliente.post("/api/seguir", {
        tipo: "pessoa",
        nickname: russa.nickname,
      });
      await russa.cliente.post("/api/users/perfil", {
        visibilidade: "publico",
      });

      const r = await eu.cliente.get<{ perfil: { seguidores: number | null } }>(
        `/api/users/perfil?de=${russa.nickname}`,
      );
      igual(r.status, 200, "status");
      ok(
        (r.corpo.perfil.seguidores ?? 0) >= 1,
        `contagem veio ${r.corpo.perfil.seguidores}`,
      );
      return `${r.corpo.perfil.seguidores} seguidor(es)`;
    });

    await s.teste("mas NÃO mostra QUEM segue", async () => {
      /*
       * São duas perguntas diferentes, e só a segunda é sobre privacidade:
       * saber que alguém tem 40 seguidores não diz nada sobre ninguém; saber
       * QUEM são os 40 diz sobre os 40. A contagem sai; a lista não existe em
       * rota nenhuma.
       */
      const meuNick = eu.nickname;

      const perfil = JSON.stringify(
        (await eu.cliente.get(`/api/users/perfil?de=${russa.nickname}`)).corpo,
      );
      ok(
        !perfil.includes(meuNick),
        `o perfil dela entregou quem a segue: ${perfil}`,
      );

      // E nem a própria pessoa consegue puxar a lista de quem a segue: /api/seguir
      // responde só sobre quem eu sigo.
      const dela = JSON.stringify(
        (await russa.cliente.get("/api/seguir")).corpo,
      );
      ok(!dela.includes(meuNick), `a russa viu quem a segue: ${dela}`);
    });

    await s.teste(
      "a contagem some no perfil privado, como o resto",
      async () => {
        await russa.cliente.post("/api/users/perfil", {
          visibilidade: "privado",
        });
        try {
          const r = await eu.cliente.get<{
            perfil: { seguidores: number | null };
          }>(`/api/users/perfil?de=${russa.nickname}`);
          igual(r.corpo.perfil.seguidores, null, "contagem no perfil privado");
        } finally {
          await russa.cliente.post("/api/users/perfil", {
            visibilidade: "reservado",
          });
        }
      },
    );

    await s.teste(
      "sem sessão não se segue nem se lê o que se segue",
      async () => {
        const anonimo = new Conta(base, "anonimo");
        igual((await anonimo.get("/api/seguir")).status, 401, "ler");
        igual(
          (
            await anonimo.post("/api/seguir", {
              tipo: "lugar",
              camada: "pais",
              valor: "Brasil",
            })
          ).status,
          401,
          "seguir",
        );
        igual(
          (await anonimo.get("/api/posts?de=seguindo")).status,
          401,
          "o mural de seguindo",
        );
      },
    );

    await s.teste("camada inventada é recusada", async () => {
      for (const camada of ["proximidade", "continente", "rua", ""]) {
        const r = await eu.cliente.post("/api/seguir", {
          tipo: "lugar",
          camada,
          valor: "Brasil",
        });
        igual(r.status, 400, `recusou "${camada}"`);
      }
      /*
       * "proximidade" está nesta lista de propósito, e não por esquecimento: as
       * células são de ~2 km, e assinar uma é receber todo dia um fluxo do
       * quarteirão de uma pessoa específica. Proximidade serve para "quem está
       * perto de mim agora"; assinar é um gesto sobre o futuro.
       */
      return "4 camadas recusadas, proximidade entre elas";
    });

    await s.teste("o teto de lugares é respeitado", async () => {
      const limite = (await sigo()).limites.lugares;
      // Enche até o teto com nomes que não existem — o que importa é a contagem.
      for (let i = 0; i < limite + 5; i++) {
        await eu.cliente.post("/api/seguir", {
          tipo: "lugar",
          camada: "pais",
          valor: `Paisinventado${i}`,
        });
      }
      const quantos = (await sigo()).lugares.length;
      ok(quantos <= limite, `passou do teto: ${quantos} de ${limite}`);

      const r = await eu.cliente.post<{ message?: string }>("/api/seguir", {
        tipo: "lugar",
        camada: "pais",
        valor: "MaisUm",
      });
      igual(r.status, 409, "status ao estourar");
      ok(r.corpo.message, "não disse o que fazer");
      return `parou em ${quantos}, e a mensagem explica o que fazer`;
    });
  } finally {
    await s.limpar();
  }

  return s;
}
