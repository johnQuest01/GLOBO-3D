import { NextResponse } from "next/server";

import { getSecret } from "@/lib/auth/cookies";
import { getSession } from "@/lib/auth/session";
import { findUserById, isAuthDbEnabled } from "@/lib/db/auth";
import {
  ASSUNTOS,
  type Alcance,
  type Assunto,
  listarNoticias,
  minhasNoticias,
  noticiasDe,
  noticiasLigadas,
  publicarNoticia,
} from "@/lib/db/noticias";
import { apagarMeuPost } from "@/lib/db/posts";
import { coordenadaValida } from "@/lib/geo/lugar";

/**
 * Notícias da região.
 *
 * GET            — as que alcançam você, pelo lugar do seu cadastro.
 * GET ?de=nick   — a página de alguém: tudo o que aquela pessoa publicou.
 * GET ?minhas=1  — as suas, inclusive as que a comunidade escondeu.
 * POST           — publica.
 * DELETE ?id=    — apaga uma sua.
 *
 * O LUGAR DE QUEM LÊ VEM DO SERVIDOR, e não do que o navegador mandou. Se o
 * cliente pudesse dizer "estou em Tóquio", qualquer pessoa leria o mural de
 * bairro de qualquer lugar do mundo — e a promessa de notícia regional viraria
 * um mural global com título.
 */

export const runtime = "nodejs";

const TITULO_MAX = 140;
const CORPO_MAX = 4000;
const ALCANCES: Alcance[] = ["cidade", "estado", "pais"];
const TIPOS = ["texto", "imagem", "video"] as const;
const CHAVE_VALIDA =
  /^m\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]{20,48}\.[a-z0-9]{2,5}$/;

function indisponivel() {
  return NextResponse.json(
    { ok: false, reason: "indisponivel" },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  if (!getSecret() || !isAuthDbEnabled || !noticiasLigadas)
    return indisponivel();

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: "nao-logado" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);

  if (url.searchParams.get("minhas") === "1") {
    return NextResponse.json({
      ok: true,
      noticias: await minhasNoticias(session.user.id),
      assuntos: ASSUNTOS,
    });
  }

  const de = url.searchParams.get("de");
  if (de) {
    return NextResponse.json({
      ok: true,
      noticias: await noticiasDe(de),
      assuntos: ASSUNTOS,
    });
  }

  const eu = await findUserById(session.user.id);
  const categoria = url.searchParams.get("assunto");
  const termo = url.searchParams.get("q");
  const antesDe = url.searchParams.get("antesDe");

  const noticias = await listarNoticias({
    pais: eu?.country ?? null,
    estado: eu?.state ?? null,
    cidade: eu?.city ?? null,
    categoria: ASSUNTOS.includes(categoria as Assunto)
      ? (categoria as Assunto)
      : null,
    termo: termo && termo.trim().length >= 2 ? termo.trim() : null,
    antesDe: antesDe && !Number.isNaN(Date.parse(antesDe)) ? antesDe : null,
  });

  return NextResponse.json({
    ok: true,
    noticias,
    assuntos: ASSUNTOS,
    // O lugar volta para a tela poder dizer "notícias de São Paulo" em vez de
    // um título genérico que não explica por que aquela lista é aquela.
    meuLugar: {
      pais: eu?.country ?? null,
      estado: eu?.state ?? null,
      cidade: eu?.city ?? null,
    },
    proximo:
      noticias.length > 0 ? noticias[noticias.length - 1]!.criadoEm : null,
  });
}

