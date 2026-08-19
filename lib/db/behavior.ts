// lib/db/behavior.ts
// MÓDULO SERVER-SIDE — nunca importe isto em componentes de cliente.
// Usa a connection string secreta do Neon (DATABASE_URL), que jamais é
// exposta ao navegador.

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

/** Indica se o backend está configurado (há connection string). */
export const isDbEnabled = Boolean(DATABASE_URL);

const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

/**
 * Peso de cada tipo de evento na afinidade.
 *
 * A escala é intencionalmente desigual: passar o olho numa região vale pouco,
 * marcar um pino ou planejar uma viagem vale muito, porque exigiu intenção. O
 * "dislike" é negativo para que a recomendação recue de verdade, em vez de só
 * deixar de reforçar.
 */
const EVENT_WEIGHT: Record<string, number> = {
  region_view: 1,
  dwell: 1, // multiplicado pelo tempo, ver abaixo
  news_open: 3,
  news_read: 6,
  like: 12,
  dislike: -14,
  pin_add: 10,
  trip_plan: 15,
  tourism_view: 5,
  search: 2,
};

/** Tipos aceitos — qualquer outro é descartado na entrada. */
export const EVENT_KINDS = Object.keys(EVENT_WEIGHT);

/**
 * Meia-vida da afinidade, em dias.
 *
 * Sem decaimento, o que a pessoa gostava há um ano pesaria igual ao de ontem e
 * a recomendação ficaria presa no passado. A cada atualização o score antigo é
 * reduzido pelo tempo decorrido antes de somar o novo.
 */
const HALF_LIFE_DAYS = 45;

/** Teto de tempo de permanência considerado, para uma aba esquecida aberta
 *  não virar "interesse altíssimo". */
const MAX_DWELL_MS = 120_000;

export interface BehaviorEvent {
  kind: string;
  regionKey?: string | null;
  topic?: string | null;
  refId?: string | null;
  dwellMs?: number | null;
}

export interface ProfileInput {
  clientId: string;
  email?: string | null;
  name?: string | null;
  city?: string | null;
  termsVersion?: string | null;
}

/** Peso final de um evento, já considerando o tempo de permanência. */
function resolveWeight(event: BehaviorEvent): number {
  const base = EVENT_WEIGHT[event.kind] ?? 0;
  if (event.kind !== 'dwell') return base;

  // Permanência entra em escala achatada: 2 minutos olhando não vale 120x
  // mais que 1 segundo, vale cerca de 11x.
  const ms = Math.min(Math.max(event.dwellMs ?? 0, 0), MAX_DWELL_MS);
  return base * Math.sqrt(ms / 1000);
}

/**
 * Cria ou atualiza o perfil. O aceite dos termos só é gravado na primeira vez
 * (ou quando a versão muda), para não reescrever a data original a cada visita.
 */
export async function upsertProfile(input: ProfileInput): Promise<void> {
  if (!sql) return;

  await sql`
    insert into profiles (client_id, email, name, city, terms_accepted_at, terms_version)
    values (
      ${input.clientId},
      ${input.email ?? null},
      ${input.name ?? null},
      ${input.city ?? null},
      ${input.termsVersion ? new Date().toISOString() : null},
      ${input.termsVersion ?? null}
    )
    on conflict (client_id) do update set
      email        = coalesce(excluded.email, profiles.email),
      name         = coalesce(excluded.name, profiles.name),
      city         = coalesce(excluded.city, profiles.city),
      last_seen_at = now(),
      terms_accepted_at = case
        when excluded.terms_version is not null
         and excluded.terms_version is distinct from profiles.terms_version
        then now() else profiles.terms_accepted_at end,
      terms_version = coalesce(excluded.terms_version, profiles.terms_version)
  `;
}

/**
 * Grava um lote de eventos e atualiza a afinidade correspondente.
 *
 * Vem em lote porque o cliente acumula e envia de tempos em tempos — uma
 * requisição por clique deixaria a navegação pesada, que é justamente o que se
 * quer evitar num globo em 3D.
 */
