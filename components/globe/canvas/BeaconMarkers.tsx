'use client';

import { Billboard, RoundedBox, Text } from '@react-three/drei';
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import React, { FC, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { labelWorldScale, SPHERE_RADIUS, textEmWidth } from '@/app/lib/globeLabels';
import { latLonToVector3 } from '@/components/lib/utils';
import type { Beacon } from '@/realtime/shared/protocol';

/**
 * Os sinais de quem está disponível para conversar.
 *
 * DUAS DECISÕES DE DESEMPENHO, herdadas do LocationPin:
 *
 * 1. Geometria e material são compartilhados por TODOS os beacons. Cada um
 *    alocar os seus faria o custo crescer junto com a quantidade — e beacon é
 *    feito para haver muitos.
 *
 * 2. A oclusão é um produto escalar, não um raycast. O `CustomMarker` que já
 *    existe no projeto usa `<Html occlude>`, que dispara um raycast contra a
 *    cena inteira a cada quadro e por marcador. Com a esfera de 128x128, as
 *    fronteiras e as 27 mil luzes, isso pesa por beacon. Aqui, se o ponto está
 *    do outro lado do globo, o grupo fica invisível — uma conta, não uma
 *    travessia da cena.
 *
 * O PULSO é escala, não material novo: mexer em `scale` não recompila shader
 * nem cria alocação por quadro.
 */

interface Props {
  beacons: Beacon[];
  /** Para não desenhar (nem deixar clicar) o próprio sinal como convite. */
  meuClientId: string;
  onPedirConexao: (clientId: string) => void;
}

const PX = 14;
const COR = '#22d3ee';
const COR_HOVER = '#67e8f9';
const CARD_RENDER_ORDER = 22;

// Compartilhados entre todos os marcadores.
const geoAnel = new THREE.TorusGeometry(0.5, 0.12, 8, 24);
const geoNucleo = new THREE.SphereGeometry(0.22, 12, 12);
const matSinal = new THREE.MeshStandardMaterial({
  color: COR,
  emissive: COR,
  emissiveIntensity: 0.9,
  metalness: 0.1,
  roughness: 0.5,
});

const BeaconMarkers: FC<Props> = ({ beacons, meuClientId, onPedirConexao }) => {
  if (beacons.length === 0) return null;
  return (
    <>
      {beacons.map((b) => (
        <BeaconMarker
          key={b.beaconId}
          beacon={b}
          ehMeu={b.clientId === meuClientId}
          onPedirConexao={onPedirConexao}
        />
      ))}
    </>
  );
};

const BeaconMarker: FC<{
  beacon: Beacon;
  ehMeu: boolean;
  onPedirConexao: (clientId: string) => void;
}> = ({ beacon, ehMeu, onPedirConexao }) => {
  const grupo = useRef<THREE.Group>(null!);
  const anel = useRef<THREE.Mesh>(null!);
  const corCard = useRef<THREE.MeshBasicMaterial>(null);
  const { size } = useThree();

  const posicao = useMemo(
    () => latLonToVector3(beacon.lat, beacon.lon, SPHERE_RADIUS * 1.004),
    [beacon.lat, beacon.lon],
  );
  const normal = useMemo(() => posicao.clone().normalize(), [posicao]);
  const quaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
    [normal],
  );

  const rotulo = ehMeu ? 'seu sinal' : (beacon.topic ?? 'quer conversar');
  const largura = useMemo(() => textEmWidth(rotulo) * 0.62 + 0.8, [rotulo]);

  useFrame(({ camera, clock }) => {
    const g = grupo.current;
    if (!g) return;

    const cam = camera as THREE.PerspectiveCamera;
    const distancia = cam.position.length();

    // Do outro lado do planeta: não desenha.
    const frente = normal.dot(cam.position) / distancia;
    const visivel = frente > SPHERE_RADIUS / distancia;
    if (g.visible !== visivel) g.visible = visivel;
    if (!visivel) return;

    g.scale.setScalar(
      labelWorldScale(cam.position.distanceTo(posicao), PX, cam.fov ?? 50, size.height),
    );

    // Pulso lento: chama atenção sem virar pisca-pisca.
    if (anel.current) {
      const p = 1 + Math.sin(clock.elapsedTime * 2) * 0.18;
      anel.current.scale.set(p, p, 1);
    }
  });

  const clicar = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (ehMeu) return;
    onPedirConexao(beacon.clientId);
  };

  return (
    <group ref={grupo} position={posicao}>
      <group quaternion={quaternion}>
        <mesh ref={anel} geometry={geoAnel} material={matSinal} />
        <mesh geometry={geoNucleo} material={matSinal} />
      </group>

      <Billboard position={[0, 1.1, 0]}>
        <group
          onClick={clicar}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (ehMeu) return;
            document.body.style.cursor = 'pointer';
            corCard.current?.color.set(COR_HOVER);
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto';
            corCard.current?.color.set(COR);
          }}
        >
          <RoundedBox
            args={[largura, 1, 0.02]}
            radius={0.22}
            smoothness={3}
            renderOrder={CARD_RENDER_ORDER}
          >
            <meshBasicMaterial
              ref={corCard}
              color={COR}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </RoundedBox>
          <Text
            position={[0, 0, 0.04]}
            fontSize={0.55}
            color="#062a30"
            anchorX="center"
            anchorY="middle"
            renderOrder={CARD_RENDER_ORDER + 1}
          >
            {rotulo}
            <meshBasicMaterial
              color="#062a30"
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </Text>
        </group>
      </Billboard>
    </group>
  );
};

export default BeaconMarkers;
