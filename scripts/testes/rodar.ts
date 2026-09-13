/**
 * O nó de testes: tudo, de uma vez, contra o aplicativo de verdade.
 *
 * CONTRA O QUE ELE RODA. Por padrão, contra a produção — a Vercel, o Neon, o
 * servidor de tempo real na Fly e o R2 da Cloudflare, todos os quatro ao mesmo
 * tempo. É o único arranjo que prova as coisas que quebram de verdade neste
 * projeto, que quase nunca são lógica dentro de um arquivo: são duas nuvens
 * discordando sobre o que aconteceu, um cookie que não atravessa, uma
 * assinatura que vence.
 *
 *   npm run testes                    (produção)
 *   npm run testes -- --base=http://localhost:3000
 *   npm run testes -- --so=perfil     (uma suíte só)
 *   npm run testes -- --faxina        (limpa contas órfãs e sai)
 *
 * ELE ESCREVE NO BANCO DE PRODUÇÃO. As contas que cria começam com `zzteste_`
 * e são apagadas ao final, inclusive quando um teste falha no meio. Se uma
 * execução for interrompida, `--faxina` varre o que ficou.
 */

import { Resultado, relatorio } from "./arnes";
import { faxina } from "./contas";

const PADRAO = "https://globo-3d-ten.vercel.app";
const PADRAO_REALTIME = "https://globo-realtime.fly.dev";

function argumento(nome: string): string | undefined {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado?.slice(nome.length + 3);
}

async function principal(): Promise<void> {
  if (process.argv.includes("--faxina")) {
    const quantas = await faxina();
    console.log(`faxina: ${quantas} conta(s) de teste apagada(s)`);
    return;
  }

  const base = (argumento("base") ?? PADRAO).replace(/\/$/, "");
  const so = argumento("so");

  const realtime = (argumento("realtime") ?? PADRAO_REALTIME).replace(
    /\/$/,
    "",
  );

  console.log(`\napp:      ${base}`);
  console.log(`realtime: ${realtime}`);
  if (so) console.log(`só a suíte: ${so}`);

  const suites: {
    nome: string;
    rodar: () => Promise<{ resultados: Resultado[] }>;
  }[] = [
    {
      nome: "conta",
      rodar: async () => (await import("./suite-conta")).suiteConta(base),
    },
    {
      nome: "perfil",
      rodar: async () => (await import("./suite-perfil")).suitePerfil(base),
    },
    {
      nome: "midia",
      rodar: async () => (await import("./suite-midia")).suiteMidia(base),
    },
    {
      nome: "sinais",
      rodar: async () =>
        (await import("./suite-sinais")).suiteSinais(base, realtime),
    },
    {
      nome: "conversa",
      rodar: async () =>
        (await import("./suite-conversa")).suiteConversa(base, realtime),
    },
    {
      nome: "mural",
      rodar: async () => (await import("./suite-mural")).suiteMural(base),
    },
    {
      nome: "seguir",
      rodar: async () => (await import("./suite-seguir")).suiteSeguir(base),
    },
    {
      nome: "estresse",
      rodar: async () =>
        (await import("./suite-estresse")).suiteEstresse(base, realtime),
    },
  ];

  const todos: Resultado[] = [];
  for (const suite of suites) {
    if (so && !suite.nome.includes(so)) continue;
    try {
      const r = await suite.rodar();
      todos.push(...r.resultados);
    } catch (e) {
      // Uma suíte que nem sobe é uma falha, e precisa aparecer no relatório —
      // não pode desaparecer num traço de pilha no meio da saída.
      todos.push({
        suite: suite.nome,
        nome: "(a suíte não chegou a rodar)",
        passou: false,
        erro: e instanceof Error ? e.message : String(e),
        ms: 0,
      });
    }
  }

  const tudoBem = relatorio(todos);
  process.exit(tudoBem ? 0 : 1);
}

void principal();
