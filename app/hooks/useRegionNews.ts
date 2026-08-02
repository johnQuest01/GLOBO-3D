// app/hooks/useRegionNews.ts
'use client';

import { useState, useEffect } from 'react';

export interface RegionNewsItem {
  id: number;
  region_key: string;
  category: string;
  title: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
}

/**
 * Busca as notícias do banco para uma região quando o popup dela abre.
 * Degradação graciosa: sem backend (ou erro), retorna lista vazia e o popup
 * exibe apenas o conteúdo estático de sempre.
 */
export function useRegionNews(regionKey: string | null): {
  news: RegionNewsItem[];
  isLoading: boolean;
} {
  const [news, setNews] = useState<RegionNewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!regionKey) {
      setNews([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(`/api/news?region=${encodeURIComponent(regionKey)}`)
      .then((res) => (res.ok ? res.json() : { news: [] }))
      .then((data: { news?: RegionNewsItem[] }) => {
        if (!cancelled) setNews(Array.isArray(data.news) ? data.news : []);
      })
      .catch(() => {
        if (!cancelled) setNews([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [regionKey]);

  return { news, isLoading };
}
