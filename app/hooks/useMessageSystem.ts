'use client';

import { useState, useCallback } from 'react';
import * as THREE from 'three';
import { FlyingMessage } from '@/app/types/globe';

export interface CameraState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export function useMessageSystem() {
  const [isMessagePopupOpen, setIsMessagePopupOpen] = useState(false);
  const [flyingMessages, setFlyingMessages] = useState<FlyingMessage[]>([]);

  const handleOpenMessagePopup = useCallback(() => {
    setIsMessagePopupOpen(true);
  }, []);

  const handleCloseMessagePopup = useCallback(() => {
    setIsMessagePopupOpen(false);
  }, []);

  /**
   * Adiciona mensagem.
   * @param overrideTargetPosition Se fornecido, a mensagem voará para este ponto específico (país/estado).
   */
  const addMessage = useCallback((text: string, cameraState: CameraState, overrideTargetPosition?: THREE.Vector3 | null) => {
    const SPHERE_RADIUS = 1.5;
    
    // Distância da câmera ao centro
    const distToCenter = cameraState.position.length();
    const distToSurface = Math.max(0.1, distToCenter - SPHERE_RADIUS);
    
    // Spawn a 20% da distância (perto da tela)
    const spawnDistance = distToSurface * 0.20;

    // Vetor frente da câmera
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(cameraState.quaternion).normalize();

    // Posição Inicial
    const startPos = cameraState.position.clone().add(forward.clone().multiplyScalar(spawnDistance));
    
    let targetPos: THREE.Vector3;

    if (overrideTargetPosition) {
        // LÓGICA DE DESTINO INTELIGENTE
        // Se temos um destino específico (ex: Brasil), usamos ele.
        targetPos = overrideTargetPosition.clone();
    } else {
        // LÓGICA PADRÃO (Centro da Visão)
        // Se não citou país, vai para onde a câmera aponta (centro do globo)
        const directionToCenter = startPos.clone().normalize().negate(); 
        targetPos = directionToCenter.multiplyScalar(SPHERE_RADIUS);
    }

    const newMessage: FlyingMessage = {
      id: Math.random().toString(36).substring(2, 9) + Date.now().toString(),
      text,
      startPosition: startPos,
      targetPosition: targetPos,
      createdAt: Date.now(),
    };

    setFlyingMessages((prev) => [...prev, newMessage]);
  }, []);

  const removeMessage = useCallback((id: string) => {
    setFlyingMessages((prev) => prev.filter((msg) => msg.id !== id));
  }, []);

  return {
    isMessagePopupOpen,
    handleOpenMessagePopup,
    handleCloseMessagePopup,
    flyingMessages,
    addMessage,
    removeMessage,
  };
}