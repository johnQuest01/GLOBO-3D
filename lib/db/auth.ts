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
  nickname: string | null;
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
  /**
   * Nulo nas contas criadas antes da busca por nickname existir. Elas escolhem
   * um na primeira vez que abrirem a busca — exigir aqui deslogaria todas.
   */
  nickname: string | null;
  fullName: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  bannedAt: string | null;
  bannedReason: string | null;
}

/** O que é seguro devolver sobre OUTRA pessoa. Note o que não está aqui: e-mail. */
export interface PublicUser {
  nickname: string;
  country: string | null;
  state: string | null;
  city: string | null;
}

function toUser(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    email: String(row.email),
    nickname: (row.nickname as string) ?? null,
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
  nickname?: string | null;
  fullName?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  clientId?: string | null;
}

/**
 * Cria a conta. Devolve null se o e-mail OU o nickname já existem.
 *
 * A checagem é do BANCO (`on conflict do nothing` sobre os índices únicos), e
 * não um "select antes de inserir": dois cadastros simultâneos com o mesmo
 * e-mail passariam pelo select ao mesmo tempo e criariam duas contas.
 *
 * `on conflict do nothing` SEM especificar a coluna, de propósito: agora são
 * dois índices únicos (email e lower(nickname)), e nomear só um faria o outro
 * estourar exceção em vez de devolver null.
 *
 * Quem chama descobre QUAL dos dois bateu com `emailExists` / `isNicknameTaken`
 * — duas consultas a mais só no caminho do erro, que é raro.
 */
export async function createUser(input: NewUser): Promise<AuthUser | null> {
  if (!sql) return null;
  const rows = (await sql`
    insert into users (email, password_hash, nickname, full_name, country, state, city, client_id)
    values (
      ${normalizeEmail(input.email)}, ${input.passwordHash}, ${input.nickname ?? null},
      ${input.fullName ?? null},
      ${input.country ?? null}, ${input.state ?? null}, ${input.city ?? null},
      ${input.clientId ?? null}
    )
    on conflict do nothing
    returning id, email, nickname, full_name, country, state, city, banned_at, banned_reason
  `) as Record<string, unknown>[];

  return rows.length > 0 ? toUser(rows[0]!) : null;
}

// ---------------------------------------------------------------------------
// Nickname
// ---------------------------------------------------------------------------

/** Já existe alguém com este nickname? A comparação é a mesma do índice único. */
export async function isNicknameTaken(nickname: string): Promise<boolean> {
  if (!sql) return false;
  const rows = (await sql`
    select 1 from users where lower(nickname) = ${nickname.trim().toLowerCase()} limit 1
  `) as unknown[];
  return rows.length > 0;
}

/** Só para separar "e-mail em uso" de "nickname em uso" na resposta do cadastro. */
export async function emailExists(email: string): Promise<boolean> {
  if (!sql) return false;
  const rows = (await sql`
    select 1 from users where email = ${normalizeEmail(email)} limit 1
  `) as unknown[];
  return rows.length > 0;
}

/**
 * Busca por prefixo de nickname, para a lupa do globo.
 *
 * PREFIXO, e não `%termo%`: busca por pedaço no meio varreria a tabela toda e
 * transformaria a caixa de busca num jeito de listar todo mundo digitando "a".
 * Quem procura alguém sabe como o nickname começa.
 *
 * Banido não aparece — continuar visível na busca seria continuar alcançável.
 */
export async function searchByNickname(
  prefixo: string,
  limite = 8,
): Promise<PublicUser[]> {
  if (!sql) return [];
  const termo = prefixo.trim().toLowerCase();
  if (termo.length < 2) return [];

  // `like` com o termo já escapado: `_` e `%` digitados por quem busca são
  // caracteres literais, não curingas. Sem isto, "_" sozinho casaria com tudo.
  const padrao = termo.replace(/[\\%_]/g, '\\$&') + '%';

  const rows = (await sql`
    select nickname, country, state, city
    from users
    where lower(nickname) like ${padrao}
      and banned_at is null
    order by length(nickname), nickname
    limit ${Math.min(limite, 20)}
  `) as Record<string, unknown>[];

  return rows.map((r) => ({
    nickname: String(r.nickname),
    country: (r.country as string) ?? null,
    state: (r.state as string) ?? null,
    city: (r.city as string) ?? null,
  }));
}

/** Escolha do nickname depois do cadastro (contas antigas). Null se já for de outro. */
export async function setNickname(
  userId: string,
  nickname: string,
): Promise<AuthUser | null> {
  if (!sql) return null;
  const rows = (await sql`
    update users set nickname = ${nickname.trim().toLowerCase()}
    where id = ${userId}::uuid
      and not exists (
        select 1 from users outro
        where lower(outro.nickname) = ${nickname.trim().toLowerCase()}
          and outro.id <> ${userId}::uuid
      )
    returning id, email, nickname, full_name, country, state, city, banned_at, banned_reason
  `) as Record<string, unknown>[];
  return rows.length > 0 ? toUser(rows[0]!) : null;
}

