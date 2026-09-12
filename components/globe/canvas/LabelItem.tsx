// components/globe/canvas/LabelItem.tsx
'use client';

import React, { useRef, FC, useState, useMemo, useCallback } from 'react';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import {
  LabelLayer,
  labelWorldScale,
  reportMeasuredEmWidth,
} from '@/app/lib/globeLabels';

interface LabelItemProps {
  position: THREE.Vector3;
  displayName: string;
  /** Altura do texto em pixels de tela (constante em qualquer zoom). */
  fontPx: number;
  /**
   * Deslocamento do texto em relação ao ponto do lugar, em múltiplos do
   * fontSize. Vem do motor de colocação: quando o ponto exato já estava
   * ocupado, o nome foi aceito ao lado ou abaixo dele.
   */
  offsetEmX?: number;
  offsetEmY?: number;
  layer?: LabelLayer;
  /** `false` inicia o fade out; o pai remove o rótulo depois da animação. */
  visible?: boolean;
  onClick?: () => void;
  isClickable?: boolean;
}

const COLOR_HOVER = '#06B6D4';
const OUTLINE_COLOR_DEFAULT = '#000000';

/** Continente e país em tom levemente mais frio, como num atlas. */
const LAYER_COLOR: Record<LabelLayer, string> = {
  continent: '#E8F1FF',
  country: '#FFFFFF',
  state: '#E4E9F0',
  city: '#D8DEE8',
};

/** Velocidade do fade (unidades de opacidade por segundo). */
const FADE_SPEED = 7;

const LabelItem: FC<LabelItemProps> = ({
  position,
  displayName,
  fontPx,
  offsetEmX = 0,
  offsetEmY = 0,
  layer = 'country',
  visible = true,
  onClick,
  isClickable = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const scaleRef = useRef<THREE.Group>(null!);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null!);
  const opacityRef = useRef(0);
  const { size } = useThree();

  const textPosition = useMemo(
    () => position.clone().multiplyScalar(1.001),
    [position],
  );

  // O texto é desenhado com fontSize 1 e escalado para casar exatamente com o
  // tamanho em pixels que o motor de colisão usou para reservar o espaço.
  useFrame(({ camera }, delta) => {
    if (!scaleRef.current) return;

    const perspective = camera as THREE.PerspectiveCamera;
    scaleRef.current.scale.setScalar(
      labelWorldScale(
        perspective.position.distanceTo(textPosition),
        fontPx,
        perspective.fov ?? 50,
        size.height,
      ),
    );

    const target = visible ? 1 : 0;
    if (opacityRef.current !== target) {
      const step = FADE_SPEED * delta;
      opacityRef.current =
        target > opacityRef.current
          ? Math.min(target, opacityRef.current + step)
          : Math.max(target, opacityRef.current - step);

      if (materialRef.current) materialRef.current.opacity = opacityRef.current;
    }
  });

  /**
   * Assim que o troika desenha o texto sabemos a largura real dele. Devolver
   * essa medida ao motor faz a caixa de colisão do próximo quadro ser exata,
   * em vez de estimada.
   */
  const handleSync = useCallback(
    (troikaText: { textRenderInfo?: { blockBounds?: number[] } }) => {
      const bounds = troikaText?.textRenderInfo?.blockBounds;
      if (bounds) reportMeasuredEmWidth(displayName, bounds[2] - bounds[0]);
    },
    [displayName],
  );

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
    onClick?.();
  };

  const mainColor = isHovered ? COLOR_HOVER : LAYER_COLOR[layer];
  const outlineColor = isHovered ? COLOR_HOVER : OUTLINE_COLOR_DEFAULT;

  return (
    <group ref={scaleRef} position={textPosition}>
      <Billboard>
        {/* O deslocamento é aplicado DENTRO do billboard, então ele é sempre
            para o lado/para cima na tela — e não numa direção do mundo, que
            mudaria de sentido conforme o globo gira. Como o grupo de fora já
            está escalado para o texto medir `fontPx`, uma unidade aqui é
            exatamente uma altura de texto. */}
        <Text
          position={[offsetEmX, offsetEmY, 0]}
          fontSize={1}
          color={mainColor}
          anchorX="center"
          anchorY="middle"
          onSync={handleSync}
          onClick={isClickable ? handleClick : undefined}
          onPointerOver={isClickable ? handlePointerOver : undefined}
          onPointerOut={isClickable ? handlePointerOut : undefined}
          renderOrder={10}
          /*
           * O CONTORNO ENGROSSAVA O TEXTO. Ele existe para o nome continuar
           * legível sobre deserto claro e sobre mar escuro, e para isso não
           * precisa ser uma auréola opaca de 5,5% da altura da letra: nesse
           * tamanho ele se soma ao traço da fonte e o resultado lê como texto
           * em negrito e serrilhado.
           *
           * Mais fino e um pouco transparente resolve o mesmo problema sem
           * empastar a letra.
           */
          outlineWidth={0.035}
          outlineColor={outlineColor}
          outlineOpacity={0.85}
        >
          {displayName}
          <meshBasicMaterial
            ref={materialRef}
            color={mainColor}
            depthTest={false}
            transparent
            opacity={opacityRef.current}
          />
        </Text>
      </Billboard>
    </group>
  );
};

export default LabelItem;
