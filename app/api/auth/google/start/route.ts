import { NextResponse } from 'next/server';

import { cookieOptions, getSecret } from '@/lib/auth/cookies';
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_TTL_SEC,
  googleConfigurado,
  novoState,
  urlDeAutorizacao,
  urlDeRetorno,
} from '@/lib/auth/google';
import { isAuthDbEnabled } from '@/lib/db/auth';

/**
 * A ida: manda a pessoa para o Google.
 *
 * É um REDIRECIONAMENTO, e não um fetch, porque quem precisa ver a tela do
 * Google é a pessoa — e o cookie de sessão do Google mora no navegador dela.
 *
 * O `state` vai no cookie antes de a viagem começar. É ele que, na volta,
 * prova que aquele login foi pedido por ESTE navegador, e não por alguém que
 * mandou um link pronto.
 */

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const segredo = getSecret();

  if (!segredo || !isAuthDbEnabled || !googleConfigurado()) {
    // Volta para o login com um motivo na URL: uma tela de erro em branco aqui
    // seria um beco sem saída no meio de um fluxo que a pessoa nem começou.
    return NextResponse.redirect(new URL('/login?google=indisponivel', request.url));
  }

  const { state, assinado } = novoState(segredo);
  const destino = urlDeAutorizacao(urlDeRetorno(request), state);

  const resposta = NextResponse.redirect(destino);
  resposta.cookies.set(GOOGLE_STATE_COOKIE, assinado, cookieOptions(GOOGLE_STATE_TTL_SEC));
  return resposta;
}
