/**
 * O perfil: pôr foto, tirar foto, escrever, apagar, e o que os outros veem.
 *
 * A PERGUNTA CENTRAL DESTA SUÍTE NÃO É "o campo grava?". É "quem consegue ler
 * isto?". Perfil é o único lugar do aplicativo onde a pessoa escreve coisas
 * sobre si mesma e escolhe quanto disso vai para estranhos — e um erro aqui não
 * dá tela de erro nenhuma: só vaza, silenciosamente, para todo mundo.
 *
 * Por isso metade dos testes olha a resposta pela conta de OUTRA pessoa, e não
 * pela do dono. É a única forma de provar a poda: o dono vê tudo por definição.
 */

import { Suite, diferente, igual, ok } from "./arnes";
import { ContaDeTeste, apagarConta, criarConta, sql } from "./contas";

interface MeuPerfil {
  nickname: string | null;
  fullName: string | null;
  descricao: string | null;
  nascimento: string | null;
  avatarUrl: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  visibilidade: string;
}

interface PerfilPublico {
  nickname: string;
  fullName: string | null;
  descricao: string | null;
  idade: number | null;
  avatarUrl: string | null;
  lugar: string | null;
  pais: string | null;
  visibilidade: string;
}

const FOTO = "https://exemplo-teste.invalid/foto-de-teste.jpg";
const OUTRA_FOTO = "https://exemplo-teste.invalid/segunda-foto.png";

