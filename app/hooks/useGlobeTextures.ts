// app/hooks/useGlobeTextures.ts
'use client';

import { useState, useEffect, useMemo } from 'react';
// --- MUDANÇA 1: Importar useTexture (para JPG/PNG/WebP) ---
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
// Importa o KTX2Loader diretamente do three.js
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

// --- Constantes de Configuração ---

const CACHE_BUST = '?v=2.3';
const TRANSCODER_PATH = '/basis/';

/**
 * --- MUDANÇA 2: Caminho para o placeholder (WebP) ---
 * Este arquivo será gerado pelo 'scripts/preprocess-data.mjs'.
 */
const PLACEHOLDER_PATH = `/textures/earth-placeholder.webp`;

/**
 * Configuração do LOD (KTX2)
 * Carregado em segundo plano.
 */
const LOD_CONFIG = [
  { maxDistance: 6.0, path: `/textures/earth-3.ktx2${CACHE_BUST}` }, // Baixa Res
  { maxDistance: 3.5, path: `/textures/earth-2.ktx2${CACHE_BUST}` }, // Média Res
  {
    maxDistance: 2.0,
    path: `/textures/earth-1-with-borders.ktx2${CACHE_BUST}`,
  }, // Alta Res com Bordas
];

/**
 * Caminhos de fallback (PNG/WebP) para os mesmos níveis de LOD,
 * usados em dispositivos/navegadores que não suportam bem KTX2.
 */
const FALLBACK_LOD_PATHS = [
  '/textures/earth-3.webp', // Baixa Res
  '/textures/earth-2.webp', // Média Res
  '/textures/earth-4.png',  // Alta Res aproximada
];

/**
 * Aplica configurações padrão às texturas KTX2.
 */
const processKtxTexture = (texture: THREE.Texture): THREE.Texture => {
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  // flipY e colorSpace já são tratados pelo KTX2Loader
  return texture;
};

/**
 * Aplica configurações padrão às texturas fallback (PNG/WebP/JPG)
 * usadas quando o carregamento KTX2 falhar ou não for suportado.
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
 * Precisamos definir manualmente o colorSpace.
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
  // --- 1. Carregamento Rápido do Placeholder (com Suspense) ---
  // --- MUDANÇA 3: Usar useTexture com o caminho .webp ---
  const placeholder = useTexture(PLACEHOLDER_PATH) as THREE.Texture;

  const placeholderTexture = useMemo(
    () => processPlaceholderTexture(placeholder),
    [placeholder],
  );

  // --- 2. Estados para Carregamento em Segundo Plano ---
  const [lodTextures, setLodTextures] = useState<THREE.Texture[]>([]);
  const [areLodTexturesReady, setAreLodTexturesReady] = useState(false);
  const { gl } = useThree();

  // --- 3. Instancia o KTX2Loader manual ---
  const ktx2Loader = useMemo(() => {
    const loader = new KTX2Loader();
    loader.setTranscoderPath(TRANSCODER_PATH);
    loader.detectSupport(gl);
    return loader;
  }, [gl]);

  // Extrai os caminhos do LOD config
  const lodPaths = useMemo(() => LOD_CONFIG.map((lod) => lod.path), []);

  // --- 4. Efeito para Carregar LODs em Segundo Plano (KTX2 + Fallback PNG/WebP) ---
  useEffect(() => {
    let isMounted = true;
    let ktx2Succeeded = false;
    setAreLodTexturesReady(false);

    // Função assíncrona para carregar todas as texturas KTX2
    async function loadHighResTextures() {
      console.log('Iniciando carregamento em segundo plano das texturas KTX2 LOD...');
      try {
        const texturePromises = lodPaths.map((path) =>
          ktx2Loader.loadAsync(path),
        );
        const loadedTextures = await Promise.all(texturePromises);

        if (isMounted) {
          const processedTextures = loadedTextures.map(processKtxTexture);
          setLodTextures(processedTextures);
          setAreLodTexturesReady(true);
          ktx2Succeeded = true;
          console.log(
            'Texturas KTX2 LOD carregadas e prontas para a troca!',
          );
        }
      } catch (error) {
        console.error(
          'Falha ao carregar texturas KTX2 LOD em segundo plano:',
          error,
        );
      }
    }

    // Carregamento paralelo do fallback PNG/WebP.
    async function loadFallbackTextures() {
      console.log('Iniciando carregamento em segundo plano das texturas PNG/WebP LOD (fallback)...');
      try {
        const textureLoader = new THREE.TextureLoader();

        const loadFallbackTexture = (path: string) =>
          new Promise<THREE.Texture>((resolve, reject) => {
            textureLoader.load(
              path,
              (tex) => resolve(processFallbackTexture(tex)),
              undefined,
              (err) => reject(err),
            );
          });

        const loadedFallbackTextures = await Promise.all(
          FALLBACK_LOD_PATHS.map((path) => loadFallbackTexture(path)),
        );

        if (!isMounted) return;

        // Só aplica o fallback se o KTX2 ainda não tiver sido aplicado
        if (!ktx2Succeeded) {
          setLodTextures(loadedFallbackTextures);
          setAreLodTexturesReady(true);
          console.log(
            'Texturas PNG/WebP LOD carregadas como fallback e prontas para a troca!',
          );
        } else {
          console.log(
            'Fallback PNG/WebP carregado, mas descartado porque KTX2 já foi aplicado com sucesso.',
          );
        }
      } catch (fallbackError) {
        console.error(
          'Falha ao carregar texturas PNG/WebP LOD de fallback:',
          fallbackError,
        );
      }
    }

    loadHighResTextures();
    loadFallbackTextures();

    return () => {
      isMounted = false;
    };
  }, [ktx2Loader, lodPaths]);

  // --- 5. Retorna os dados ---
  return {
    placeholderTexture, // (THREE.Texture de um .webp)
    lodTextures, // (Array de THREE.Texture de .ktx2)
    areLodTexturesReady,
    lodConfig: LOD_CONFIG,
  };
}
