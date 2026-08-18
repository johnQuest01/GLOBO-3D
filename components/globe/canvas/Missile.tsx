'use client';

import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import Explosion from './Explosion';

interface MissileProps {
  startVec: THREE.Vector3;
  endVec: THREE.Vector3;
  delay?: number;
  isAnimated?: boolean;
}

const FLIGHT_SPEED = 0.3;
const SPHERE_RADIUS = 1.5;

const MissileModel: React.FC = () => {
  // --- CORREÇÃO: Caminho correto para o arquivo .glb padrão ---
  const { scene } = useGLTF('/models/missile.glb');
  const model = useMemo(() => scene.clone(), [scene]);
  return <primitive object={model} scale={0.05} />;
};

// --- CORREÇÃO: Preload correto ---
useGLTF.preload('/models/missile.glb');

const Missile: React.FC<MissileProps> = ({
  startVec,
  endVec,
  delay = 0,
  isAnimated = true,
}) => {
  const missileRef = useRef<THREE.Group>(null!);
  // Progresso em ref, não em state. Os mísseis animam desde que o app abre;
  // com setState por quadro, todo o app pagava um re-render de React a 60 fps
  // o tempo inteiro, mesmo com o usuário parado olhando o globo.
  const progressRef = useRef(0);
  const [showExplosion, setShowExplosion] = useState(false);
  const [isDelayed, setIsDelayed] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsDelayed(false);
    }, delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  const curve = useMemo(() => {
    const distance = startVec.distanceTo(endVec);
    const altitude = distance * 0.15 + 0.1;
    let midVec = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
    if (midVec.length() < 0.1) {
      let up = new THREE.Vector3(0, 1, 0);
      if (Math.abs(startVec.y / SPHERE_RADIUS) > 0.9) up = new THREE.Vector3(1, 0, 0);
      midVec = new THREE.Vector3().crossVectors(startVec, up).normalize();
    }
    const midPoint = midVec.normalize().multiplyScalar(SPHERE_RADIUS + altitude);
    
    // Simplificado para garantir funcionamento
    return new THREE.CatmullRomCurve3(
      [startVec, midPoint, endVec],
      false,
      'catmullrom',
      0.5
    );
  }, [startVec, endVec]);

  const onExplosionComplete = () => {
    setShowExplosion(false);
    progressRef.current = 0;
    const randomDelay = Math.random() * 5000 + 2000;
    setIsDelayed(true);
    setTimeout(() => setIsDelayed(false), randomDelay);
  };

  useFrame((_, delta) => {
    if (!missileRef.current || !curve || showExplosion || isDelayed) return;
    if (!isAnimated) {
      progressRef.current = 0;
      return;
    }

    const newProgress = Math.min(progressRef.current + delta * FLIGHT_SPEED, 1.0);
    progressRef.current = newProgress;

    const position = curve.getPointAt(newProgress);
    missileRef.current.position.copy(position);

    const tangentPosition = curve.getPointAt(Math.min(newProgress + 0.01, 1.0));
    missileRef.current.lookAt(tangentPosition);

    if (newProgress >= 1.0) {
      setShowExplosion(true);
    }
  });

  return (
    <group>
      <group ref={missileRef} visible={!showExplosion && !isDelayed && isAnimated}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <MissileModel />
        </group>
      </group>
      {showExplosion && isAnimated && (
        <group position={endVec}>
          <Explosion scale={0.5} onComplete={onExplosionComplete} />
        </group>
      )}
    </group>
  );
};

export default Missile;