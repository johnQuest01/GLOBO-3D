import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import {
  GOOGLE_STATE_COOKIE,
  googleConfigurado,
  stateConfere,
  trocarCodigo,
  urlDeRetorno,
} from '@/lib/auth/google';
import { startSession } from '@/lib/auth/session';
import { acharOuCriarPeloGoogle, isAuthDbEnabled, markLogin } from '@/lib/db/auth';

/**
 * A volta do Google.
 *
 * TUDO QUE DÁ ERRADO AQUI VOLTA PARA O LOGIN com um motivo na URL, e nunca
 * para uma página de erro: a pessoa está no meio de entrar, e a única coisa
 * útil a fazer com ela é devolvê-la ao lugar onde ela pode tentar de novo.
 *
 * O COOKIE DO `state` É APAGADO EM TODOS OS CAMINHOS — inclusive nos de erro.
 * Ele vale para uma viagem só; deixá-lo para trás daria uma segunda chance a
 * um código que já foi usado.
 */

export const runtime = 'nodejs';

const voltarAoLogin = (request: Request, motivo: string) =>
  NextResponse.redirect(new URL(`/login?google=${motivo}`, request.url));

export async function GET(request: Request) {
  const segredo = getSecret();
  if (!segredo || !isAuthDbEnabled || !googleConfigurado()) {
    return voltarAoLogin(request, 'indisponivel');
  }

  const url = new URL(request.url);
  const jar = await cookies();
  const doCookie = jar.get(GOOGLE_STATE_COOKIE)?.value;

  const limpar = (resposta: NextResponse) => {
    resposta.cookies.delete(GOOGLE_STATE_COOKIE);
    return resposta;
  };

  // A pessoa clicou em "cancelar" na tela do Google. Não é erro, é desistência.
  if (url.searchParams.get('error')) {
    return limpar(voltarAoLogin(request, 'cancelado'));
  }

  if (!stateConfere(url.searchParams.get('state'), doCookie, segredo)) {
    return limpar(voltarAoLogin(request, 'expirado'));
  }

  const codigo = url.searchParams.get('code');
  if (!codigo) return limpar(voltarAoLogin(request, 'falhou'));

  const conta = await trocarCodigo(codigo, urlDeRetorno(request));
  if (!conta) return limpar(voltarAoLogin(request, 'falhou'));

  const user = await acharOuCriarPeloGoogle({
    sub: conta.sub,
    email: conta.email,
    nome: conta.nome,
    foto: conta.foto,
  });
  if (!user) return limpar(voltarAoLogin(request, 'falhou'));

  // Banimento vale para qualquer porta de entrada. Entrar pelo Google não pode
  // ser a forma de contornar uma suspensão.
  if (user.bannedAt) return limpar(voltarAoLogin(request, 'banida'));

  const abriu = await startSession(user, {
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for'),
  });
  if (!abriu) return limpar(voltarAoLogin(request, 'falhou'));

  await markLogin(user.id);

  /*
   * VAI DIRETO PARA O GLOBO, sem passar por formulário nenhum.
   *
   * A conta pode não ter nickname, e isso é esperado: ele é pedido depois, na
   * primeira vez que a pessoa for procurar alguém ou abrir as conversas — que
   * é onde o nome público começa a fazer falta. Pedir aqui transformaria
   * "entrar com o Google" num cadastro, que é o que o botão existe para evitar.
   */
  return limpar(NextResponse.redirect(new URL('/', request.url)));
}
