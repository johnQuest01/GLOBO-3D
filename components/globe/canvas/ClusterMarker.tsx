// components/globe/canvas/ClusterMarker.tsx
'use client';

import React, { FC } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface ClusterMarkerProps {
  position: THREE.Vector3;
  count: number;
}

/**
 * Componente que renderiza um marcador de cluster (agrupamento) do Supercluster.
 * Exibe a contagem de pontos agrupados.
 */
const ClusterMarker: FC<ClusterMarkerProps> = ({ position, count }) => {
  // Ajusta o tamanho e a opacidade com base na contagem
  // O tamanho começa em 24px e cresce até 64px
  const size = Math.min(24 + count * 0.1, 64);
  // A opacidade começa em 0.7 e cresce até 1.0
  const opacity = Math.min(0.7 + count * 0.01, 1);
  
  // Formata a contagem (ex: 1200 -> 1.2k)
  let countDisplay: string = count.toString();
  if (count > 1000) {
    countDisplay = `${(count / 1000).toFixed(1)}k`;
  }

  return (
    <Html 
      position={position} 
      center 
      occlude // Oculta o cluster se estiver atrás do globo
      // Impede que o cluster bloqueie o raycast para os labels
      // style={{ pointerEvents: 'none' }} 
      // Em vez de style, usamos a className para o Html
      className="pointer-events-none"
    >
      <div
        className="text-white rounded-full flex items-center justify-center font-bold text-xs sm:text-sm border-2 border-white/50 transition-all duration-150"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: `rgba(29, 78, 216, ${opacity})`, // bg-blue-700 com opacidade
          // pointerEvents: 'none', // Redundante, já que o wrapper <Html> tem
        }}
        title={`${count} locais agrupados`}
      >
        {countDisplay}
      </div>
    </Html>
  );
};

export default ClusterMarker;