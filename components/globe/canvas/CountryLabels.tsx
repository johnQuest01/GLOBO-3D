// components/globe/canvas/CountryLabels.tsx
'use client';

import React, { FC } from 'react';
import * as THREE from 'three';
import LabelItem from './LabelItem';

// Interface do hook useLabelData
interface CountryLabelData {
  name: string; // Nome traduzido (ex: "Brasil")
  key: string;  // Chave original (ex: "Brazil")
  lat: number;
  lon: number;
  // --- INÍCIO DA MODIFICAÇÃO ---
  // A interface já espera o continente, que o script agora fornece
  continent: string;
  // --- FIM DA MODIFICAÇÃO ---
}

// Tipo interno
type LabelWithPosition = CountryLabelData & { position: THREE.Vector3 };

// --- Props Atualizadas ---
interface CountryLabelsProps {
  visibleLabels: LabelWithPosition[]; // Recebe os labels JÁ FILTRADOS
  openPopup: (nameKey: string) => void;
}

const CountryLabels: FC<CountryLabelsProps> = ({
  visibleLabels,
  openPopup,
}) => {
  return (
    <>
      {visibleLabels.map((label) => {
        // A CHAVE para o popup é a chave original (ex: "Brazil")
        const nameKey = label.key;
        // O NOME de exibição é o traduzido (ex: "Brasil")
        const displayName = label.name;

        return (
          <LabelItem
            key={nameKey}
            position={label.position}
            displayName={displayName}
            onClick={() => openPopup(nameKey)} // <-- CORRIGIDO: Usa a 'key'
            isClickable={true}
            // --- INÍCIO DA MODIFICAÇÃO ---
            // Passa o continente para o LabelItem
            continent={label.continent}
            // --- FIM DA MODIFICAÇÃO ---
          />
        );
      })}
    </>
  );
};

export default CountryLabels;