// components/globe/config/niches.ts
// Catálogo canônico de nichos/interesses usados na segmentação de anúncios.

export const NICHES = [
  'viagem',
  'luxo',
  'gastronomia',
  'aventura',
  'praia',
  'cultura',
  'negocios',
  'tecnologia',
  'natureza',
  'familia',
  'esportes',
  'compras',
  'saude',
] as const;

export type Niche = (typeof NICHES)[number];

export const NICHE_LABELS: Record<Niche, string> = {
  viagem: 'Viagem',
  luxo: 'Luxo',
  gastronomia: 'Gastronomia',
  aventura: 'Aventura',
  praia: 'Praia',
  cultura: 'Cultura',
  negocios: 'Negócios',
  tecnologia: 'Tecnologia',
  natureza: 'Natureza',
  familia: 'Família',
  esportes: 'Esportes',
  compras: 'Compras',
  saude: 'Saúde',
};

const VALID = new Set<string>(NICHES);

export function isNiche(value: string): value is Niche {
  return VALID.has(value);
}

// Mapeia categorias de notícia (comportamento do usuário) para nichos.
export const NEWS_CATEGORY_TO_NICHE: Record<string, Niche | undefined> = {
  sports: 'esportes',
  business: 'negocios',
  science: 'tecnologia',
  entertainment: 'cultura',
  health: 'saude',
  local: undefined, // sinal geográfico, não de nicho
};
