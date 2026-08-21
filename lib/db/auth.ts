import { neon } from '@neondatabase/serverless';

import { hashToken, SESSION_TTL_SEC } from '@/lib/auth/cookies';

/**
 * Acesso ao banco para conta e sessão.
 *
 * Mesmo padrão do lib/db/behavior.ts: sem DATABASE_URL, o módulo não quebra —
 * ele desliga. É o que permite rodar o globo sem banco nenhum.
 */

const DATABASE_URL = process.env.DATABASE_URL;
export const isAuthDbEnabled = Boolean(DATABASE_URL);
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  client_id: string | null;
  banned_at: string | null;
  banned_reason: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  bannedAt: string | null;
  bannedReason: string | null;
}

function toUser(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: (row.full_name as string) ?? null,
    country: (row.country as string) ?? null,
    state: (row.state as string) ?? null,
    city: (row.city as string) ?? null,
    bannedAt: (row.banned_at as string) ?? null,
    bannedReason: (row.banned_reason as string) ?? null,
  };
}

/** E-mail é sempre normalizado antes de tocar o banco: "A@X.com" e "a@x.com " são a mesma conta. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Conta
// ---------------------------------------------------------------------------

export interface NewUser {
  email: string;
  passwordHash: string;
  fullName?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  clientId?: string | null;
}

/**
 * Cria a conta. Devolve null se o e-mail já existe.
 *
 * A checagem é do BANCO (`on conflict do nothing` sobre o índice único), e não
 * um "select antes de inserir": dois cadastros simultâneos com o mesmo e-mail
 * passariam pelo select ao mesmo tempo e criariam duas contas.
 */
export async function createUser(input: NewUser): Promise<AuthUser | null> {
  if (!sql) return null;
  const rows = (await sql`
    insert into users (email, password_hash, full_name, country, state, city, client_id)
    values (
      ${normalizeEmail(input.email)}, ${input.passwordHash}, ${input.fullName ?? null},
      ${input.country ?? null}, ${input.state ?? null}, ${input.city ?? null},
      ${input.clientId ?? null}
    )
    on conflict (email) do nothing
    returning id, email, full_name, country, state, city, banned_at, banned_reason
  `) as Record<string, unknown>[];

  return rows.length > 0 ? toUser(rows[0]!) : null;
}

export async function findUserByEmail(
  email: string,
): Promise<(AuthUser & { passwordHash: string }) | null> {
  if (!sql) return null;
  const rows = (await sql`
    select id, email, password_hash, full_name, country, state, city,
           banned_at, banned_reason
    from users
    where email = ${normalizeEmail(email)}
    limit 1
  `) as Record<string, unknown>[];

  if (rows.length === 0) return null;
  return { ...toUser(rows[0]!), passwordHash: String(rows[0]!.password_hash) };
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  if (!sql) return null;
  const rows = (await sql`
    select id, email, full_name, country, state, city, banned_at, banned_reason
    from users where id = ${id}::uuid limit 1
  `) as Record<string, unknown>[];
  return rows.length > 0 ? toUser(rows[0]!) : null;
}

