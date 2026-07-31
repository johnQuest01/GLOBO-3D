'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { FlyingMessage } from '@/app/types/globe';
import { latLonToVector3, vector3ToLatLon } from '@/components/lib/utils';

export interface CameraState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

const SPHERE_RADIUS = 1.5;
const POLL_INTERVAL_MS = 4000; // frequência do "tem mensagem nova?"

interface ApiMessage {
  client_id: string;
  text: string;
  lat: number;
  lon: number;
  created_at: string;
}

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

      // 2. Persiste no backend (só tenta se ainda não sabemos que está desligado).
      //    O servidor faz no-op se DATABASE_URL não estiver configurada.
      if (backendEnabledRef.current !== false) {
        const { lat, lon } = vector3ToLatLon(targetPos);
        fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientIdRef.current,
            text,
            lat,
            lon,
          }),
        }).catch(() => {
          /* offline / sem backend — segue só no modo local */
        });
      }
    },
    [],
  );

  // Recebe mensagens de OUTROS usuários por polling (rede social).
  // Robusto em serverless (Vercel/Neon): pergunta ao servidor a cada poucos
  // segundos se há mensagens novas desde a última consulta.
  const backendEnabledRef = useRef<boolean | null>(null);
  const lastSinceRef = useRef<string | null>(null);
  const primedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const since = lastSinceRef.current;
        const url = since
          ? `/api/messages?since=${encodeURIComponent(since)}`
          : '/api/messages';
        const res = await fetch(url);
        if (!res.ok) return;
        const data: {
          enabled: boolean;
          messages: ApiMessage[];
          serverTime: string;
        } = await res.json();

        if (cancelled) return;

        // Backend desligado → para de pesquisar (fica só no modo local)
        if (!data.enabled) {
          backendEnabledRef.current = false;
          if (timer) clearInterval(timer);
          return;
        }
        backendEnabledRef.current = true;

        // Avança o cursor pelo relógio do servidor (evita perder mensagens)
        lastSinceRef.current = data.serverTime;

        // Primeira consulta: só estabelece a linha de base (não re-exibe histórico)
        if (!primedRef.current) {
          primedRef.current = true;
          return;
        }

        // Exibe as mensagens novas de outros usuários voando até a região
        for (const m of data.messages) {
          if (m.client_id === clientIdRef.current) continue; // ignora eco
          spawnArrivingMessage(m.text, m.lat, m.lon);
        }
      } catch {
        /* rede indisponível — tenta de novo no próximo tick */
      }
    }

    poll(); // consulta inicial imediata (prime)
    timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
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
