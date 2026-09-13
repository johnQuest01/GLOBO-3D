/**
 * A conta: entrar, sair, o nome público e o lugar no globo.
 *
 * DUAS COISAS AQUI JÁ PRENDERAM GENTE NUMA TELA SEM SAÍDA, e as duas têm teste
 * próprio porque o defeito não dava erro nenhum — só um pedido que voltava para
 * sempre:
 *
 *   · o nickname: o aparelho achava que a conta não tinha um, pedia, o servidor
 *     respondia "você já tem", e a tela pedia de novo;
 *   · o lugar: um nome que o globo não sabia situar era aceito e gravado, e o
 *     aplicativo continuava achando que a pessoa não tinha lugar.
 *
 * Os dois viraram teste de laço: a resposta do servidor precisa SEMPRE deixar a
 * tela sair de onde está, inclusive quando ela recusa.
 */

import { randomUUID } from "node:crypto";

import { Suite, igual, ok } from "./arnes";
import { Conta } from "./cliente";
import { PREFIXO, apagarConta, criarConta, sql } from "./contas";

interface Usuario {
  email?: string;
  nickname?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
}

const senhaBoa = () => `T${randomUUID()}!9`;

export async function suiteConta(base: string): Promise<Suite> {
  const s = new Suite("conta — cadastro, sessão, nickname e lugar");

  const paraApagar: string[] = [];
  s.aoFinal(async () => {
    for (const id of paraApagar) await apagarConta(id);
  });

  try {
    // -----------------------------------------------------------------------
    // Cadastro
    // -----------------------------------------------------------------------

    await s.teste("cadastro recusa senha fraca e diz qual campo", async () => {
      const c = new Conta(base, "fraca");
      const r = await c.post<{ errors?: Record<string, string> }>(
        "/api/auth/register",
        {
          email: `${PREFIXO}fraca@exemplo-teste.invalid`,
          password: "123",
          confirmPassword: "123",
          fullName: "Teste",
          nickname: `${PREFIXO}fraca`,
          country: "Brasil",
          state: "São Paulo",
          city: "São Paulo",
        },
      );
      igual(r.status, 400, "status");
      ok(r.corpo.errors?.password, "apontou a senha");
    });

    await s.teste("cadastro recusa confirmação diferente", async () => {
      const c = new Conta(base, "confirma");
      const senha = senhaBoa();
      const r = await c.post<{ errors?: Record<string, string> }>(
        "/api/auth/register",
        {
          email: `${PREFIXO}conf@exemplo-teste.invalid`,
          password: senha,
          confirmPassword: senha + "x",
          fullName: "Teste",
          nickname: `${PREFIXO}conf`,
          country: "Brasil",
          state: "São Paulo",
          city: "São Paulo",
        },
      );
      igual(r.status, 400, "status");
      ok(r.corpo.errors, "disse o que está errado");
    });

    await s.teste("cadastro exige país, estado e cidade", async () => {
      const c = new Conta(base, "semlugar");
      const senha = senhaBoa();
      const r = await c.post<{ errors?: Record<string, string> }>(
        "/api/auth/register",
        {
          email: `${PREFIXO}sl@exemplo-teste.invalid`,
          password: senha,
          confirmPassword: senha,
          fullName: "Teste",
          nickname: `${PREFIXO}sl`,
        },
      );
      igual(r.status, 400, "status");
      ok(r.corpo.errors?.country, "apontou o país");
    });

    // -----------------------------------------------------------------------
    // O lugar — a coordenada nasce no cadastro
    // -----------------------------------------------------------------------

    let comLugar: Awaited<ReturnType<typeof criarConta>> | null = null;

    await s.teste("a coordenada escolhida no cadastro é GRAVADA", async () => {
      comLugar = await criarConta(base, "lugar", {
        country: "Rússia",
        state: "Moscovo",
        city: "Moscou",
        lat: 55.76,
        lon: 37.62,
      });
      paraApagar.push(comLugar.id);

      const [linha] = (await sql`
        select country, state, city, lat, lon from users where id = ${comLugar.id}::uuid`) as {
        country: string;
        state: string;
        city: string;
        lat: number;
        lon: number;
      }[];
      igual(linha!.lat, 55.76, "latitude");
      igual(linha!.lon, 37.62, "longitude");
      return `${linha!.city} -> ${linha!.lat}, ${linha!.lon}`;
    });

    await s.teste("e volta em /api/auth/me, para o globo usar", async () => {
      const r = await comLugar!.cliente.get<{ user: Usuario }>(
        "/api/auth/me?fresh=1",
      );
      igual(r.status, 200, "status");
      igual(r.corpo.user.lat, 55.76, "latitude");
      igual(r.corpo.user.lon, 37.62, "longitude");
    });

    await s.teste("mudar de cidade muda a coordenada junto", async () => {
      const r = await comLugar!.cliente.post<Usuario>("/api/users/local", {
        country: "Brasil",
        state: "Minas Gerais",
        city: "Belo Horizonte",
        lat: -19.92,
        lon: -43.94,
      });
      igual(r.status, 200, "status");

      const [linha] = (await sql`
        select city, lat, lon from users where id = ${comLugar!.id}::uuid`) as {
        city: string;
        lat: number;
        lon: number;
      }[];
      igual(linha!.city, "Belo Horizonte", "cidade");
      igual(linha!.lat, -19.92, "latitude");
      return "o nome e o ponto andaram juntos";
    });

    await s.teste(
      "coordenada inválida é descartada, e o lugar ainda é gravado",
      async () => {
        // A tela nunca manda isto; a rede, sim. O globo não pode receber NaN —
        // um ponto inválido some com todo mundo da tela, não só com quem errou.
        for (const [lat, lon] of [
          [NaN, 0],
          [999, 999],
          ["-23", "-46"],
          [null, null],
        ]) {
          const r = await comLugar!.cliente.post<Usuario>("/api/users/local", {
            country: "Brasil",
            state: "São Paulo",
            city: "São Paulo",
            lat,
            lon,
          });
          igual(r.status, 200, `aceitou o lugar com lat=${String(lat)}`);
          igual(
            r.corpo.lat,
            null,
            `descartou a coordenada ruim ${String(lat)}`,
          );
        }
        return "4 coordenadas ruins descartadas sem derrubar o lugar";
      },
    );

    await s.teste("o lugar sem país é recusado com motivo", async () => {
      const r = await comLugar!.cliente.post<{
        errors?: Record<string, string>;
      }>("/api/users/local", {
        country: "",
        state: "São Paulo",
        city: "São Paulo",
      });
      igual(r.status, 400, "status");
      ok(
        r.corpo.errors?.country,
        "disse qual campo — a tela precisa disso para sair do laço",
      );
    });

    // -----------------------------------------------------------------------
    // Entrar e sair
    // -----------------------------------------------------------------------

    let pessoa: Awaited<ReturnType<typeof criarConta>> | null = null;

    await s.teste("entrar com a senha certa abre sessão", async () => {
      pessoa = await criarConta(base, "login");
      paraApagar.push(pessoa.id);

      const outra = new Conta(base, "outro-aparelho");
      const r = await outra.post<{ user: Usuario }>("/api/auth/login", {
        email: pessoa.email,
        password: pessoa.senha,
      });
      igual(r.status, 200, "status");
      ok(outra.logada, "não guardou cookie");
      const me = await outra.get<{ user: Usuario }>("/api/auth/me");
      igual(me.status, 200, "a sessão vale");
      igual(me.corpo.user.nickname, pessoa.nickname, "é a pessoa certa");
    });

    await s.teste(
      "senha errada e e-mail inexistente dão a MESMA resposta",
      async () => {
        const a = new Conta(base, "senha-errada");
        const r1 = await a.post("/api/auth/login", {
          email: pessoa!.email,
          password: "SenhaErrada!123456",
        });
        const r2 = await a.post("/api/auth/login", {
          email: "ninguem-mesmo@exemplo-teste.invalid",
          password: "SenhaErrada!123456",
        });
        igual(r1.status, r2.status, "o status");
        igual(
          JSON.stringify(r1.corpo),
          JSON.stringify(r2.corpo),
          "o corpo — senão o login vira um verificador de quem tem conta",
        );
        return `ambos ${r1.status}`;
      },
    );

    await s.teste("sair encerra a sessão de verdade", async () => {
      const c = new Conta(base, "sai");
      await c.post("/api/auth/login", {
        email: pessoa!.email,
        password: pessoa!.senha,
      });
      igual((await c.get("/api/auth/me")).status, 200, "entrou");
      await c.post("/api/auth/logout");
      igual((await c.get("/api/auth/me")).status, 401, "saiu");
    });

    await s.teste("cookie adulterado não vale sessão", async () => {
      const c = new Conta(base, "falso");
      await c.post("/api/auth/login", {
        email: pessoa!.email,
        password: pessoa!.senha,
      });
      // Reescreve o jarro com um valor inventado do mesmo formato.
      const jarro = c as unknown as { cookies: Map<string, string> };
      for (const [k] of jarro.cookies) {
        jarro.cookies.set(k, randomUUID().replace(/-/g, ""));
      }
      igual((await c.get("/api/auth/me")).status, 401, "status");
    });

    await s.teste("banir a conta derruba a sessão aberta", async () => {
      const c = new Conta(base, "banido");
      await c.post("/api/auth/login", {
        email: pessoa!.email,
        password: pessoa!.senha,
      });
      igual((await c.get("/api/auth/me")).status, 200, "entrou");

      await sql`update users set banned_at = now(), banned_reason = 'teste' where id = ${pessoa!.id}::uuid`;
      try {
        // `fresh=1` força a consulta ao banco em vez do cache assinado, que é
        // o que a tela faz na primeira carga.
        const depois = await c.get("/api/auth/me?fresh=1");
        ok(
          depois.status === 401 || depois.status === 403,
          `ficou ${depois.status}`,
        );
        return `banido -> ${depois.status}`;
      } finally {
        await sql`update users set banned_at = null, banned_reason = null where id = ${pessoa!.id}::uuid`;
      }
    });

    // -----------------------------------------------------------------------
    // O nickname — o laço original
    // -----------------------------------------------------------------------

    await s.teste(
      "nickname repetido é recusado e diz QUAL é o seu",
      async () => {
        /*
         * O laço original: a tela pedia um nickname para uma conta que já tinha,
         * o servidor respondia "já existe" e a tela pedia de novo, para sempre.
         * A resposta de conflito precisa trazer o nickname de verdade — é com ele
         * que a tela se conserta sozinha e sai.
         */
        const r = await pessoa!.cliente.post<{
          nickname?: string;
          reason?: string;
        }>("/api/users/nickname", { nickname: `${PREFIXO}qualquer1` });
        if (r.status === 409) {
          ok(r.corpo.nickname, "o 409 não disse qual é o nickname atual");
          igual(r.corpo.nickname, pessoa!.nickname, "e ele é o certo");
          return "409 com o nickname de volta";
        }
        igual(r.status, 200, `status inesperado: ${JSON.stringify(r.corpo)}`);
        return "a conta pôde trocar";
      },
    );

    await s.teste("nickname de outra pessoa é recusado", async () => {
      const nova = new Conta(base, "colide");
      const senha = senhaBoa();
      const r = await nova.post<{ errors?: Record<string, string> }>(
        "/api/auth/register",
        {
          email: `${PREFIXO}col${Date.now().toString(36)}@exemplo-teste.invalid`,
          password: senha,
          confirmPassword: senha,
          fullName: "Teste",
          nickname: pessoa!.nickname,
          country: "Brasil",
          state: "São Paulo",
          city: "São Paulo",
        },
      );
      // 409 ou 400: o que importa é NÃO ser a mensagem genérica de e-mail. Um
      // erro de e-mail exibido num cadastro que falhou pelo nickname manda a
      // pessoa trocar o campo errado e tentar de novo para sempre.
      ok(r.status === 400 || r.status === 409, `ficou ${r.status}`);
      ok(r.corpo.errors?.nickname, "apontou o nickname, e não o e-mail");
      return `${r.status} apontando o nickname`;
    });

    await s.teste("nickname com formato inválido é recusado", async () => {
      for (const nome of [
        "a",
        "com espaço",
        "com/barra",
        "a".repeat(40),
        "@arroba",
      ]) {
        const r = await pessoa!.cliente.post("/api/users/nickname", {
          nickname: nome,
        });
        ok(r.status >= 400, `aceitou "${nome}"`);
      }
      return "5 formatos recusados";
    });

    // -----------------------------------------------------------------------
    // A busca
    // -----------------------------------------------------------------------

    await s.teste(
      "a busca acha OUTRA pessoa pelo nickname, sem caixa",
      async () => {
        // Precisa ser outra conta procurando: a lupa esconde você de si mesmo, e
        // é intencional — ver o próprio nome com um botão "Conectar" ao lado só
        // confunde.
        const quemProcura = comLugar!;
        const r = await quemProcura.cliente.get<{
          resultados?: { nickname: string }[];
        }>(
          `/api/users/search?q=${encodeURIComponent(pessoa!.nickname.toUpperCase())}`,
        );
        igual(r.status, 200, "status");
        const achou = (r.corpo.resultados ?? []).some(
          (x) => x.nickname.toLowerCase() === pessoa!.nickname.toLowerCase(),
        );
        ok(achou, `não achou: ${JSON.stringify(r.corpo).slice(0, 200)}`);
      },
    );

    await s.teste("a lupa não devolve a própria pessoa", async () => {
      const r = await pessoa!.cliente.get<{
        resultados?: { nickname: string }[];
      }>(`/api/users/search?q=${encodeURIComponent(pessoa!.nickname)}`);
      const eu = (r.corpo.resultados ?? []).some(
        (x) => x.nickname.toLowerCase() === pessoa!.nickname.toLowerCase(),
      );
      ok(!eu, "a pessoa apareceu na própria busca");
    });

    await s.teste(
      "busca de uma letra devolve lista vazia, e não a base",
      async () => {
        const r = await pessoa!.cliente.get<{ resultados?: unknown[] }>(
          "/api/users/search?q=a",
        );
        igual(r.status, 200, "status");
        igual((r.corpo.resultados ?? []).length, 0, "resultados");
      },
    );

    await s.teste(
      "curinga de SQL digitado é literal, e não casa com tudo",
      async () => {
        // Sem escapar, "%" sozinho devolveria a base inteira.
        for (const termo of ["%%", "__", "%_"]) {
          const r = await pessoa!.cliente.get<{ resultados?: unknown[] }>(
            `/api/users/search?q=${encodeURIComponent(termo)}`,
          );
          igual(
            (r.corpo.resultados ?? []).length,
            0,
            `"${termo}" devolveu gente`,
          );
        }
        return "3 curingas neutralizados";
      },
    );

    await s.teste("a busca NÃO devolve e-mail de ninguém", async () => {
      const r = await pessoa!.cliente.get(
        `/api/users/search?q=${encodeURIComponent(PREFIXO)}`,
      );
      const bruto = JSON.stringify(r.corpo);
      ok(!bruto.includes("@"), `vazou algo com @: ${bruto.slice(0, 200)}`);
    });

    await s.teste("sem sessão não se busca ninguém", async () => {
      const anonimo = new Conta(base, "anonimo");
      const r = await anonimo.get(`/api/users/search?q=${PREFIXO}`);
      ok(r.status === 401 || r.status === 403, `ficou ${r.status}`);
    });
  } finally {
    await s.limpar();
  }

  return s;
}
