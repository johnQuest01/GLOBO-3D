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
import { getSession, startSession } from '@/lib/auth/session';
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

/*
 * O MOTIVO VAI PARA O LOG DO SERVIDOR, e não só para a URL.
 *
 * Este caminho é um redirecionamento: quando ele falha, a pessoa vê uma frase
 * genérica e nós não vemos nada. Sem esta linha, descobrir por que alguém não
 * conseguiu entrar vira adivinhação — foi o `state`, foi o Google recusando o
 * código, foi o banco?
 *
 * Não registra e-mail nem código: o que importa é QUAL etapa falhou.
 */
const voltarAoLogin = (request: Request, motivo: string) => {
  console.error(`[google] entrada recusada: ${motivo}`);
  return NextResponse.redirect(new URL(`/login?google=${motivo}`, request.url));
};

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

  /*
   * O CÓDIGO DO GOOGLE VALE UMA VEZ SÓ — e esta rota pode ser chamada duas.
   *
   * Visto em produção: dois GETs neste endereço com meio segundo de diferença.
   * Acontece com pré-carregamento do navegador, com antivírus que abre o link
   * antes de você, e com um toque duplo no celular. A primeira chamada entra e
   * abre a sessão; a segunda encontra um código já gasto, o Google recusa, e a
   * pessoa — que JÁ ESTÁ LOGADA — é mandada para a tela de erro.
   *
   * Então, antes de dar erro, perguntamos se a sessão já existe. Se existe, o
   * login funcionou: seguir para o globo é a resposta certa.
   */
  if (!conta) {
    if (await getSession()) {
      return limpar(NextResponse.redirect(new URL('/', request.url)));
    }
    return limpar(voltarAoLogin(request, 'falhou'));
  }

  /*
   * O BANCO PODE ESTOURAR, e aqui isso não pode virar tela de erro.
   *
   * Sem este `try`, uma exceção do Postgres (coluna que falta, conexão que
   * caiu) sai como 500: a pessoa, no meio de entrar, recebe uma página de erro
   * do Next da qual não há nada a fazer. O log guarda a exceção de verdade e a
   * tela devolve para o login, que é onde ela pode tentar de novo.
   */
  let user;
  try {
    user = await acharOuCriarPeloGoogle({
      sub: conta.sub,
      email: conta.email,
      nome: conta.nome,
      foto: conta.foto,
    });
  } catch (e) {
    console.error('[google] banco recusou criar/achar a conta:', e);
    return limpar(voltarAoLogin(request, 'falhou'));
  }
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