export async function suitePerfil(base: string): Promise<Suite> {
  const s = new Suite("perfil — foto, texto e o que os outros veem");

  let dono: ContaDeTeste | null = null;
  let curioso: ContaDeTeste | null = null;

  try {
    dono = await criarConta(base, "dono");
    curioso = await criarConta(base, "curioso");
    const d = dono;
    const c = curioso;
    s.aoFinal(() => apagarConta(d.id));
    s.aoFinal(() => apagarConta(c.id));

    const meu = async () =>
      (await d.cliente.get<{ perfil: MeuPerfil }>("/api/users/perfil")).corpo
        .perfil;
    const comoOsOutrosVeem = async () =>
      (
        await c.cliente.get<{ perfil: PerfilPublico }>(
          `/api/users/perfil?de=${d.nickname}`,
        )
      ).corpo.perfil;

    // -----------------------------------------------------------------------
    // Texto
    // -----------------------------------------------------------------------

    await s.teste("escrever descrição e nome", async () => {
      const r = await d.cliente.post("/api/users/perfil", {
        fullName: "Maria das Dores",
        descricao: "Gosto de conversar sobre música e viagem.",
      });
      igual(r.status, 200, "status");
      const p = await meu();
      igual(p.fullName, "Maria das Dores", "nome");
      igual(
        p.descricao,
        "Gosto de conversar sobre música e viagem.",
        "descrição",
      );
      return `${p.descricao!.length} caracteres, com acento`;
    });

    await s.teste("mexer em um campo não apaga o outro", async () => {
      await d.cliente.post("/api/users/perfil", {
        descricao: "Só a descrição mudou.",
      });
      const p = await meu();
      igual(p.fullName, "Maria das Dores", "o nome sobreviveu");
      igual(p.descricao, "Só a descrição mudou.", "a descrição mudou");
    });

    await s.teste(
      "apagar a descrição (string vazia apaga de verdade)",
      async () => {
        await d.cliente.post("/api/users/perfil", { descricao: "" });
        const p = await meu();
        igual(p.descricao, null, "descrição");
        igual(p.fullName, "Maria das Dores", "e o nome continua lá");
      },
    );

    await s.teste("descrição comprida é cortada, e não recusada", async () => {
      const gigante = "a".repeat(1000);
      const r = await d.cliente.post("/api/users/perfil", {
        descricao: gigante,
      });
      igual(r.status, 200, "status");
      const p = await meu();
      ok(p.descricao !== null, "gravou algo");
      ok(p.descricao!.length <= 300, `cortou em ${p.descricao!.length}`);
      return `1000 -> ${p.descricao!.length} caracteres`;
    });

    await s.teste("espaço em branco puro conta como apagar", async () => {
      await d.cliente.post("/api/users/perfil", { descricao: "     " });
      igual((await meu()).descricao, null, "descrição");
    });

    // -----------------------------------------------------------------------
    // Foto: pôr, trocar, tirar
    // -----------------------------------------------------------------------

    await s.teste("pôr foto", async () => {
      const r = await d.cliente.post("/api/users/perfil", { avatarUrl: FOTO });
      igual(r.status, 200, "status");
      igual((await meu()).avatarUrl, FOTO, "foto");
    });

    await s.teste("trocar a foto por outra", async () => {
      await d.cliente.post("/api/users/perfil", { avatarUrl: OUTRA_FOTO });
      igual((await meu()).avatarUrl, OUTRA_FOTO, "foto");
    });

    await s.teste("tirar a foto", async () => {
      await d.cliente.post("/api/users/perfil", { avatarUrl: "" });
      igual((await meu()).avatarUrl, null, "foto");
    });

    await s.teste("tirar a foto não apaga o resto do perfil", async () => {
      await d.cliente.post("/api/users/perfil", {
        avatarUrl: FOTO,
        descricao: "Uma frase que precisa sobreviver.",
        nascimento: "1994-03-21",
      });
      await d.cliente.post("/api/users/perfil", { avatarUrl: "" });
      const p = await meu();
      igual(p.avatarUrl, null, "foto saiu");
      igual(
        p.descricao,
        "Uma frase que precisa sobreviver.",
        "descrição ficou",
      );
      igual(p.nascimento, "1994-03-21", "nascimento ficou");
    });

    await s.teste(
      "pôr e tirar cinco vezes seguidas termina sem foto",
      async () => {
        for (let i = 0; i < 5; i++) {
          await d.cliente.post("/api/users/perfil", { avatarUrl: FOTO });
          await d.cliente.post("/api/users/perfil", { avatarUrl: "" });
        }
        igual((await meu()).avatarUrl, null, "foto");
        // Devolve a foto para os testes de visibilidade adiante.
        await d.cliente.post("/api/users/perfil", { avatarUrl: FOTO });
      },
    );

    // -----------------------------------------------------------------------
    // Data de nascimento
    // -----------------------------------------------------------------------

    await s.teste("recusa data no futuro", async () => {
      const ano = new Date().getFullYear() + 2;
      const r = await d.cliente.post<{ errors?: Record<string, string> }>(
        "/api/users/perfil",
        {
          nascimento: `${ano}-01-01`,
        },
      );
      igual(r.status, 400, "status");
      ok(r.corpo.errors?.nascimento, "disse qual campo");
    });

    await s.teste("recusa menor de 13 anos", async () => {
      const ano = new Date().getFullYear() - 8;
      const r = await d.cliente.post("/api/users/perfil", {
        nascimento: `${ano}-01-01`,
      });
      igual(r.status, 400, "status");
    });

    await s.teste("recusa idade impossível e formato inválido", async () => {
      for (const data of ["1800-01-01", "21/03/1994", "ontem", "1994-13-45"]) {
        const r = await d.cliente.post("/api/users/perfil", {
          nascimento: data,
        });
        igual(r.status, 400, `recusou "${data}"`);
      }
    });

    await s.teste("aceita uma data boa e apaga com string vazia", async () => {
      await d.cliente.post("/api/users/perfil", { nascimento: "1994-03-21" });
      igual((await meu()).nascimento, "1994-03-21", "data");
      await d.cliente.post("/api/users/perfil", { nascimento: "" });
      igual((await meu()).nascimento, null, "apagou");
      await d.cliente.post("/api/users/perfil", { nascimento: "1994-03-21" });
    });

    // -----------------------------------------------------------------------
    // O que os outros veem — a parte que não pode errar
    // -----------------------------------------------------------------------

    await s.teste(
      "público: o outro vê nome, descrição, idade, foto e cidade",
      async () => {
        await d.cliente.post("/api/users/perfil", {
          visibilidade: "publico",
          fullName: "Maria das Dores",
          descricao: "Uma frase pública.",
        });
        const p = await comoOsOutrosVeem();
        igual(p.fullName, "Maria das Dores", "nome");
        igual(p.descricao, "Uma frase pública.", "descrição");
        igual(p.avatarUrl, FOTO, "foto");
        ok(p.idade && p.idade > 20, `idade veio: ${p.idade}`);
        ok(p.lugar?.includes("São Paulo"), `lugar: ${p.lugar}`);
        return `idade ${p.idade}, lugar "${p.lugar}"`;
      },
    );

    await s.teste("reservado: sai a foto e o país, some o resto", async () => {
      await d.cliente.post("/api/users/perfil", { visibilidade: "reservado" });
      const p = await comoOsOutrosVeem();
      igual(p.avatarUrl, FOTO, "a foto continua");
      igual(p.pais, "Brasil", "o país continua");
      igual(p.fullName, null, "nome escondido");
      igual(p.descricao, null, "descrição escondida");
      igual(p.idade, null, "idade escondida");
      igual(p.lugar, null, "a cidade NÃO sai");
    });

    await s.teste("privado: só o nickname, nem foto", async () => {
      await d.cliente.post("/api/users/perfil", { visibilidade: "privado" });
      const p = await comoOsOutrosVeem();
      igual(p.avatarUrl, null, "foto escondida");
      igual(p.pais, null, "país escondido");
      igual(p.fullName, null, "nome escondido");
      igual(p.descricao, null, "descrição escondida");
      igual(p.idade, null, "idade escondida");
      igual(
        p.nickname,
        d.nickname,
        "o nickname sai, porque é por ele que se chama",
      );
    });

    await s.teste("o e-mail NUNCA sai, em nenhum nível", async () => {
      for (const nivel of ["publico", "reservado", "privado"]) {
        await d.cliente.post("/api/users/perfil", { visibilidade: nivel });
        const bruto = JSON.stringify(await comoOsOutrosVeem());
        ok(!bruto.includes(d.email), `vazou o e-mail em ${nivel}`);
        ok(
          !bruto.includes("@"),
          `vazou algo com @ em ${nivel}: ${bruto.slice(0, 200)}`,
        );
      }
    });

    await s.teste("a DATA de nascimento nunca sai — só a idade", async () => {
      await d.cliente.post("/api/users/perfil", { visibilidade: "publico" });
      const bruto = JSON.stringify(await comoOsOutrosVeem());
      ok(!bruto.includes("1994-03-21"), "vazou a data exata");
      ok(!bruto.includes("nascimento"), "vazou o campo da data");
      ok(bruto.includes("idade"), "mas a idade sai");
    });

    await s.teste("a COORDENADA nunca sai no perfil de outro", async () => {
      for (const nivel of ["publico", "reservado", "privado"]) {
        await d.cliente.post("/api/users/perfil", { visibilidade: nivel });
        const bruto = JSON.stringify(await comoOsOutrosVeem());
        ok(!bruto.includes("lat"), `vazou "lat" em ${nivel}`);
        ok(!bruto.includes("-23.55"), `vazou a coordenada em ${nivel}`);
      }
      await d.cliente.post("/api/users/perfil", { visibilidade: "publico" });
    });

    await s.teste("recusa nível de visibilidade inventado", async () => {
      const r = await d.cliente.post("/api/users/perfil", {
        visibilidade: "tudo-liberado",
      });
      igual(r.status, 400, "status");
      igual((await meu()).visibilidade, "publico", "não mudou nada");
    });

    // -----------------------------------------------------------------------
    // Quem pode pedir
    // -----------------------------------------------------------------------

    await s.teste("sem sessão não se lê perfil nenhum", async () => {
      const anonimo = new (await import("./cliente")).Conta(base, "anonimo");
      const meu = await anonimo.get("/api/users/perfil");
      igual(meu.status, 401, "o próprio");
      const outro = await anonimo.get(`/api/users/perfil?de=${d.nickname}`);
      igual(outro.status, 401, "o de outra pessoa");
    });

    await s.teste("sem sessão não se grava perfil", async () => {
      const anonimo = new (await import("./cliente")).Conta(base, "anonimo");
      const r = await anonimo.post("/api/users/perfil", {
        descricao: "invadido",
      });
      igual(r.status, 401, "status");
      diferente((await meu()).descricao, "invadido", "descrição");
    });

    await s.teste(
      "perfil de quem não existe dá 404, e não vazamento",
      async () => {
        const r = await c.cliente.get(
          `/api/users/perfil?de=naoexisteninguemcomesse`,
        );
        igual(r.status, 404, "status");
      },
    );

    await s.teste(
      "nickname com caixa diferente acha a mesma pessoa",
      async () => {
        const r = await c.cliente.get<{ perfil: PerfilPublico }>(
          `/api/users/perfil?de=${d.nickname.toUpperCase()}`,
        );
        igual(r.status, 200, "status");
        igual(r.corpo.perfil.nickname, d.nickname, "nickname");
      },
    );

    await s.teste("conta banida some do perfil público", async () => {
      await sql`update users set banned_at = now() where id = ${d.id}::uuid`;
      const r = await c.cliente.get(`/api/users/perfil?de=${d.nickname}`);
      await sql`update users set banned_at = null where id = ${d.id}::uuid`;
      igual(r.status, 404, "status");
    });
  } finally {
    await s.limpar();
  }

  return s;
}