export async function POST(request: Request) {
  if (!getSecret() || !isAuthDbEnabled || !noticiasLigadas)
    return indisponivel();

  const session = await getSession({ exigirBanco: true });
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: "nao-logado" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "json-invalido" },
      { status: 400 },
    );
  }

  const erros: Record<string, string> = {};

  const titulo =
    typeof body.titulo === "string"
      ? body.titulo.trim().slice(0, TITULO_MAX)
      : "";
  if (!titulo) erros.titulo = "Escreva um título.";

  const corpo =
    typeof body.corpo === "string" ? body.corpo.trim().slice(0, CORPO_MAX) : "";

  const categoria = ASSUNTOS.includes(body.categoria as Assunto)
    ? (body.categoria as Assunto)
    : "outro";

  const alcance = ALCANCES.includes(body.alcance as Alcance)
    ? (body.alcance as Alcance)
    : null;
  if (!alcance) erros.alcance = "Diga até onde esta notícia interessa.";

  const midiaChave =
    typeof body.midiaChave === "string" ? body.midiaChave : null;

  /*
   * O CARTAZ PASSA PELA MESMA PENEIRA DA MIDIA. Ele e' uma chave de objeto que
   * veio do navegador, e uma chave que nao conferimos e' um caminho para pedir
   * assinatura de um objeto que nao e' nosso. Cartaz invalido nao derruba a
   * publicacao: ele simplesmente nao entra, porque o video vive sem ele.
   */
  const cartazBruto =
    typeof body.cartazChave === "string" ? body.cartazChave : null;
  const cartazChave =
    cartazBruto && CHAVE_VALIDA.test(cartazBruto) ? cartazBruto : null;

  if (midiaChave && !CHAVE_VALIDA.test(midiaChave)) {
    erros.midia = "Arquivo inválido.";
  }

  const kind = TIPOS.includes(body.kind as (typeof TIPOS)[number])
    ? (body.kind as (typeof TIPOS)[number])
    : "texto";
  if (kind !== "texto" && !midiaChave) erros.midia = "Falta o arquivo.";

  if (Object.keys(erros).length > 0) {
    return NextResponse.json({ ok: false, errors: erros }, { status: 400 });
  }

  const autor = await findUserById(session.user.id);
  if (!autor?.nickname) {
    return NextResponse.json(
      { ok: false, reason: "sem-nickname" },
      { status: 409 },
    );
  }

  /*
   * SEM LUGAR NÃO SE PUBLICA NOTÍCIA DE REGIÃO — e aqui não é burocracia: a
   * notícia É de um lugar. Sem coordenada não há de onde ela falar, e sem
   * país/estado/cidade não há a quem ela alcançar.
   */
  if (!coordenadaValida(autor.lat, autor.lon) || !autor.country) {
    return NextResponse.json(
      { ok: false, reason: "sem-lugar" },
      { status: 409 },
    );
  }

  /*
   * ALCANCE MAIOR QUE O LUGAR QUE A PESSOA TEM É RECUSADO. Quem não preencheu
   * a cidade não pode publicar "para a minha cidade" — a notícia não teria a
   * quem chegar, e ficaria invisível sem ninguém entender por quê.
   */
  if (alcance === "cidade" && !autor.city) {
    return NextResponse.json(
      {
        ok: false,
        errors: { alcance: "Você ainda não disse em que cidade mora." },
      },
      { status: 400 },
    );
  }
  if (alcance === "estado" && !autor.state) {
    return NextResponse.json(
      {
        ok: false,
        errors: { alcance: "Você ainda não disse em que estado mora." },
      },
      { status: 400 },
    );
  }

  const noticia = await publicarNoticia({
    autorId: autor.id,
    titulo,
    corpo: corpo || null,
    kind,
    midiaChave,
    cartazChave,
    categoria,
    // `alcance` ja' foi validado acima; o `!` diz isso ao compilador, que nao
    // consegue enxergar a checagem atraves do objeto de erros.
    alcance: alcance!,
    lat: autor.lat!,
    lon: autor.lon!,
    lugar:
      [autor.city, autor.country]
        .filter((v) => typeof v === "string" && v)
        .join(", ") || null,
    pais: autor.country,
    estado: autor.state,
    cidade: autor.city,
  });

  if (!noticia) return indisponivel();
  return NextResponse.json({ ok: true, noticia });
}

export async function DELETE(request: Request) {
  if (!getSecret() || !isAuthDbEnabled || !noticiasLigadas)
    return indisponivel();

  const session = await getSession({ exigirBanco: true });
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: "nao-logado" },
      { status: 401 },
    );
  }

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, reason: "sem-id" }, { status: 400 });
  }

  // A mesma função do mural: o `author_id` vai no `where`, então conhecer o id
  // de uma notícia não dá poder de apagá-la.
  const apagou = await apagarMeuPost(session.user.id, id);
  if (!apagou) {
    return NextResponse.json(
      { ok: false, reason: "nao-encontrado" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
