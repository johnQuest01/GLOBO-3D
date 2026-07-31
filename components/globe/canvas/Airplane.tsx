'use client';

import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Airline, DEFAULT_AIRLINE } from '@/components/globe/config/airlines';

interface AirplaneProps {
  startVec: THREE.Vector3;
  endVec: THREE.Vector3;
  onFlightComplete?: () => void;
  airline?: Airline;
  // Atraso inicial (em segundos) — usado pela frota de marketing para
  // escalonar as decolagens e evitar que todos partam ao mesmo tempo.
  startDelay?: number;
}

const SPHERE_RADIUS = 1.5;
const FLIGHT_SPEED = 0.05;
const LINE_POINTS = 200;
const LOOP_DELAY_DURATION = 1.5;

/**
 * Componente que carrega o modelo 3D do avião e o pinta com a cor da companhia.
 */
const AirplaneModel: React.FC<{ color: string }> = ({ color }) => {
  const { scene } = useGLTF('/models/airplane.glb');

  const model = useMemo(() => scene.clone(), [scene]);

  // Material próprio por companhia (cor da marca na fuselagem)
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        metalness: 0.1,
        roughness: 0.35,
        emissive: color,
        emissiveIntensity: 0.25,
      }),
    [color],
  );

  useEffect(() => {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
      }
    });
  }, [model, material]);

  // Libera o material da GPU ao desmontar
  useEffect(() => () => material.dispose(), [material]);

  return <primitive object={model} />;
};

useGLTF.preload('/models/airplane.glb');

const Airplane: React.FC<AirplaneProps> = ({
  startVec,
  endVec,
  onFlightComplete,
  airline = DEFAULT_AIRLINE,
  startDelay = 0,
}) => {
  const airplaneRef = useRef<THREE.Group>(null!);

  // Progresso e timers vivem em refs para NÃO re-renderizar o React a cada frame.
  const progressRef = useRef(0);
  const delayRef = useRef(0);
  const startDelayRef = useRef(startDelay);
  const lastDrawCountRef = useRef(0);

  // O rastro (Line) é o único que precisa de estado, e atualizamos apenas
  // quando o número de pontos desenhados muda (não a cada frame).
  const [linePoints, setLinePoints] = useState<THREE.Vector3[]>([]);

  // 1. Calcula a curva (o arco)
  const curve = useMemo(() => {
    const distance = startVec.distanceTo(endVec);
    const altitude = distance * 0.15 + 0.1;
    let midVec = new THREE.Vector3()
      .addVectors(startVec, endVec)
      .multiplyScalar(0.5);
    if (midVec.length() < 0.1) {
      let up = new THREE.Vector3(0, 1, 0);
      if (Math.abs(startVec.y / SPHERE_RADIUS) > 0.9) {
        up = new THREE.Vector3(1, 0, 0);
      }
      midVec = new THREE.Vector3().crossVectors(startVec, up).normalize();
    }
    const midPoint = midVec
      .normalize()
      .multiplyScalar(SPHERE_RADIUS + altitude);
    const startClimbFraction = 0.1;
    const startClimbAltitudeRatio = 0.2;
    const startClimbPoint = new THREE.Vector3()
      .lerpVectors(startVec, midPoint, startClimbFraction)
      .normalize()
      .multiplyScalar(SPHERE_RADIUS + altitude * startClimbAltitudeRatio);
    const endDescentFraction = 0.1;
    const endDescentAltitudeRatio = 0.2;
    const endDescentPoint = new THREE.Vector3()
      .lerpVectors(endVec, midPoint, endDescentFraction)
      .normalize()
      .multiplyScalar(SPHERE_RADIUS + altitude * endDescentAltitudeRatio);

    return new THREE.CatmullRomCurve3(
      [startVec, startClimbPoint, midPoint, endDescentPoint, endVec],
      false,
      'catmullrom',
      0.5,
    );
  }, [startVec, endVec]);

  const points = useMemo(() => {
    return curve.getSpacedPoints(LINE_POINTS);
  }, [curve]);

  // Reinicia o voo quando a rota muda
  useEffect(() => {
    progressRef.current = 0;
    delayRef.current = 0;
    startDelayRef.current = startDelay;
    lastDrawCountRef.current = 0;
    setLinePoints([]);
  }, [curve, startDelay]);

  // 4. Anima o avião, a linha E O LOOP
  useFrame((_, delta) => {
    if (!airplaneRef.current || !curve) return;

    // Atraso inicial de decolagem (frota de marketing)
    if (startDelayRef.current > 0) {
      startDelayRef.current -= delta;
      return;
    }

    const progress = progressRef.current;

    if (progress >= 1.0) {
      delayRef.current += delta;
      if (delayRef.current > LOOP_DELAY_DURATION) {
        progressRef.current = 0;
        delayRef.current = 0;
        lastDrawCountRef.current = 0;
        setLinePoints([]);
      }
      return;
    }

    const newProgress = Math.min(progress + delta * FLIGHT_SPEED, 1.0);
    progressRef.current = newProgress;

    const position = curve.getPointAt(newProgress);
    airplaneRef.current.position.copy(position);

    const tangentProgress = Math.min(newProgress + 0.001, 1.0);
    const tangentPosition = curve.getPointAt(tangentProgress);

    const up = position.clone().normalize();
    airplaneRef.current.up.copy(up);
    airplaneRef.current.lookAt(tangentPosition);

    // Atualiza o rastro apenas quando o número de pontos realmente muda
    const pointsToDraw = Math.ceil(newProgress * LINE_POINTS);
    if (pointsToDraw !== lastDrawCountRef.current) {
      lastDrawCountRef.current = pointsToDraw;
      setLinePoints(points.slice(0, pointsToDraw));
    }

    if (newProgress >= 1.0) {
      onFlightComplete?.();
    }
  });

  return (
    <group>
      <group ref={airplaneRef}>
        <group rotation={[0, Math.PI, 0]} scale={0.12}>
          <AirplaneModel color={airline.color} />
        </group>
        <Html position={[0, 0.05, -0.2]} center occlude>
          <div
            className="border border-black/60 px-2 py-0.5 rounded-md text-sm font-bold select-none shadow-md"
            style={{ backgroundColor: airline.labelBg, color: airline.labelText }}
          >
            {airline.name}
          </div>
        </Html>
      </group>
      {linePoints.length > 1 && (
        <Line
          points={linePoints}
          color={airline.color}
          lineWidth={2}
          transparent
          opacity={0.7}
        />
      )}
    </group>
  );
};

export default Airplane;
