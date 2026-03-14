// components/globe/ui/CustomMarker.tsx
'use client';

import { Html } from '@react-three/drei';
import React from 'react';

interface CustomMarkerProps {
  position: [number, number, number]; // A posição [x, y, z] no globo
  imageUrl: string;
  title: string;
  onClick: () => void; // Mantém a prop de clique
}

export function CustomMarker({
  position,
  imageUrl,
  title,
  onClick,
}: CustomMarkerProps) {
  return (
    <Html
      position={position}
      center
      distanceFactor={10} 
      occlude
      className="pointer-events-none" // O wrapper do Html NÃO é clicável
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        // O botão É clicável
        className="pointer-events-auto bg-transparent border-none p-0 m-0 cursor-pointer focus:outline-none"
        title={`Ver detalhes de ${title}`}
      >
        {/* Container principal: Reduzido para w-8 (32px) */}
        <div className="flex flex-col items-center w-8">
          
          {/* 1. O Título HTML: Reduzido para text-[5px] (extremamente pequeno) */}
          <h3 className="text-[5px] leading-tight font-bold text-white bg-black/60 px-1 py-0.5 rounded-full shadow-lg whitespace-nowrap">
            {title}
          </h3>

          {/* 2. A Imagem PNG: Reduzida para w-2 h-2 (8px) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={title}
            className="w-2 h-2 object-contain drop-shadow-lg mt-0.5"
          />
        </div>
      </button>
    </Html>
  );
}