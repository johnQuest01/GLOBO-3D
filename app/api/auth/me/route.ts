import { NextResponse } from 'next/server';

import { COOKIE_CACHE_TTL_SEC, getSecret } from '@/lib/auth/cookies';
import { getSession } from '@/lib/auth/session';
import { isAuthDbEnabled } from '@/lib/db/auth';

/**
 * Quem está logado agora.
 *
 * `?fresh=1` força a checagem no banco, ignorando o COOKIE_CACHE. É o que a
 * interface usa quando precisa ter certeza — por exemplo, ao voltar do
 * segundo plano depois de muito tempo.
 *
 * `viaCache` na resposta não é enfeite: ele diz se aquele "sim, está logado"
 * veio do cache assinado (que pode estar até COOKIE_CACHE_TTL_SEC atrás de um
 * banimento) ou do banco.
 */

export const runtime = 'nodejs';

export async function GET(request: Request) {
  // 503 e 401 dizem coisas MUITO diferentes para o cliente: 401 e "voce nao
  // esta logado, saia da tela"; 503 e "eu nao consigo saber". Se os dois
  // respondessem igual, um deploy sem AUTH_SECRET deslogaria todo mundo.
  if (!getSecret() || !isAuthDbEnabled) {
    return NextResponse.json(
      { ok: false, reason: 'auth-nao-configurado' },
      { status: 503 },
    );
  }

  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  const session = await getSession({ exigirBanco: fresh });

  if (!session) {
    return NextResponse.json({ ok: false, user: null }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    user: session.user,
    viaCache: session.viaCache,
    cacheTtlSec: COOKIE_CACHE_TTL_SEC,
  });
}
