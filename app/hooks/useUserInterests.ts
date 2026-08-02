// app/hooks/useUserInterests.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { NEWS_CATEGORY_TO_NICHE, isNiche, Niche } from '@/components/globe/config/niches';

const EXPLICIT_KEY = 'globo3d:interests';
const SAVED_NEWS_KEY = 'saved-news-items';
const SAVED_SPOTS_KEY = 'saved-vacation-spots';

/**
 * Deriva os interesses (nichos) do usuário a partir de:
 *  - interesses explícitos (localStorage 'globo3d:interests'), e
 *  - sinais de comportamento: categorias de notícias salvas e locais de
 *    viagem salvos.
 *
 * É a base do "anúncio certo para a pessoa certa" — sem depender de login,
 * usando o que o próprio usuário já demonstrou gostar.
 */
export function useUserInterests(): {
  interests: Niche[];
  setExplicitInterests: (niches: Niche[]) => void;
} {
  const [interests, setInterests] = useState<Niche[]>([]);

  const compute = useCallback(() => {
    if (typeof window === 'undefined') return;
    const set = new Set<Niche>();

    // 1. Interesses explícitos
    try {
      const raw = localStorage.getItem(EXPLICIT_KEY);
      if (raw) {
        (JSON.parse(raw) as string[]).forEach((n) => {
          if (isNiche(n)) set.add(n);
        });
      }
    } catch {
      /* ignora */
    }

    // 2. Categorias de notícias salvas → nichos
    try {
      const raw = localStorage.getItem(SAVED_NEWS_KEY);
      if (raw) {
        const items = JSON.parse(raw) as { categoryKey?: string }[];
        items.forEach((it) => {
          const niche = it.categoryKey
            ? NEWS_CATEGORY_TO_NICHE[it.categoryKey]
            : undefined;
          if (niche) set.add(niche);
        });
      }
    } catch {
      /* ignora */
    }

    // 3. Locais de viagem salvos → interesse em viagem
    try {
      const raw = localStorage.getItem(SAVED_SPOTS_KEY);
      if (raw) {
        const spots = JSON.parse(raw) as unknown[];
        if (Array.isArray(spots) && spots.length > 0) set.add('viagem');
      }
    } catch {
      /* ignora */
    }

    setInterests(Array.from(set));
  }, []);

  useEffect(() => {
    compute();
    const onStorage = () => compute();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [compute]);

  const setExplicitInterests = useCallback(
    (niches: Niche[]) => {
      try {
        localStorage.setItem(EXPLICIT_KEY, JSON.stringify(niches));
        window.dispatchEvent(
          new StorageEvent('storage', { key: EXPLICIT_KEY }),
        );
      } catch {
        /* ignora */
      }
      compute();
    },
    [compute],
  );

  return { interests, setExplicitInterests };
}
