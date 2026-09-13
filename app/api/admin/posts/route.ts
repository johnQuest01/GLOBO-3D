import { NextResponse } from "next/server";

import { getSession, isAdmin } from "@/lib/auth/session";
import { isAuthDbEnabled } from "@/lib/db/auth";
import {
  decidirSobrePost,
  filaDeModeracao,
  postsLigados,
} from "@/lib/db/posts";

/**
 * A moderação que fica por cima.
 *
 * GET  — a fila: o que a comunidade escondeu e ninguém julgou ainda.
 * POST — a decisão: `restaurar` devolve ao ar, `remover` tira de vez.
 *
 * A DECISÃO DAQUI GANHA DA DA COMUNIDADE, e é por isso que `restaurar` também
 * marca o post como revisado: sem a segunda parte, o mesmo grupo o esconderia de
 * novo em minutos, e moderar não significaria nada.
 *
 * SÓ QUEM TEM O COOKIE ASSINADO DE ADMINISTRADOR passa por aqui — emitido pelo
 * /api/admin/login depois de conferir e-mail e senha no servidor. O
 * sessionStorage do navegador não vale nada: ele é do lado de lá.
 *
 * REMOVER NÃO APAGA A LINHA. O post sai do ar e o registro fica: a denúncia do
 * outro lado precisa continuar apontando para alguma coisa, e uma decisão de
 * moderação sem rastro é uma decisão que ninguém pode revisar depois — inclusive
 * quando quem revisa é a própria pessoa que decidiu, uma semana depois.
 */

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { ok: false, reason: "nao-autorizado" },
      { status: 401 },
    );
  }
  if (!isAuthDbEnabled || !postsLigados) {
    return NextResponse.json(
      { ok: false, reason: "indisponivel" },
      { status: 503 },
    );
  }

  const fila = await filaDeModeracao();
  return NextResponse.json({ ok: true, fila, total: fila.length });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { ok: false, reason: "nao-autorizado" },
      { status: 401 },
    );
  }
  if (!isAuthDbEnabled || !postsLigados) {
    return NextResponse.json(
      { ok: false, reason: "indisponivel" },
      { status: 503 },
    );
  }

  let body: { postId?: unknown; acao?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "json-invalido" },
      { status: 400 },
    );
  }

  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  const acao =
    body.acao === "restaurar" || body.acao === "remover" ? body.acao : null;

  if (!postId || !acao) {
    return NextResponse.json(
      { ok: false, reason: "pedido-incompleto" },
      { status: 400 },
    );
  }

  // Quem decidiu fica gravado. A sessão de administrador pode existir sem uma
  // sessão de usuário por trás, e nesse caso o autor da decisão fica nulo — o
  // registro do QUE foi decidido não depende disso.
  const sessao = await getSession();
  const ok = await decidirSobrePost(postId, sessao?.user.id ?? null, acao);

  if (!ok) {
    return NextResponse.json(
      { ok: false, reason: "nao-encontrado" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, acao });
}
