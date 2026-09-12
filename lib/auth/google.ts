/**
 * Entrar com o Google.
 *
 * O FLUXO É O DE CÓDIGO DE AUTORIZAÇÃO, e não o do botão que devolve um
 * `id_token` direto no navegador. A diferença que importa: aqui o token é
 * buscado pelo SERVIDOR, numa conexão direta com o Google, autenticada com um
 * segredo que o navegador nunca vê. O que chega pelo navegador é só um código
 * de uso único que não vale nada sozinho.
 *
 * POR ISSO A ASSINATURA DO id_token NÃO É VERIFICADA AQUI, e isso não é
 * desleixo: o token não veio do usuário, veio de uma resposta HTTPS do
 * endpoint do próprio Google, pedida por nós. Verificar a assinatura protege
 * contra um token forjado que chegou por um caminho não confiável — que não é
 * este caso. (Se algum dia o `id_token` passar a chegar pelo navegador, a
 * verificação por JWKS vira obrigatória.)
 *
 * O `state` É OBRIGATÓRIO e é a defesa contra CSRF de login: sem ele, alguém
 * consegue fazer o seu navegador completar o login DELE, e você passa a usar o
 * site logado numa conta alheia sem perceber. Ele é gerado aqui, guardado num
 * cookie curto e conferido na volta.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** O cookie que carrega o `state` entre a ida e a volta. Vida curta. */
export const GOOGLE_STATE_COOKIE = 'globo_oauth';
export const GOOGLE_STATE_TTL_SEC = 600;

const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const TROCAR = 'https://oauth2.googleapis.com/token';

export function googleConfigurado(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

/**
 * Para onde o Google devolve a pessoa.
 *
 * Montado a partir da requisição, e não de uma variável de ambiente, para o
 * mesmo código funcionar em localhost e em produção sem configuração dupla. O
 * Google exige que esta URL esteja na lista do console — é lá que ela é
 * autorizada, e é por isso que uma barra a mais quebra tudo.
 */
export function urlDeRetorno(request: Request): string {
  const url = new URL(request.url);
  // Atrás da Vercel, o protocolo real vem no cabeçalho: internamente a
  // requisição chega como http, e devolver http aqui faria o Google recusar.
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') ?? url.host;
  return `${proto}://${host}/api/auth/google/callback`;
}

/** Gera o `state` e a sua forma assinada, que é o que vai no cookie. */
export function novoState(segredo: string): { state: string; assinado: string } {
  const state = randomBytes(16).toString('base64url');
  return { state, assinado: `${state}.${assinar(state, segredo)}` };
}

/** Confere o `state` da volta contra o que está no cookie. */
export function stateConfere(
  daUrl: string | null,
  doCookie: string | undefined,
  segredo: string,
): boolean {
  if (!daUrl || !doCookie) return false;

  const ponto = doCookie.indexOf('.');
  if (ponto <= 0) return false;

  const guardado = doCookie.slice(0, ponto);
  const assinatura = doCookie.slice(ponto + 1);

  const a = Buffer.from(assinatura);
  const b = Buffer.from(assinar(guardado, segredo));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const x = Buffer.from(daUrl);
  const y = Buffer.from(guardado);
  return x.length === y.length && timingSafeEqual(x, y);
}

function assinar(dados: string, segredo: string): string {
  return createHmac('sha256', segredo).update(dados).digest('base64url');
}

export function urlDeAutorizacao(retorno: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: retorno,
    response_type: 'code',
    // Só o necessário para saber quem é. Pedir mais faria o Google exigir
    // verificação do app e a tela mostraria aviso de "app não verificado".
    scope: 'openid email profile',
    state,
    // Sem isto, quem já está logado numa conta Google entra direto nela e não
    // consegue escolher outra — o que, num aparelho compartilhado, é ruim.
    prompt: 'select_account',
  });
  return `${AUTORIZAR}?${p.toString()}`;
}

export interface ContaDoGoogle {
  sub: string;
  email: string;
  emailVerificado: boolean;
  nome: string | null;
  foto: string | null;
}

/**
 * Troca o código pela identidade. Devolve null se o Google recusar.
 *
 * Null para qualquer falha de propósito: quem chama não tem o que fazer de
 * diferente entre "código expirado" e "código já usado", e as duas viram a
 * mesma tela de "não deu, tente de novo".
 */
export async function trocarCodigo(
  codigo: string,
  retorno: string,
): Promise<ContaDoGoogle | null> {
  let resposta: Response;
  try {
    resposta = await fetch(TROCAR, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: codigo,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: retorno,
        grant_type: 'authorization_code',
      }),
    });
  } catch (e) {
    console.error('[google] nao consegui falar com o endpoint de token:', e);
    return null;
  }

  if (!resposta.ok) {
    /*
     * O CORPO DO ERRO DO GOOGLE VAI PARA O LOG, e é a única coisa que
     * diferencia as causas reais daqui: `invalid_grant` é código já usado ou
     * expirado, `redirect_uri_mismatch` é o endereço não bater com o do
     * console, `invalid_client` é segredo errado. Sem isso, as três viram a
     * mesma frase inútil na tela e nenhuma pista no servidor.
     *
     * O corpo do erro não contém segredo: ele diz o que o Google recusou, não
     * o que foi enviado.
     */
    const detalhe = await resposta.text().catch(() => '');
    console.error(`[google] token recusado (${resposta.status}): ${detalhe.slice(0, 300)}`);
    return null;
  }

  const dados = (await resposta.json().catch(() => null)) as {
    id_token?: string;
  } | null;
  if (!dados?.id_token) {
    console.error('[google] resposta sem id_token');
    return null;
  }

  const corpo = lerIdToken(dados.id_token);
  if (!corpo?.sub || !corpo.email) {
    console.error('[google] id_token sem sub ou sem email');
    return null;
  }

  /*
   * E-MAIL NÃO VERIFICADO NÃO ENTRA.
   *
   * O Google permite contas com e-mail não confirmado, e aceitá-las abriria um
   * caminho para alguém entrar aqui com um endereço que não é seu — e, pelo
   * casamento por e-mail que a criação de conta faz, encostar numa conta
   * alheia.
   */
  if (corpo.email_verified === false) {
    console.error('[google] e-mail nao verificado na conta do Google');
    return null;
  }

  return {
    sub: String(corpo.sub),
    email: String(corpo.email).trim().toLowerCase(),
    emailVerificado: true,
    nome: corpo.name ? String(corpo.name) : null,
    foto: corpo.picture ? String(corpo.picture) : null,
  };
}

interface CorpoDoIdToken {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/** Lê o miolo do JWT. Ver o comentário do topo sobre a assinatura. */
function lerIdToken(token: string): CorpoDoIdToken | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(partes[1]!, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
