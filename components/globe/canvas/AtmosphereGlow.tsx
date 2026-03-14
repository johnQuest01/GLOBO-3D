// components/globe/canvas/AtmosphereGlow.tsx
'use client';

import * as THREE from 'three';
import React, { useRef } from 'react';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';

// 1. Definição do Shader (GLSL) - (Do seu código)
const vertexShader = `
  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    
    // Vetor normal no espaço do mundo
    vWorldNormal = normalize( normalMatrix * normal );
    
    // Vetor da câmera para o vértice no espaço do mundo
    vViewDirection = normalize( cameraPosition - worldPosition.xyz );
    
    // Posição padrão
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const fragmentShader = `
  varying vec3 vWorldNormal;
  varying vec3 vViewDirection;

  // Parâmetros que podemos controlar do React
  uniform vec3 uGlowColor;
  uniform float uFresnelPower; // Quão "forte" é o brilho na borda
  uniform float uFresnelOpacity; // Opacidade geral do brilho

  void main() {
    // 2. O Cálculo do Efeito Fresnel
    // 1.0 = centro (olhando reto)
    // 0.0 = borda (ângulo de 90 graus)
    float fresnel = dot( vWorldNormal, vViewDirection );
    
    // Invertemos e aplicamos potência:
    // centro = pow(1.0 - 1.0, 4.0) = 0.0 (transparente)
    // borda = pow(1.0 - 0.0, 4.0) = 1.0 (opaco)
    fresnel = pow( 1.0 - fresnel, uFresnelPower );

    // 3. A Cor Final
    gl_FragColor = vec4( uGlowColor, fresnel * uFresnelOpacity );
  }
`;

// 3. Criando o material customizado com 'shaderMaterial' do Drei
const AtmosphereMaterial = shaderMaterial(
  {
    // Uniforms (valores que passamos do React para o shader)
    uGlowColor: new THREE.Color('#4d99ff'), // Um azul-céu
    uFresnelPower: 4.0, // Controla o "aperto" do brilho. Mais alto = mais fino.
    uFresnelOpacity: 0.7, // Opacidade geral
  },
  vertexShader,
  fragmentShader
);

// 4. Disponibilizando o material para o R3F
extend({ AtmosphereMaterial });

// --- Interface para Tipagem (TypeScript) ---
// (Esta é a sua versão estrita, que está correta)
interface AtmosphereMaterialImpl {
  uGlowColor?: THREE.Color | string | number;
  uFresnelPower?: number;
  uFresnelOpacity?: number;
}
declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereMaterial: AtmosphereMaterialImpl & {
      key?: string | number | null;
      ref?: React.Ref<THREE.ShaderMaterial>;
    } & Partial<THREE.Material>;
  }
}
// --- Fim da Tipagem ---

// 5. O Componente React da Atmosfera
const AtmosphereGlow = () => {
  const meshRef = useRef<THREE.Mesh>(null!);

  // O raio do seu globo é 1.5
  const SPHERE_RADIUS = 1.5;

  return (
    <mesh ref={meshRef} scale={1.04}> {/* 4% maior que o globo */}
      <sphereGeometry args={[SPHERE_RADIUS, 64, 64]} />
      <atmosphereMaterial
        key="atmosphere-material"
        transparent={true} // Habilita transparência
        blending={THREE.AdditiveBlending} // Faz os brilhos "somarem", criando o "glow"
        depthWrite={false} // Não oculta coisas atrás

        // --- CORREÇÃO ESSENCIAL ---
        // Renderiza apenas a face interna da esfera.
        // Isso garante que o brilho só apareça "atrás" da borda do globo
        // (criando a aura) e não na face virada para a câmera.
        side={THREE.BackSide}
        // --- FIM DA CORREÇÃO ---

        // Props dos uniforms
        uGlowColor="#4d99ff"
        uFresnelPower={4.0}
        uFresnelOpacity={0.7}
      />
    </mesh>
  );
};

export default AtmosphereGlow;