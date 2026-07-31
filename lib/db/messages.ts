// lib/db/messages.ts
// MÓDULO SERVER-SIDE — nunca importe isto em componentes de cliente.
// Usa a connection string secreta do Neon (DATABASE_URL), que jamais é
// exposta ao navegador.

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

/** Indica se o backend está configurado (há connection string). */
export const isDbEnabled = Boolean(DATABASE_URL);

// Cliente SQL sobre HTTP (funciona em serverless/edge, sem conexões presas).
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export interface RegionMessageRow {
  client_id: string;
  text: string;
  lat: number;
  lon: number;
  created_at: string;
}

export interface NewRegionMessage {
  client_id: string;
  text: string;
  lat: number;
  lon: number;
  region_key?: string | null;
  author_name?: string | null;
}

/**
 * Busca mensagens criadas DEPOIS de `sinceIso`. Se `sinceIso` for nulo,
 * retorna as mais recentes (usado para "primar" o cliente sem re-exibir
 * histórico antigo).
 */
export async function getMessagesSince(
  sinceIso: string | null,
  limit = 40,
): Promise<RegionMessageRow[]> {
  if (!sql) return [];
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  const rows = sinceIso
    ? await sql`
        select client_id, text, lat, lon, created_at
        from region_messages
        where created_at > ${sinceIso}
        order by created_at asc
        limit ${safeLimit}
      `
    : await sql`
        select client_id, text, lat, lon, created_at
        from region_messages
        order by created_at desc
        limit ${safeLimit}
      `;

  return rows as RegionMessageRow[];
}

/** Insere uma nova mensagem de região. */
export async function insertMessage(msg: NewRegionMessage): Promise<void> {
  if (!sql) return;
  await sql`
    insert into region_messages (client_id, text, lat, lon, region_key, author_name)
    values (${msg.client_id}, ${msg.text}, ${msg.lat}, ${msg.lon},
            ${msg.region_key ?? null}, ${msg.author_name ?? null})
  `;
}
