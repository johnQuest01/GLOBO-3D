import { cookies } from 'next/headers';

import {
  ADMIN_COOKIE,
  ADMIN_TTL_SEC,
  CACHE_COOKIE,
  COOKIE_CACHE_TTL_SEC,
  cookieOptions,
  getSecret,
  newSessionToken,
  packSigned,
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  unpackSigned,
} from '@/lib/auth/cookies';
import {
  createSession,
  findSessionUser,
  revokeSession,
  type AuthUser,
} from '@/lib/db/auth';

/**
 * A sessão vista pelas rotas.
 *
 * `viaCache` diz de onde veio a resposta: do COOKIE_CACHE (sem tocar no banco)
 * ou do banco. Quem precisa de decisão sensível — banir, apagar conta, mudar
 * senha — deve exigir a confirmação no banco, porque o cache pode estar até
 * COOKIE_CACHE_TTL_SEC segundos atrasado em relação a um banimento.
 */
export interface SessionInfo {
  user: Pick<AuthUser, 'id' | 'email' | 'fullName'>;
  viaCache: boolean;
}

interface CachePayload extends Record<string, unknown> {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Quem está logado.
 *
 * Caminho rápido: o COOKIE_CACHE assinado responde sem consultar o Neon —
 * é o que evita uma consulta por carregamento de página.
 * Caminho lento: o token vai ao banco, que confere expiração, revogação,
 * corte de sessões e banimento numa consulta só.
 *
 * `exigirBanco: true` ignora o cache. Use em qualquer coisa que dependa do
 * estado ATUAL da conta.
 */
export async function getSession(
  { exigirBanco = false }: { exigirBanco?: boolean } = {},
): Promise<SessionInfo | null> {
  const secret = getSecret();
  if (!secret) return null;

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  if (!exigirBanco && COOKIE_CACHE_TTL_SEC > 0) {
    const cache = unpackSigned<CachePayload>(jar.get(CACHE_COOKIE)?.value, secret);
    if (cache) {
      return {
        user: { id: cache.id, email: cache.email, fullName: cache.name },
        viaCache: true,
      };
    }
  }

  const user = await findSessionUser(token);
  if (!user) return null;

  return {
    user: { id: user.id, email: user.email, fullName: user.fullName },
    viaCache: false,
  };
}

/**
 * Abre a sessão: grava no banco e escreve os dois cookies.
 *
 * O cookie de sessão dura 30 dias; o de cache, 60 segundos. É essa diferença
 * que dá desempenho no caminho comum e mantém o banimento com efeito rápido.
 */
export async function startSession(
  user: AuthUser,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<boolean> {
  const secret = getSecret();
  if (!secret) return false;

  const token = newSessionToken();
  await createSession(user.id, token, meta);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_SEC));
  writeCache(jar, user, secret);
  return true;
}

/** Refaz o cookie de cache a partir de dados frescos do banco. */
export async function refreshCache(user: AuthUser): Promise<void> {
  const secret = getSecret();
  if (!secret) return;
  writeCache(await cookies(), user, secret);
}

function writeCache(
  jar: Awaited<ReturnType<typeof cookies>>,
  user: AuthUser,
  secret: string,
): void {
  if (COOKIE_CACHE_TTL_SEC <= 0) return;
  const payload: CachePayload = {
    id: user.id,
    email: user.email,
    name: user.fullName,
  };
  jar.set(
    CACHE_COOKIE,
    packSigned(payload, COOKIE_CACHE_TTL_SEC, secret),
    cookieOptions(COOKIE_CACHE_TTL_SEC),
  );
}

/**
 * Fecha a sessão.
 *
 * Revoga no banco ANTES de apagar os cookies: se a ordem fosse inversa e a
 * requisição morresse no meio, o token continuaria valendo no servidor com o
 * usuário achando que saiu.
 */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);

  jar.set(SESSION_COOKIE, '', cookieOptions(0));
  jar.set(CACHE_COOKIE, '', cookieOptions(0));
}

// ---------------------------------------------------------------------------
// Administrador
// ---------------------------------------------------------------------------

/**
 * Sessão de admin, assinada.
 *
 * Antes, o `/api/admin/login` respondia `{ok:true}` e o navegador guardava a
 * decisão em sessionStorage — o próprio arquivo já dizia que era um portão de
 * interface, não uma barreira. Isso bastava para ligar e desligar animação;
 * não basta para banir gente. Agora o servidor emite um cookie assinado e
 * confere ele nas rotas de moderação.
 */
export async function startAdminSession(email: string): Promise<boolean> {
  const secret = getSecret();
  if (!secret) return false;
  const jar = await cookies();
  jar.set(
    ADMIN_COOKIE,
    packSigned({ admin: true, email }, ADMIN_TTL_SEC, secret),
    cookieOptions(ADMIN_TTL_SEC),
  );
  return true;
}

export async function isAdmin(): Promise<boolean> {
  const secret = getSecret();
  if (!secret) return false;
  const jar = await cookies();
  const dados = unpackSigned<{ admin: boolean }>(jar.get(ADMIN_COOKIE)?.value, secret);
  return dados?.admin === true;
}

export async function endAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, '', cookieOptions(0));
}
