// app/hooks/useGlobeTextures.ts
'use client';

import { useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';

// --- Constantes de Configuração ---

const CACHE_BUST = '?v=2.3';

/**
 * Configuração do LOD usando apenas PNG/WebP normais.
 * Estes arquivos devem existir em /public/textures.
 */
const LOD_CONFIG = [
  { maxDistance: 6.0, path: `/textures/earth-3.webp${CACHE_BUST}` }, // Baixa Res
  { maxDistance: 3.5, path: `/textures/earth-2.webp${CACHE_BUST}` }, // Média Res
  {
    maxDistance: 2.0,
    // Alta resolução com fronteiras para o zoom máximo
    path: `/textures/earth-1-with-borders.webp${CACHE_BUST}`,
  },
];

/**
 * Aplica configurações padrão às texturas fallback (PNG/WebP/JPG)
 * usadas para os níveis de LOD.
 */
const processFallbackTexture = (texture: THREE.Texture): THREE.Texture => {
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

/**
 * Processamento especial para o placeholder WebP/JPG/PNG
 * ou qualquer textura gerada em memória.
 */
const processPlaceholderTexture = (texture: THREE.Texture): THREE.Texture => {
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace; // Essencial para WebP/JPG/PNG
  texture.needsUpdate = true;
  return texture;
};

/**
 * Hook customizado (OTIMIZADO) para carregar texturas da Terra
 * de forma PROGRESSIVA.
 */
export function useGlobeTextures() {
  // --- 1. Placeholder procedural em memória (sem depender de arquivos externos) ---
  const placeholderTexture = useMemo(() => {
    const size = 4;
    const data = new Uint8Array(size * size * 3);

    // Preenche com uma cor azulada simples (simbolizando o planeta)
    for (let i = 0; i < data.length; i += 3) {
      data[i] = 20;   // R
      data[i + 1] = 60; // G
      data[i + 2] = 120; // B
    }

    const texture = new THREE.DataTexture(
      data,
      size,
      size,
      THREE.RGBFormat,
    );
    texture.needsUpdate = true;

    return processPlaceholderTexture(texture);
  }, []);

  // --- 2. Estados para Carregamento em Segundo Plano ---
  const [lodTextures, setLodTextures] = useState<THREE.Texture[]>([]);
  const [areLodTexturesReady, setAreLodTexturesReady] = useState(false);

  // Extrai os caminhos do LOD config
  const lodPaths = useMemo(() => LOD_CONFIG.map((lod) => lod.path), []);

  // --- 3. Efeito para Carregar LODs em Segundo Plano (PNG/WebP) ---
  useEffect(() => {
    let isMounted = true;
    setAreLodTexturesReady(false);

    async function loadLodTextures() {
      console.log(
        '[GlobeTextures] Iniciando carregamento em segundo plano das texturas PNG/WebP LOD...',
      );
      try {
        const textureLoader = new THREE.TextureLoader();

        const loadTexture = (path: string) =>
          new Promise<THREE.Texture>((resolve, reject) => {
            textureLoader.load(
              path,
              (tex) => resolve(processFallbackTexture(tex)),
              undefined,
              (err) => reject(err),
            );
          });

        const loadedTextures = await Promise.all(
          lodPaths.map((path) => loadTexture(path)),
        );

        if (!isMounted) return;

        setLodTextures(loadedTextures);
        setAreLodTexturesReady(true);
        console.log(
          '[GlobeTextures] Texturas PNG/WebP LOD carregadas e prontas para a troca.',
        );
      } catch (fallbackError) {
        console.error(
          '[GlobeTextures] Falha ao carregar texturas PNG/WebP LOD:',
          fallbackError,
        );
      }
    }

    loadLodTextures();

    return () => {
      isMounted = false;
    };
  }, [lodPaths]);

  // --- 5. Retorna os dados ---
  return {
    placeholderTexture, // (THREE.Texture de um .webp)
    lodTextures, // (Array de THREE.Texture de .ktx2)
    areLodTexturesReady,
    lodConfig: LOD_CONFIG,
  };
}
