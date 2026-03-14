// components/globe/canvas/LocationPin.tsx
'use client';

import React, { FC } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface LocationPinProps {
  position: THREE.Vector3;
  name: string;
  onInfoClick: () => void;
}

/**
 * Renderiza um "Pino" 3D vermelho em uma posição específica, com um botão
 * de <Html> flutuante que exibe o nome e abre o popup de informações.
 */
const LocationPin: FC<LocationPinProps> = ({ position, name, onInfoClick }) => {
  // Criamos um quaternion que rotaciona um objeto (cuja direção "para cima" é o eixo Y)
  // para que ele aponte para fora do centro do globo, alinhado com o vetor de posição.
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), // O vetor "para cima" padrão do cone
    position.clone().normalize(), // O vetor de direção para onde queremos apontar
  );

  return (
    // O grupo principal é posicionado no local exato na superfície do globo
    <group position={position}>
      {/* Este grupo interno aplica a rotação para que o cone "aponte para cima" */}
      <group quaternion={quaternion}>
        {/* O Cone (o pino) */}
        <mesh>
          <coneGeometry args={[0.015, 0.07, 16]} />
          <meshStandardMaterial
            color="#ff0000"
            emissive="#cc0000"
            emissiveIntensity={0.6}
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>
        {/* A esfera na ponta do pino */}
        <mesh position={[0, 0.035, 0]}>
          <sphereGeometry args={[0.018, 16, 16]} />
          <meshStandardMaterial
            color="#ff0000"
            emissive="#cc0000"
            emissiveIntensity={0.6}
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>

        {/* Botão de Informação (Nome do Local) */}
        <Html position={[0, 0.06, 0]} center occlude>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInfoClick();
            }}
            onPointerDown={(e) => e.stopPropagation()} // Impede o drag do globo
            className="px-2 py-0.5 bg-blue-600 text-white text-xs font-bold rounded shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 whitespace-nowrap"
            title={`Ver informações sobre ${name}`}
          >
            {name}
          </button>
        </Html>
      </group>
    </group>
  );
};

export default LocationPin;
