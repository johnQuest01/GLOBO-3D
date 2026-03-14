// components/login/LoginBackground.tsx
'use client';

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';

// Componente individual de partícula para o fundo animado
function AnimatedParticle() {
  const meshRef = useRef<THREE.Mesh>(null!);

  // Gera uma posição aleatória inicial
  const position = useRef(
    new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
    ),
  );
  // Gera uma velocidade aleatória
  const velocity = useRef(
    new THREE.Vector3(
      Math.random() * 0.01 - 0.005,
      Math.random() * 0.01 - 0.005,
      Math.random() * 0.01 - 0.005,
    ),
  );

  useFrame((state, delta) => {
    if (meshRef.current) {
      // Move a partícula
      meshRef.current.position.add(velocity.current);

      // Reseta a posição se sair da "tela" para criar um loop infinito
      if (
        meshRef.current.position.x > 10 ||
        meshRef.current.position.x < -10 ||
        meshRef.current.position.y > 10 ||
        meshRef.current.position.y < -10 ||
        meshRef.current.position.z > 10 ||
        meshRef.current.position.z < -10
      ) {
        meshRef.current.position.set(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
        );
      }
    }
  });

  return (
    <mesh ref={meshRef} position={position.current}>
      <sphereGeometry args={[0.05, 8, 8]} />
      <meshBasicMaterial color="rgb(34, 197, 94)" /> {/* green-500 */}
    </mesh>
  );
}

// O Canvas 3D para o fundo
const LoginBackground: React.FC = () => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
        <color attach="background" args={['#0c0a09']} /> {/* stone-900 */}
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <Stars
          radius={100}
          depth={50}
          count={5000}
          factor={4}
          saturation={0}
          fade
          speed={1}
        />
        {/* Renderiza várias partículas animadas */}
        {Array.from({ length: 150 }).map((_, i) => (
          <AnimatedParticle key={i} />
        ))}
        {/* OrbitControls apenas para desenvolvimento, remover em produção */}
        {/* <OrbitControls enableZoom={false} enablePan={false} /> */}
      </Canvas>
    </div>
  );
};

export default LoginBackground;