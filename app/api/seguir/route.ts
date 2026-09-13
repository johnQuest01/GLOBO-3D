import { NextResponse } from "next/server";

import { getSecret } from "@/lib/auth/cookies";
import { getSession } from "@/lib/auth/session";
import { isAuthDbEnabled } from "@/lib/db/auth";
import {
  type CamadaDoLugar,
  LUGARES_MAX,
  PESSOAS_MAX,
  deixarDeSeguirLugar,
  deixarDeSeguirPessoa,
  oQueEuSigo,
  seguirLugar,
  seguirPessoa,
} from "@/lib/db/seguir";

/**
 * Seguir lugares e pessoas.
 *
 * GET    — o que eu sigo.
 * POST   — passa a seguir.
 * DELETE — deixa de seguir.
 *
 * SÓ RESPONDE SOBRE VOCÊ. Não existe rota para perguntar quem segue outra
 * pessoa, e a ausência é a funcionalidade: seguir aqui é privado, ninguém
 * descobre quem o segue, e não há contagem de seguidores em lugar nenhum. É o
 * que permite ter "seguir" sem ter placar — no minuto em que um número de
 * seguidores fica visível, ele vira o objetivo, e as pessoas passam a publicar
 * para ele em vez de para quem está do outro lado.
 *
 * Se um dia isso mudar, muda AQUI e no schema, e não em vinte telas.
 */

export const runtime = "nodejs";

const CAMADAS: CamadaDoLugar[] = ["pais", "estado", "cidade"];
const NOME_MAX = 120;

function indisponivel() {
  return NextResponse.json(
    { ok: false, reason: "indisponivel" },
    { status: 503 },
  );
}

export async function GET() {
  if (!getSecret() || !isAuthDbEnabled) return indisponivel();

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: "nao-logado" },
      { status: 401 },
    );
  }

  const sigo = await oQueEuSigo(session.user.id);
  return NextResponse.json({
    ok: true,
    ...sigo,
    // Os tetos vêm na resposta para a tela não repetir os números — eles moram
    // em lib/db/seguir.ts, e mudam num lugar só.
    limites: { lugares: LUGARES_MAX, pessoas: PESSOAS_MAX },
  });
}

/** Os dois verbos leem o mesmo corpo; o que muda é o que fazem com ele. */
async function lerAlvo(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return { erro: "json-invalido" as const };
  }

  if (body.tipo === "pessoa") {
    const nickname =
      typeof body.nickname === "string" ? body.nickname.trim() : "";
    if (!nickname) return { erro: "sem-alvo" as const };
    return { pessoa: nickname };
  }

  const camada = CAMADAS.includes(body.camada as CamadaDoLugar)
    ? (body.camada as CamadaDoLugar)
    : null;
  const valor =
    typeof body.valor === "string" ? body.valor.trim().slice(0, NOME_MAX) : "";

  if (!camada || !valor) return { erro: "sem-alvo" as const };

  /*
   * O PAÍS ACOMPANHA ESTADO E CIDADE para desempatar homônimas — "Santiago"
   * existe em vários países, e assinar uma cidade sem dizer qual traria posts
   * de três continentes. No país ele é redundante e fica nulo.
   */
  const pais =
    camada === "pais"
      ? null
      : typeof body.pais === "string"
        ? body.pais.trim().slice(0, NOME_MAX) || null
        : null;

  return { lugar: { tipo: camada, valor, pais } };
}

export async function POST(request: Request) {
  if (!getSecret() || !isAuthDbEnabled) return indisponivel();

  const session = await getSession({ exigirBanco: true });
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: "nao-logado" },
      { status: 401 },
    );
  }

  const alvo = await lerAlvo(request);
  if ("erro" in alvo) {
    return NextResponse.json({ ok: false, reason: alvo.erro }, { status: 400 });
  }

  const r = alvo.pessoa
    ? await seguirPessoa(session.user.id, alvo.pessoa)
    : await seguirLugar(session.user.id, alvo.lugar!);

  if (r === "cheio") {
    /*
     * 409 e uma frase que diz o que fazer. "Não foi possível" para quem
     * esbarrou num teto manda a pessoa tentar de novo para sempre.
     */
    return NextResponse.json(
      {
        ok: false,
        reason: "cheio",
        message: alvo.pessoa
          ? `Você já segue ${PESSOAS_MAX} pessoas. Deixe de seguir alguém para abrir espaço.`
          : `Você já segue ${LUGARES_MAX} lugares. Deixe de seguir um para abrir espaço.`,
      },
      { status: 409 },
    );
  }
  if (r === "nao-encontrado") {
    return NextResponse.json(
      { ok: false, reason: "nao-encontrado" },
      { status: 404 },
    );
  }
  if (r === "indisponivel") return indisponivel();

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!getSecret() || !isAuthDbEnabled) return indisponivel();

  const session = await getSession({ exigirBanco: true });
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: "nao-logado" },
      { status: 401 },
    );
  }

  const alvo = await lerAlvo(request);
  if ("erro" in alvo) {
    return NextResponse.json({ ok: false, reason: alvo.erro }, { status: 400 });
  }

  if (alvo.pessoa) await deixarDeSeguirPessoa(session.user.id, alvo.pessoa);
  else await deixarDeSeguirLugar(session.user.id, alvo.lugar!);

  // Sempre 200, inclusive quando não seguia. Deixar de seguir é idempotente:
  // dois toques no mesmo botão não podem produzir um erro.
  return NextResponse.json({ ok: true });
}
