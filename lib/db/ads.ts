// lib/db/ads.ts
// MÓDULO SERVER-SIDE — acesso aos anúncios (marketing) no Neon.

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
export const isDbEnabled = Boolean(DATABASE_URL);
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export interface AdRow {
  id: number;
  region_key: string | null;
  title: string;
  image_url: string | null;
  link_url: string | null;
  lat: number | null;
  lon: number | null;
}

/** Busca os anúncios ativos. */
export async function getActiveAds(limit = 50): Promise<AdRow[]> {
  if (!sql) return [];
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const rows = await sql`
    select id, region_key, title, image_url, link_url, lat, lon
    from ads
    where active = true
    order by created_at desc
    limit ${safeLimit}
  `;
  return rows as AdRow[];
}
