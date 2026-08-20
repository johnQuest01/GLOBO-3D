// app/hooks/useLabelData.ts
'use client';

import { useState, useEffect, useMemo } from 'react';
import { latLonToVector3 } from '@/components/lib/utils';
import * as THREE from 'three';
import { useGlobeTranslations } from './useGlobeTranslations';
import { SPHERE_RADIUS } from '@/app/lib/globeLabels';

/**
 * Metadados cartográficos que vêm do Natural Earth (via preprocess-data.mjs):
 * quem é importante e em que faixa de zoom o nome deve existir.
 */
export interface LabelRanking {
  labelRank: number;
  minLabel: number;
  maxLabel: number;
}

// --- ATUALIZADO: Interface agora inclui o continente ---
export interface CountryLabelData extends LabelRanking {
  name: string; // Nome traduzido (ex: "Brasil")
  key: string; // Chave original (ex: "Brazil")
  lat: number;
  lon: number;
  continent: string; // (ex: "South America", "Africa")
}

export interface ContinentLabelData extends LabelRanking {
  name: string;
  key: string;
  lat: number;
  lon: number;
}

// Interface para os dados dos "tiles" de estado
export interface StateLabelData extends LabelRanking {
  name: string; // Nome traduzido (ex: "São Paulo")
  key: string; // Chave original (ex: "são paulo")
  lat: number;
  lon: number;
}

// Tipos de suporte para useCombinedStateData
type StateLabelDataWithCountry = StateLabelData & { countryKey: string };
export type ProcessedStateLabel = StateLabelDataWithCountry & {
  position: THREE.Vector3;
};

export interface CityLabelData extends LabelRanking {
  name: string;
  key: string;
  lat: number;
  lon: number;
}

export type ProcessedCityLabel = CityLabelData & { position: THREE.Vector3 };

const CITY_TILE_BASE_URL = '/data/city-labels-tiled/';
const COUNTRIES_URL = '/data/country-labels.json';
const CONTINENTS_URL = '/data/continent-labels.json';
const STATE_TILE_BASE_URL = '/data/state-labels-tiled/';

/** Valores usados quando o JSON ainda não tem os metadados do Natural Earth. */
const COUNTRY_RANKING_FALLBACK: LabelRanking = {
  labelRank: 4,
  minLabel: 2.5,
  maxLabel: 7,
};
const STATE_RANKING_FALLBACK: LabelRanking = {
  labelRank: 5,
  minLabel: 4.2,
  maxLabel: 9,
};

function withRanking<T extends Partial<LabelRanking>>(
  item: T,
  fallback: LabelRanking,
): T & LabelRanking {
  return {
    ...item,
    labelRank: item.labelRank ?? fallback.labelRank,
    minLabel: item.minLabel ?? fallback.minLabel,
    maxLabel: item.maxLabel ?? fallback.maxLabel,
  };
}

/**
 * Hook para buscar os dados de rótulos de CONTINENTES e PAÍSES, aplicando a
 * tradução dinâmica.
 */
export function useLabelData() {
  const [countryLabels, setCountryLabels] = useState<CountryLabelData[]>([]);
  const [continentLabels, setContinentLabels] = useState<ContinentLabelData[]>(
    [],
  );
  const [isLoadingRaw, setIsLoadingRaw] = useState(true);

  // Usa o novo hook de tradução
  const { translate, isLoadingTranslations } = useGlobeTranslations();

  // Efeito para buscar os dados brutos dos países
  useEffect(() => {
    async function fetchData() {
      setIsLoadingRaw(true);
      try {
        // Sem 'no-store': são artefatos de build, podem ficar no cache do navegador.
        const [countriesRes, continentsRes] = await Promise.all([
          fetch(COUNTRIES_URL),
          fetch(CONTINENTS_URL),
        ]);

        if (!countriesRes.ok) {
          throw new Error(
            `Falha ao buscar ${COUNTRIES_URL}: ${countriesRes.statusText}`
          );
        }

        const countriesData: CountryLabelData[] = await countriesRes.json();
        setCountryLabels(
          countriesData.map((label) =>
            withRanking(label, COUNTRY_RANKING_FALLBACK),
          ),
        );

        if (continentsRes.ok) {
          const continentsData: ContinentLabelData[] =
            await continentsRes.json();
          setContinentLabels(continentsData);
        }
      } catch (error) {
        console.error(
          'Falha ao carregar dados dos rótulos (labels):',
          error
        );
      } finally {
        setIsLoadingRaw(false);
      }
    }

    fetchData();
  }, []); // Executa apenas uma vez na montagem

  // Processamento e Aplicação da Tradução (MEMOIZADO)
  const translatedCountryLabels = useMemo(() => {
    // Retorna vazio enquanto estiver carregando os dados brutos ou as traduções
    if (isLoadingRaw || isLoadingTranslations || countryLabels.length === 0) return [];

    return countryLabels.map((label) => {
      // O 'key' é o nome original (ex: "Brazil"), usado para lookup na tradução
      const translatedName = translate(label.key);

      return {
        ...label,
        // Mantém o nome já traduzido no preprocess quando não há tradução manual.
        name: translatedName === label.key ? label.name : translatedName,
      };
    });
  }, [countryLabels, translate, isLoadingRaw, isLoadingTranslations]); // Depende dos dados brutos e da função de tradução

  const translatedContinentLabels = useMemo(() => {
    if (isLoadingRaw || isLoadingTranslations) return [];

    return continentLabels.map((label) => {
      const translatedName = translate(label.key);
      return {
        ...label,
        name: translatedName === label.key ? label.name : translatedName,
      };
    });
  }, [continentLabels, translate, isLoadingRaw, isLoadingTranslations]);

  return {
    countryLabels: translatedCountryLabels, // Retorna os labels traduzidos
    continentLabels: translatedContinentLabels,
    isLoadingLabels: isLoadingRaw || isLoadingTranslations // O estado de carregamento combinado
  };
}

