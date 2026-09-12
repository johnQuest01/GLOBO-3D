/**
 * O crachá do socket.
 *
 * POR QUE ISTO PRECISA EXISTIR. Até aqui, `presence:join` aceitava o
 * `clientId` e o `nickname` que o navegador dissesse, e o servidor acreditava.
 * Qualquer pessoa podia entrar anunciando o nickname de outra e aparecer na
 * lupa no lugar dela. Enquanto a conversa era só P2P, o estrago parava num
 * convite enganoso; com caixa postal, "eu sou o bruno" vira "me entregue as
 * mensagens do bruno". Então a identidade passa a vir daqui, e o que o cliente
 * afirma sobre si mesmo deixa de ser levado em conta.
 *
 * POR QUE NÃO O COOKIE DE SESSÃO. O cookie é do domínio do app (Vercel); o
 * servidor de realtime mora em outro (Railway). Cookie não atravessa isso, e
 * fazer atravessar exigiria afrouxar SameSite no cookie de sessão — o cookie
 * que dá acesso à conta inteira — para resolver um problema que um token
 * curto resolve sem tocar nele.
 *
 * O FORMATO é o mesmo `packSigned` que o projeto já usa nos cookies:
 * `base64url(payload).base64url(hmac)`. Não é JWT de propósito — não há
 * negociação de algoritmo, e portanto não existe o ataque clássico de trocar o
 * `alg` por `none`. Um algoritmo só, fixo no código.
 *
 * SEGREDO PRÓPRIO (`REALTIME_TOKEN_SECRET`), e não o `AUTH_SECRET`: são dois
 * serviços, e quem invade o de realtime não deve sair de lá capaz de forjar
 * cookie de sessão do app.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Vida curta de propósito: ele só precisa durar o aperto de mão do socket. */
export const TOKEN_TTL_SEC = 300;

export interface TokenPayload {
  /** users.id */
  uid: string;
  /** users.nickname, em minúsculas. Ausente em conta que ainda não escolheu um. */
  nick?: string;
  /** Epoch em segundos. */
  exp: number;
}

const b64url = (b: Buffer) => b.toString('base64url');

function assinar(dados: string, segredo: string): string {
  return b64url(createHmac('sha256', segredo).update(dados).digest());
}

export function mintRealtimeToken(
  payload: Omit<TokenPayload, 'exp'>,
  segredo: string,
  ttlSec = TOKEN_TTL_SEC,
): string {
  const corpo: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const dados = b64url(Buffer.from(JSON.stringify(corpo), 'utf8'));
  return `${dados}.${assinar(dados, segredo)}`;
}

/**
 * Devolve o conteúdo do token, ou null se ele não presta.
 *
 * Null para tudo — assinatura errada, formato errado, vencido — porque quem
 * chama não tem o que fazer de diferente em cada caso, e distinguir só daria
 * ao atacante um oráculo para descobrir onde ele errou.
 */
export function verifyRealtimeToken(
  token: string | undefined,
  segredo: string,
): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;

  const ponto = token.indexOf('.');
  if (ponto <= 0) return null;

  const dados = token.slice(0, ponto);
  const assinaturaRecebida = token.slice(ponto + 1);
  const assinaturaEsperada = assinar(dados, segredo);

  // Comparação em tempo constante: `===` sai no primeiro byte diferente, e
  // essa diferença de tempo é medível o bastante para revelar a assinatura
  // byte a byte.
  const a = Buffer.from(assinaturaRecebida);
  const b = Buffer.from(assinaturaEsperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const corpo = JSON.parse(Buffer.from(dados, 'base64url').toString('utf8'));
    if (!corpo || typeof corpo.uid !== 'string' || typeof corpo.exp !== 'number') {
      return null;
    }
    if (corpo.exp * 1000 < Date.now()) return null;
    return corpo as TokenPayload;
  } catch {
    return null;
  }
}
