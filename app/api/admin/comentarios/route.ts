import { NextResponse } from "next/server";

import { getSession, isAdmin } from "@/lib/auth/session";
import { isAuthDbEnabled } from "@/lib/db/auth";
import {
  decidirSobreComentario,
  filaDeComentarios,
  socialLigado,
} from "@/lib/db/social";

/**
 * A moderação de comentários — irmã de /api/admin/posts, e igual a ela de
 * propósito.
 *
 * GET  — a fila: o que a comunidade escondeu e ninguém julgou ainda.
 * POST — a decisão: `restaurar` devolve ao ar, `remover` tira de vez.
 *
 * DUAS ROTAS E NÃO UMA, porque são duas coisas diferentes sendo julgadas: um
 * post é um ponto no globo e um comentário é uma linha pendurada nele. Juntar
 * as duas filas numa rota só obrigaria cada resposta a dizer de que tipo é cada
 * item, e cada decisão a repetir isso de volta — um campo a mais para errar em
 * troca de um arquivo a menos.
 *
 * SÓ QUEM TEM O COOKIE ASSINADO DE ADMINISTRADOR passa por aqui. O
 * sessionStorage do navegador não vale nada: ele é do lado de lá.
 */

export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function porteiro() {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { ok: false, reason: "nao-autorizado" },
      { status: 401 },
    );
  }
  if (!isAuthDbEnabled || !socialLigado) {
    return NextResponse.json(
      { ok: false, reason: "indisponivel" },
      { status: 503 },
    );
  }
  return null;
}

export async function GET() {
  const barrado = await porteiro();
  if (barrado) return barrado;

  const fila = await filaDeComentarios();
  return NextResponse.json({ ok: true, fila, total: fila.length });
}

export async function POST(request: Request) {
  const barrado = await porteiro();
  if (barrado) return barrado;

  let body: { comentarioId?: unknown; acao?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "json-invalido" },
      { status: 400 },
    );
  }

  const id =
    typeof body.comentarioId === "string" ? body.comentarioId.trim() : "";
  const acao =
    body.acao === "restaurar" || body.acao === "remover" ? body.acao : null;

  if (!UUID.test(id) || !acao) {
    return NextResponse.json(
      { ok: false, reason: "pedido-incompleto" },
      { status: 400 },
    );
  }

  // Quem decidiu fica gravado. A sessão de administrador pode existir sem uma
  // sessão de usuário por trás, e nesse caso o autor da decisão fica nulo — o
  // registro do QUE foi decidido não depende disso.
  const sessao = await getSession();
  const ok = await decidirSobreComentario(id, sessao?.user.id ?? null, acao);

  if (!ok) {
    return NextResponse.json(
      { ok: false, reason: "nao-encontrado" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, acao });
}