export async function markLogin(userId: string): Promise<void> {
  if (!sql) return;
  await sql`update users set last_login_at = now() where id = ${userId}::uuid`;
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

export async function createSession(
  userId: string,
  token: string,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<void> {
  if (!sql) return;
  await sql`
    insert into sessions (token_hash, user_id, expires_at, user_agent, ip)
    values (
      ${hashToken(token)}, ${userId}::uuid,
      now() + ${SESSION_TTL_SEC} * interval '1 second',
      ${meta.userAgent ?? null}, ${meta.ip ?? null}
    )
  `;
}

/**
 * Resolve o token para o usuário, ou null.
 *
 * Uma consulta só, com todas as razões de recusa juntas: sessão inexistente,
 * expirada, revogada, anterior ao corte de sessões do usuário, ou usuário
 * banido. Fazer isso em etapas separadas abriria janela entre a checagem e o
 * uso.
 */
export async function findSessionUser(token: string): Promise<AuthUser | null> {
  if (!sql) return null;
  const rows = (await sql`
    select u.id, u.email, u.full_name, u.country, u.state, u.city,
           u.banned_at, u.banned_reason
    from sessions s
    join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)}
      and s.revoked_at is null
      and s.expires_at > now()
      and s.created_at >= u.sessions_valid_from
      and u.banned_at is null
    limit 1
  `) as Record<string, unknown>[];

  return rows.length > 0 ? toUser(rows[0]!) : null;
}

export async function revokeSession(token: string): Promise<void> {
  if (!sql) return;
  await sql`
    update sessions set revoked_at = now()
    where token_hash = ${hashToken(token)} and revoked_at is null
  `;
}

// ---------------------------------------------------------------------------
// Limite de tentativas
// ---------------------------------------------------------------------------

/** Janela e tetos. Curtos o bastante para não punir quem só errou a senha. */
export const RATE_WINDOW_MIN = 15;
/** Por conta: protege UMA pessoa de ter a senha adivinhada. */
export const RATE_MAX_PER_EMAIL = 8;
/** Por origem: protege TODAS as contas de alguém varrendo a lista. */
export const RATE_MAX_PER_IP = 30;

export async function recordLoginAttempt(
  email: string,
  ip: string | null,
  ok: boolean,
): Promise<void> {
  if (!sql) return;
  await sql`
    insert into login_attempts (email, ip, ok)
    values (${normalizeEmail(email)}, ${ip}, ${ok})
  `;
}

/**
 * Quantas falhas recentes existem para esta conta e para esta origem.
 *
 * Só falhas contam: quem entra certo não gasta o próprio limite. E a contagem
 * é feita numa consulta só, com dois `count` filtrados — duas idas ao banco
 * dariam ao atacante uma janela entre elas.
 */
export async function recentLoginFailures(
  email: string,
  ip: string | null,
): Promise<{ porEmail: number; porIp: number }> {
  if (!sql) return { porEmail: 0, porIp: 0 };
  const rows = (await sql`
    select
      count(*) filter (where email = ${normalizeEmail(email)})::int as por_email,
      count(*) filter (where ip = ${ip} and ${ip}::text is not null)::int as por_ip
    from login_attempts
    where ok = false
      and created_at > now() - ${RATE_WINDOW_MIN} * interval '1 minute'
  `) as Record<string, unknown>[];

  return {
    porEmail: Number(rows[0]?.por_email ?? 0),
    porIp: Number(rows[0]?.por_ip ?? 0),
  };
}

/** Entrou: o histórico de falhas daquela conta deixa de pesar. */
export async function clearLoginFailures(email: string): Promise<void> {
  if (!sql) return;
  await sql`
    delete from login_attempts
    where email = ${normalizeEmail(email)} and ok = false
  `;
}

// ---------------------------------------------------------------------------
// Política de uso
// ---------------------------------------------------------------------------

/**
 * Bane e derruba tudo de uma vez.
 *
 * O `sessions_valid_from = now()` é o corte: qualquer sessão criada antes
 * deste instante deixa de valer, inclusive as que ainda não expiraram e as de
 * outros aparelhos. Revogar as linhas também é redundante de propósito — se um
 * dia o corte for alterado por engano, as sessões continuam revogadas.
 *
 * Lembrete honesto: o COOKIE_CACHE ainda pode sustentar a navegação por até
 * COOKIE_CACHE_TTL_SEC segundos. Ver lib/auth/cookies.ts.
 */
export async function banUser(
  email: string,
  reason: string,
): Promise<AuthUser | null> {
  if (!sql) return null;
  const rows = (await sql`
    update users
    set banned_at = now(), banned_reason = ${reason}, sessions_valid_from = now()
    where email = ${normalizeEmail(email)}
    returning id, email, full_name, country, state, city, banned_at, banned_reason
  `) as Record<string, unknown>[];

  if (rows.length === 0) return null;

  await sql`
    update sessions set revoked_at = now()
    where user_id = ${String(rows[0]!.id)}::uuid and revoked_at is null
  `;

  return toUser(rows[0]!);
}

export async function unbanUser(email: string): Promise<AuthUser | null> {
  if (!sql) return null;
  const rows = (await sql`
    update users set banned_at = null, banned_reason = null
    where email = ${normalizeEmail(email)}
    returning id, email, full_name, country, state, city, banned_at, banned_reason
  `) as Record<string, unknown>[];
  return rows.length > 0 ? toUser(rows[0]!) : null;
}

export async function recordReport(input: {
  targetEmail?: string | null;
  targetClientId?: string | null;
  reporterClientId?: string | null;
  reason: string;
}): Promise<void> {
  if (!sql) return;
  // O alvo pode ser uma conta (por e-mail) ou só um anônimo (client_id) — no
  // globo, a maioria das pessoas ainda não tem conta. A subconsulta resolve o
  // e-mail para o id quando existe, e deixa nulo quando não existe, sem exigir
  // uma segunda ida ao banco.
  const alvoEmail = input.targetEmail ? normalizeEmail(input.targetEmail) : null;
  await sql`
    insert into policy_reports (target_user_id, target_client_id, reporter_client_id, reason)
    values (
      (select id from users where email = ${alvoEmail}),
      ${input.targetClientId ?? null},
      ${input.reporterClientId ?? null},
      ${input.reason}
    )
  `;
}