export async function recordEvents(
  clientId: string,
  events: BehaviorEvent[],
): Promise<number> {
  if (!sql || events.length === 0) return 0;

  const valid = events.filter((e) => EVENT_KINDS.includes(e.kind));
  if (valid.length === 0) return 0;

  // 1. Histórico bruto.
  for (const event of valid) {
    await sql`
      insert into behavior_events
        (client_id, kind, region_key, topic, ref_id, dwell_ms, weight)
      values (
        ${clientId}, ${event.kind}, ${event.regionKey ?? null},
        ${event.topic ?? null}, ${event.refId ?? null},
        ${event.dwellMs ?? null}, ${resolveWeight(event)}
      )
    `;
  }

  // 2. Resumo por dimensão, para a recomendação ser uma leitura indexada.
  const deltas = new Map<string, { dimension: string; value: string; score: number }>();
  for (const event of valid) {
    const weight = resolveWeight(event);
    if (weight === 0) continue;

    for (const [dimension, value] of [
      ['region', event.regionKey],
      ['topic', event.topic],
    ] as const) {
      if (!value) continue;
      const key = `${dimension}:${value}`;
      const current = deltas.get(key);
      if (current) current.score += weight;
      else deltas.set(key, { dimension, value, score: weight });
    }
  }

  for (const { dimension, value, score } of deltas.values()) {
    await sql`
      insert into affinity (client_id, dimension, value, score, updated_at)
      values (${clientId}, ${dimension}, ${value}, ${score}, now())
      on conflict (client_id, dimension, value) do update set
        score = affinity.score
                * power(
                    0.5,
                    extract(epoch from (now() - affinity.updated_at))
                      / (${HALF_LIFE_DAYS} * 86400)
                  )
                + ${score},
        updated_at = now()
    `;
  }

  return valid.length;
}

export interface AffinityRow {
  dimension: string;
  value: string;
  score: number;
}

/** As preferências mais fortes da pessoa, já decaídas pelo tempo. */
export async function getAffinity(
  clientId: string,
  limitPerDimension = 12,
): Promise<AffinityRow[]> {
  if (!sql) return [];

  const rows = (await sql`
    select dimension, value,
           score * power(
             0.5,
             extract(epoch from (now() - updated_at)) / (${HALF_LIFE_DAYS} * 86400)
           ) as score
    from affinity
    where client_id = ${clientId}
    order by dimension, score desc
    limit ${limitPerDimension * 2}
  `) as AffinityRow[];

  return rows;
}

export interface RecommendedNews {
  id: number;
  region_key: string;
  category: string;
  title: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  score: number;
}

/**
 * Notícias ordenadas pelo perfil da pessoa.
 *
 * A nota final soma três coisas: quanto ela gosta daquela região, quanto gosta
 * daquele assunto e quão recente é a notícia. Sem o termo de recência o feed
 * congelaria nos interesses antigos; sem os de afinidade seria só cronológico.
 *
 * Quem ainda não tem histórico recebe as mais recentes — o algoritmo não trava
 * esperando dados.
 */
export async function getRecommendedNews(
  clientId: string,
  limit = 20,
): Promise<RecommendedNews[]> {
  if (!sql) return [];

  const rows = (await sql`
    with pref as (
      select dimension, value,
             score * power(
               0.5,
               extract(epoch from (now() - updated_at)) / (${HALF_LIFE_DAYS} * 86400)
             ) as score
      from affinity
      where client_id = ${clientId}
    )
    select n.id, n.region_key, n.category, n.title, n.body, n.image_url,
           n.created_at,
           coalesce(r.score, 0) * 1.0
         + coalesce(t.score, 0) * 0.8
         + 12 * power(
             0.5,
             extract(epoch from (now() - n.created_at)) / (7 * 86400)
           ) as score
    from region_news n
    left join pref r on r.dimension = 'region' and r.value = n.region_key
    left join pref t on t.dimension = 'topic'  and t.value = n.category
    order by score desc, n.created_at desc
    limit ${limit}
  `) as RecommendedNews[];

  return rows;
}

/** Apaga tudo o que foi coletado sobre uma pessoa. */
export async function forgetClient(clientId: string): Promise<void> {
  if (!sql) return;
  await sql`select forget_client(${clientId})`;
}
