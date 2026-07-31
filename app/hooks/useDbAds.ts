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
 * Carrega os anúncios ativos do banco (marketing interativo exibido no zoom).
 * Degradação graciosa: sem backend, retorna lista vazia.
 */
export function useDbAds(): { ads: DbAd[]; isLoading: boolean } {
  const [ads, setAds] = useState<DbAd[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ads')
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
  }, []);

  return { ads, isLoading };
}
