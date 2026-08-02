// lib/ads/targeting.ts
// MOTOR DE SEGMENTAÇÃO (pure functions — sem dependências, testável isolado).
//
// Regra central da sua visão: um anúncio segmentado (com nichos) só aparece
// para quem tem interesse compatível. Anúncios sem nicho são "gerais" e
// aparecem para todos. Tudo pode ainda ser restrito por região.

export interface TargetableAd {
  id: number;
  title: string;
  image_url: string | null;
  link_url: string | null;
  lat: number | null;
  lon: number | null;
  region_key: string | null;
  niches: string[] | string | null; // vem do Postgres como text[] (ou literal)
  created_at?: string;
}

export interface ScoredAd extends TargetableAd {
  nichesNormalized: string[];
  matchedNiches: string[];
  isGeneral: boolean;
  score: number;
}

export interface TargetingContext {
  interests: string[];
  region?: string | null;
  limit?: number;
}

/**
 * Normaliza o campo `niches` que pode vir como array JS, literal do Postgres
 * ('{a,b}') ou nulo.
 */
export function normalizeNiches(raw: string[] | string | null | undefined): string[] {
  if (!raw) return [];
  let arr: string[];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      arr = trimmed
        .slice(1, -1)
        .split(',')
        .map((s) => s.replace(/^"|"$/g, ''));
    } else if (trimmed.length > 0) {
      arr = [trimmed];
    } else {
      arr = [];
    }
  } else {
    arr = [];
  }
  return arr
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** Calcula a relevância de um anúncio para um usuário/contexto. */
export function scoreAd(ad: TargetableAd, ctx: TargetingContext): ScoredAd {
  const interests = ctx.interests.map((i) => i.trim().toLowerCase());
  const nichesNormalized = normalizeNiches(ad.niches);
  const isGeneral = nichesNormalized.length === 0;
  const matchedNiches = nichesNormalized.filter((n) => interests.includes(n));

  // Anúncio geral: relevância base baixa. Segmentado: +peso por nicho batido.
  const score = isGeneral ? 1 : matchedNiches.length * 10;

  return { ...ad, nichesNormalized, matchedNiches, isGeneral, score };
}

/** Verifica compatibilidade geográfica (região opcional). */
function geoMatches(ad: TargetableAd, region?: string | null): boolean {
  if (!ad.region_key) return true; // anúncio sem região = mundial
  if (!region) return true; // sem contexto de região = não filtra
  return ad.region_key.toLowerCase() === region.toLowerCase();
}

/**
 * Seleciona e ranqueia os anúncios elegíveis para o contexto do usuário.
 * - Geral (sem nicho) → aparece para todos.
 * - Segmentado → só aparece se algum nicho bater com os interesses.
 * - Ordenado por relevância (nichos batidos) e depois por recência.
 */
export function selectAds(ads: TargetableAd[], ctx: TargetingContext): ScoredAd[] {
  const limit = ctx.limit ?? 50;

  const eligible = ads
    .map((ad) => scoreAd(ad, ctx))
    .filter((ad) => {
      if (!geoMatches(ad, ctx.region)) return false;
      // Geral aparece para todos; segmentado exige pelo menos 1 nicho batido.
      return ad.isGeneral || ad.matchedNiches.length > 0;
    });

  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Desempate por recência (mais novo primeiro)
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return tb - ta;
  });

  return eligible.slice(0, limit);
}
