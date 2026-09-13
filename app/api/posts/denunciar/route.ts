import { NextResponse } from "next/server";

import { getSecret } from "@/lib/auth/cookies";
import { getSession } from "@/lib/auth/session";
import { isAuthDbEnabled } from "@/lib/db/auth";
import {
  DENUNCIAS_PARA_OCULTAR,
  denunciarPost,
  postsLigados,
} from "@/lib/db/posts";

/**
 * Denunciar um post — a camada de baixo da moderação.
 *
 * O QUE ELA FAZ É UMA PAUSA, e não um veredito. Juntando denúncias de pessoas
 * diferentes, o post sai do ar e entra numa fila para alguém olhar. Nada é
 * apagado, e a moderação pode devolver.
 *
 * POR QUE A PAUSA PRECISA SER AUTOMÁTICA. É aritmética, não desconfiança de
 * quem modera: o post vive 24 horas e a revisão humana não é instantânea. Sem
 * isto, algo grave publicado à meia-noite ficaria no ar até alguém acordar. A
 * comunidade cobre essa janela; a moderação corrige o que ela errar.
 *
 * E POR QUE ELA NÃO PODE APAGAR. Ocultar por volume é reversível. Remover por
 * volume seria entregar a moderação a quem denuncia em grupo — um mural onde um
 * grupo organizado apaga qualquer pessoa não é moderado, é capturado.
 *
 * A RESPOSTA NÃO CONTA QUANTAS DENÚNCIAS FALTAM. Dizer "faltam duas" convida a
 * juntar mais duas, e a única pessoa que usaria essa informação é quem está
 * coordenando.
 */

export const runtime = "nodejs";

const MOTIVOS = new Set([
  "spam",
  "assedio",
  "nudez",
  "violencia",
  "crianca",
  "golpe",
  "outro",
]);

export async function POST(request: Request) {
  if (!getSecret() || !isAuthDbEnabled || !postsLigados) {
    return NextResponse.json(
      { ok: false, reason: "indisponivel" },
      { status: 503 },
    );
  }

  const session = await getSession({ exigirBanco: true });
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: "nao-logado" },
      { status: 401 },
    );
  }

  let body: { postId?: unknown; motivo?: unknown; detalhe?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "json-invalido" },
      { status: 400 },
    );
  }

  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  if (!postId) {
    return NextResponse.json(
      { ok: false, reason: "sem-post" },
      { status: 400 },
    );
  }

  /*
   * O MOTIVO É DE UMA LISTA, com um campo livre ao lado. Texto livre puro
   * produz uma fila que precisa ser lida inteira para ser triada; a lista deixa
   * "isto é uma criança" saltar na frente de "spam" sem ninguém abrir os dois.
   */
  const escolhido = typeof body.motivo === "string" ? body.motivo : "";
  const motivo = MOTIVOS.has(escolhido) ? escolhido : "outro";
  const detalhe =
    typeof body.detalhe === "string" ? body.detalhe.trim().slice(0, 300) : "";

  const r = await denunciarPost(
    postId,
    session.user.id,
    detalhe ? `${motivo}: ${detalhe}` : motivo,
  );

  return NextResponse.json({
    ok: true,
    registrada: r.registrada,
    saiuDoAr: r.ocultou,
  });
}

/** Só para a tela explicar a regra sem repetir o número dos dois lados. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    motivos: [...MOTIVOS],
    denunciasParaOcultar: DENUNCIAS_PARA_OCULTAR,
  });
}
