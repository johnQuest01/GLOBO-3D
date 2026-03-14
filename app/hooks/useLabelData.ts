// app/hooks/useLabelData.ts
'use client';

import { useState, useEffect, useMemo } from 'react';
import { latLonToVector3 } from '@/components/lib/utils';
import * as THREE from 'three';
import { useGlobeTranslations } from './useGlobeTranslations'; // Importa o novo hook de tradução

// --- ATUALIZADO: Interface agora inclui o continente ---
export interface CountryLabelData {
  name: string; // Nome traduzido (ex: "Brasil")
  key: string; // Chave original (ex: "Brazil")
  lat: number;
  lon: number;
  continent: string; // (ex: "South America", "Africa")
}

// Interface para os dados dos "tiles" de estado
export interface StateLabelData {
  name: string; // Nome traduzido (ex: "São Paulo")
  key: string; // Chave original (ex: "são paulo")
  lat: number;
  lon: number;
}

// Tipo interno para estados com posição 3D processada
export type StateLabelWithPosition = StateLabelData & { position: THREE.Vector3 };

// Tipos de suporte para useCombinedStateData
type StateLabelDataWithCountry = StateLabelData & { countryKey: string };
export type ProcessedStateLabel = StateLabelDataWithCountry & {
  position: THREE.Vector3;
};

// URL dos países
const COUNTRIES_URL = '/data/country-labels.json';
const STATE_TILE_BASE_URL = '/data/state-labels-tiled/';
const SPHERE_RADIUS = 1.5;

/**
 * Hook para buscar os dados de rótulos de PAÍSES, aplicando a tradução dinâmica.
 * (Inalterado)
 */
export function useLabelData() {
  const [countryLabels, setCountryLabels] = useState<CountryLabelData[]>([]);
  const [isLoadingRaw, setIsLoadingRaw] = useState(true);
  
  // Usa o novo hook de tradução
  const { translate, isLoadingTranslations } = useGlobeTranslations();

  // Efeito para buscar os dados brutos dos países
  useEffect(() => {
    async function fetchData() {
      setIsLoadingRaw(true);
      try {
        const countriesRes = await fetch(COUNTRIES_URL, { cache: 'no-store' });

        if (!countriesRes.ok) {
          throw new Error(
            `Falha ao buscar ${COUNTRIES_URL}: ${countriesRes.statusText}`
          );
        }

        const countriesData: CountryLabelData[] = await countriesRes.json();
        setCountryLabels(countriesData);
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
        name: translatedName, // <-- Nome traduzido (ou fallback para o original)
      };
    });
  }, [countryLabels, translate, isLoadingRaw, isLoadingTranslations]); // Depende dos dados brutos e da função de tradução

  return {
    countryLabels: translatedCountryLabels, // Retorna os labels traduzidos
    isLoadingLabels: isLoadingRaw || isLoadingTranslations // O estado de carregamento combinado
  };
}

/**
 * (Inalterado) Hook para buscar os "tiles" de estados dinamicamente.
 */
export function useTiledStateData(countryKey: string | null) {
  const [stateLabels, setStateLabels] = useState<StateLabelData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!countryKey) {
      setStateLabels([]);
      return;
    }

    async function fetchStateData() {
      setIsLoading(true);
      const STATE_TILE_URL = `${STATE_TILE_BASE_URL}${countryKey}.json`;

      try {
        const statesRes = await fetch(STATE_TILE_URL, { cache: 'no-store' });
        if (!statesRes.ok) {
          if (statesRes.status === 404) {
            // console.log(`Nenhum tile de estado para: ${countryKey}`);
          } else {
            throw new Error(
              `Falha ao buscar ${STATE_TILE_URL}: ${statesRes.statusText}`
            );
          }
        }

        const statesData: StateLabelData[] = await statesRes.json();
        setStateLabels(statesData);
      } catch (error) {
        setStateLabels([]);
        // console.warn(`Falha ao carregar tile de estado para ${countryKey}:`, error.message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStateData();
  }, [countryKey]);

  return { stateLabels, isLoadingStateLabels: isLoading };
}


// --- INÍCIO DA LÓGICA DE OCULTAÇÃO SELETIVA ---

/**
 * (REMOVIDO DO FILTRO ATIVO, POIS 'StateLabels.tsx' JÁ FAZ ISSO)
 * Lista de bloqueio estática para países específicos (pela 'key' em inglês).
 */
