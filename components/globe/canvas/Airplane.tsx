'use client';

import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';

interface AirplaneProps {
  startVec: THREE.Vector3;
  endVec: THREE.Vector3;
  onFlightComplete?: () => void;
}

const SPHERE_RADIUS = 1.5;
const FLIGHT_SPEED = 0.05;
const LINE_POINTS = 200;
const LOOP_DELAY_DURATION = 1.5;

const stylishAirplaneMaterial = new THREE.MeshStandardMaterial({
  color: 'white',
  metalness: 0,
  roughness: 0,
  emissive: 'white',
  emissiveIntensity: 0.3,
});

/**
 * Componente que carrega o modelo 3D do avião.
 */
const AirplaneModel: React.FC = () => {
  // --- CORREÇÃO: Removido o sufixo '-draco' para corresponder ao seu arquivo ---
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

// --- CORREÇÃO: Preload do caminho correto ---
useGLTF.preload('/models/airplane.glb');

const Airplane: React.FC<AirplaneProps> = ({
  startVec,
  endVec,
  onFlightComplete,
}) => {
  const airplaneRef = useRef<THREE.Group>(null!);
  const [progress, setProgress] = useState(0);
  const [linePoints, setLinePoints] = useState<THREE.Vector3[]>([]);
  const [delayTimer, setDelayTimer] = useState(0);

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

  // 4. Anima o avião, a linha E O LOOP
  useFrame((_, delta) => {
    if (!airplaneRef.current || !curve) return;

    if (progress >= 1.0) {
      const newTimer = delayTimer + delta;
      setDelayTimer(newTimer);

      if (newTimer > LOOP_DELAY_DURATION) {
        setProgress(0);
        setDelayTimer(0);
        setLinePoints([]); 
      }
      return;
    }

    const newProgress = Math.min(progress + delta * FLIGHT_SPEED, 1.0);
    const position = curve.getPointAt(newProgress);
    airplaneRef.current.position.copy(position);

    const tangentProgress = Math.min(newProgress + 0.001, 1.0);
    const tangentPosition = curve.getPointAt(tangentProgress);

    const up = position.clone().normalize();
    airplaneRef.current.up.copy(up);
    airplaneRef.current.lookAt(tangentPosition);

    setProgress(newProgress);

    const pointsToDraw = Math.ceil(newProgress * LINE_POINTS);
    setLinePoints(points.slice(0, pointsToDraw));

    if (newProgress >= 1.0) {
      onFlightComplete?.();
    }
  });

  return (
    <group>
      <group ref={airplaneRef}>
        <group rotation={[0, Math.PI, 0]} scale={0.12}>
          <AirplaneModel />
        </group>
        <Html position={[0, 0.05, -0.2]} center occlude>
          <div className="bg-white text-red-600 border border-black px-2 py-0.5 rounded-md text-sm font-bold select-none">
            GOL
          </div>
        </Html>
      </group>
      {linePoints.length > 1 && (
        <Line points={linePoints} color="#00FFFF" lineWidth={2} transparent opacity={0.7} />
      )}
    </group>
  );
};

export default Airplane;