// components/globe/canvas/StateLabels.tsx
'use client';

import React, { FC, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import {
  useCombinedStateData,
  CountryLabelData,
  ProcessedStateLabel,
} from '@/app/hooks/useLabelData';
import LabelItem from './LabelItem';

// --- Constantes Padrão ---
const STATE_VISIBILITY_THRESHOLD = 2.5; //
const MAX_VISIBLE_STATES = 5; //
const DOT_PRODUCT_THRESHOLD = 0.1; //
const DEFAULT_STATE_FONT_SIZE = 0.018; //

// --- INÍCIO DA MODIFICAÇÃO (LÓGICA DE ALLOWLIST) ---
// Este Set contém as chaves (em inglês, como no geojson) dos países
// cujos RÓTULOS de estado você QUER EXIBIR.
// Todos os outros serão ocultados.
const COUNTRIES_TO_SHOW_STATES = new Set([
  'Brazil',
  'United States of America',
]);
// --- FIM DA MODIFICAÇÃO ---

// --- Tipagens (Inalteradas) ---
interface CountryLabelWithPosition extends CountryLabelData {
  position: THREE.Vector3;
}

export interface StateLabelsProps {
  visibleCountries: CountryLabelWithPosition[];
  cameraDistance: number;
  popupName: string | null;
  openPopup: (name: string) => void;
}

const StateLabels: FC<StateLabelsProps> = ({
  visibleCountries,
  cameraDistance,
  popupName,
  openPopup,
}) => {
  const { camera } = useThree();

  // 1. Hook busca TODOS os estados dos países visíveis (Inalterado)
  const { combinedStates, isLoading } = useCombinedStateData(visibleCountries);

  // 2. Estado para armazenar os estados filtrados (Inalterado)
  const [top5States, setTop5States] = useState<ProcessedStateLabel[]>([]);

  // 3. Efeito que recalcula o Top 5 (LÓGICA PRINCIPAL ATUALIZADA)
  useEffect(() => {
    // Se um popup está aberto, limpa os labels (Inalterado)
    if (popupName) {
      if (top5States.length > 0) {
        setTop5States([]);
      }
      return;
    }

    // Se não há estados carregados, limpa (Inalterado)
    if (combinedStates.length === 0) {
      if (top5States.length > 0) {
        setTop5States([]);
      }
      return;
    }

    // --- INÍCIO DA LÓGICA DE FILTRAGEM MODIFICADA ---

    // 1. Verifica se estamos perto o suficiente
    if (cameraDistance >= STATE_VISIBILITY_THRESHOLD) {
      if (top5States.length > 0) setTop5States([]);
      return;
    }

    // 2. Se estivermos perto, processa a filtragem
    const cameraDirection = camera.position.clone().normalize();

    const sortedVisibleStates = combinedStates
      // --- ETAPA DE MODIFICAÇÃO ---
      // Filtra (exibe) APENAS os estados que pertencem aos países na lista de exibição
      .filter(
        (state) => COUNTRIES_TO_SHOW_STATES.has(state.countryKey)
      )
      // --- FIM DA ETAPA DE MODIFICAÇÃO ---
      .map((state) => ({
        ...state,
        dotProduct: state.position.clone().normalize().dot(cameraDirection),
      }))
      .filter((state) => state.dotProduct > DOT_PRODUCT_THRESHOLD)
      .sort((a, b) => b.dotProduct - a.dotProduct)
      .slice(0, MAX_VISIBLE_STATES);

    // Se o resultado é o mesmo, evita re-renderização desnecessária
    const oldKeys = top5States.map((s) => s.key).join(',');
    const newKeys = sortedVisibleStates.map((s) => s.key).join(',');

    if (oldKeys !== newKeys) {
      setTop5States(sortedVisibleStates);
    }
    // --- FIM DA LÓGICA DE FILTRAGEM MODIFICADA ---
  }, [
    combinedStates,
    cameraDistance,
    camera.position,
    popupName,
    top5States,
  ]);

  if (isLoading || top5States.length === 0) {
    return null;
  }

  // 4. Renderiza os estados (Inalterado)
  return (
    <>
      {top5States.map((label) => (
        <LabelItem
          key={label.key}
          position={label.position}
          displayName={label.name}
          onClick={() => openPopup(label.key)}
          isClickable={true}
          fontSize={DEFAULT_STATE_FONT_SIZE}
        />
      ))}
    </>
  );
};

export default StateLabels;