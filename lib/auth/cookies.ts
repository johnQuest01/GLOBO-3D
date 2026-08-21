import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

/**
 * Cookies de sessão — e o COOKIE_CACHE.
 *
 * São DOIS cookies, com papéis diferentes:
 *
 * 1. `globo_session` — o token de sessão. É a verdade. O banco guarda só o
 *    SHA-256 dele, então nem um vazamento da tabela entrega sessão a ninguém.
 *
 * 2. `globo_cache` — o COOKIE_CACHE. Uma cópia assinada e CURTA dos dados que
 *    a interface precisa a cada requisição (id, nome, e-mail). Existe para não
 *    bater no Neon a cada carregamento de página.
 *
 * O PREÇO DO CACHE, dito com todas as letras: enquanto ele vale, o servidor
 * confia nele sem consultar o banco. Então banir alguém não corta o acesso no
 * mesmo milissegundo — corta em, no máximo, `COOKIE_CACHE_TTL_SEC` (60s por
 * padrão). É por isso que o TTL é curto e configurável: quem precisar de corte
 * imediato baixa para 0 e paga uma consulta por requisição. Não existe as duas
 * coisas ao mesmo tempo, e fingir que existe seria o bug.
 *
 * Os dois cookies são HttpOnly: JavaScript da página não os lê, então um XSS
 * não rouba a sessão.
 */

export const SESSION_COOKIE = 'globo_session';
export const CACHE_COOKIE = 'globo_cache';
export const ADMIN_COOKIE = 'globo_admin';

/** Quanto tempo a sessão dura sem novo login. */
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30 dias

/** Janela em que um banimento ainda pode não ter surtido efeito. */
export const COOKIE_CACHE_TTL_SEC = Number(
  process.env.COOKIE_CACHE_TTL_SEC ?? 60,
);

/** A sessão de administrador é curta de propósito: é poder, não conforto. */
export const ADMIN_TTL_SEC = 60 * 60 * 8;

/**
 * Segredo de assinatura. Sem ele, nada de sessão — e o erro é explícito.
 *
 * Um valor padrão "para funcionar em dev" seria a pior escolha possível: iria
 * para produção sem ninguém perceber, e qualquer pessoa que lesse o código
 * conseguiria forjar o cookie de outra.
 */
export function getSecret(): string | null {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s || s.length < 32) return null;
  return s;
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** O que vai para o banco. O token cru só existe no cookie do navegador. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// Payload assinado (cookie cache e cookie de admin)
// ---------------------------------------------------------------------------

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Empacota `{...dados, exp}` como `payloadBase64.assinatura`.
 *
 * A validade vai DENTRO da parte assinada, e não só no Max-Age do cookie: o
 * navegador é do outro lado, e apagar o Max-Age é trivial. O que o servidor
 * confere é o `exp` assinado.
 */
export function packSigned(
  payload: Record<string, unknown>,
  ttlSec: number,
  secret: string,
): string {
  const corpo = JSON.stringify({ ...payload, exp: Date.now() + ttlSec * 1000 });
  const b64 = Buffer.from(corpo, 'utf8').toString('base64url');
  return `${b64}.${sign(b64, secret)}`;
}

export function unpackSigned<T extends Record<string, unknown>>(
  valor: string | undefined,
  secret: string,
): (T & { exp: number }) | null {
  if (!valor) return null;
  const corte = valor.lastIndexOf('.');
  if (corte <= 0) return null;

  const b64 = valor.slice(0, corte);
  const assinatura = valor.slice(corte + 1);
  const esperada = sign(b64, secret);

  // Tempo constante: comparar assinatura com `!==` deixa o tempo de resposta
  // contar quantos caracteres o atacante acertou.
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const dados = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (typeof dados?.exp !== 'number' || dados.exp < Date.now()) return null;
    return dados as T & { exp: number };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Opções do cookie
// ---------------------------------------------------------------------------

const emProducao = process.env.NODE_ENV === 'production';

export function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    // `secure` em produção; em localhost o navegador recusaria o cookie.
    secure: emProducao,
    // 'lax' deixa o cookie viajar na navegação normal e barra o envio em
    // requisição de outro site — o essencial contra CSRF, sem quebrar links.
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  };
}
