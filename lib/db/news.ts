// lib/db/news.ts
// MÓDULO SERVER-SIDE — acesso às notícias por região no Neon.

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
export const isDbEnabled = Boolean(DATABASE_URL);
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export interface RegionNewsRow {
  id: number;
  region_key: string;
  category: string;
  title: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
}

/** Busca as notícias de uma região (mais recentes primeiro). */
export async function getNewsByRegion(
  regionKey: string,
  limit = 30,
): Promise<RegionNewsRow[]> {
  if (!sql || !regionKey) return [];
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const rows = await sql`
    select id, region_key, category, title, body, image_url, created_at
    from region_news
    where region_key = ${regionKey}
    order by created_at desc
    limit ${safeLimit}
  `;
  return rows as RegionNewsRow[];
}
