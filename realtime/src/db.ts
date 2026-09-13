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
  /** Para quem foi. Necessario quando a mensagem e' MINHA: a conversa e' com ele. */
  toNickname?: string | null;
  /** Fui eu que mandei? Decide o lado da bolha no aparelho que esta sincronizando. */
  minha?: boolean;
  kind: string;
  /** Já aberto pelo cofre: é o que vai para o destinatário, como ele enviou. */
  payload: string;
  createdAt: string;
  entregue?: boolean;
  lida?: boolean;
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
/**
 * Tudo o que mudou para esta pessoa desde o corte que o aparelho conhece.
 *
 * OS DOIS SENTIDOS, e é aí que mora o conserto: a consulta traz o que ela
 * RECEBEU e também o que ela MANDOU. Enquanto só trazia o que chegou, a
 * mensagem enviada do celular não existia no computador — ela nunca tinha
 * passado por lá, e o servidor não tinha como contá-la.
 *
 * O CORTE É UM INSTANTE, e não uma página: o aparelho diz "já tenho tudo até
 * aqui" e recebe o resto. É barato (os dois índices por data resolvem), não
 * depende de o aparelho ter visto as mensagens na mesma ordem, e funciona igual
 * para quem some por cinco minutos e para quem some por um mês.
 */
export async function desde(
  userId: string,
  corte: string | null,
  limite = 300,
): Promise<EnvelopeGuardado[]> {
  if (!sql) return [];

  // `1970` como piso quando não há corte: aparelho novo entrando na conta leva
  // o histórico inteiro que ainda existe.
  const inicio = corte ?? '1970-01-01T00:00:00.000Z';

  const linhas = (await sql`
    select e.msg_id, e.from_user_id, e.to_user_id, e.kind, e.enc, e.created_at,
           e.delivered_at, e.read_at,
           encode(e.payload, 'base64') as payload_b64,
           de.nickname as from_nickname,
           para.nickname as to_nickname
      from envelopes e
      left join users de on de.id = e.from_user_id
      left join users para on para.id = e.to_user_id
     where (e.to_user_id = ${userId}::uuid or e.from_user_id = ${userId}::uuid)
       and e.expires_at > now()
       and (
         e.created_at > ${inicio}::timestamptz
         /*
          * O QUE NUNCA CHEGOU A NENHUM APARELHO VOLTA SEMPRE, corte ou nao.
          *
          * Sem esta linha havia um buraco estreito e real: a entrega ao vivo
          * de uma mensagem se perde (soluco de rede) enquanto o aparelho
          * continua conectado e mandando as suas — o corte avanca por cima da
          * mensagem perdida, e a proxima sincronizacao nao a traria mais.
          *
          * A condicao delivered_at is null e' a garantia de que ninguem a
          * recebeu ainda, entao repeti-la nao custa nada a quem ja' tem.
          */
         or (e.to_user_id = ${userId}::uuid and e.delivered_at is null)
       )
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
      toNickname: (l.to_nickname as string) ?? null,
      minha: String(l.from_user_id) === userId,
      kind: String(l.kind),
      payload: claro.toString('utf8'),
      createdAt: new Date(String(l.created_at)).toISOString(),
      entregue: Boolean(l.delivered_at),
      lida: Boolean(l.read_at),
    });
  }
  return saida;
}

/**
 * O aparelho recebeu — e a linha CONTINUA existindo.
 *
 * Aqui havia um `delete`. Ele cumpria a promessa antiga ("entregue é
 * apagado") e, junto com ela, impedia qualquer segundo aparelho de ver a
 * mensagem: o primeiro que confirmasse a apagava para todos. Agora o ack
 * carimba a data, que é o que o segundo tique precisa.
 *
 * `delivered_at is null` no where: marcar duas vezes não pode avisar o
 * remetente duas vezes, e o retorno vazio da segunda vez é exatamente o que
 * evita isso.
 */
export async function confirmarEntrega(
  userId: string,
  msgIds: string[],
): Promise<{ fromUserId: string; msgId: string }[]> {
  if (!sql || msgIds.length === 0) return [];
  const linhas = (await sql`
    update envelopes
       set delivered_at = now()
     where to_user_id = ${userId}::uuid
       and msg_id = any(${msgIds.slice(0, 500)})
       and delivered_at is null
    returning msg_id, from_user_id
  `) as Record<string, unknown>[];
  return linhas.map((l) => ({
    msgId: String(l.msg_id),
    fromUserId: String(l.from_user_id),
  }));
}

/**
 * "Eu li." Carimba, e devolve de quem eram as mensagens.
 *
 * Guardar a leitura é novo: antes o aviso só existia ao vivo e se perdia se o
 * remetente estivesse fora. Com o histórico no servidor, o tique azul passa a
 * sobreviver ao recarregar — e a aparecer no outro aparelho da mesma pessoa.
 */
export async function confirmarLeitura(
  userId: string,
  msgIds: string[],
): Promise<{ fromUserId: string; msgId: string }[]> {
  if (!sql || msgIds.length === 0) return [];
  const linhas = (await sql`
    update envelopes
       set read_at = now(),
           delivered_at = coalesce(delivered_at, now())
     where to_user_id = ${userId}::uuid
       and msg_id = any(${msgIds.slice(0, 500)})
       and read_at is null
    returning msg_id, from_user_id
  `) as Record<string, unknown>[];
  return linhas.map((l) => ({
    msgId: String(l.msg_id),
    fromUserId: String(l.from_user_id),
  }));
}

/**
 * Esta pessoa aceita a PRIMEIRA mensagem de quem ela nao conhece?
 *
 * Pergunta so' no primeiro contato — ver o uso em mailbox.ts. Quem ja' conversou
 * uma vez continua conversando, porque o filtro e' sobre abrir a porta, nao
 * sobre quem ja' esta dentro.
 */
export async function aceitaDesconhecidos(userId: string): Promise<boolean> {
  if (!sql) return true;
  const linhas = (await sql`
    select aberto_a_conversas from users where id = ${userId}::uuid limit 1
  `) as Record<string, unknown>[];
  // Na duvida, aceita: uma conta sem resposta nao pode virar uma caixa fechada
  // sem que ninguem tenha pedido isso.
  return linhas.length === 0 ? true : Boolean(linhas[0]!.aberto_a_conversas);
}

/**
 * Ja' existe conversa entre os dois?
 *
 * `limit 1` e os dois indices por data resolvem isso sem varrer: a pergunta e'
 * "existe alguma", e nao "quantas".
 */
export async function jaConversaram(a: string, b: string): Promise<boolean> {
  if (!sql) return false;
  const linhas = (await sql`
    select 1 from envelopes
     where (from_user_id = ${a}::uuid and to_user_id = ${b}::uuid)
        or (from_user_id = ${b}::uuid and to_user_id = ${a}::uuid)
     limit 1
  `) as unknown[];
  return linhas.length > 0;
}

/** Quantas mensagens ainda nao foram entregues a nenhum aparelho dela. */
export async function quantosEsperando(userId: string): Promise<number> {
  if (!sql) return 0;
  const linhas = (await sql`
    select count(*)::int as n from envelopes
    where to_user_id = ${userId}::uuid and expires_at > now()
      and delivered_at is null
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
