/**
 * O banco, visto pelo servidor de realtime.
 *
 * Até a Fase G este processo não tocava em banco nenhum — presença e beacons
 * vivem no Redis e morrem sozinhos, e era tudo de que ele precisava. A caixa
 * postal muda isso: mensagem que espera entrega precisa sobreviver a um deploy,
 * e Redis aqui seria a escolha errada (é memória com persistência opcional, e
 * perder a caixa postal de todo mundo num reinício não é um risco aceitável).
 *
 * Mesmo padrão do resto do projeto: sem `DATABASE_URL`, o módulo não quebra —
 * ele desliga, e a caixa postal fica indisponível enquanto o resto funciona.
 *
 * O DRIVER É O HTTP DO NEON, o mesmo que o app Next usa. Uma ida e volta por
 * consulta, sem pool para administrar. Custa alguns milissegundos por mensagem
 * e é o suficiente para este volume; se um dia o gargalo for este, o lugar de
 * mudar é aqui dentro, e só aqui.
 */

import { neon } from '@neondatabase/serverless';

import { abrir, ENC_ATUAL, fechar } from './cofre.js';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export const bancoLigado = Boolean(sql);

export interface EnvelopeGuardado {
  msgId: string;
  fromUserId: string;
  fromNickname: string | null;
  kind: string;
  /** Já aberto pelo cofre: é o que vai para o destinatário, como ele enviou. */
  payload: string;
  createdAt: string;
}

/** Do nome público para a conta. Null quando ninguém tem esse nickname. */
export async function userIdDoNickname(nickname: string): Promise<string | null> {
  if (!sql) return null;
  const linhas = (await sql`
    select id from users
    where lower(nickname) = ${nickname.trim().toLowerCase()}
      and banned_at is null
    limit 1
  `) as Record<string, unknown>[];
  return linhas.length > 0 ? String(linhas[0]!.id) : null;
}

export async function nicknameDoUserId(userId: string): Promise<string | null> {
  if (!sql) return null;
  const linhas = (await sql`
    select nickname from users where id = ${userId}::uuid limit 1
  `) as Record<string, unknown>[];
  return linhas.length > 0 ? ((linhas[0]!.nickname as string) ?? null) : null;
}

/** Vale nos DOIS sentidos: quem bloqueia também não recebe. */
export async function estaBloqueado(a: string, b: string): Promise<boolean> {
  if (!sql) return false;
  const linhas = (await sql`
    select 1 from user_blocks
    where (blocker_user_id = ${a}::uuid and blocked_user_id = ${b}::uuid)
       or (blocker_user_id = ${b}::uuid and blocked_user_id = ${a}::uuid)
    limit 1
  `) as unknown[];
  return linhas.length > 0;
}

export async function bloquearConta(
  quem: string,
  alvo: string,
): Promise<void> {
  if (!sql) return;
  await sql`
    insert into user_blocks (blocker_user_id, blocked_user_id)
    values (${quem}::uuid, ${alvo}::uuid)
    on conflict do nothing
  `;
}

/**
 * Guarda o envelope. Devolve false se ele já existia.
 *
 * `on conflict do nothing` sobre (to_user_id, msg_id): reenviar a mesma
 * mensagem depois de uma queda de rede é o caminho NORMAL, não um erro — e não
 * pode virar duas mensagens na tela de ninguém.
 */
export async function guardarEnvelope(p: {
  msgId: string;
  fromUserId: string;
  toUserId: string;
  kind: string;
  payload: string;
}): Promise<boolean> {
  if (!sql) return false;
  const cifrado = fechar(Buffer.from(p.payload, 'utf8'));
  const linhas = (await sql`
    insert into envelopes (msg_id, from_user_id, to_user_id, kind, enc, payload)
    values (
      ${p.msgId}, ${p.fromUserId}::uuid, ${p.toUserId}::uuid,
      ${p.kind}, ${ENC_ATUAL}, decode(${cifrado.toString('base64')}, 'base64')
    )
    on conflict do nothing
    returning id
  `) as unknown[];
  return linhas.length > 0;
}

