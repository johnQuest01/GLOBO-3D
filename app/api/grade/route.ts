import { NextResponse } from "next/server";

import { getSecret } from "@/lib/auth/cookies";
import { getSession } from "@/lib/auth/session";
import { isAuthDbEnabled } from "@/lib/db/auth";
import { gradeDe, gradeLigada, minhaGrade } from "@/lib/db/grade";

/**
 * A grade de fotos e vídeos de um perfil.
 *
 * GET ?de=nick  — a grade daquela pessoa.
 * GET ?minha=1  — a minha, inclusive o que a comunidade escondeu.
 *
 * EXIGE SESSÃO, como todo o resto que lê conteúdo de gente. Sem isso a grade
 * viraria um índice público de quem publicou o quê, aberto a qualquer robô que
 * soubesse listar nicknames — e ninguém publicou no globo esperando isso.
 *
 * NÃO OLHA A VISIBILIDADE DO PERFIL, e isso é deliberado. Ela guarda idade,
 * nome e lugar: coisas que a pessoa NÃO escolheu tornar públicas, e que o
 * cadastro pediu. Publicar é o contrário — é um ato deliberado de mostrar, e
 * cada publicação já foi ao mural ou à tela de notícias de estranhos. Esconder
 * na grade o que já está circulando não protegeria nada; só faria o perfil
 * mentir sobre uma pessoa que está publicando.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!getSecret() || !isAuthDbEnabled || !gradeLigada) {
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

  const url = new URL(request.url);

  if (url.searchParams.get("minha") === "1") {
    return NextResponse.json({
      ok: true,
      itens: await minhaGrade(session.user.id),
    });
  }

  const de = (url.searchParams.get("de") ?? "").trim();
  if (!de || de.length > 40) {
    return NextResponse.json({ ok: false, reason: "sem-de" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, itens: await gradeDe(de) });
}
