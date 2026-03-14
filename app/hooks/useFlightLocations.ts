// app/hooks/useFlightLocations.ts
'use client';


import { useState, useEffect } from 'react';
import { FlightLocation } from '@/app/types/flight';


// ATUALIZADO: Busca apenas o JSON pré-processado
const DATA_URL = '/data/flight-locations.json';


/**
 * Hook (Otimizado) para buscar a lista PRÉ-PROCESSADA de locais
 * para o popup de voo.
 *
 * Esta versão NÃO processa mais GeoJSONs ou content.json no cliente.
 * Apenas busca o 'flight-locations.json' gerado no build.
 */
export function useFlightLocations(): {
  locations: FlightLocation[];
  isLoading: boolean;
} {
  const [locations, setLocations] = useState<FlightLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);


  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        // --- CORREÇÃO REMOVIDA ---
        // Removido { cache: 'no-store' } para permitir o cache de build.
        const res = await fetch(DATA_URL);
        // --- FIM DA CORREÇÃO ---


        if (!res.ok) {
          throw new Error(`Falha ao buscar ${DATA_URL}: ${res.statusText}`);
        }
        const data: FlightLocation[] = await res.json();


        // 2. Define o estado
        setLocations(data);
      } catch (error) {
        console.error('Falha ao carregar dados de voo pré-processados:', error);
      } finally {
        setIsLoading(false);
      }
    }


    fetchData();
  }, []); // Executa apenas uma vez


  // 3. Retorna os dados
  return { locations, isLoading };
}
