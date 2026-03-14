// components/globe/canvas/Explosion.tsx
'use client';

import React, { FC } from 'react';
import { Html } from '@react-three/drei';

interface ExplosionProps {
  scale?: number;
  onComplete: () => void;
}

/**
 * Renderiza uma animação de explosão 2D em CSS
 * posicionada no mundo 3D usando <Html>.
 */
const Explosion: FC<ExplosionProps> = ({ scale = 1.0, onComplete }) => {
  return (
    <Html center>
      <div
        className="explosion"
        style={{ transform: `scale(${scale})` }}
        // Quando a animação CSS (de 0.5s) terminar, chama o onComplete
        onAnimationEnd={onComplete}
      />
    </Html>
  );
};

export default Explosion;