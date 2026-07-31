'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { FlyingMessage } from '@/app/types/globe';
import { latLonToVector3, vector3ToLatLon } from '@/components/lib/utils';
import { isSupabaseEnabled } from '@/lib/supabase/client';
import {
  insertRegionMessage,
  subscribeToRegionMessages,
} from '@/lib/supabase/regionMessages';

export interface CameraState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

const SPHERE_RADIUS = 1.5;

export function useMessageSystem() {
  const [isMessagePopupOpen, setIsMessagePopupOpen] = useState(false);
  const [flyingMessages, setFlyingMessages] = useState<FlyingMessage[]>([]);

  // Id de sessão do cliente — evita que a mensagem que EU enviei volte via
  // realtime e seja exibida em duplicidade.
  const clientIdRef = useRef<string>(
    Math.random().toString(36).slice(2) + Date.now().toString(36),
  );

  const handleOpenMessagePopup = useCallback(() => {
    setIsMessagePopupOpen(true);
  }, []);

  const handleCloseMessagePopup = useCallback(() => {
    setIsMessagePopupOpen(false);
  }, []);

  const removeMessage = useCallback((id: string) => {
    setFlyingMessages((prev) => prev.filter((msg) => msg.id !== id));
  }, []);

  // Cria uma mensagem "chegando" a uma região (usada para mensagens remotas
  // recebidas via realtime, que não têm câmera de origem). Ela nasce no
  // espaço, acima da região, e desce até o local no globo.
  const spawnArrivingMessage = useCallback((text: string, lat: number, lon: number) => {
    const targetPos = latLonToVector3(lat, lon, SPHERE_RADIUS);
    const startPos = targetPos.clone().normalize().multiplyScalar(SPHERE_RADIUS + 2.5);
    const newMessage: FlyingMessage = {
      id: Math.random().toString(36).substring(2, 9) + Date.now().toString(),
      text,
      startPosition: startPos,
      targetPosition: targetPos,
      createdAt: Date.now(),
    };
    setFlyingMessages((prev) => [...prev, newMessage]);
  }, []);

  /**
   * Adiciona mensagem (enviada pelo usuário local).
   * @param overrideTargetPosition Se fornecido, a mensagem voará para este ponto específico.
   */
  const addMessage = useCallback(
    (
      text: string,
      cameraState: CameraState,
      overrideTargetPosition?: THREE.Vector3 | null,
    ) => {
      // Distância da câmera ao centro
      const distToCenter = cameraState.position.length();
      const distToSurface = Math.max(0.1, distToCenter - SPHERE_RADIUS);

      // Spawn a 20% da distância (perto da tela)
      const spawnDistance = distToSurface * 0.2;

      // Vetor frente da câmera
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(cameraState.quaternion).normalize();

      // Posição Inicial
      const startPos = cameraState.position
        .clone()
        .add(forward.clone().multiplyScalar(spawnDistance));

      let targetPos: THREE.Vector3;

      if (overrideTargetPosition) {
        targetPos = overrideTargetPosition.clone();
      } else {
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

      // 1. Exibe localmente (comportamento original — sempre acontece)
      setFlyingMessages((prev) => [...prev, newMessage]);

      // 2. Persiste + transmite para outros usuários (só se o backend estiver ligado)
      if (isSupabaseEnabled) {
        const { lat, lon } = vector3ToLatLon(targetPos);
        insertRegionMessage({
          client_id: clientIdRef.current,
          text,
          lat,
          lon,
        });
      }
    },
    [],
  );

  // Assina mensagens em tempo real de OUTROS usuários (rede social)
  useEffect(() => {
    if (!isSupabaseEnabled) return;
    const unsubscribe = subscribeToRegionMessages((row) => {
      // Ignora o eco da própria mensagem
      if (row.client_id === clientIdRef.current) return;
      spawnArrivingMessage(row.text, row.lat, row.lon);
    });
    return unsubscribe;
  }, [spawnArrivingMessage]);

  return {
    isMessagePopupOpen,
    handleOpenMessagePopup,
    handleCloseMessagePopup,
    flyingMessages,
    addMessage,
    removeMessage,
  };
}