/** O que chegou enquanto a pessoa estava fora. Em ordem de chegada. */
export async function caixaDeEntrada(
  userId: string,
  limite = 200,
): Promise<EnvelopeGuardado[]> {
  if (!sql) return [];
  const linhas = (await sql`
    select e.msg_id, e.from_user_id, e.kind, e.enc, e.created_at,
           encode(e.payload, 'base64') as payload_b64,
           u.nickname as from_nickname
    from envelopes e
    left join users u on u.id = e.from_user_id
    where e.to_user_id = ${userId}::uuid
      and e.expires_at > now()
    order by e.created_at
    limit ${Math.min(limite, 500)}
  `) as Record<string, unknown>[];

  const saida: EnvelopeGuardado[] = [];
  for (const l of linhas) {
    const claro = abrir(Buffer.from(String(l.payload_b64), 'base64'));
    // Envelope que não abre é envelope perdido (chave trocada, bytes
    // corrompidos). Some da lista em vez de derrubar a sincronização inteira
    // de quem está entrando — uma mensagem ilegível não pode custar todas as
    // outras.
    if (!claro) continue;
    saida.push({
      msgId: String(l.msg_id),
      fromUserId: String(l.from_user_id),
      fromNickname: (l.from_nickname as string) ?? null,
      kind: String(l.kind),
      payload: claro.toString('utf8'),
      createdAt: new Date(String(l.created_at)).toISOString(),
    });
  }
  return saida;
}

/**
 * Entregue: apaga.
 *
 * É o modelo do WhatsApp, e é a única parte desta funcionalidade que segura a
 * promessa antiga: o servidor guarda até entregar, e depois não tem mais o que
 * entregar a quem pedir. Apagar só o que é DESTE destinatário — o `to_user_id`
 * no where não é detalhe: sem ele, conhecer um msg_id bastaria para apagar a
 * mensagem de outra pessoa.
 */
export async function confirmarEntrega(
  userId: string,
  msgIds: string[],
): Promise<{ fromUserId: string; msgId: string }[]> {
  if (!sql || msgIds.length === 0) return [];
  // `returning from_user_id` no proprio delete: e' a unica chance de saber de
  // quem era cada mensagem, porque a linha que diria isso e' exatamente a que
  // esta sendo apagada. Sem isto, o aviso de "entregue" nao teria para quem ir.
  const linhas = (await sql`
    delete from envelopes
    where to_user_id = ${userId}::uuid
      and msg_id = any(${msgIds.slice(0, 500)})
    returning msg_id, from_user_id
  `) as Record<string, unknown>[];
  return linhas.map((l) => ({
    msgId: String(l.msg_id),
    fromUserId: String(l.from_user_id),
  }));
}

/** Quantos envelopes esperam por esta pessoa. Só para log e diagnóstico. */
export async function quantosEsperando(userId: string): Promise<number> {
  if (!sql) return 0;
  const linhas = (await sql`
    select count(*)::int as n from envelopes
    where to_user_id = ${userId}::uuid and expires_at > now()
  `) as Record<string, unknown>[];
  return Number(linhas[0]?.n ?? 0);
}

/** Faxina do que venceu sem nunca ser buscado. */
export async function limparVencidos(): Promise<number> {
  if (!sql) return 0;
  const linhas = (await sql`
    delete from envelopes where expires_at < now() returning id
  `) as unknown[];
  return linhas.length;
}

// ---------------------------------------------------------------------------
// Inscrições de notificação
// ---------------------------------------------------------------------------

export interface InscricaoDePush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Todos os aparelhos onde esta pessoa pediu para ser avisada. */
export async function inscricoesDe(userId: string): Promise<InscricaoDePush[]> {
  if (!sql) return [];
  const linhas = (await sql`
    select endpoint, p256dh, auth from push_subscriptions
    where user_id = ${userId}::uuid
  `) as Record<string, unknown>[];
  return linhas.map((l) => ({
    endpoint: String(l.endpoint),
    p256dh: String(l.p256dh),
    auth: String(l.auth),
  }));
}

/** O servidor de push disse que este aparelho não existe mais. */
export async function apagarInscricao(endpoint: string): Promise<void> {
  if (!sql) return;
  await sql`delete from push_subscriptions where endpoint = ${endpoint}`;
}
