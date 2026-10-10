import { NextRequest, NextResponse } from "next/server";

/**
 * Onde as falhas do navegador viram registro no servidor.
 *
 * POR QUE ISTO EXISTE. Em produção o Next esconde a mensagem real do erro e
 * mostra só um `digest` — por segurança, e com razão. Mas isso significa que
 * uma falha no celular de alguém não deixa rastro nenhum do nosso lado: a
 * pessoa fecha o app e a gente nunca fica sabendo. Esta rota é o caminho de
 * volta.
 *
 * O QUE ELA NÃO FAZ: não grava no banco. Um erro que acontece numa falha em
 * cascata chegaria mil vezes por minuto e transformaria uma falha de tela num
 * incidente de banco de dados. `console.error` já vai para os registros do
 * Vercel, que é onde se olha quando alguém diz "deu erro".
 */
export const runtime = "nodejs";

/* Um teto por processo: depois dele, o barulho não ajuda mais a entender. */
let contados = 0;
let janela = Date.now();
const TETO = 40;
const JANELA_MS = 60_000;

export async function POST(req: NextRequest) {
  const agora = Date.now();
  if (agora - janela > JANELA_MS) {
    janela = agora;
    contados = 0;
  }
  if (contados >= TETO) return NextResponse.json({ ok: true, demais: true });
  contados += 1;

  let corpo: Record<string, unknown> = {};
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const texto = (v: unknown, teto: number) =>
    typeof v === "string" ? v.slice(0, teto) : null;

  console.error("[erro-no-navegador]", {
    mensagem: texto(corpo.mensagem, 500),
    digest: texto(corpo.digest, 80),
    onde: texto(corpo.onde, 200),
    tela: texto(corpo.tela, 20),
    // O agente diz o aparelho e o navegador — é o que separa "quebra em todo
    // lugar" de "quebra no Safari do iPhone", e as duas pedem conserto
    // diferente.
    agente: (req.headers.get("user-agent") ?? "").slice(0, 200),
    pilha: texto(corpo.pilha, 2000),
  });

  return NextResponse.json({ ok: true });
}