/**
 * `passwordHash` é NULO nas contas do Google, e quem chama precisa tratar isso.
 *
 * Antes ele era sempre string, e uma conta sem senha viraria a string "null"
 * — que passaria pelo verificador de senha como um hash mal formado e daria
 * "e-mail ou senha incorretos". Funcionaria, e mentiria: a pessoa ficaria
 * tentando lembrar uma senha que ela nunca criou.
 */
export async function findUserByEmail(
  email: string,
): Promise<(AuthUser & { passwordHash: string | null }) | null> {
  if (!sql) return null;
  const rows = (await sql`
    select id, email, nickname, password_hash, full_name, country, state, city,
           banned_at, banned_reason
    from users
    where email = ${normalizeEmail(email)}
    limit 1
  `) as Record<string, unknown>[];

  if (rows.length === 0) return null;
  const hash = rows[0]!.password_hash;
  return {
    ...toUser(rows[0]!),
    passwordHash: typeof hash === 'string' && hash ? hash : null,
  };
}

/**
 * Acha (ou cria) a conta de quem entrou pelo Google.
 *
 * A ORDEM DAS TRÊS TENTATIVAS NÃO É ARBITRÁRIA.
 *
 * 1. Pelo `google_sub`: é o identificador estável. Quem já entrou antes cai
 *    aqui, mesmo que tenha trocado de e-mail no Google desde então.
 *
 * 2. Pelo e-mail, LIGANDO as duas contas: é o caso de quem já tinha conta com
 *    senha aqui e agora clicou no botão do Google. Sem este passo, a pessoa
 *    ganharia uma segunda conta e perderia as conversas da primeira. Só é
 *    seguro porque o Google confirmou que aquele e-mail é dela — um e-mail não
 *    verificado nunca chega até aqui (ver lib/auth/google.ts).
 *
 * 3. Criar. Sem senha e SEM NICKNAME: o nome público é pedido depois, na
 *    primeira vez que a pessoa for procurar alguém. Exigir na porta de entrada
 *    transformaria "entrar com o Google" num formulário, que é exatamente o
 *    que o botão existe para evitar.
 */
export async function acharOuCriarPeloGoogle(conta: {
  sub: string;
  email: string;
  nome: string | null;
  foto: string | null;
  clientId?: string | null;
}): Promise<AuthUser | null> {
  if (!sql) return null;

  const porSub = (await sql`
    select id, email, nickname, full_name, country, state, city, banned_at, banned_reason
    from users where google_sub = ${conta.sub} limit 1
  `) as Record<string, unknown>[];
  if (porSub.length > 0) return toUser(porSub[0]!);

  const email = normalizeEmail(conta.email);

  // `where google_sub is null` impede que duas contas do Google diferentes
  // disputem o mesmo e-mail — o segundo não rouba o vínculo do primeiro.
  const ligadas = (await sql`
    update users
       set google_sub = ${conta.sub},
           avatar_url = coalesce(avatar_url, ${conta.foto}),
           full_name  = coalesce(full_name, ${conta.nome})
     where email = ${email} and google_sub is null
    returning id, email, nickname, full_name, country, state, city, banned_at, banned_reason
  `) as Record<string, unknown>[];
  if (ligadas.length > 0) return toUser(ligadas[0]!);

  const criadas = (await sql`
    insert into users (email, google_sub, full_name, avatar_url, client_id)
    values (${email}, ${conta.sub}, ${conta.nome}, ${conta.foto}, ${conta.clientId ?? null})
    on conflict do nothing
    returning id, email, nickname, full_name, country, state, city, banned_at, banned_reason
  `) as Record<string, unknown>[];
  if (criadas.length > 0) return toUser(criadas[0]!);

  // Conflito: alguém criou a mesma conta entre a checagem e a inserção. Ler de
  // volta é mais honesto que devolver erro para uma corrida que já terminou bem.
  const denovo = (await sql`
    select id, email, nickname, full_name, country, state, city, banned_at, banned_reason
    from users where google_sub = ${conta.sub} or email = ${email} limit 1
  `) as Record<string, unknown>[];
  return denovo.length > 0 ? toUser(denovo[0]!) : null;
}

/** Grava onde a pessoa está. Pode ser chamado quantas vezes ela se mudar. */
export async function setLocal(
  userId: string,
  local: { country: string; state: string | null; city: string | null },
): Promise<void> {
  if (!sql) return;
  await sql`
    update users
       set country = ${local.country}, state = ${local.state}, city = ${local.city}
     where id = ${userId}::uuid`;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  if (!sql) return null;
  const rows = (await sql`
    select id, email, nickname, full_name, country, state, city, banned_at, banned_reason
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
    select u.id, u.email, u.nickname, u.full_name, u.country, u.state, u.city,
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
