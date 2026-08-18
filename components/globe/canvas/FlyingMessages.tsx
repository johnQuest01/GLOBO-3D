'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, Billboard, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { FlyingMessage } from '@/app/types/globe';

interface FlyingMessagesProps {
  messages: FlyingMessage[];
  onMessageComplete: (id: string) => void;
}

const LINE_POINTS = 50; // Quantidade de pontos na linha da rota
const SPHERE_RADIUS = 1.5; // Raio do globo

const MessageItem = ({ message, onComplete }: { message: FlyingMessage; onComplete: (id: string) => void }) => {
  const groupRef = useRef<THREE.Group>(null!);
  const containerRef = useRef<THREE.Group>(null!);
  const { camera } = useThree();
  
  const DURATION = 6.0; 
  const BLOCK_COLOR = "#be185d"; 
  const BLOCK_OPACITY = 0.9;

  // O rastro é uma geometria só, criada uma vez; crescer o traço é mover o
  // `drawRange`. Antes recriava o array e a geometria da linha a cada quadro.
  const trailRef = useRef<THREE.BufferGeometry>(null);

  // 1. Calcula a Curva de Voo (Rota Geodésica - Estilo Avião)
  const curve = useMemo(() => {
    const start = message.startPosition;
    const end = message.targetPosition;
    
    // Distância linear entre origem e destino
    const dist = start.distanceTo(end);

    // --- CÁLCULO DO PONTO MÉDIO (CRUZEIRO) ---
    // Calcula o vetor médio entre o início e o fim
    const midVec = new THREE.Vector3().addVectors(start, end);
    
    // Normaliza para obter a direção "para fora" do centro da Terra
    // Se start e end forem opostos (ex: polos opostos), midVec será zero.
    // Precisamos tratar isso para não quebrar a curva (atravessar o centro).
    if (midVec.lengthSq() < 0.01) {
         // Se forem opostos, criamos um arco lateral usando um vetor perpendicular
         // Tenta cruzar com Y (up), se falhar (estamos nos polos), usa X.
         midVec.crossVectors(start, new THREE.Vector3(0, 1, 0));
         if (midVec.lengthSq() < 0.01) midVec.set(1, 0, 0); 
    }
    
    // Normaliza a direção
    midVec.normalize();

    // Define a Altitude de Cruzeiro
    // A mensagem deve subir para não bater em montanhas/relevo.
    // 1. Pega a altura atual de onde a mensagem nasceu (perto da câmera)
    const startAltitude = start.length();
    
    // 2. Calcula uma altura segura baseada na distância da viagem.
    // Viagens longas = Arco mais alto.
    // Base: Raio da Terra + margem segura + proporção da distância
    const safeArcAltitude = SPHERE_RADIUS + 0.5 + (dist * 0.5);
    
    // 3. A altura final do ponto médio é a maior entre a altura inicial e o arco seguro.
    // Isso garante que se você estiver longe (zoom out), ela não "mergulhe" antes de subir.
    const cruiseAltitude = Math.max(startAltitude * 1.1, safeArcAltitude);
    
    // Cria o Ponto de Controle (topo do arco)
    const controlPoint = midVec.multiplyScalar(cruiseAltitude);

    // Usa CatmullRom para criar uma trajetória orgânica de voo
    // Passamos por: Início -> Cruzeiro -> Fim
    return new THREE.CatmullRomCurve3(
        [start, controlPoint, end], 
        false, 
        'chordal', // 'chordal' cria arcos mais suaves e naturais que 'catmullrom' padrão
        0.5
    );
  }, [message.startPosition, message.targetPosition]);

  // Pré-calcula o rastro UMA vez, já no formato que a GPU consome.
  const trailPositions = useMemo(() => {
      const pts = curve.getSpacedPoints(LINE_POINTS);
      const arr = new Float32Array(pts.length * 3);
      pts.forEach((p, i) => {
          arr[i * 3] = p.x;
          arr[i * 3 + 1] = p.y;
          arr[i * 3 + 2] = p.z;
      });
      return arr;
  }, [curve]);

  // Distância inicial para escala
  const startDistanceToCamera = useMemo(() => {
    return message.startPosition.distanceTo(camera.position);
  }, [message.startPosition, camera.position]);

  const baseScaleSize = Math.max(0.03, startDistanceToCamera * 0.08);

  useFrame(() => {
    if (!groupRef.current) return;

    const elapsed = (Date.now() - message.createdAt) / 1000;
    const progress = Math.min(elapsed / DURATION, 1);

    // Easing suave (Acelera no meio, desacelera no pouso)
    const ease = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    // MOVIMENTO PELA CURVA
    // Vai até 102% para garantir o "mergulho" final na malha da Terra
    const movementProgress = Math.min(ease * 1.02, 1.0); 
    
    // Obtém a posição na curva baseada no progresso
    const currentPos = curve.getPointAt(movementProgress);
    groupRef.current.position.copy(currentPos);

    // Atualiza a linha de rota (rastro) para mostrar o caminho percorrido
    if (trailRef.current) {
        const drawn = Math.floor(movementProgress * LINE_POINTS) + 1;
        trailRef.current.setDrawRange(0, Math.max(0, drawn));
    }

    // ESCALA
    let animScale = 1;
    if (progress < 0.1) {
       // Pop-in elástico
       animScale = Math.sin((progress / 0.1) * (Math.PI / 2));
    } else {
       // Diminui conforme viaja para longe
       const flightProgress = (progress - 0.1) / 0.9;
       animScale = 1 - Math.pow(flightProgress, 0.5); 
       
       // Colapso final rápido ao tocar o solo
       if (flightProgress > 0.95) {
         animScale *= (1 - (flightProgress - 0.95) / 0.05);
       }
    }

    const finalScale = baseScaleSize * Math.max(0, animScale);
    groupRef.current.scale.setScalar(finalScale);

    // ROTAÇÃO (Aponta para a direção do voo)
    if (containerRef.current) {
        // Calcula a tangente (direção) para inclinar o balão levemente
        // Mas mantemos o Billboard cuidando da orientação principal para legibilidade
        containerRef.current.rotation.z = Math.sin(elapsed * 3.0) * 0.05; // Balanço suave
    }

    if (progress >= 1) {
      onComplete(message.id);
    }
  });

  const textLength = message.text.length;
  const boxWidth = Math.min(Math.max(textLength * 0.15, 1.2), 5); 
  const boxHeight = 0.65;

  return (
    <group>
        {/* Renderiza a Linha da Rota (Rastro) */}
        <line>
            <bufferGeometry ref={trailRef}>
                <bufferAttribute
                    attach="attributes-position"
                    args={[trailPositions, 3]}
                />
            </bufferGeometry>
            <lineBasicMaterial
                color="#ec4899"
                transparent
                opacity={0.5}
                depthWrite={false}
            />
        </line>

        <group ref={groupRef} position={message.startPosition}>
        <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
            <group ref={containerRef}>
                <RoundedBox args={[boxWidth, boxHeight, 0.05]} radius={0.2} smoothness={4}>
                    <meshStandardMaterial 
                        color={BLOCK_COLOR} 
                        transparent 
                        opacity={BLOCK_OPACITY}
                        emissive={BLOCK_COLOR}
                        emissiveIntensity={0.8}
                        roughness={0.2}
                        metalness={0.1}
                        depthTest={true}
                        depthWrite={true}
                    />
                </RoundedBox>
                <Text
                    position={[0, 0, 0.06]}
                    fontSize={0.25}
                    color="#ffffff" 
                    anchorX="center"
                    anchorY="middle"
                    maxWidth={boxWidth - 0.2}
                    textAlign="center"
                    outlineWidth={0.015}
                    outlineColor="#831843"
                >
                    {message.text}
                </Text>
            </group>
        </Billboard>
        </group>
    </group>
  );
};

const FlyingMessages: React.FC<FlyingMessagesProps> = ({ messages, onMessageComplete }) => {
  return (
    <>
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} onComplete={onMessageComplete} />
      ))}
    </>
  );
};

export default FlyingMessages;