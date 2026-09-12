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
/**
 * UM download, UMA conversao, UMA copia na memoria.
 *
 * Este hook e' chamado de tres lugares (o globo, os anuncios e a presenca do
 * realtime) e cada chamada fazia tudo de novo: buscava o mesmo arquivo de 75 KB,
 * convertia o objeto inteiro num Map de milhares de entradas, e guardava a
 * propria copia. Foi medido na aba: `geo-mapping.json` aparecia DUAS vezes na
 * lista de recursos, e a terceira so' nao aparecia por cache do navegador — o
 * trabalho de converter, esse, acontecia as tres.
 *
 * E acontecia durante a abertura do app, na mesma thread que desenha o primeiro
 * quadro.
 *
 * A promessa fica no modulo, e nao num contexto do React, porque nao ha estado
 * aqui: o arquivo e' o mesmo para todo mundo e nao muda enquanto a aba viver.
 * Quem chegar primeiro dispara; os outros esperam a mesma promessa.
 */
let carregamento: Promise<LocationMap> | null = null;

function carregarMapa(): Promise<LocationMap> {
  if (carregamento) return carregamento;

  carregamento = fetch(DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Falha ao buscar ${DATA_URL}: ${res.statusText}`);
      return res.json() as Promise<LocationObject>;
    })
    .then((data) => new Map(Object.entries(data)))
    .catch((erro) => {
      console.error('Falha ao carregar geo-mapping pre-processado:', erro);
      // Zera para que uma proxima montagem possa tentar de novo: guardar a
      // promessa rejeitada deixaria o globo sem coordenadas para sempre.
      carregamento = null;
      return new Map() as LocationMap;
    });

  return carregamento;
}

export function useGeoMapping() {
  const [locationMap, setLocationMap] = useState<LocationMap>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    void carregarMapa().then((mapa) => {
      if (!vivo) return;
      setLocationMap(mapa);
      setIsLoading(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

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


  /**
   * A coordenada crua, sem virar vetor.
   *
   * A presença precisa mandar lat/lon para o servidor de realtime, e converter
   * para Vector3 só para desconverter do outro lado seria trabalho perdido —
   * e uma chance a mais de os dois caminhos discordarem.
   */
  const keyToLatLon = useCallback(
    (key: string): { lat: number; lon: number } | null =>
      locationMap.get(key) ?? null,
    [locationMap],
  );

  return { keyToVector3, keyToLatLon, isLoading };
}