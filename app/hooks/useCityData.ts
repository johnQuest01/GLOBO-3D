// app/hooks/useCityData.ts
'use client';

import { useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { latLonToVector3 } from '@/components/lib/utils';

export interface CityData {
  key: string;
  name: string;
  lat: number;
  lon: number;
  countryKey: string;
}

export type CityWithPosition = CityData & {
  position: THREE.Vector3;
  normal: THREE.Vector3;
};

const CITIES_URL = '/data/cities.json';
const SPHERE_RADIUS = 1.5;

// Cache em memória (o JSON de cidades é estático — carrega uma vez só)
let citiesCache: Promise<CityData[]> | null = null;

function fetchCities(): Promise<CityData[]> {
  if (citiesCache) return citiesCache;
  citiesCache = fetch(CITIES_URL, { cache: 'force-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(`Falha ao buscar ${CITIES_URL}`);
      return res.json() as Promise<CityData[]>;
    })
    .catch(() => {
      citiesCache = null; // permite nova tentativa
      return [] as CityData[];
    });
  return citiesCache;
}

/**
 * Carrega o dataset de grandes cidades e pré-calcula a posição 3D e a normal
 * de cada uma (usadas para o filtro de visibilidade no zoom máximo).
 */
export function useCityData(): {
  cities: CityWithPosition[];
  isLoading: boolean;
} {
  const [rawCities, setRawCities] = useState<CityData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCities().then((data) => {
      if (!cancelled) {
        setRawCities(data);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cities = useMemo(() => {
    return rawCities.map((c) => {
      const position = latLonToVector3(c.lat, c.lon, SPHERE_RADIUS);
      return {
        ...c,
        position,
        normal: position.clone().normalize(),
      };
    });
  }, [rawCities]);

  return { cities, isLoading };
}
