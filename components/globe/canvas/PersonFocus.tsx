'use client';

import { Billboard, RoundedBox, Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import React, { FC, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { labelWorldScale, SPHERE_RADIUS, textEmWidth } from '@/app/lib/globeLabels';
import { latLonToVector3 } from '@/components/lib/utils';

/**
 * "Onde está essa pessoa?" — a resposta visual da lupa.
 *
 * Duas coisas que andam juntas e por isso moram no mesmo arquivo: virar o globo
 * até o ponto, e marcar o ponto quando ele chega.
 *
 * POR QUE A CÂMERA ORBITA EM VEZ DE O GLOBO GIRAR: é a mesma escolha que o
 * resto da cena já faz (ver o comentário do modo Relógio em GlobeScene). O
 * mundo fica parado; rótulos, fronteiras, luzes e pinos estão em coordenadas
 * de mundo e dependem disso.
 *
 * O CAMINHO É UM ARCO, NÃO UMA RETA. Interpolar a posição da câmera em linha
 * reta atravessaria o planeta — o ponto médio entre São Paulo e Tóquio, em
 * coordenadas cartesianas, fica DENTRO da esfera. Girar a direção e ajustar o
 * raio à parte mantém o movimento por fora, que é como uma pessoa espera que
 * um globo se mova.
 *
 * O MARCADOR segue as duas decisões do BeaconMarkers, e pelas mesmas razões:
 * tamanho constante em pixels (senão ele some de longe e cobre o país de
 * perto) e oclusão por produto escalar em vez de raycast (uma conta contra a
 * travessia da cena inteira, a cada quadro).
 */

/** Quão perto a câmera chega. Perto o bastante para reconhecer o lugar. */
const DISTANCIA_FOCO = 2.6;

/**
 * Fração do caminho percorrida por quadro.
 *
 * Não é velocidade constante: é aproximação exponencial, que começa rápido e
 * desacelera na chegada. Como o passo depende do que falta, o movimento para
 * sozinho — não precisa de cronômetro.
 */
const SUAVIDADE = 0.06;

/** Perto disto, considera-se chegado, e a animação se desliga. */
const TOLERANCIA = 0.015;

const PX = 16;
const CARD_RENDER_ORDER = 22;
const COR_ONLINE = '#34d399';
const COR_OFFLINE = '#94a3b8';

export interface AlvoDoFoco {
  lat: number;
  lon: number;
  nickname: string;
  online: boolean;
  /** Muda a cada pedido, mesmo que a coordenada se repita. Ver o efeito abaixo. */
  pedidoEm: number;
}

interface Props {
  alvo: AlvoDoFoco | null;
}

// Compartilhadas: só há um destes por vez, mas recriar geometria a cada busca
// seria alocação à toa.
const geoAnel = new THREE.TorusGeometry(0.5, 0.1, 8, 24);
const geoNucleo = new THREE.SphereGeometry(0.2, 12, 12);

const PersonFocus: FC<Props> = ({ alvo }) => {
  const { camera, size } = useThree();
  const grupo = useRef<THREE.Group>(null);
  const pulso = useRef<THREE.Mesh>(null);

  /** Para onde a câmera deve ir. Null quando já chegou (ou não há alvo). */
  const destino = useRef<THREE.Vector3 | null>(null);

  const posicao = useMemo(
    () => (alvo ? latLonToVector3(alvo.lat, alvo.lon, SPHERE_RADIUS * 1.004) : null),
    [alvo],
  );
  const normal = useMemo(() => posicao?.clone().normalize() ?? null, [posicao]);
  const quaternion = useMemo(
    () =>
      normal
        ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
        : null,
    [normal],
  );

  const material = useMemo(() => {
    const cor = alvo?.online ? COR_ONLINE : COR_OFFLINE;
    return new THREE.MeshStandardMaterial({
      color: cor,
      emissive: cor,
      emissiveIntensity: 0.9,
      roughness: 0.5,
    });
  }, [alvo?.online]);
  useEffect(() => () => material.dispose(), [material]);

  const rotulo = alvo ? `@${alvo.nickname}` : '';
  const largura = useMemo(() => textEmWidth(rotulo) * 0.62 + 0.8, [rotulo]);

  /**
   * Um alvo novo — ou o MESMO alvo pedido de novo — reabre a viagem.
   *
   * É para isso que existe o `pedidoEm`: clicar em "ver no globo" duas vezes
   * tem que funcionar as duas vezes. Sem ele, a segunda vez não mudaria
   * nenhuma propriedade e o efeito não rodaria.
   */
  useEffect(() => {
    if (!alvo) {
      destino.current = null;
      return;
    }
    destino.current = latLonToVector3(alvo.lat, alvo.lon, DISTANCIA_FOCO);
  }, [alvo]);

  useFrame(({ clock }, delta) => {
    const g = grupo.current;

    if (g && normal && posicao) {
      const cam = camera as THREE.PerspectiveCamera;
      const distancia = cam.position.length();

      // Do outro lado do planeta: não desenha.
      const frente = normal.dot(cam.position) / distancia;
      const visivel = frente > SPHERE_RADIUS / distancia;
      if (g.visible !== visivel) g.visible = visivel;

      if (visivel) {
        g.scale.setScalar(
          labelWorldScale(
            cam.position.distanceTo(posicao),
            PX,
            cam.fov ?? 50,
            size.height,
          ),
        );
        if (pulso.current) {
          const p = 1 + Math.sin(clock.elapsedTime * 2.4) * 0.2;
          pulso.current.scale.set(p, p, 1);
        }
      }
    }

    const paraOnde = destino.current;
    if (!paraOnde) return;

    // Gira a DIREÇÃO e ajusta o raio à parte: é o que mantém o caminho por
    // fora da esfera.
    const raioAtual = camera.position.length();
    const daqui = camera.position.clone().normalize();
    const prali = paraOnde.clone().normalize();

    // Passo independente da taxa de quadros: a 30fps leva o mesmo tempo que a
    // 120fps, em vez de ficar duas vezes mais lento.
    const t = 1 - Math.pow(1 - SUAVIDADE, delta * 60);
    const direcao = daqui.lerp(prali, t).normalize();
    const raio = THREE.MathUtils.lerp(raioAtual, DISTANCIA_FOCO, t);
    camera.position.copy(direcao.multiplyScalar(raio));

    if (camera.position.distanceTo(paraOnde) < TOLERANCIA) {
      // Chegou: desliga, e daqui em diante a câmera é inteiramente de quem
      // estiver mexendo nela.
      destino.current = null;
    }
  });

  if (!posicao || !quaternion || !alvo) return null;

  return (
    <group ref={grupo} position={posicao}>
      <group quaternion={quaternion}>
        <mesh ref={pulso} geometry={geoAnel} material={material} />
        <mesh geometry={geoNucleo} material={material} />
      </group>

      {/*
        O cartão do nome segue as medidas do BeaconMarkers — mesma altura,
        mesmo corpo de letra, mesma conta de largura — porque os dois aparecem
        na mesma cena e tamanhos diferentes fariam um parecer erro do outro.

        `depthTest={false}` é o que impede o relevo do globo de comer o cartão
        quando a câmera chega perto e o ponto fica na borda visível.
      */}
      <Billboard position={[0, 1.1, 0]}>
        <RoundedBox
          args={[largura, 1, 0.02]}
          radius={0.22}
          smoothness={3}
          renderOrder={CARD_RENDER_ORDER}
        >
          <meshBasicMaterial
            color={alvo.online ? COR_ONLINE : COR_OFFLINE}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </RoundedBox>
        <Text
          position={[0, 0, 0.04]}
          fontSize={0.55}
          color="#0f172a"
          anchorX="center"
          anchorY="middle"
          renderOrder={CARD_RENDER_ORDER + 1}
        >
          {rotulo}
          <meshBasicMaterial
            color="#0f172a"
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </Text>
      </Billboard>
    </group>
  );
};

export default PersonFocus;
