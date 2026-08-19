'use client';

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Billboard, Text, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { labelWorldScale } from '@/app/lib/globeLabels';

interface AirplaneProps {
  startVec: THREE.Vector3;
  endVec: THREE.Vector3;
  onFlightComplete?: () => void;
}

const SPHERE_RADIUS = 1.5;
const FLIGHT_SPEED = 0.05;
/** Pontos do rastro. A geometria é criada UMA vez com todos eles. */
const LINE_POINTS = 220;
const LOOP_DELAY_DURATION = 1.5;

/**
 * Altura do texto do card em pixels de tela. O card acompanha o aviao mas nao
 * cresce com o zoom — o mesmo tratamento que os rotulos do globo recebem.
 */
const CARD_TEXT_PX = 12;

/**
 * Deslocamento do card em relacao ao aviao, nas unidades do grupo do aviao
 * (que o `lookAt` ja orientou na direcao do voo). O -Z coloca o card adiantado
 * sobre a propria linha da rota, e nao em cima da fuselagem.
 */
const CARD_OFFSET: [number, number, number] = [0, 0.05, -0.2];

const stylishAirplaneMaterial = new THREE.MeshStandardMaterial({
  color: 'white',
  metalness: 0,
  roughness: 0,
  emissive: 'white',
  emissiveIntensity: 0.3,
});

const AirplaneModel: React.FC = () => {
  const { scene } = useGLTF('/models/airplane.glb');
  const model = useMemo(() => scene.clone(), [scene]);

  useEffect(() => {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = stylishAirplaneMaterial;
      }
    });
  }, [model]);

  return <primitive object={model} />;
};

useGLTF.preload('/models/airplane.glb');

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
function makeGreatCircleRoute(start: THREE.Vector3, end: THREE.Vector3) {
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

const Airplane: React.FC<AirplaneProps> = ({
  startVec,
  endVec,
  onFlightComplete,
}) => {
  const airplaneRef = useRef<THREE.Group>(null!);
  const labelRef = useRef<THREE.Group>(null!);
  const { size } = useThree();

  // Progresso em ref, não em state: animar com setState provocava um
  // re-render de React a cada quadro, que era o gargalo da viagem.
  const progressRef = useRef(0);
  const delayRef = useRef(0);
  const completedRef = useRef(false);

  const pointAt = useMemo(
    () => makeGreatCircleRoute(startVec, endVec),
    [startVec, endVec],
  );

  /**
   * O rastro é UMA geometria com todos os pontos, criada uma vez. Crescer o
   * traço é só mover o `drawRange` — sem realocar array nem reconstruir
   * geometria a cada quadro, que era o que travava.
   */
  const trailGeometry = useMemo(() => {
    const positions = new Float32Array((LINE_POINTS + 1) * 3);
    const point = new THREE.Vector3();

    for (let i = 0; i <= LINE_POINTS; i++) {
      pointAt(i / LINE_POINTS, point);
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);
    return geometry;
  }, [pointAt]);

  useEffect(() => () => trailGeometry.dispose(), [trailGeometry]);

  const position = useMemo(() => new THREE.Vector3(), []);
  const tangent = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }, delta) => {
    if (!airplaneRef.current) return;

    if (progressRef.current >= 1) {
      delayRef.current += delta;
      if (delayRef.current > LOOP_DELAY_DURATION) {
        progressRef.current = 0;
        delayRef.current = 0;
        completedRef.current = false;
        trailGeometry.setDrawRange(0, 0);
      }
      return;
    }

    progressRef.current = Math.min(progressRef.current + delta * FLIGHT_SPEED, 1);
    const t = progressRef.current;

    pointAt(t, position);
    airplaneRef.current.position.copy(position);

    // Aponta o nariz para onde a rota segue.
    pointAt(Math.min(t + 0.002, 1), tangent);
    airplaneRef.current.up.copy(position).normalize();
    airplaneRef.current.lookAt(tangent);

    trailGeometry.setDrawRange(0, Math.ceil(t * LINE_POINTS) + 1);

    // Card com tamanho constante em tela, pela mesma conta dos rótulos.
    if (labelRef.current) {
      const perspective = camera as THREE.PerspectiveCamera;
      labelRef.current.scale.setScalar(
        labelWorldScale(
          perspective.position.distanceTo(position),
          CARD_TEXT_PX,
          perspective.fov ?? 50,
          size.height,
        ),
      );
    }

    if (t >= 1 && !completedRef.current) {
      completedRef.current = true;
      onFlightComplete?.();
    }
  });

  return (
    <group>
      <group ref={airplaneRef}>
        <group rotation={[0, Math.PI, 0]} scale={0.12}>
          <AirplaneModel />
        </group>

        {/* O mesmo card branco de antes, agora desenhado na GPU em vez de
            <Html occlude> — que fazia raycast contra a cena e sincronizava um
            elemento do DOM a cada quadro. Acompanha o avião e mantém tamanho
            constante em tela. */}
        <group ref={labelRef} position={CARD_OFFSET}>
          <Billboard>
            {/* Medidas em múltiplos da altura do texto (fontSize 1), para o
                card manter a proporção seja qual for o tamanho em tela. */}
            <RoundedBox args={[2.6, 1.5, 0.02]} radius={0.32} smoothness={3}>
              <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
            </RoundedBox>
            <Text
              position={[0, 0, 0.03]}
              fontSize={1}
              color="#dc2626"
              anchorX="center"
              anchorY="middle"
              renderOrder={12}
            >
              GOL
              <meshBasicMaterial color="#dc2626" depthTest={false} toneMapped={false} />
            </Text>
          </Billboard>
        </group>
      </group>

      <line
        // @ts-expect-error -- three.js aceita geometry como prop nativa aqui
        geometry={trailGeometry}
      >
        <lineBasicMaterial
          color="#00FFFF"
          transparent
          opacity={0.65}
          depthWrite={false}
        />
      </line>
    </group>
  );
};

export default Airplane;
