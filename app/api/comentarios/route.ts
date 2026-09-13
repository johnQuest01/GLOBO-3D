import { NextResponse } from "next/server";

import { freio } from "@/lib/api/freio";
import { getSecret } from "@/lib/auth/cookies";
import { getSession } from "@/lib/auth/session";
import { findUserById, isAuthDbEnabled } from "@/lib/db/auth";
import {
  apagarComentario,
  comentar,
  denunciarComentario,
  listarComentarios,
  listarRespostas,
  socialLigado,
} from "@/lib/db/social";

/**
 * Comentários.
 *
 * GET  ?post=id[&antesDe=]   → as conversas da publicação (só as raízes)
 * GET  ?raiz=id[&depoisDe=]  → as respostas de uma conversa
 * POST { post, corpo, respondendoA? }
 * POST { denunciar: id, motivo? }
 * DELETE ?id=
 *
 * AS RESPOSTAS NÃO VÊM COM AS RAÍZES, e essa separação é o que mantém a
 * consulta previsível: uma publicação com quinhentas respostas espalhadas em
 * vinte conversas mandaria as quinhentas para desenhar vinte linhas. Elas são
 * pedidas quando alguém abre aquela conversa — que é quando passam a ser lidas.
 */

export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORPO_MAX = 2000;

/**
 * Doze por minuto para escrever, cento e vinte para ler.
 *
 * Escrever é caro e é o vetor de spam; ler é o uso normal de quem rola a tela.
 * Um número só para os dois teria de servir ao mais permissivo, e aí não
 * seguraria nada.
 */
const escrever = freio("comentar", 12);
const ler = freio("comentarios-ler", 120);

function semSessao() {
  return NextResponse.json({ ok: false, reason: "nao-logado" }, { status: 401 });
}

function rapidoDemais(f: { esperaSeg: number }) {
  return NextResponse.json(
    { ok: false, reason: "muito-rapido" },
    { status: 429, headers: { "retry-after": String(f.esperaSeg) } },
  );
}

function desligado() {
  return NextResponse.json(
    { ok: false, reason: "indisponivel" },
    { status: 503 },
  );
}

const ligado = () =>
  Boolean(getSecret()) && isAuthDbEnabled && socialLigado;

// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  if (!ligado()) return desligado();
  const session = await getSession();
  if (!session) return semSessao();
  if (!ler.permitir(session.user.id)) return rapidoDemais(ler);

  const url = new URL(request.url);
  const raiz = url.searchParams.get("raiz");
  const post = url.searchParams.get("post");

  const instante = (v: string | null) =>
    v && !Number.isNaN(Date.parse(v)) ? v : null;

  if (raiz && UUID.test(raiz)) {
    return NextResponse.json({
      ok: true,
      comentarios: await listarRespostas(raiz, session.user.id, {
        depoisDe: instante(url.searchParams.get("depoisDe")),
      }),
    });
  }

  if (post && UUID.test(post)) {
    return NextResponse.json({
      ok: true,
      comentarios: await listarComentarios(post, session.user.id, {
        antesDe: instante(url.searchParams.get("antesDe")),
      }),
    });
  }

  return NextResponse.json({ ok: false, reason: "sem-alvo" }, { status: 400 });
}

// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  if (!ligado()) return desligado();
  const session = await getSession();
  if (!session) return semSessao();

  let body: {
    post?: unknown;
    corpo?: unknown;
    respondendoA?: unknown;
    denunciar?: unknown;
    motivo?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "json-invalido" },
      { status: 400 },
    );
  }

  /* -- Denunciar ---------------------------------------------------------- */

  if (typeof body.denunciar === "string") {
    if (!escrever.permitir(session.user.id)) return rapidoDemais(escrever);
    if (!UUID.test(body.denunciar)) {
      return NextResponse.json(
        { ok: false, reason: "id-invalido" },
        { status: 400 },
      );
    }
    const motivo =
      typeof body.motivo === "string" ? body.motivo.slice(0, 60) : null;
    const r = await denunciarComentario(
      body.denunciar,
      session.user.id,
      motivo,
    );
    return NextResponse.json({ ok: r.ok, escondido: r.escondido });
  }

  /* -- Comentar ----------------------------------------------------------- */

  if (!escrever.permitir(session.user.id)) return rapidoDemais(escrever);

  const post = typeof body.post === "string" ? body.post : "";
  const corpo =
    typeof body.corpo === "string" ? body.corpo.trim().slice(0, CORPO_MAX) : "";
  const respondendoA =
    typeof body.respondendoA === "string" && UUID.test(body.respondendoA)
      ? body.respondendoA
      : null;

  if (!UUID.test(post)) {
    return NextResponse.json(
      { ok: false, reason: "sem-post" },
      { status: 400 },
    );
  }
  if (!corpo) {
    return NextResponse.json(
      { ok: false, errors: { corpo: "Escreva alguma coisa." } },
      { status: 400 },
    );
  }

  /*
   * SEM NICKNAME NÃO SE COMENTA — a mesma regra de publicar. Um comentário
   * aparece assinado; uma conversa cheia de "?" não dá a ninguém como
   * responder nem como saber de quem é.
   */
  const eu = await findUserById(session.user.id);
  if (!eu?.nickname) {
    return NextResponse.json(
      { ok: false, reason: "sem-nickname" },
      { status: 409 },
    );
  }

  const feito = await comentar({
    postId: post,
    autorId: session.user.id,
    corpo,
    respondendoA,
  });

  if (!feito) {
    /*
     * UM MOTIVO SÓ PARA VÁRIAS CAUSAS, e isso é deliberado. O post pode não
     * existir, pode ter sido removido, ou pode haver bloqueio entre as duas
     * pessoas — e distinguir isso na resposta contaria a quem foi bloqueado
     * que foi bloqueado, que é exatamente o que um bloqueio não deve anunciar.
     */
    return NextResponse.json(
      { ok: false, reason: "nao-deu" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, comentario: feito });
}

// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
  if (!ligado()) return desligado();
  const session = await getSession();
  if (!session) return semSessao();

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) {
    return NextResponse.json(
      { ok: false, reason: "id-invalido" },
      { status: 400 },
    );
  }

  const foi = await apagarComentario(id, session.user.id);
  return foi
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, reason: "nao-e-seu" }, { status: 403 });
}
