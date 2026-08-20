// app/hooks/useGlobeTextures.ts
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const CACHE_BUST = '?v=4.0';

/**
 * UMA textura para o globo inteiro — dia, noite e todos os zooms.
 *
 * A noite não tem imagem própria: é esta mesma textura escurecida e puxada
 * para o azul dentro do shader da Terra.
 *
 * E não há mais escada de LOD. Antes existiam três arquivos (2K, 4K, 8K) que
 * o app trocava conforme a câmera se aproximava, com um crossfade no shader
 * para a troca não aparecer como um pulo. Isso existia por um motivo só: os
 * mipmaps estavam desligados. O KTX2 traz a cadeia de mipmaps dentro do
 * arquivo, e aí quem escolhe o nível de detalhe é a GPU, por pixel, de graça e
 * sem pop. Uma imagem basta.
 *
 * POR QUE KTX2 E NÃO WEBP. A GPU não entende WebP: o navegador decodifica e
 * guarda RGBA8, 4 bytes por pixel, sempre — o nível 8K sozinho virava 128 MB
 * de memória de vídeo, e entrava já no primeiro pinçar de dedos. O KTX2 chega
 * no formato que a própria GPU lê comprimido (ETC2 no Android, ASTC, BC no
 * desktop, escolhido por aparelho na hora do carregamento): o mesmo 8K ocupa
 * ~22 MB com os mipmaps inclusos. Também some o tranco de subir 128 MB para a
 * placa no meio do zoom.
 */

/**
 * A MESMA textura em duas medidas — não são dois níveis de detalhe.
 *
 * Textura comprimida não é redimensionada por ninguém: se o aparelho tem teto
 * de 4096 (celular antigo), uma imagem de 8192 simplesmente não sobe e o globo
 * fica preto. Cada aparelho baixa exatamente um destes arquivos.
 */
const TEXTURE_8K = `/textures/earth-day-8k.ktx2${CACHE_BUST}`;
const TEXTURE_4K = `/textures/earth-day-4k.ktx2${CACHE_BUST}`;

/** Onde ficam o basis_transcoder.js e o .wasm (copiados do three). */
const TRANSCODER_PATH = '/basis/';

export function useGlobeTextures() {
  const { gl } = useThree();

  // Placeholder procedural: um azul liso enquanto a textura não chega. São 4x4
  // pixels gerados em memória — nada para baixar.
  const placeholderTexture = useMemo(() => {
    const size = 4;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 20;
      data[i + 1] = 60;
      data[i + 2] = 120;
      data[i + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);

  const [dayTexture, setDayTexture] = useState<THREE.Texture | null>(null);
  const loadedRef = useRef<THREE.Texture | null>(null);

  useEffect(() => {
    let cancelado = false;

    const loader = new KTX2Loader()
      .setTranscoderPath(TRANSCODER_PATH)
      // Pergunta à placa quais formatos comprimidos ela aceita. É isto que faz
      // um único arquivo servir Android, iPhone e desktop.
      .detectSupport(gl);

    const tetoDeTextura = gl.capabilities.maxTextureSize;
    const url = tetoDeTextura >= 8192 ? TEXTURE_8K : TEXTURE_4K;

    loader.load(
      url,
      (texture) => {
        if (cancelado) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        // Os mipmaps vêm prontos no arquivo: usar o filtro trilinear é o que
        // faz eles valerem alguma coisa. Sem isto a GPU amostraria sempre o
        // nível cheio, que é justamente o que causava o serrilhado em ângulo
        // raso e o desperdício de cache.
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
        texture.needsUpdate = true;

        loadedRef.current = texture;
        setDayTexture(texture);
      },
      undefined,
      (error) => {
        console.error('[GlobeTextures] Falha ao carregar a textura:', error);
      },
    );

    return () => {
      cancelado = true;
      loader.dispose();
      loadedRef.current?.dispose();
      loadedRef.current = null;
    };
  }, [gl]);

  return {
    placeholderTexture,
    dayTexture,
    /** A textura de verdade já está na placa (o globo deixou de ser uma bola azul). */
    isDayTextureReady: dayTexture !== null,
  };
}
