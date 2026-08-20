// components/globe/canvas/Earth.tsx
'use client';

import React, { useMemo, useRef } from 'react';
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
 * Material do globo: UMA textura, e a mistura dia -> noite conforme o ângulo
 * entre a superfície e o Sol.
 *
 * Antes havia duas amostragens por pixel, porque o material fazia crossfade
 * entre dois níveis de LOD (`uTexture1` -> `uTexture2`). Isso acabou: com os
 * mipmaps vindo dentro do KTX2, quem escolhe o nível de detalhe é a GPU, por
 * pixel. Sobrou uma amostragem — em tela de celular, uma busca de textura a
 * menos por pixel a cada quadro não é pouca coisa.
 */
const GlobeMaterialImpl = shaderMaterial(
  {
    uTexture: new THREE.Texture(),
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
    uniform sampler2D uTexture;
    uniform vec3 uSunDirection;
    uniform float uClockMode;
    uniform float uZoomDaylight;
    uniform vec2 uTwilight;

    varying vec2 vUv;
    varying vec3 vNormal;

    void main() {
      vec4 day = texture2D(uTexture, vUv);

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
extend({ GlobeMaterial: GlobeMaterialImpl });

// --- Tipagem ---
interface GlobeMaterialUniforms {
  uTexture?: THREE.Texture;
  uSunDirection?: THREE.Vector3;
  uClockMode?: number;
  uZoomDaylight?: number;
  uTwilight?: THREE.Vector2;
}
declare module '@react-three/fiber' {
  interface ThreeElements {
    globeMaterial: GlobeMaterialUniforms & {
      key?: string | number | null;
      ref?: React.Ref<THREE.ShaderMaterial>;
    } & Partial<THREE.Material>;
  }
}

interface EarthProps {
  /** Azul liso de 4x4 pixels, enquanto a textura de verdade não chegou. */
  placeholderTexture: THREE.Texture;
  dayTexture: THREE.Texture | null;
  isInteractive: boolean;
  /** Avisa quando a câmera está perto o bastante para os anúncios aparecerem. */
  onZoomedInChange: (isZoomedIn: boolean) => void;
  mode: GlobeMode;
}

const SPHERE_RADIUS = 1.5;

/**
 * Distância da câmera a partir da qual se considera que o usuário "entrou" no
 * globo. Era o degrau em que a antiga escada de LOD trocava para o nível mais
 * pesado; virou um limiar explícito, que é o que ele sempre foi de fato.
 */
const ZOOMED_IN_DISTANCE = 2.95;

export default function Earth({
  placeholderTexture,
  dayTexture,
  isInteractive,
  onZoomedInChange,
  mode,
}: EarthProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  const meshRef = useRef<THREE.Mesh>(null!);

  const prevIsZoomedIn = useRef(false);

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

    // A textura entra assim que chega, sem crossfade: não há dois níveis para
    // conciliar, só a bola azul dando lugar ao planeta.
    materialRef.current.uniforms.uTexture.value = dayTexture ?? placeholderTexture;

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

    // Popup aberto: o quadro é do popup, não do globo.
    if (!isInteractive) return;

    const isZoomedIn = distance < ZOOMED_IN_DISTANCE;
    if (isZoomedIn !== prevIsZoomedIn.current) {
      prevIsZoomedIn.current = isZoomedIn;
      onZoomedInChange(isZoomedIn);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[SPHERE_RADIUS, 128, 128]} />
      <globeMaterial
        ref={materialRef}
        key="globe-material"
        uniforms-uTexture-value={placeholderTexture}
        uniforms-uClockMode-value={0.0}
        uniforms-uZoomDaylight-value={1.0}
        toneMapped={false}
      />
    </mesh>
  );
}
