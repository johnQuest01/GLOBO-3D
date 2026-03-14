// app/hooks/useGeoMapping.ts
'use client';


import { useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { latLonToVector3 } from '@/components/lib/utils';


// ATUALIZADO: Busca apenas o JSON pré-processado
const DATA_URL = '/data/geo-mapping.json';
// REMOVIDO: const CACHE_BUST_PARAM = `?v=${Date.now()}`;


// Tipo para o objeto { "key": { lat, lon } }
type LocationObject = Record<string, { lat: number; lon: number }>;
// Tipo para o Map<string, { lat, lon }>
type LocationMap = Map<string, { lat: number; lon: number }>;


/**
* Hook (Otimizado) para criar um mapa de geolocalização (Chave -> Lat/Lon)
* e fornecer uma função de conversão para THREE.Vector3.
*/
export function useGeoMapping() {
  const [locationMap, setLocationMap] = useState<LocationMap>(new Map());
  const [isLoading, setIsLoading] = useState(true);


  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        // --- CORREÇÃO: Removido Cache Buster e 'no-store' ---
        // Permite que o Next.js e o navegador cacheiem este arquivo estático.
        const res = await fetch(DATA_URL);
        // --- FIM DA CORREÇÃO ---


        if (!res.ok) {
          throw new Error(`Falha ao buscar ${DATA_URL}: ${res.statusText}`);
        }
        // 2. Busca o OBJETO
        const data: LocationObject = await res.json();


        // 3. Converte o OBJETO para um MAP (necessário para `keyToVector3`)
        const newLocationMap: LocationMap = new Map(Object.entries(data));


        setLocationMap(newLocationMap);
      } catch (error) {
        console.error('Falha ao carregar geo-mapping pré-processado:', error);
      } finally {
        setIsLoading(false);
      }
    }


    fetchData();
  }, []); // Executa apenas uma vez


  // 4. Função de conversão (memoizada) - Sem alteração na lógica interna
  const keyToVector3 = useCallback(
    (key: string, radius: number): THREE.Vector3 | null => {
      const location = locationMap.get(key);
      if (location) {
        return latLonToVector3(location.lat, location.lon, radius);
      }
      // console.warn(`[useGeoMapping] Chave de localização não encontrada: "${key}"`);
      return null; // Retorna nulo se a chave não for encontrada
    },
    [locationMap], // Depende apenas do mapa simples
  );


  return { keyToVector3, isLoading };
}