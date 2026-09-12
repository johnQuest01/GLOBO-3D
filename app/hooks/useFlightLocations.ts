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
/**
 * A lista de lugares — 102 KB que NAO precisam chegar na abertura.
 *
 * Ela so' serve aos popups de viagem, ferias e turismo. Baixar no primeiro
 * instante custava 12% de tudo o que a pagina traz, disputando rede e CPU com o
 * globo, para um menu que a maioria das pessoas nunca abre.
 *
 * AGORA ELA CHEGA NA FOLGA. `requestIdleCallback` espera o navegador terminar o
 * que importa — montar a cena, desenhar o primeiro quadro — e so' entao busca.
 * Quando a pessoa abre o popup, segundos depois, a lista ja' esta la'.
 *
 * O tempo limite existe porque nem todo navegador tem `requestIdleCallback`
 * (Safari ate' pouco tempo nao tinha) e porque uma aba que nunca fica ociosa
 * nao pode deixar o menu vazio para sempre.
 */
let carregamento: Promise<FlightLocation[]> | null = null;

function carregarLocais(): Promise<FlightLocation[]> {
  if (carregamento) return carregamento;

  carregamento = fetch(DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Falha ao buscar ${DATA_URL}: ${res.statusText}`);
      return res.json() as Promise<FlightLocation[]>;
    })
    .catch((erro) => {
      console.error('Falha ao carregar a lista de locais:', erro);
      carregamento = null;
      return [] as FlightLocation[];
    });

  return carregamento;
}

/** Agenda a carga para quando o navegador estiver de folga. */
function quandoDerFolga(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const idle = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opcoes?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  }).requestIdleCallback;

  if (idle) {
    const id = idle(fn, { timeout: 4000 });
    return () => (window as unknown as { cancelIdleCallback?: (i: number) => void })
      .cancelIdleCallback?.(id);
  }

  const t = window.setTimeout(fn, 2000);
  return () => window.clearTimeout(t);
}

export function useFlightLocations(): {
  locations: FlightLocation[];
  isLoading: boolean;
} {
  const [locations, setLocations] = useState<FlightLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    const cancelar = quandoDerFolga(() => {
      void carregarLocais().then((dados) => {
        if (!vivo) return;
        setLocations(dados);
        setIsLoading(false);
      });
    });
    return () => {
      vivo = false;
      cancelar();
    };
  }, []);

  return { locations, isLoading };
}
