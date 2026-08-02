// app/hooks/useDbAds.ts
'use client';

import { useState, useEffect } from 'react';

export interface DbAd {
  id: number;
  region_key: string | null;
  title: string;
  image_url: string | null;
  link_url: string | null;
  lat: number | null;
  lon: number | null;
}

/**
 * Carrega os anúncios ativos do banco JÁ SEGMENTADOS pelos interesses do
 * usuário (marketing interativo exibido no zoom).
 * Degradação graciosa: sem backend, retorna lista vazia.
 */
export function useDbAds(interests: string[] = []): {
  ads: DbAd[];
  isLoading: boolean;
} {
  const [ads, setAds] = useState<DbAd[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Chave estável para os interesses (evita refetch desnecessário)
  const interestsKey = [...interests].sort().join(',');

  useEffect(() => {
    let cancelled = false;
    const query = interestsKey
      ? `?interests=${encodeURIComponent(interestsKey)}`
      : '';
    fetch(`/api/ads${query}`)
      .then((res) => (res.ok ? res.json() : { ads: [] }))
      .then((data: { ads?: DbAd[] }) => {
        if (!cancelled) setAds(Array.isArray(data.ads) ? data.ads : []);
      })
      .catch(() => {
        if (!cancelled) setAds([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [interestsKey]);

  return { ads, isLoading };
}
