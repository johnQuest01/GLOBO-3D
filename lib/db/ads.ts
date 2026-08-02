// lib/db/ads.ts
// MÓDULO SERVER-SIDE — acesso aos anúncios (marketing) no Neon + segmentação.

import { neon } from '@neondatabase/serverless';
import { selectAds, ScoredAd, TargetableAd } from '@/lib/ads/targeting';

const DATABASE_URL = process.env.DATABASE_URL;
export const isDbEnabled = Boolean(DATABASE_URL);
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export interface AdRow extends TargetableAd {
  id: number;
  region_key: string | null;
  title: string;
  image_url: string | null;
  link_url: string | null;
  lat: number | null;
  lon: number | null;
  niches: string[] | string | null;
  created_at?: string;
}

/**
 * Busca os anúncios ativos e aplica a segmentação por interesse + região.
 * Se `interests` estiver vazio, só os anúncios gerais (sem nicho) são exibidos.
 */
export async function getTargetedAds(opts: {
  interests: string[];
  region?: string | null;
  limit?: number;
}): Promise<ScoredAd[]> {
  if (!sql) return [];
  const rows = (await sql`
    select id, region_key, title, image_url, link_url, lat, lon, niches, created_at
    from ads
    where active = true
    limit 200
  `) as AdRow[];

  return selectAds(rows, {
    interests: opts.interests,
    region: opts.region,
    limit: opts.limit ?? 50,
  });
}
