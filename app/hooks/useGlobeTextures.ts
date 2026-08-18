// app/hooks/useGlobeTextures.ts
'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as THREE from 'three';

const CACHE_BUST = '?v=3.0';

/**
 * Níveis de detalhe do lado dia. Todos saem da mesma fonte (earth-1.png,
 * 16200x8100), então aproximar só deixa a imagem mais nítida — não muda a cor
 * no meio do caminho. `maxDistance` é a distância de câmera em que cada nível
 * assume.
 */
const LOD_CONFIG = [
  // Faixas: d >= 6 -> 2K | 2.95 <= d < 6 -> 4K | d < 2.95 -> 8K.
  // A camera comeca em d = 3, que cai no 4K de proposito: nessa distancia a
  // tela mostra ~65 graus de arco, e 4096px ja cobre isso pixel a pixel. O 8K
  // so entra quando o usuario de fato aproxima.
  { maxDistance: 6.0, path: `/textures/earth-day-2k.webp${CACHE_BUST}` },
  { maxDistance: 2.95, path: `/textures/earth-day-4k.webp${CACHE_BUST}` },
  { maxDistance: 2.0, path: `/textures/earth-day-8k.webp${CACHE_BUST}` },
];

/**
 * Quantos níveis carregam sozinhos. Os dois primeiros somam 646 KB e cobrem o
 * uso comum; o 8K (1,7 MB) só é buscado quando a câmera realmente aproxima —
 * quem só gira o planeta nunca paga por ele.
 */
const EAGER_LEVELS = 2;

const applyTextureSettings = (texture: THREE.Texture): THREE.Texture => {
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
};

function loadTexture(
  loader: THREE.TextureLoader,
  path: string,
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(path, (tex) => resolve(applyTextureSettings(tex)), undefined, reject);
  });
}

/**
 * Carrega as texturas da Terra em ordem de utilidade: primeiro o 2K (145 KB),
 * que já deixa o globo apresentável, e só depois os níveis pesados. Enquanto o
 * 4K/8K não chegam, os três níveis apontam para o 2K — nunca há buraco.
 */
export function useGlobeTextures() {
  // Placeholder procedural: um azul liso enquanto nem o 2K chegou.
  const placeholderTexture = useMemo(() => {
    const size = 4;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 20;
      data[i + 1] = 60;
      data[i + 2] = 120;
      data[i + 3] = 255;
    }
    const texture = new THREE.DataTexture(
      data,
      size,
      size,
      THREE.RGBAFormat,
    );
    return applyTextureSettings(texture);
  }, []);

  const [lodTextures, setLodTextures] = useState<THREE.Texture[]>([]);
  const [areLodTexturesReady, setAreLodTexturesReady] = useState(false);
  const loadedRef = useRef<THREE.Texture[]>([]);
  const mountedRef = useRef(true);
  const requestedRef = useRef(new Set<number>());

  /**
   * Chamado pelo Earth quando o zoom passa a pedir um nível ainda não baixado.
   * Cada nível é pedido uma vez só.
   */
  const requestLevel = useCallback((index: number) => {
    if (index < EAGER_LEVELS || index >= LOD_CONFIG.length) return;
    if (requestedRef.current.has(index)) return;
    requestedRef.current.add(index);

    loadTexture(new THREE.TextureLoader(), LOD_CONFIG[index].path)
      .then((tex) => {
        if (!mountedRef.current) {
          tex.dispose();
          return;
        }
        loadedRef.current.push(tex);
        setLodTextures((prev) => {
          const next = [...prev];
          next[index] = tex;
          return next;
        });
      })
      .catch(() => {
        requestedRef.current.delete(index);
      });
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loader = new THREE.TextureLoader();
    const loaded: THREE.Texture[] = [];
    loadedRef.current = loaded;

    async function load() {
      try {
        // 1. O nível mais leve primeiro: com ele o globo já está utilizável.
        const base = await loadTexture(loader, LOD_CONFIG[0].path);
        if (!isMounted) return;
        loaded.push(base);
        setLodTextures(LOD_CONFIG.map(() => base));
        setAreLodTexturesReady(true);

        // 2. Nível intermediário: entra sozinho, é barato e cobre o zoom comum.
        //    O 8K (1,7 MB) fica esperando o usuário realmente aproximar.
        for (let index = 1; index < EAGER_LEVELS; index++) {
          try {
            const tex = await loadTexture(loader, LOD_CONFIG[index].path);
            if (!isMounted) {
              tex.dispose();
              return;
            }
            loaded.push(tex);
            setLodTextures((prev) => {
              const next = [...prev];
              next[index] = tex;
              return next;
            });
          } catch {
            console.warn(
              `[GlobeTextures] Nível ${index} indisponível; mantendo o anterior.`,
            );
          }
        }
      } catch (error) {
        console.error('[GlobeTextures] Falha ao carregar a textura base:', error);
      }
    }

    load();

    return () => {
      isMounted = false;
      mountedRef.current = false;
      for (const texture of loadedRef.current) texture.dispose();
    };
  }, []);

  return {
    placeholderTexture,
    lodTextures,
    areLodTexturesReady,
    lodConfig: LOD_CONFIG,
    requestLevel,
  };
}
