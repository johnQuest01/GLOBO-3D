// components/globe/canvas/Earth.tsx
'use client';

import React, { useState, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';

// --- Shader para o Crossfade (Inalterado) ---
const CrossfadeMaterialImpl = shaderMaterial(
  {
    uBlendFactor: 0.0,
    uTexture1: new THREE.Texture(),
    uTexture2: new THREE.Texture(),
  },
  // Vertex Shader
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment Shader
  `
    uniform float uBlendFactor;
    uniform sampler2D uTexture1;
    uniform sampler2D uTexture2;
    varying vec2 vUv;

    void main() {
      vec4 tex1 = texture2D(uTexture1, vUv);
      vec4 tex2 = texture2D(uTexture2, vUv);
      gl_FragColor = mix(tex1, tex2, uBlendFactor);
    }
  `
);
extend({ CrossfadeMaterial: CrossfadeMaterialImpl });

// --- Tipagem (Inalterada) ---
interface CrossfadeMaterialUniforms {
  uBlendFactor?: number;
  uTexture1?: THREE.Texture;
  uTexture2?: THREE.Texture;
}
declare module '@react-three/fiber' {
  interface ThreeElements {
    crossfadeMaterial: CrossfadeMaterialUniforms & {
      key?: string | number | null;
      ref?: React.Ref<THREE.ShaderMaterial>;
    } & Partial<THREE.Material>;
  }
}

interface EarthProps {
  placeholderTexture: THREE.Texture;
  lodTextures: THREE.Texture[];
  lodConfig: { maxDistance: number; path: string }[];
  areLodTexturesReady: boolean;
  isInteractive: boolean;
  onLODChange: (isHighRes: boolean) => void;
}

const SPHERE_RADIUS = 1.5;
const TRANSITION_SPEED = 2.0;
// CORREÇÃO 1: Velocidade ZERO para garantir que o globo não gire sozinho
const ROTATION_SPEED = 0.0; 

export default function Earth({
  placeholderTexture,
  lodTextures,
  lodConfig,
  areLodTexturesReady,
  isInteractive, // Mantido na interface, mas não usado para rotação
  onLODChange,
}: EarthProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  const meshRef = useRef<THREE.Mesh>(null!);

  // Estados de Transição
  const [activeLodIndex, setActiveLodIndex] = useState(0);
  const [targetLodIndex, setTargetLodIndex] = useState(0);
  const [isUsingPlaceholder, setIsUsingPlaceholder] = useState(true);

  // CORREÇÃO 2: Ref para evitar loop infinito de re-renderização
  const prevIsHighRes = useRef<boolean>(false);

  // Garante que as texturas LOD sejam enviadas à GPU ANTES do zoom,
  // evitando o "stall" (travamento) no momento em que a textura de alta
  // resolução (grande) aparece pela primeira vez durante a aproximação.
  const prewarmDoneRef = useRef(false);

  useFrame(({ camera, gl }, delta) => {
    // Pré-aquece o upload das texturas para a GPU uma única vez
    if (!prewarmDoneRef.current && areLodTexturesReady && lodTextures.length > 0) {
      prewarmDoneRef.current = true;
      for (const tex of lodTextures) {
        try {
          gl.initTexture(tex);
        } catch {
          // initTexture pode não existir em versões antigas — ignora com segurança
        }
      }
    }

    // Se o globo não estiver interativo (popup aberto, UI travada), não processa LOD.
    // Isso reduz o trabalho por frame exatamente quando o usuário clica em um estado/país,
    // permitindo que o popup apareça mais rápido, especialmente em mobile.
    if (!isInteractive) {
      return;
    }

    // Rotação removida para manter alinhamento com os labels

    if (!materialRef.current) return;

    // Lógica de LOD
    const distance = camera.position.length();
    let newTargetIndex = lodConfig.findIndex(
      (lod) => distance >= lod.maxDistance
    );
    if (newTargetIndex === -1) {
        newTargetIndex = lodConfig.length - 1;
    }

    // CORREÇÃO 3: Só chama a função do pai se o valor REALMENTE mudar
    // Isso impede que o React entre em loop e faça o globo sumir
    const isHighRes = newTargetIndex === lodConfig.length - 1;
    if (isHighRes !== prevIsHighRes.current) {
        prevIsHighRes.current = isHighRes;
        onLODChange(isHighRes);
    }

    const uniform = materialRef.current.uniforms.uBlendFactor;

    // Lógica de Transição de Textura
    if (isUsingPlaceholder) {
      if (!areLodTexturesReady || lodTextures.length === 0) {
        materialRef.current.uniforms.uTexture1.value = placeholderTexture;
        materialRef.current.uniforms.uTexture2.value = placeholderTexture;
        uniform.value = 0.0;
        return;
      }

      materialRef.current.uniforms.uTexture1.value = placeholderTexture;
      materialRef.current.uniforms.uTexture2.value = lodTextures[newTargetIndex];

      uniform.value = Math.min(uniform.value + delta * TRANSITION_SPEED, 1.0);

      if (uniform.value >= 1.0) {
        setIsUsingPlaceholder(false);
        setActiveLodIndex(newTargetIndex);
        setTargetLodIndex(newTargetIndex);
        uniform.value = 0.0;
      }
    } else {
      if (newTargetIndex !== targetLodIndex) {
        setTargetLodIndex(newTargetIndex);
      }

      materialRef.current.uniforms.uTexture1.value = lodTextures[activeLodIndex];
      materialRef.current.uniforms.uTexture2.value = lodTextures[targetLodIndex];

      if (activeLodIndex !== targetLodIndex) {
        uniform.value = Math.min(uniform.value + delta * TRANSITION_SPEED, 1.0);
        if (uniform.value >= 1.0) {
          setActiveLodIndex(targetLodIndex);
          uniform.value = 0.0;
        }
      } else {
        uniform.value = 0.0;
      }
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[SPHERE_RADIUS, 64, 64]} />
      <crossfadeMaterial
        ref={materialRef}
        key="custom-material"
        uniforms-uTexture1-value={placeholderTexture}
        uniforms-uTexture2-value={placeholderTexture}
        uniforms-uBlendFactor-value={0.0}
        toneMapped={false}
      />
    </mesh>
  );
}