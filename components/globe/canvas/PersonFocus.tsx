'use client';

import { Billboard, RoundedBox, Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import React, { FC, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { labelWorldScale, SPHERE_RADIUS, textEmWidth } from '@/app/lib/globeLabels';
import { latLonToVector3 } from '@/components/lib/utils';
import MidiaNoGlobo, { type MidiaDoFoco } from './MidiaNoGlobo';

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

/**
 * Teto de duração da viagem.
 *
 * Com a suavidade acima, atravessar meio planeta leva cerca de um segundo e
 * meio. Quatro segundos é folga larga para o caso normal e curto o bastante
 * para que um caso anômalo não prenda a câmera.
 */
const PRAZO_MS = 4000;

/** Perto disto, considera-se chegado, e a animação se desliga. */
const TOLERANCIA = 0.015;

const PX = 16;
const CARD_RENDER_ORDER = 22;
const COR_ONLINE = '#34d399';
const COR_OFFLINE = '#94a3b8';
/** Lugar de ferias: ambar, a mesma familia dos pinos do globo. */
const COR_LUGAR = '#fbbf24';

export interface AlvoDoFoco {
  lat: number;
  lon: number;
  /**
   * A publicacao que pediu esta viagem, quando houver uma.
   *
   * NEM TODO FOCO TEM MIDIA: a lupa procura uma pessoa, o botao de ferias
   * procura um lugar, e nenhum dos dois traz foto. Por isso ela e' opcional, e
   * nao um campo vazio que todo chamador tem de preencher com nulo.
   */
  midia?: MidiaDoFoco | null;
  /**
   * O que está sendo procurado.
   *
   * Começou como "a pessoa da lupa" e passou a servir também para um lugar de
   * férias — são o mesmo gesto: pedi para ver onde fica, o globo me leva até
   * lá. O que muda é o rótulo (um leva arroba, o outro não) e a cor, que na
   * pessoa diz se ela está online e num lugar não diria nada.
   */
  tipo?: 'pessoa' | 'lugar';
  nickname: string;
  online: boolean;
  /** Muda a cada pedido, mesmo que a coordenada se repita. Ver o efeito abaixo. */
  pedidoEm: number;
}

interface Props {
  alvo: AlvoDoFoco | null;
}

/*
 * Onde o cartao do nome termina.
 *
 * Ele fica em y = 1,1 e tem 1 de altura, entao o topo esta' em 1,6. A conta
 * esta' escrita aqui, e nao no outro arquivo, porque quem mexer na altura do
 * cartao mexe neste arquivo — e o numero precisa estar onde a mao ja' esta'.
 */
const TOPO_DO_NOME = 1.6;

// Compartilhadas: só há um destes por vez, mas recriar geometria a cada busca
// seria alocação à toa.
const geoAnel = new THREE.TorusGeometry(0.5, 0.1, 8, 24);
const geoNucleo = new THREE.SphereGeometry(0.2, 12, 12);

/**
 * A cor do marcador.
 *
 * Lugar de férias tem cor própria porque "online" não quer dizer nada sobre um
 * lugar — pintar de verde sugeriria que ele está disponível para conversar.
 */
function corDoAlvo(alvo: AlvoDoFoco | null): string {
  if (alvo?.tipo === 'lugar') return COR_LUGAR;
  return alvo?.online ? COR_ONLINE : COR_OFFLINE;
}

const PersonFocus: FC<Props> = ({ alvo }) => {
  const { camera, size, gl } = useThree();
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
    const cor = corDoAlvo(alvo);
    return new THREE.MeshStandardMaterial({
      color: cor,
      emissive: cor,
      emissiveIntensity: 0.9,
      roughness: 0.5,
    });
  }, [alvo?.online, alvo?.tipo]);
  useEffect(() => () => material.dispose(), [material]);

  const rotulo = alvo ? (alvo.tipo === 'lugar' ? alvo.nickname : `@${alvo.nickname}`) : '';
  const largura = useMemo(() => textEmWidth(rotulo) * 0.62 + 0.8, [rotulo]);

  /**
   * Um alvo novo — ou o MESMO alvo pedido de novo — reabre a viagem.
   *
   * É para isso que existe o `pedidoEm`: clicar em "ver no globo" duas vezes
   * tem que funcionar as duas vezes. Sem ele, a segunda vez não mudaria
   * nenhuma propriedade e o efeito não rodaria.
   */
  /** Quando esta viagem começou. Junto com o prazo, é o freio de segurança. */
  const partiuEm = useRef(0);

  useEffect(() => {
    if (!alvo) {
      destino.current = null;
      return;
    }
    destino.current = latLonToVector3(alvo.lat, alvo.lon, DISTANCIA_FOCO);
    partiuEm.current = performance.now();

    /*
     * A VIAGEM CEDE NA HORA EM QUE A PESSOA TOCA NO GLOBO.
     *
     * Sem isto havia um cabo de guerra sem fim, e foi relatado assim: "o globo
     * fica focando toda hora, tirando o acesso de navegar livremente". A
     * aproximação move uma fração do que falta a cada quadro, então, se
     * alguém arrasta o globo no meio do caminho, a distância nunca entra na
     * tolerância — e a viagem, que só terminava ao chegar, puxava a câmera de
     * volta para sempre.
     *
     * Quem manda na câmera é quem está com a mão nela. O voo é um favor, e
     * favor não insiste.
     */
    const desistir = () => {
      destino.current = null;
    };
    const tela = gl.domElement;
    tela.addEventListener('pointerdown', desistir);
    tela.addEventListener('wheel', desistir, { passive: true });

    return () => {
      tela.removeEventListener('pointerdown', desistir);
      tela.removeEventListener('wheel', desistir);
    };
  }, [alvo, gl]);

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

    /*
     * CHEGOU, OU ACABOU O PRAZO.
     *
     * O prazo não é desconfiança do cálculo: é que o destino pode ficar
     * inalcançável por fora — outro código mexendo na câmera, o amortecimento
     * do controle empatando com a aproximação. Sem um fim garantido, "quase
     * chegando" vira para sempre.
     */
    const chegou = camera.position.distanceTo(paraOnde) < TOLERANCIA;
    const demorou = performance.now() - partiuEm.current > PRAZO_MS;
    if (chegou || demorou) {
      // Daqui em diante a câmera é inteiramente de quem estiver mexendo nela.
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
            color={corDoAlvo(alvo)}
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

      {/*
        A PUBLICACAO, acima do nome do lugar. Ela nasce em cima do ponto que
        acendeu — o video e o nome da cidade sao uma coisa so', e nao duas que
        o olho precisa casar atravessando a tela.
      */}
      <MidiaNoGlobo
        midia={alvo.midia ?? null}
        base={TOPO_DO_NOME}
        pxPorUnidade={PX}
      />
    </group>
  );
};

export default PersonFocus;
