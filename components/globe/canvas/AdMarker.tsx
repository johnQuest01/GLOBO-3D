// components/globe/canvas/AdMarker.tsx
'use client';

import React, { FC } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { AdData } from '@/app/types/globe'; // Import the AdData type

interface AdMarkerProps {
  position: THREE.Vector3;
  adData: AdData;
}

const AdMarker: FC<AdMarkerProps> = ({ position, adData }) => {
  // Offset slightly above the surface
  const markerPosition = position.clone().multiplyScalar(1.01);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Open link in a new tab for security and better UX
    window.open(adData.websiteUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Html
      position={markerPosition}
      center
      distanceFactor={8} // Adjust size based on distance
      occlude // Hide when behind the globe
      zIndexRange={[10, 0]} // Render on top
      // Make the Html wrapper non-interactive, interaction is on the button inside
      className="pointer-events-none"
    >
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={(e) => e.stopPropagation()} // Prevent dragging the globe
        title={`Anúncio: ${adData.title}\nClique para visitar: ${adData.websiteUrl}`}
        // Enable pointer events ONLY for the button
        className="
          pointer-events-auto cursor-pointer
          flex flex-col items-center
          bg-black/70 backdrop-blur-sm
          rounded-lg shadow-lg overflow-hidden
          border border-yellow-500/80
          p-1.5 w-24 max-w-xs /* Adjust width as needed */
          transform transition-transform hover:scale-105
          focus:outline-none focus:ring-2 focus:ring-yellow-400
        "
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={adData.imageUrl}
          alt={`Anúncio: ${adData.title}`}
          className="w-full h-16 object-cover rounded-md" // Adjust height as needed
          // Basic error handling for image load failures
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.onerror = null; // prevent infinite loop
            target.src = 'https://placehold.co/100x64/1E293B/94A3B8?text=Ad+Error';
            target.alt = 'Erro ao carregar anúncio';
          }}
        />
        <h4 className="mt-1 text-xs font-semibold text-yellow-300 text-center line-clamp-2 leading-tight">
          {adData.title}
        </h4>
      </button>
    </Html>
  );
};

export default AdMarker;