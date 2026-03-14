// components/globe/canvas/LabelItem.tsx
'use client';

import React, { useRef, FC, useState, useMemo } from 'react';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';

// --- Tipagens (Inalteradas) ---
interface LabelItemProps {
  position: THREE.Vector3;
  displayName: string;
  onClick?: () => void;
  isClickable?: boolean;
  fontSize?: number;
  continent?: string;
}

// --- Constantes (Inalteradas) ---
const FONT_SIZE_DEFAULT = 0.04;
const FONT_SIZE_AFRICA = 0.025;
const FONT_SIZE_SMALL_COUNTRY = 0.02;
const COLOR_DEFAULT = '#FFFFFF'; // O texto continua branco
const COLOR_HOVER = '#06B6D4';
// --- NOVA CONSTANTE PARA O CONTORNO ---
const OUTLINE_COLOR_DEFAULT = '#000000'; // O contorno será preto

// --- Componente (Inalterado) ---
const LabelItem: FC<LabelItemProps> = ({
  position,
  displayName,
  onClick,
  isClickable = false,
  fontSize,
  continent,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const textRef = useRef<THREE.Mesh>(null!);

  const textPosition = position.clone().multiplyScalar(1.001);

  // --- Handlers de Interação (Inalterados) ---
  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (!isClickable) return;
    e.stopPropagation();
    setIsHovered(true);
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = () => {
    if (!isClickable) return;
    setIsHovered(false);
    document.body.style.cursor = 'auto';
  };

  const handleClick = (e: ThreeEvent<PointerEvent>) => {
    if (!isClickable) return;
    e.stopPropagation();
    if (onClick) {
      onClick();
    }
  };

  // --- LÓGICA DE FONT-SIZE (Inalterada) ---
  const finalFontSize = useMemo(() => {
    if (fontSize) {
      return fontSize;
    }
    if (
      displayName === 'Espanha' ||
      displayName === 'Portugal' ||
      displayName === 'Israel' ||
      displayName === 'Palestina' ||
      displayName === 'Palestine' ||
      displayName === 'Egito' ||
      displayName === 'Jordânia' ||
      displayName === 'Jordan' ||
      displayName === 'Síria' ||
      displayName === 'Líbano' ||
      displayName === 'Lebanon' ||
      displayName === 'Cyprus' ||
      displayName === 'Itália' ||
      displayName === 'Italia' ||
      displayName === 'Austrália' ||
      displayName === 'Australia' ||
      displayName === 'Croácia' ||
      displayName === 'Croatia' ||
      displayName === 'Slovenia' ||
      displayName === 'França' ||
      displayName === 'France' ||
      displayName === 'Ucrânia' ||
      displayName === 'Ukraine' ||
      displayName === 'Bélgica' ||
      displayName === 'Belgium' ||
      displayName === 'Luxemburgo' ||
      displayName === 'Luxembourg' ||
      displayName === 'Suíça' ||
      displayName === 'Switzerland' ||
      displayName === 'Chéquia' ||
      displayName === 'Czechia'
    ) {
      return FONT_SIZE_SMALL_COUNTRY;
    }
    if (continent === 'Africa') {
      if (displayName === 'África' || displayName === 'Africa') {
        return FONT_SIZE_DEFAULT;
      }
      return FONT_SIZE_AFRICA;
    }
    return FONT_SIZE_DEFAULT;
  }, [fontSize, continent, displayName]);

  // --- LÓGICA DE COR (ATUALIZADA) ---
  // Define a cor principal (fill) e a cor do contorno
  const mainColor = isHovered ? COLOR_HOVER : COLOR_DEFAULT;
  const outlineColor = isHovered ? COLOR_HOVER : OUTLINE_COLOR_DEFAULT;

  // --- Renderização (ATUALIZADA) ---
  return (
    <Billboard position={textPosition}>
      <Text
        ref={textRef}
        fontSize={finalFontSize}
        color={mainColor} // Cor principal (branco ou ciano)
        anchorX="center"
        anchorY="middle"
        onClick={isClickable ? handleClick : undefined}
        onPointerOver={isClickable ? handlePointerOver : undefined}
        onPointerOut={isClickable ? handlePointerOut : undefined}
        renderOrder={10}

        // --- INÍCIO DAS ALTERAÇÕES DE VISIBILIDADE ---

        // 1. ADICIONA UM CONTORNO PRETO
        // (O tamanho é relativo ao fontSize, então 0.05 é 5% do tamanho da fonte)
        outlineWidth={finalFontSize * 0.05} 
        outlineColor={outlineColor} // Usa preto por padrão, ciano no hover
        outlineOpacity={1} // Contorno totalmente opaco

        // --- FIM DAS ALTERAÇÕES DE VISIBILIDADE ---
      >
        {displayName}
        <meshBasicMaterial
          color={mainColor} // Garante que o material interno acompanhe o hover
          depthTest={false}
          transparent
          
          // --- ALTERAÇÃO DE OPACIDADE ---
          opacity={1.0} // Alterado de 0.8 para 1.0 para opacidade total
          // --- FIM DA ALTERAÇÃO ---
        />
      </Text>
    </Billboard>
  );
};

export default LabelItem;