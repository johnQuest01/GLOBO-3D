import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import { getSession } from '@/lib/auth/session';
import { isAuthDbEnabled, searchByNickname } from '@/lib/db/auth';

/**
 * A lupa: quem existe com este começo de nickname.
 *
 * ESTA ROTA É O CADASTRO, NÃO A PRESENÇA. Ela responde "esta pessoa tem conta
 * e mora ali", inclusive para quem está offline. Quem está online AGORA, e com
 * qual coordenada, quem responde é o servidor de realtime (`directory:find`) —
 * o Neon não sabe disso e não deve saber: presença mudando de estado a cada
 * 15s não é dado de banco relacional.
 *
 * O QUE NUNCA SAI DAQUI: e-mail, nome completo, id. Uma busca que devolvesse
 * e-mail viraria, em uma tarde, uma lista de e-mails do site inteiro.
 *
 * PRECISA DE SESSÃO. Não é burocracia: sem login, esta rota é um jeito de
 * baixar a lista de usuários do projeto com um laço de `for` sobre o alfabeto.
 * Com login, o abuso tem dono — e o dono pode ser banido.
 */

export const runtime = 'nodejs';

/** Dois caracteres, no mínimo. Com um, "a" devolveria um pedaço da base. */
const MIN_TERMO = 2;
const MAX_RESULTADOS = 8;

/**
 * Limite de taxa por sessão, em memória.
 *
 * Memória é honestamente fraco aqui — cada instância serverless tem a sua, e o
 * teto real acaba sendo `instâncias × JANELA`. Vale mesmo assim: segura o
 * script ingênuo, que é o caso comum, e custa zero. O limite que não dá para
 * furar é o do login (aquele está no banco, ver login_attempts) e o do
 * servidor de realtime, que é um processo só.
 */
const JANELA_MS = 60_000;
const MAX_POR_JANELA = 40;
const baldes = new Map<string, { n: number; ate: number }>();

function permitir(chave: string): boolean {
  const agora = Date.now();
  const balde = baldes.get(chave);

  if (!balde || balde.ate < agora) {
    baldes.set(chave, { n: 1, ate: agora + JANELA_MS });
    // Faxina preguiçosa: sem ela o mapa cresce para sempre com sessões mortas.
    if (baldes.size > 5_000) {
      for (const [k, v] of baldes) if (v.ate < agora) baldes.delete(k);
    }
    return true;
  }

  balde.n += 1;
  return balde.n <= MAX_POR_JANELA;
}

export async function GET(request: Request) {
  if (!getSecret() || !isAuthDbEnabled) {
    return NextResponse.json(
      { ok: false, reason: 'auth-nao-configurado' },
      { status: 503 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  if (!permitir(session.user.id)) {
    return NextResponse.json(
      { ok: false, reason: 'muitas-buscas' },
      { status: 429, headers: { 'retry-after': '60' } },
    );
  }

  const termo = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (termo.length < MIN_TERMO) {
    // 200 com lista vazia, e não 400: digitar uma letra não é erro, é o
    // caminho normal de quem está no meio da palavra.
    return NextResponse.json({ ok: true, resultados: [] });
  }

  const achados = await searchByNickname(termo, MAX_RESULTADOS);

  // A própria pessoa não aparece na busca dela. Ver o próprio nickname na
  // lista com um botão "Conectar" ao lado é só confusão.
  const resultados = achados.filter(
    (p) => p.nickname.toLowerCase() !== (session.user.nickname ?? '').toLowerCase(),
  );

  return NextResponse.json({ ok: true, resultados });
}
