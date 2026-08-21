'use client';

import { useFrame } from '@react-three/fiber';
import React, { FC, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { makeGreatCircleRoute } from '@/components/lib/greatCircle';

/**
 * A linha entre as duas pessoas que estão conversando.
 *
 * USA O MESMO ARCO DO AVIÃO. O `makeGreatCircleRoute` saiu do Airplane.tsx e
 * virou helper compartilhado justamente para isto: duas implementações do
 * mesmo arco divergem com o tempo, e a linha da conversa passaria a ter uma
 * curvatura diferente da linha do voo sem ninguém entender por quê.
 *
 * A geometria é criada UMA vez, com todos os pontos. O que anima é a opacidade
 * e um brilho que corre pela linha — nada é realocado por quadro. Recriar a
 * geometria a cada quadro é o erro que trava um globo.
 *
 * O arco some quando a conversa acaba porque o componente é desmontado pelo
 * pai. A geometria é liberada no cleanup: linha órfã na GPU é vazamento.
 */

interface Props {
  de: THREE.Vector3;
  para: THREE.Vector3;
  /** Enquanto a conexão ainda não fechou, a linha fica mais apagada. */
  ativa?: boolean;
}

const PONTOS = 128;
const COR = new THREE.Color('#22d3ee');

const ConnectionArc: FC<Props> = ({ de, para, ativa = true }) => {
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const opacidadeRef = useRef(0);

  const geometria = useMemo(() => {
    const pointAt = makeGreatCircleRoute(de, para);
    const posicoes = new Float32Array((PONTOS + 1) * 3);
    const ponto = new THREE.Vector3();

    for (let i = 0; i <= PONTOS; i++) {
      pointAt(i / PONTOS, ponto);
      posicoes[i * 3] = ponto.x;
      posicoes[i * 3 + 1] = ponto.y;
      posicoes[i * 3 + 2] = ponto.z;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
    return g;
  }, [de, para]);

  useEffect(() => () => geometria.dispose(), [geometria]);

  useFrame((_, delta) => {
    const m = materialRef.current;
    if (!m) return;

    // Entra suave em vez de aparecer de uma vez.
    const alvo = ativa ? 0.85 : 0.35;
    if (opacidadeRef.current !== alvo) {
      const passo = 2 * delta;
      opacidadeRef.current =
        alvo > opacidadeRef.current
          ? Math.min(alvo, opacidadeRef.current + passo)
          : Math.max(alvo, opacidadeRef.current - passo);
      m.opacity = opacidadeRef.current;
    }
  });

  return (
    <line
      // @ts-expect-error -- three.js aceita geometry como prop nativa aqui
      geometry={geometria}
      renderOrder={4}
    >
      <lineBasicMaterial
        ref={materialRef}
        color={COR}
        transparent
        opacity={0}
        depthWrite={false}
      />
    </line>
  );
};

export default ConnectionArc;
