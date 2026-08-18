'use client';

import { FC, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { latLonToVector3 } from '@/components/lib/utils';
import { SPHERE_RADIUS } from '@/app/lib/globeLabels';
import {
  MODE_FADE_SPEED,
  SUN_UPDATE_INTERVAL_MS,
  sunDirectionForDate,
  TWILIGHT_END,
  TWILIGHT_START,
  zoomDaylight,
} from '@/app/lib/globeDayNight';
import type { GlobeMode } from '@/components/globe/ui/GlobeModeToggle';

/**
 * Luzes das cidades sem textura nenhuma.
 *
 * As posições saem de uma imagem noturna de satélite lida no build (ver a
 * Etapa 4 do `scripts/preprocess-data.mjs`) — a imagem nunca chega ao
 * navegador. Aqui elas são só um punhado de vértices desenhados em UM draw
 * call, com o brilho de cada ponto calculado no shader a partir do ângulo com
 * o Sol.
 *
 * Comparado a carregar o mapa noturno: sai uma textura de 2048x1024 (8 MB de
 * memória de GPU e uma amostragem por pixel a cada quadro) e entra um buffer de
 * ~9 mil pontos. É o caminho leve para celular fraco.
 *
 * O acender é consequência, não animação: o brilho é `1 - luz do dia` naquele
 * ponto. Conforme o terminador real anda, cada cidade acende sozinha.
 */

const LIGHTS_URL = '/data/city-lights.bin';

/**
 * Formato do arquivo: 5 bytes por luz.
 *   [0..3]  uint32  quantidade
 *   depois  int16   longitude x100  (uma por luz)
 *   depois  int16   latitude  x100
 *   depois  uint8   intensidade x255
 * Binário em vez de JSON porque são dezenas de milhares de números: o parse
 * de texto pesaria no celular justamente na abertura.
 */
function decodeLights(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const count = view.getUint32(0, true);
  return {
    count,
    lons: new Int16Array(buffer, 4, count),
    lats: new Int16Array(buffer, 4 + count * 2, count),
    intensities: new Uint8Array(buffer, 4 + count * 4, count),
  };
}

/** Um fio acima da superfície, para a esfera não engolir os pontos. */
const LIGHT_RADIUS = SPHERE_RADIUS * 1.0012;

/**
 * Duas cores, não uma. Vista do espaço, cidade pequena é laranja de vapor de
 * sódio; núcleo de metrópole satura e puxa para o branco. Interpolar entre as
 * duas pela intensidade é o que tira o aspecto de pontilhado carimbado.
 */
const LIGHT_COLOR_SMALL = new THREE.Color('#ff9e42');
const LIGHT_COLOR_LARGE = new THREE.Color('#fff4dc');

interface CityLightsProps {
  mode: GlobeMode;
  isPopupOpen: boolean;
}

const CityLights: FC<CityLightsProps> = ({ mode, isPopupOpen }) => {
  const { camera, size, gl } = useThree();
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const sunDirection = useMemo(() => sunDirectionForDate(new Date()), []);
  const lastSunUpdate = useRef(0);

  useEffect(() => {
    let cancelled = false;

    fetch(LIGHTS_URL)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buffer) => {
        if (cancelled || !buffer) return;

        const { count, lons, lats, intensities } = decodeLights(buffer);
        const positions = new Float32Array(count * 3);
        const strength = new Float32Array(count);
        const vector = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
          strength[i] = intensities[i] / 255;
          vector.copy(
            latLonToVector3(lats[i] / 100, lons[i] / 100, LIGHT_RADIUS),
          );
          positions[i * 3] = vector.x;
          positions[i * 3 + 1] = vector.y;
          positions[i * 3 + 2] = vector.z;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aIntensity', new THREE.BufferAttribute(strength, 1));
        setGeometry(geo);
      })
      .catch(() => {
        /* sem o arquivo de luzes o globo simplesmente fica sem elas */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection },
      uClockMode: { value: 0 },
      uZoomNight: { value: 0 },
      uTwilight: { value: new THREE.Vector2(TWILIGHT_START, TWILIGHT_END) },
      uColorSmall: { value: LIGHT_COLOR_SMALL },
      uColorLarge: { value: LIGHT_COLOR_LARGE },
      uScale: { value: 1 },
      uFarBoost: { value: 1 },
    }),
    [sunDirection],
  );

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;

    const now = performance.now();
    if (now - lastSunUpdate.current > SUN_UPDATE_INTERVAL_MS) {
      lastSunUpdate.current = now;
      sunDirection.copy(sunDirectionForDate(new Date()));
    }

    const perspective = camera as THREE.PerspectiveCamera;
    material.uniforms.uZoomNight.value =
      1 - zoomDaylight(perspective.position.length());

    // Mesma curva de troca de modo que o globo usa, para os dois andarem juntos.
    const target = mode === 'relogio' ? 1 : 0;
    const clock = material.uniforms.uClockMode;
    if (clock.value !== target) {
      const step = MODE_FADE_SPEED * delta;
      clock.value =
        target > clock.value
          ? Math.min(target, clock.value + step)
          : Math.max(target, clock.value - step);
    }

    // Tamanho do ponto em pixels reais, independente de tela e densidade.
    material.uniforms.uScale.value = size.height * gl.getPixelRatio() * 0.5;

    // De longe cada luz encolhe até o pixel mínimo e perde área — sem
    // compensar, o planeta inteiro apagaria justamente na vista mais bonita.
    // Perto o ganho volta a 1 para o contraste entre metrópole e cidadezinha
    // não se achatar.
    material.uniforms.uFarBoost.value = THREE.MathUtils.lerp(
      1,
      2.6,
      THREE.MathUtils.smoothstep(perspective.position.length(), 3, 10),
    );
  });

  if (!geometry || isPopupOpen) return null;

  return (
    <points geometry={geometry} renderOrder={3}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={`
          attribute float aIntensity;

          uniform vec3 uSunDirection;
          uniform float uClockMode;
          uniform float uZoomNight;
          uniform vec2 uTwilight;
          uniform float uScale;
          uniform float uFarBoost;

          varying float vBright;
          varying float vIntensity;

          void main() {
            // Quanto de noite existe NESTE ponto do globo.
            float sun = dot(normalize(position), normalize(uSunDirection));
            float clockNight = 1.0 - smoothstep(uTwilight.x, uTwilight.y, sun);
            float night = mix(uZoomNight, clockNight, uClockMode);

            // Expoente logo acima de 1: preserva o contraste entre o núcleo de
            // Tóquio e uma cidade do interior, sem apagar as fracas. Em 1.35 a
            // cauda inteira sumia e continentes com luz mais fraca (América do
            // Sul, África) ficavam vazios.
            vBright = pow(aIntensity, 1.05) * night * uFarBoost;
            vIntensity = aIntensity;

            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;

            // Crescimento ao QUADRADO da intensidade: a maioria fica em
            // pontinho miúdo e só os núcleos viram borrão maior, como a mancha
            // urbana aparece na foto. A base não pode ser pequena demais: com
            // 0.18 quase tudo grudava no mínimo de 1 pixel e sumia da tela.
            // Teto baixo de propósito: ponto grande com borda suave vira
            // mancha. Luz de cidade tem que ler como ponto, não como borrão.
            float size = (0.5 + aIntensity * aIntensity * 2.4)
                       * uScale * 0.005 / -mvPosition.z;
            gl_PointSize = clamp(size, 1.0, 5.5);
          }
        `}
        fragmentShader={`
          uniform vec3 uColorSmall;
          uniform vec3 uColorLarge;

          varying float vBright;
          varying float vIntensity;

          void main() {
            if (vBright < 0.015) discard;

            // Halo redondo desenhado por matemática, sem textura de sprite.
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;

            // Disco sólido com borda curta. A versão anterior usava
            // smoothstep(0.5, 0.0, d) — uma queda longa do centro até a borda,
            // ou seja, cada luz era um borrão. Aqui o miolo vai cheio até 0.34
            // e a borda apaga em 0.16 de raio: o suficiente para não serrilhar,
            // curto o bastante para o ponto ficar nítido.
            float core = 1.0 - smoothstep(0.34, 0.50, d);

            // Só as luzes fortes ganham um halo em volta — é o que diferencia
            // o núcleo de uma metrópole sem embaçar as milhares de pequenas.
            float halo = (1.0 - smoothstep(0.0, 0.5, d))
                       * smoothstep(0.62, 1.0, vIntensity) * 0.5;

            float glow = core + halo;

            // Laranja nas pequenas, quase branco nos grandes núcleos.
            vec3 tint = mix(uColorSmall, uColorLarge, smoothstep(0.35, 0.95, vIntensity));

            // Blending aditivo: passar de 1.0 é o que dá o estouro de luz.
            gl_FragColor = vec4(tint * glow * vBright * 2.1, glow * vBright);
          }
        `}
      />
    </points>
  );
};

export default CityLights;
