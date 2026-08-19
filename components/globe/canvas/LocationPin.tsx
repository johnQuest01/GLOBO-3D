// components/globe/canvas/LocationPin.tsx
'use client';

import React, { FC, useMemo, useRef } from 'react';
import { Billboard, RoundedBox, Text } from '@react-three/drei';
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { labelWorldScale, SPHERE_RADIUS, textEmWidth } from '@/app/lib/globeLabels';

/**
 * Pino de local: cone vermelho na superfície e um card azul com o nome.
 *
 * Duas coisas importam aqui.
 *
 * 1. TAMANHO FIXO EM TELA. O pino é desenhado em unidades locais e o grupo é
 *    escalado a cada quadro, então ele mede sempre os mesmos pixels — continua
 *    visível com a câmera longe, onde um pino de tamanho fixo no mundo viraria
 *    menos de um pixel e sumiria.
 *
 * 2. CUSTO POR PINO PRÓXIMO DE ZERO. A versão anterior usava `<Html occlude>`,
 *    que dispara um raycast contra a cena inteira a cada quadro para decidir se
 *    esconde o elemento do DOM. Com a esfera de 128x128, as fronteiras e as 27
 *    mil luzes, isso pesava por pino — e inviabilizava ter muitos. Aqui o card
 *    é geometria na GPU e a oclusão sai de um produto escalar: se o ponto está
 *    do outro lado do globo, o grupo fica invisível. É uma conta por pino, não
 *    uma travessia da cena.
 */

interface LocationPinProps {
  position: THREE.Vector3;
  name: string;
  onInfoClick: () => void;
}

/** Altura do pino em pixels de tela. */
const PIN_PX = 17;

/** Cores do pino e do card. */
const PIN_COLOR = '#ff0000';
const PIN_EMISSIVE = '#cc0000';
const CARD_COLOR = '#2563eb';
const CARD_HOVER = '#3b82f6';

// Geometrias e materiais compartilhados por TODOS os pinos: sem isto, cada
// pino alocaria os seus e o custo cresceria junto com a quantidade.
const coneGeometry = new THREE.ConeGeometry(0.21, 1, 14);
const ballGeometry = new THREE.SphereGeometry(0.26, 14, 14);
const pinMaterial = new THREE.MeshStandardMaterial({
  color: PIN_COLOR,
  emissive: PIN_EMISSIVE,
  emissiveIntensity: 0.6,
  metalness: 0.3,
  roughness: 0.4,
});

const LocationPin: FC<LocationPinProps> = ({ position, name, onInfoClick }) => {
  const groupRef = useRef<THREE.Group>(null!);
  const cardMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const { size } = useThree();

  // O cone nasce apontando para +Y; aqui ele passa a apontar para fora do globo.
  const quaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        position.clone().normalize(),
      ),
    [position],
  );

  const normal = useMemo(() => position.clone().normalize(), [position]);

  /** Largura do card a partir da largura real do texto, com folga nas laterais. */
  const cardWidth = useMemo(() => textEmWidth(name) * 0.62 + 0.7, [name]);

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;

    const perspective = camera as THREE.PerspectiveCamera;
    const cameraDistance = perspective.position.length();

    // Oclusão pelo horizonte da esfera: um ponto só aparece se a normal dele
    // passa de R/d. Substitui o raycast por um produto escalar.
    const facing = normal.dot(perspective.position) / cameraDistance;
    const visible = facing > SPHERE_RADIUS / cameraDistance;
    if (group.visible !== visible) group.visible = visible;
    if (!visible) return;

    group.scale.setScalar(
      labelWorldScale(
        perspective.position.distanceTo(position),
        PIN_PX,
        perspective.fov ?? 50,
        size.height,
      ),
    );
  });

  const handleClick = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onInfoClick();
  };

  const handleOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = 'pointer';
    if (cardMaterialRef.current) cardMaterialRef.current.color.set(CARD_HOVER);
  };

  const handleOut = () => {
    document.body.style.cursor = 'auto';
    if (cardMaterialRef.current) cardMaterialRef.current.color.set(CARD_COLOR);
  };

  return (
    <group ref={groupRef} position={position}>
      <group quaternion={quaternion}>
        <mesh geometry={coneGeometry} material={pinMaterial} />
        <mesh geometry={ballGeometry} material={pinMaterial} position={[0, 0.5, 0]} />
      </group>

      {/* O card fica sempre de frente para a câmera, acima do pino. */}
      <Billboard position={[0, 1.35, 0]}>
        <group
          onClick={handleClick}
          onPointerOver={handleOver}
          onPointerOut={handleOut}
        >
          <RoundedBox args={[cardWidth, 1, 0.02]} radius={0.22} smoothness={3}>
            <meshBasicMaterial
              ref={cardMaterialRef}
              color={CARD_COLOR}
              depthTest={false}
              toneMapped={false}
            />
          </RoundedBox>
          <Text
            position={[0, 0, 0.03]}
            fontSize={0.62}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            renderOrder={14}
          >
            {name}
            <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
          </Text>
        </group>
      </Billboard>
    </group>
  );
};

export default LocationPin;