/**
 * Cada tile de país é buscado uma única vez por sessão; girar o globo de volta
 * não dispara rede novamente.
 */
const stateTileCache = new Map<string, Promise<StateLabelDataWithCountry[]>>();

function loadStateTile(countryKey: string): Promise<StateLabelDataWithCountry[]> {
  const cached = stateTileCache.get(countryKey);
  if (cached) return cached;

  const request = fetch(`${STATE_TILE_BASE_URL}${encodeURIComponent(countryKey)}.json`)
    .then((res) => (res.ok ? (res.json() as Promise<StateLabelData[]>) : []))
    .then((states) =>
      states.map((state) => ({
        ...withRanking(state, STATE_RANKING_FALLBACK),
        countryKey,
      })),
    )
    .catch(() => [] as StateLabelDataWithCountry[]);

  stateTileCache.set(countryKey, request);
  return request;
}

/**
 * Busca tiles de estado só dos países visíveis, e só quando o zoom pede a
 * camada de estados. Nunca o mundo inteiro.
 */
export function useCombinedStateData(
  visibleCountryKeys: string[],
  enabled = true,
): {
  combinedStates: ProcessedStateLabel[];
  isLoading: boolean;
} {
  const [combinedStates, setCombinedStates] = useState<
    StateLabelDataWithCountry[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  const countryKeys = useMemo(
    () => (enabled ? [...visibleCountryKeys].sort().join(',') : ''),
    [visibleCountryKeys, enabled],
  );

  useEffect(() => {
    if (!countryKeys) {
      setCombinedStates([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    Promise.all(countryKeys.split(',').map(loadStateTile))
      .then((tiles) => {
        if (cancelled) return;
        setCombinedStates(tiles.flat());
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Falha ao combinar dados de estados:', error);
        setCombinedStates([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [countryKeys]);

  const processedStates: ProcessedStateLabel[] = useMemo(() => {
    return combinedStates.map((label) => ({
      ...label,
      position: latLonToVector3(label.lat, label.lon, SPHERE_RADIUS),
    }));
  }, [combinedStates]);

  return { combinedStates: processedStates, isLoading };
}

/** Cada tile de cidade é buscado uma única vez por sessão. */
const cityTileCache = new Map<string, Promise<CityLabelData[]>>();

function loadCityTile(countryKey: string): Promise<CityLabelData[]> {
  const cached = cityTileCache.get(countryKey);
  if (cached) return cached;

  const request = fetch(`${CITY_TILE_BASE_URL}${encodeURIComponent(countryKey)}.json`)
    .then((res) => (res.ok ? (res.json() as Promise<CityLabelData[]>) : []))
    .catch(() => [] as CityLabelData[]);

  cityTileCache.set(countryKey, request);
  return request;
}

/**
 * Cidades dos países visíveis, e só quando o zoom já chegou na camada delas.
 *
 * São 7.342 cidades no mundo. Num zoom de cidade a tela mostra um punhado de
 * países, então baixar o mundo inteiro para ler "Sete Lagoas" seria cobrar do
 * celular uma conta que ele não vai usar. Mesmo fatiamento dos estados, e de
 * propósito: os dois usam a MESMA lista de países visíveis.
 */
export function useCityLabelData(
  visibleCountryKeys: string[],
  enabled = false,
): {
  cityLabels: ProcessedCityLabel[];
  isLoadingCities: boolean;
} {
  const [cityLabels, setCityLabels] = useState<CityLabelData[]>([]);
  const [isLoadingCities, setIsLoadingCities] = useState(false);

  const countryKeys = useMemo(
    () => (enabled ? [...visibleCountryKeys].sort().join(',') : ''),
    [visibleCountryKeys, enabled],
  );

  useEffect(() => {
    if (!countryKeys) {
      setCityLabels([]);
      return;
    }

    let cancelled = false;
    setIsLoadingCities(true);

    Promise.all(countryKeys.split(',').map(loadCityTile))
      .then((tiles) => {
        if (!cancelled) setCityLabels(tiles.flat());
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Falha ao carregar cidades:', error);
        setCityLabels([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCities(false);
      });

    return () => {
      cancelled = true;
    };
  }, [countryKeys]);

  const processedCities = useMemo(
    () =>
      cityLabels.map((label) => ({
        ...label,
        position: latLonToVector3(label.lat, label.lon, SPHERE_RADIUS),
      })),
    [cityLabels],
  );

  return { cityLabels: processedCities, isLoadingCities };
}
