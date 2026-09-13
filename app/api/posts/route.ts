import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import { getSession } from '@/lib/auth/session';
import { findUserById, isAuthDbEnabled } from '@/lib/db/auth';
import {
  apagarMeuPost,
  listarMural,
  meusPosts,
  postsLigados,
  publicar,
  type TipoDePost,
} from '@/lib/db/posts';
import { muralDeQuemSegue } from '@/lib/db/seguir';
import { coordenadaValida } from '@/lib/geo/lugar';

/**
 * O mural do globo.
 *
 * GET  — o mundo inteiro, com teto e cursor. `?meus=1` devolve os seus,
 *        inclusive os que a comunidade escondeu: é o seu mural, e ficar sem
 *        saber que um post seu saiu do ar seria o pior jeito de descobrir.
 * POST — publica.
 * DELETE — apaga um seu.
 *
 * EXIGE SESSÃO ATÉ PARA LER, e essa é a decisão que define o produto. O mural é
 * mundial DENTRO do aplicativo, e não na internet aberta: sem login, ele viraria
 * uma página indexável de fotos e textos de gente que publicou para um globo, e
 * não para um mecanismo de busca.
 *
 * A COORDENADA DO POST VEM DO PERFIL DO AUTOR, lida aqui no servidor — nunca do
 * que o navegador mandou. Deixar o cliente escolher onde o próprio post aparece
 * permitiria plantar conteúdo em cima de qualquer cidade do mundo, que é o
 * primeiro uso que alguém daria a isso.
 */

export const runtime = 'nodejs';

const TEXTO_MAX = 600;
const TIPOS: TipoDePost[] = ['texto', 'imagem', 'video'];

/** O mesmo formato que /api/midia gera. Sem isso, um `..` viraria um caminho. */
const CHAVE_VALIDA = /^m\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]{20,48}\.[a-z0-9]{2,5}$/;

function indisponivel() {
  return NextResponse.json({ ok: false, reason: 'indisponivel' }, { status: 503 });
}

export async function GET(request: Request) {
  if (!getSecret() || !isAuthDbEnabled || !postsLigados) return indisponivel();

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  const url = new URL(request.url);

  if (url.searchParams.get('meus') === '1') {
    return NextResponse.json({ ok: true, posts: await meusPosts(session.user.id) });
  }

  /*
   * DUAS ABAS, UMA ROTA. `?de=seguindo` devolve o mural filtrado pelo que a
   * pessoa assinou — com o mundo misturado, porque assinar poucos lugares e
   * abrir numa hora morta nao pode devolver tela em branco (ver
   * lib/db/seguir.ts).
   *
   * Ele NAO pagina por cursor, e isso e' deliberado: a mistura e' calculada a
   * cada leitura, entao "a proxima pagina" nao teria como ser estavel. Sessenta
   * posts e' o que uma pessoa le' numa sentada; para ir mais fundo existe a aba
   * do mundo, que pagina.
   */
  if (url.searchParams.get('de') === 'seguindo') {
    return NextResponse.json({
      ok: true,
      posts: await muralDeQuemSegue(session.user.id),
      proximo: null,
    });
  }

  const antesDe = url.searchParams.get('antesDe');
  const posts = await listarMural({
    antesDe: antesDe && !Number.isNaN(Date.parse(antesDe)) ? antesDe : null,
  });

  /*
   * O CURSOR VOLTA PRONTO, em vez de a tela ter que descobri-lo. Ela só precisa
   * devolvê-lo no próximo pedido — e assim a regra de paginação mora num lugar
   * só, aqui, e não em cada tela que lista posts.
   */
  return NextResponse.json({
    ok: true,
    posts,
    proximo: posts.length > 0 ? posts[posts.length - 1]!.criadoEm : null,
  });
}

export async function POST(request: Request) {
  if (!getSecret() || !isAuthDbEnabled || !postsLigados) return indisponivel();

  const session = await getSession({ exigirBanco: true });
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'json-invalido' }, { status: 400 });
  }

  const kind = TIPOS.includes(body.kind as TipoDePost)
    ? (body.kind as TipoDePost)
    : null;
  if (!kind) {
    return NextResponse.json(
      { ok: false, errors: { kind: 'Tipo de publicação inválido.' } },
      { status: 400 },
    );
  }

  const texto =
    typeof body.body === 'string' ? body.body.trim().slice(0, TEXTO_MAX) : '';
  const midiaChave = typeof body.midiaChave === 'string' ? body.midiaChave : null;

  if (midiaChave && !CHAVE_VALIDA.test(midiaChave)) {
    return NextResponse.json(
      { ok: false, errors: { midia: 'Arquivo inválido.' } },
      { status: 400 },
    );
  }

  /*
   * UM POST PRECISA TER ALGUMA COISA DENTRO. Publicação vazia não é um caso de
   * uso — é um toque acidental no botão, e ela ocuparia um ponto no globo
   * dizendo nada.
   */
  if (kind === 'texto' && !texto) {
    return NextResponse.json(
      { ok: false, errors: { body: 'Escreva alguma coisa.' } },
      { status: 400 },
    );
  }
  if (kind !== 'texto' && !midiaChave) {
    return NextResponse.json(
      { ok: false, errors: { midia: 'Falta o arquivo.' } },
      { status: 400 },
    );
  }

  /*
   * SEM NICKNAME NÃO SE PUBLICA. O post aparece assinado, e um mural com posts
   * de "?" não dá a ninguém como responder nem como saber de quem é — a mesma
   * razão pela qual a caixa postal recusa mensagem de quem não tem nome público.
   */
  const autor = await findUserById(session.user.id);
  if (!autor?.nickname) {
    return NextResponse.json(
      { ok: false, reason: 'sem-nickname' },
      { status: 409 },
    );
  }

  /*
   * SEM LUGAR NO GLOBO NÃO SE PUBLICA — e aqui isso não é burocracia, é o
   * produto: um post deste mural É um ponto no globo. Sem coordenada não há
   * onde pô-lo.
   */
  if (!coordenadaValida(autor.lat, autor.lon)) {
    return NextResponse.json({ ok: false, reason: 'sem-lugar' }, { status: 409 });
  }

  const post = await publicar({
    autorId: autor.id,
    kind,
    body: texto || null,
    midiaChave,
    lat: autor.lat!,
    lon: autor.lon!,
    lugar:
      [autor.city, autor.country]
        .filter((v) => typeof v === "string" && v)
        .join(", ") || null,
    /*
     * AS CAMADAS VAO SEPARADAS, e nao so' o texto concatenado. E' por elas que
     * "seguir Brasil" funciona como igualdade indexada, em vez de casamento de
     * texto — que e' o erro que ja' mandou uma conta para a Siberia.
     */
    pais: autor.country,
    estado: autor.state,
    cidade: autor.city,
  });

  if (!post) return indisponivel();
  return NextResponse.json({ ok: true, post });
}

export async function DELETE(request: Request) {
  if (!getSecret() || !isAuthDbEnabled || !postsLigados) return indisponivel();

  const session = await getSession({ exigirBanco: true });
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) {
    return NextResponse.json({ ok: false, reason: 'sem-id' }, { status: 400 });
  }

  const apagou = await apagarMeuPost(session.user.id, id);
  // 404 e não 403 para post de outra pessoa: responder "existe, mas não é seu"
  // transformaria esta rota num jeito de descobrir de quem é cada post.
  if (!apagou) {
    return NextResponse.json({ ok: false, reason: 'nao-encontrado' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
