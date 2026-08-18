'use client';

import { FC, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { latLonToVector3 } from '@/components/lib/utils';
import {
  SPHERE_RADIUS,
  STATE_LAYER_ZOOM,
  viewZoom,
} from '@/app/lib/globeLabels';

/**
 * Fronteiras desenhadas como linhas de verdade, e não pintadas dentro da
 * textura. Duas consequências: a espessura fica igual em qualquer zoom, e a
 * imagem do globo volta a ser só satélite.
 *
 * O custo aqui não são os vértices (10 mil é nada para a GPU) — é o número de
 * draw calls. Por isso os 289 anéis de país viram UM único `LineSegments`
 * mesclado. Uma malha, uma chamada de desenho, por camada.
 */

const COUNTRIES_URL = '/data/borders-countries.json';
const STATES_URL = '/data/borders-states.json';

/**
 * A esfera tem 64 segmentos, então a superfície é levemente facetada. A linha
 * precisa flutuar acima dessa faceta para não ser engolida por ela — mas pouco,
 * senão descola do globo na silhueta.
 */
const COUNTRY_RADIUS = SPHERE_RADIUS * 1.0025;
const STATE_RADIUS = SPHERE_RADIUS * 1.002;

// Tons dessaturados e opacidade baixa: a fronteira é referência, não o
// assunto. Ela precisa deixar ler o país sem competir com os nomes nem com as
// luzes das cidades.
const COUNTRY_COLOR = '#9fb8cc';
const STATE_COLOR = '#7c8b9c';

const COUNTRY_OPACITY = 0.30;
const STATE_OPACITY = 0.16;

/** Velocidade do fade das fronteiras estaduais (opacidade por segundo). */
const FADE_SPEED = 2.5;

interface BorderData {
  rings: number[][];
}

/**
 * Converte os anéis em um único buffer de segmentos de linha.
 * Cada par de pontos vizinhos do anel vira um segmento (A→B, B→C, ...).
 */
function buildLineGeometry(
  rings: number[][],
  radius: number,
): THREE.BufferGeometry {
  let segmentCount = 0;
  for (const ring of rings) {
    segmentCount += Math.max(0, ring.length / 2 - 1);
  }

  const positions = new Float32Array(segmentCount * 6);
  const vector = new THREE.Vector3();
  let offset = 0;

  for (const ring of rings) {
    const pointCount = ring.length / 2;
    for (let i = 0; i < pointCount - 1; i++) {
      for (const index of [i, i + 1]) {
        const lon = ring[index * 2];
        const lat = ring[index * 2 + 1];
        vector.copy(latLonToVector3(lat, lon, radius));
        positions[offset++] = vector.x;
        positions[offset++] = vector.y;
        positions[offset++] = vector.z;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

/** Cada arquivo é buscado uma vez por sessão. */
const borderCache = new Map<string, Promise<BorderData | null>>();

function loadBorders(url: string): Promise<BorderData | null> {
  const cached = borderCache.get(url);
  if (cached) return cached;

  const request = fetch(url)
    .then((res) => (res.ok ? (res.json() as Promise<BorderData>) : null))
    .catch(() => null);

  borderCache.set(url, request);
  return request;
}

interface GlobeBordersProps {
  /** Fronteiras somem junto com o resto quando um popup abre. */
  isPopupOpen: boolean;
}

const GlobeBorders: FC<GlobeBordersProps> = ({ isPopupOpen }) => {
  const { camera, size } = useThree();

  const [countryGeometry, setCountryGeometry] =
    useState<THREE.BufferGeometry | null>(null);
  const [stateGeometry, setStateGeometry] =
    useState<THREE.BufferGeometry | null>(null);
  const [statesRequested, setStatesRequested] = useState(false);

  const stateMaterialRef = useRef<THREE.LineBasicMaterial>(null);
  const stateOpacityRef = useRef(0);
  const wantStatesRef = useRef(false);

  // Fronteiras de país: sempre presentes, carregadas de imediato.
  useEffect(() => {
    let cancelled = false;
    loadBorders(COUNTRIES_URL).then((data) => {
      if (cancelled || !data) return;
      setCountryGeometry(buildLineGeometry(data.rings, COUNTRY_RADIUS));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fronteiras de estado: 1,7 MB, só baixam quando o zoom chega na camada.
  useEffect(() => {
    if (!statesRequested) return;
    let cancelled = false;
    loadBorders(STATES_URL).then((data) => {
      if (cancelled || !data) return;
      setStateGeometry(buildLineGeometry(data.rings, STATE_RADIUS));
    });
    return () => {
      cancelled = true;
    };
  }, [statesRequested]);

  // Libera a memória de GPU ao desmontar.
  useEffect(
    () => () => {
      countryGeometry?.dispose();
      stateGeometry?.dispose();
    },
    [countryGeometry, stateGeometry],
  );

  useFrame((_, delta) => {
    const perspective = camera as THREE.PerspectiveCamera;
    const zoom = viewZoom(
      perspective.position.length(),
      perspective.fov ?? 50,
      size.height,
    );

    const wantStates = !isPopupOpen && zoom >= STATE_LAYER_ZOOM;
    if (wantStates !== wantStatesRef.current) {
      wantStatesRef.current = wantStates;
      if (wantStates && !statesRequested) setStatesRequested(true);
    }

    const target = wantStates && stateGeometry ? STATE_OPACITY : 0;
    if (stateOpacityRef.current !== target) {
      const step = FADE_SPEED * delta * STATE_OPACITY;
      stateOpacityRef.current =
        target > stateOpacityRef.current
          ? Math.min(target, stateOpacityRef.current + step)
          : Math.max(target, stateOpacityRef.current - step);
      if (stateMaterialRef.current) {
        stateMaterialRef.current.opacity = stateOpacityRef.current;
      }
    }
  });

  if (isPopupOpen) return null;

  return (
    <>
      {stateGeometry && (
        <lineSegments geometry={stateGeometry} renderOrder={1}>
          <lineBasicMaterial
            ref={stateMaterialRef}
            color={STATE_COLOR}
            transparent
            opacity={stateOpacityRef.current}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {countryGeometry && (
        <lineSegments geometry={countryGeometry} renderOrder={2}>
          <lineBasicMaterial
            color={COUNTRY_COLOR}
            transparent
            opacity={COUNTRY_OPACITY}
            depthWrite={false}
          />
        </lineSegments>
      )}
    </>
  );
};

export default GlobeBorders;
