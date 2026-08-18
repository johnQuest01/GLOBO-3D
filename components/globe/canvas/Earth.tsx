// components/globe/canvas/Earth.tsx
'use client';

import React, { useState, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import type { GlobeMode } from '@/components/globe/ui/GlobeModeToggle';
import {
  MODE_FADE_SPEED,
  SUN_UPDATE_INTERVAL_MS,
  sunDirectionForDate,
  TWILIGHT_END,
  TWILIGHT_START,
  zoomDaylight,
} from '@/app/lib/globeDayNight';

/**
 * Material do globo. Faz duas misturas ao mesmo tempo:
 *
 * 1. Crossfade entre dois níveis de LOD do lado dia (uTexture1 -> uTexture2),
 *    para a troca de nitidez não aparecer como um "pulo".
 * 2. Dia -> noite conforme o ângulo entre a superfície e o Sol. O lado escuro
 *    mostra as luzes das cidades, e a passagem entre os dois é suave como o
 *    crepúsculo de verdade, não uma linha dura.
 */
const CrossfadeMaterialImpl = shaderMaterial(
  {
    uBlendFactor: 0.0,
    uTexture1: new THREE.Texture(),
    uTexture2: new THREE.Texture(),
    uSunDirection: new THREE.Vector3(1, 0, 0),
    uClockMode: 0.0,
    uZoomDaylight: 1.0,
    uTwilight: new THREE.Vector2(TWILIGHT_START, TWILIGHT_END),
  },
  // Vertex Shader
  `
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment Shader
  `
    uniform float uBlendFactor;
    uniform sampler2D uTexture1;
    uniform sampler2D uTexture2;
    uniform vec3 uSunDirection;
    uniform float uClockMode;
    uniform float uZoomDaylight;
    uniform vec2 uTwilight;

    varying vec2 vUv;
    varying vec3 vNormal;

    void main() {
      vec4 day = mix(texture2D(uTexture1, vUv), texture2D(uTexture2, vUv), uBlendFactor);

      // MODO RELOGIO: cada ponto decide sozinho se e dia ou noite, pelo angulo
      // com o Sol. Crepusculo estreito, porque na Terra real o dia vai claro
      // ate quase o terminador.
      float sun = dot(normalize(vNormal), normalize(uSunDirection));
      float clockDaylight = smoothstep(uTwilight.x, uTwilight.y, sun);

      // MODO PADRAO: o globo inteiro segue o zoom (calculado na CPU).
      // Longe = noite com luzes, perto = dia.
      float daylight = mix(uZoomDaylight, clockDaylight, uClockMode);

      // NOITE: a MESMA textura do dia, escurecida e puxada para o azul do
      // luar. Nao ha segunda imagem — nada extra para o celular baixar, guardar
      // na GPU nem amostrar por pixel.
      //
      // O canal azul cai menos que o vermelho de proposito: o oceano continua
      // se distinguindo do continente no escuro. Quem desenha o contorno dos
      // paises a noite sao as linhas de fronteira, que sao geometria e nao
      // dependem da textura.
      vec3 nightColor = day.rgb * vec3(0.11, 0.15, 0.30) + vec3(0.004, 0.008, 0.018);

      gl_FragColor = vec4(mix(nightColor, day.rgb, daylight), 1.0);
    }
  `
);
extend({ CrossfadeMaterial: CrossfadeMaterialImpl });

// --- Tipagem ---
interface CrossfadeMaterialUniforms {
  uBlendFactor?: number;
  uTexture1?: THREE.Texture;
  uTexture2?: THREE.Texture;
  uSunDirection?: THREE.Vector3;
  uClockMode?: number;
  uZoomDaylight?: number;
  uTwilight?: THREE.Vector2;
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
  /** Avisa o carregador que o zoom já justifica baixar este nível. */
  requestLevel: (index: number) => void;
  mode: GlobeMode;
}

const SPHERE_RADIUS = 1.5;
const TRANSITION_SPEED = 2.0;

export default function Earth({
  placeholderTexture,
  lodTextures,
  lodConfig,
  areLodTexturesReady,
  isInteractive,
  onLODChange,
  requestLevel,
  mode,
}: EarthProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  const meshRef = useRef<THREE.Mesh>(null!);

  const [activeLodIndex, setActiveLodIndex] = useState(0);
  const [targetLodIndex, setTargetLodIndex] = useState(0);
  const [isUsingPlaceholder, setIsUsingPlaceholder] = useState(true);

  const prevIsHighRes = useRef<boolean>(false);

  // O Sol anda ~0.004°/s: recalcular a cada minuto é mais que suficiente.
  const sunDirection = useMemo(() => sunDirectionForDate(new Date()), []);
  const lastSunUpdate = useRef(0);

  useFrame(({ camera }, delta) => {
    if (!materialRef.current) return;

    // Terminador acompanhando o relógio.
    const now = performance.now();
    if (now - lastSunUpdate.current > SUN_UPDATE_INTERVAL_MS) {
      lastSunUpdate.current = now;
      sunDirection.copy(sunDirectionForDate(new Date()));
    }
    materialRef.current.uniforms.uSunDirection.value = sunDirection;

    const distance = camera.position.length();

    // Modo padrão: o globo inteiro escurece conforme afasta.
    materialRef.current.uniforms.uZoomDaylight.value = zoomDaylight(distance);

    // Troca de modo com fade, para não cortar seco entre um e outro.
    const modeTarget = mode === 'relogio' ? 1 : 0;
    const clock = materialRef.current.uniforms.uClockMode;
    if (clock.value !== modeTarget) {
      const step = MODE_FADE_SPEED * delta;
      clock.value =
        modeTarget > clock.value
          ? Math.min(modeTarget, clock.value + step)
          : Math.max(modeTarget, clock.value - step);
    }

    // Popup aberto: nada de recalcular LOD, o quadro é do popup.
    if (!isInteractive) return;
    let newTargetIndex = lodConfig.findIndex((lod) => distance >= lod.maxDistance);
    if (newTargetIndex === -1) {
      newTargetIndex = lodConfig.length - 1;
    }

    // Só agora sabemos que o usuário chegou perto o bastante para o nível
    // pesado valer a pena. Enquanto ele não chega, o anterior segue no lugar.
    requestLevel(newTargetIndex);

    const isHighRes = newTargetIndex === lodConfig.length - 1;
    if (isHighRes !== prevIsHighRes.current) {
      prevIsHighRes.current = isHighRes;
      onLODChange(isHighRes);
    }

    const uniform = materialRef.current.uniforms.uBlendFactor;

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
      <sphereGeometry args={[SPHERE_RADIUS, 128, 128]} />
      <crossfadeMaterial
        ref={materialRef}
        key="custom-material"
        uniforms-uTexture1-value={placeholderTexture}
        uniforms-uTexture2-value={placeholderTexture}
        uniforms-uBlendFactor-value={0.0}
        uniforms-uClockMode-value={0.0}
        uniforms-uZoomDaylight-value={1.0}
        toneMapped={false}
      />
    </mesh>
  );
}