// const STATE_BLOCKLIST = new Set(['Russia', 'Ukraine', 'China', 'Japan']);

/**
 * --- CORREÇÃO (BUG 3) ---
 * Chaves de "países" que na verdade são continentes.
 * Alterado de 'south-america' (minúsculo) para 'South America' (como está no GeoJSON/content.json)
 */
const CONTINENT_KEYS = new Set([
  'South America',
  'North America',
  'Europe',
  'Africa',
  'Asia',
  'Oceania',
  'Antarctica'
]);

/**
 * Hook que busca TODOS os dados de estados para os países VISÍVEIS (e NÃO BLOQUEADOS)
 * e os combina em um único array mestre.
 */
export function useCombinedStateData(
  // A 'CountryLabelData' agora inclui 'continent'
  visibleCountries: (CountryLabelData & { position: THREE.Vector3 })[]
): {
  combinedStates: ProcessedStateLabel[];
  isLoading: boolean;
} {
  const [combinedStates, setCombinedStates] = useState<
    StateLabelDataWithCountry[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [prevCountryKeys, setPrevCountryKeys] = useState<string>('');

  // 1. Filtra os países visíveis ANTES de fazer a busca
  const countriesToFetch = useMemo(() => {
    return visibleCountries.filter(country => {
      // Regra 1: Ignora os "países" que são continentes
      // (Usa a 'key' corrigida, ex: "South America")
      if (CONTINENT_KEYS.has(country.key)) {
        return false;
      }

      // --- FILTROS REMOVIDOS ---
      // A lógica de quais países DEVEM mostrar estados (Brazil, USA)
      // já está sendo tratada no componente 'StateLabels.tsx'.
      // Manter filtros aqui (como bloquear a África) e
      // filtros lá (como permitir o Brasil) é redundante e causa bugs.
      // O trabalho deste hook é apenas buscar dados para países que *não* são continentes.

      // [REMOVIDO] Regra 2: Ignora países da lista de bloqueio estática
      // if (STATE_BLOCKLIST.has(country.key)) {
      //   return false;
      // }

      // [REMOVIDO] Regra 3: Ignora todos os países do continente Africano
      // if (country.continent === 'Africa') {
      //   return false;
      // }

      // Se passou por tudo (ou seja, NÃO é um continente), busca os estados
      return true;
    });
  }, [visibleCountries]);

  // 2. Gera a chave de memoização baseada APENAS nos países filtrados
  const countryKeys = useMemo(
    () => countriesToFetch.map((c) => c.key).sort().join(','),
    [countriesToFetch]
  );

  useEffect(() => {
    // Só re-busca se a lista de países filtrados mudar
    if (countryKeys === prevCountryKeys) {
      return;
    }

    setPrevCountryKeys(countryKeys);

    // 3. Usa a lista filtrada (countriesToFetch)
    if (countriesToFetch.length === 0) {
      setCombinedStates([]);
      return;
    }

    async function fetchAllStateData() {
      setIsLoading(true);
      try {
        const fetchPromises = countriesToFetch.map((country) => { // <-- USA A LISTA FILTRADA
          const STATE_TILE_URL = `${STATE_TILE_BASE_URL}${country.key}.json`;
          return fetch(STATE_TILE_URL, { cache: 'no-store' })
            .then((res) => {
              if (res.status === 404) return [];
              if (!res.ok) throw new Error(`Falha ao buscar ${country.key}`);
              return res.json() as Promise<StateLabelData[]>;
            })
            .then((states) => {
              // (Lógica inalterada de adicionar 'countryKey')
              return states.map((state) => ({
                ...state,
                countryKey: country.key,
              }));
            })
            .catch(() => {
              return [];
            });
        });

        const allStateArrays = (await Promise.all(
          fetchPromises
        )) as StateLabelDataWithCountry[][];

        const flatStates = allStateArrays.flat();
        setCombinedStates(flatStates);

      } catch (error) {
        console.error('Falha ao combinar dados de estados:', error);
        setCombinedStates([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAllStateData();
  }, [countryKeys, countriesToFetch, prevCountryKeys]); // <-- Dependência atualizada

  // (Lógica de processamento para Vector3 inalterada)
  const processedStates: ProcessedStateLabel[] = useMemo(() => {
    return combinedStates.map((label) => ({
      ...label,
      position: latLonToVector3(label.lat, label.lon, SPHERE_RADIUS),
    }));
  }, [combinedStates]);

  return { combinedStates: processedStates, isLoading };
}