import { NextResponse } from "next/server";

import { freio } from "@/lib/api/freio";
import { getSecret } from "@/lib/auth/cookies";
import { getSession } from "@/lib/auth/session";
import { isAuthDbEnabled } from "@/lib/db/auth";
import { curtirComentario, curtirPost, socialLigado } from "@/lib/db/social";

/**
 * Curtir e descurtir — de publicação ou de comentário.
 *
 * UMA ROTA PARA OS DOIS porque é o mesmo gesto com o mesmo freio. Duas rotas
 * teriam dois baldes, e quem quisesse abusar usaria os dois.
 *
 * POST { post: id, quero: bool }       → curte/descurte a publicação
 * POST { comentario: id, quero: bool } → curte/descurte o comentário
 *
 * DEVOLVE O NÚMERO DE VERDADE, e não "ok". A tela mexe no coração na hora do
 * toque, sem esperar — é o que faz o gesto parecer instantâneo. Mas entre o
 * toque e a resposta outras pessoas curtiram, e sem o número do servidor o
 * contador de quem está com a tela aberta vai divergindo do mundo o dia
 * inteiro.
 */

export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cento e vinte por minuto.
 *
 * Generoso de propósito: curtir enquanto se rola um feed é uma rajada legítima,
 * e um freio apertado puniria o uso normal para atrapalhar de leve o abuso. O
 * que realmente protege aqui é a chave primária — curtir duas vezes não conta
 * duas vezes —, então o freio só precisa impedir que alguém use a rota como
 * martelo contra o banco.
 */
const balde = freio("curtir", 120);

export async function POST(request: Request) {
  if (!getSecret() || !isAuthDbEnabled || !socialLigado) {
    return NextResponse.json(
      { ok: false, reason: "indisponivel" },
      { status: 503 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: "nao-logado" },
      { status: 401 },
    );
  }

  if (!balde.permitir(session.user.id)) {
    return NextResponse.json(
      { ok: false, reason: "muito-rapido" },
      { status: 429, headers: { "retry-after": String(balde.esperaSeg) } },
    );
  }

  let body: { post?: unknown; comentario?: unknown; quero?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "json-invalido" },
      { status: 400 },
    );
  }

  /*
   * O PADRÃO É CURTIR. Um corpo sem `quero` é quase sempre um cliente antigo
   * ou um toque simples; tratar isso como "descurtir" apagaria uma curtida que
   * ninguém pediu para apagar.
   */
  const quero = body.quero !== false;
  const post = typeof body.post === "string" ? body.post : null;
  const comentario =
    typeof body.comentario === "string" ? body.comentario : null;

  if (post && UUID.test(post)) {
    const r = await curtirPost(post, session.user.id, quero);
    if (!r) {
      return NextResponse.json(
        { ok: false, reason: "nao-existe" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, ...r });
  }

  if (comentario && UUID.test(comentario)) {
    const r = await curtirComentario(comentario, session.user.id, quero);
    if (!r) {
      return NextResponse.json(
        { ok: false, reason: "nao-existe" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, ...r });
  }

  return NextResponse.json({ ok: false, reason: "sem-alvo" }, { status: 400 });
}
