import * as THREE from 'three';

import { SPHERE_RADIUS } from '@/app/lib/globeLabels';

/**
 * Arco de círculo máximo sobre a esfera — compartilhado.
 *
 * Estava dentro do Airplane.tsx, onde nasceu. Saiu de lá quando o arco de
 * conexão entre duas pessoas passou a precisar da MESMA curva: duas
 * implementações do mesmo arco divergem com o tempo, e aí a linha do voo e a
 * linha da conversa deixam de se parecer sem ninguém saber por quê.
 */

/**
 * Rota de círculo máximo — a mesma que a aviação comercial voa.
 *
 * Entre dois aeroportos, o caminho mais curto sobre a esfera é o arco de
 * círculo máximo, e é por isso que um voo São Paulo–Tóquio passa perto do
 * Ártico em vez de seguir reto no mapa plano. A interpolação é feita por
 * quaternion (rotação constante em torno do eixo comum), o que dá o arco exato
 * — a curva Catmull-Rom que havia aqui antes passava pelos pontos certos mas
 * saía do círculo máximo no meio do caminho.
 *
 * A altitude segue um seno: sobe, cruza no teto e desce.
 */
export function makeGreatCircleRoute(start: THREE.Vector3, end: THREE.Vector3) {
  const from = start.clone().normalize();
  const to = end.clone().normalize();

  // Antípodas não definem um plano: qualquer perpendicular serve de desempate.
  let axisQuaternion: THREE.Quaternion;
  if (from.dot(to) < -0.9999) {
    const fallback =
      Math.abs(from.y) > 0.9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3().crossVectors(from, fallback).normalize();
    axisQuaternion = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI);
  } else {
    axisQuaternion = new THREE.Quaternion().setFromUnitVectors(from, to);
  }

  // Distância angular: define o teto de cruzeiro, como numa rota real.
  const angle = from.angleTo(to);
  const cruiseAltitude = 0.06 + (angle / Math.PI) * 0.30;

  const identity = new THREE.Quaternion();
  const step = new THREE.Quaternion();

  return function pointAt(t: number, target: THREE.Vector3): THREE.Vector3 {
    step.slerpQuaternions(identity, axisQuaternion, t);
    target.copy(from).applyQuaternion(step);

    const altitude = cruiseAltitude * Math.sin(Math.PI * t);
    return target.multiplyScalar(SPHERE_RADIUS + altitude);
  };
}
