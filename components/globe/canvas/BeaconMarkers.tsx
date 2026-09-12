'use client';

import { Billboard, RoundedBox, Text } from '@react-three/drei';
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import React, { FC, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { labelWorldScale, SPHERE_RADIUS, textEmWidth } from '@/app/lib/globeLabels';
import { latLonToVector3 } from '@/components/lib/utils';
import { espalharNaRegiao } from '@/lib/geo/espalhar';
import type { Beacon } from '@/realtime/shared/protocol';

/**
 * Os sinais de quem está disponível para conversar.
 *
 * DUAS DECISÕES DE DESEMPENHO, herdadas do LocationPin:
 *
 * 1. Geometria e material são compartilhados por TODOS os beacons. Cada um
 *    alocar os seus faria o custo crescer junto com a quantidade — e beacon é
 *    feito para haver muitos.
 *
 * 2. A oclusão é um produto escalar, não um raycast. O `CustomMarker` que já
 *    existe no projeto usa `<Html occlude>`, que dispara um raycast contra a
 *    cena inteira a cada quadro e por marcador. Com a esfera de 128x128, as
 *    fronteiras e as 27 mil luzes, isso pesa por beacon. Aqui, se o ponto está
 *    do outro lado do globo, o grupo fica invisível — uma conta, não uma
 *    travessia da cena.
 *
 * O PULSO é escala, não material novo: mexer em `scale` não recompila shader
 * nem cria alocação por quadro.
 */

interface Props {
  beacons: Beacon[];
  /** Para não desenhar (nem deixar clicar) o próprio sinal como convite. */
  meuClientId: string;
  onPedirConexao: (clientId: string) => void;
  /** Abriu um grupo: a interface mostra a lista de quem está ali. */
  onAbrirGrupo: (doGrupo: Beacon[]) => void;
}

/**
 * A que distância, em pixels de tela, dois sinais deixam de ser dois.
 *
 * Espalhar resolve a sobreposição de PERTO; de longe não há o que espalhar. Um
 * estado inteiro ocupa poucos pixels quando o globo cabe na tela, e dez sinais
 * em São Paulo viram uma mancha — não porque estejam no mesmo ponto, mas porque
 * não cabem. Espalhar mais seria jogar gente no estado vizinho, o que seria
 * mentira.
 *
 * Então, quando não cabem, viram um só que diz quantos são. É a mesma decisão
 * que qualquer mapa com muitos pinos toma, e pela mesma razão.
 */
const SEPARACAO_PX = 42;

const PX = 14;
const COR = '#22d3ee';
const COR_HOVER = '#67e8f9';
const CARD_RENDER_ORDER = 22;

// Compartilhados entre todos os marcadores.
const geoAnel = new THREE.TorusGeometry(0.5, 0.12, 8, 24);
const geoNucleo = new THREE.SphereGeometry(0.22, 12, 12);
/** O grupo que inclui o seu próprio sinal tem outra cor: você está ali dentro. */
const matMeuGrupo = new THREE.MeshStandardMaterial({
  color: '#a5f3fc',
  emissive: '#a5f3fc',
  emissiveIntensity: 1,
  metalness: 0.1,
  roughness: 0.5,
});

const matSinal = new THREE.MeshStandardMaterial({
  color: COR,
  emissive: COR,
  emissiveIntensity: 0.9,
  metalness: 0.1,
  roughness: 0.5,
});

const BeaconMarkers: FC<Props> = ({
  beacons,
  meuClientId,
  onPedirConexao,
  onAbrirGrupo,
}) => {
  const { size, camera } = useThree();

  /*
   * A DISTÂNCIA DA CÂMERA, EM DEGRAUS.
   *
   * O agrupamento depende do zoom: o que é uma mancha de longe são dez sinais
   * separados de perto. Mas refazer os grupos a cada quadro faria o React
   * reconciliar a cena inteira sessenta vezes por segundo enquanto a pessoa
   * gira o globo. Guardar a distância arredondada resolve: ela só muda quando o
   * zoom muda de verdade, e entre um degrau e outro nada é recalculado.
   */
  const [degrau, setDegrau] = useState(() => camera.position.length());
  useFrame(({ camera: cam }) => {
    const d = Math.round(cam.position.length() * 8) / 8;
    setDegrau((atual) => (atual === d ? atual : d));
  });

  const pontos = useMemo(
    () =>
      beacons.map((b) => {
        const e = espalharNaRegiao(b.lat, b.lon, b.clientId);
        return { beacon: b, pos: latLonToVector3(e.lat, e.lon, SPHERE_RADIUS * 1.004) };
      }),
    [beacons],
  );

  const grupos = useMemo(() => {
    /*
     * Quanto vale um pixel, em unidades de mundo, à distância de agora.
     *
     * É a conta da projeção em perspectiva invertida: a altura visível a uma
     * distância `d` é `2·d·tan(fov/2)`, e ela ocupa a altura do viewport em
     * pixels. A distância usada é até a SUPERFÍCIE, e não até o centro do globo
     * — é lá que os sinais estão, e medir do centro agruparia demais de perto.
     */
    const fov = ((camera as THREE.PerspectiveCamera).fov ?? 50) * (Math.PI / 180);
    const ateASuperficie = Math.max(0.05, degrau - SPHERE_RADIUS);
    const mundoPorPx =
      (2 * ateASuperficie * Math.tan(fov / 2)) / Math.max(1, size.height);
    const limite = SEPARACAO_PX * mundoPorPx;

    // Guloso: cada sinal entra no primeiro grupo perto o bastante. São poucos
    // sinais por tela, e um algoritmo melhor aqui não compraria nada.
    const saida: { pos: THREE.Vector3; itens: Beacon[] }[] = [];
    for (const { beacon, pos } of pontos) {
      const perto = saida.find((g) => g.pos.distanceTo(pos) <= limite);
      if (perto) perto.itens.push(beacon);
      else saida.push({ pos: pos.clone(), itens: [beacon] });
    }
    return saida;
  }, [pontos, degrau, camera, size.height]);

  if (beacons.length === 0) return null;

  return (
    <>
      {grupos.map((g) =>
        g.itens.length === 1 ? (
          <BeaconMarker
            key={g.itens[0]!.beaconId}
            beacon={g.itens[0]!}
            ehMeu={g.itens[0]!.clientId === meuClientId}
            onPedirConexao={onPedirConexao}
          />
        ) : (
          <GrupoDeSinais
            key={g.itens.map((b) => b.beaconId).join('|')}
            posicao={g.pos}
            itens={g.itens}
            temOMeu={g.itens.some((b) => b.clientId === meuClientId)}
            onAbrir={onAbrirGrupo}
          />
        ),
      )}
    </>
  );
};

/**
 * Vários sinais que, deste zoom, não cabem separados.
 *
 * Mostra QUANTOS são — e não um ponto maior — porque o número é a informação
 * que a pessoa quer: "tem gente aqui, e são cinco". Tocar abre a lista, que é
 * onde dá para escolher com quem falar. Aproximar também resolve: a partir de
 * certo zoom eles voltam a ser cinco sinais.
 */
const GrupoDeSinais: FC<{
  posicao: THREE.Vector3;
  itens: Beacon[];
  temOMeu: boolean;
  onAbrir: (doGrupo: Beacon[]) => void;
}> = ({ posicao, itens, temOMeu, onAbrir }) => {
  const grupo = useRef<THREE.Group>(null!);
  const anel = useRef<THREE.Mesh>(null!);
  const corCard = useRef<THREE.MeshBasicMaterial>(null);
  const { size } = useThree();

  const normal = useMemo(() => posicao.clone().normalize(), [posicao]);
  const quaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
    [normal],
  );

  const rotulo = `${itens.length} querem conversar`;
  const largura = useMemo(() => textEmWidth(rotulo) * 0.62 + 0.8, [rotulo]);

  useFrame(({ camera, clock }) => {
    const g = grupo.current;
    if (!g) return;
    const cam = camera as THREE.PerspectiveCamera;
    const distancia = cam.position.length();

    const frente = normal.dot(cam.position) / distancia;
    const visivel = frente > SPHERE_RADIUS / distancia;
    if (g.visible !== visivel) g.visible = visivel;
    if (!visivel) return;

    // Um pouco maior que um sinal sozinho: são vários.
    g.scale.setScalar(
      labelWorldScale(
        cam.position.distanceTo(posicao),
        PX * 1.25,
        cam.fov ?? 50,
        size.height,
      ),
    );
    if (anel.current) {
      const pulso = 1 + Math.sin(clock.elapsedTime * 2) * 0.18;
      anel.current.scale.set(pulso, pulso, 1);
    }
  });

  return (
    <group ref={grupo} position={posicao}>
      <group quaternion={quaternion}>
        <mesh ref={anel} geometry={geoAnel} material={temOMeu ? matMeuGrupo : matSinal} />
        <mesh geometry={geoNucleo} material={temOMeu ? matMeuGrupo : matSinal} />
      </group>

      <Billboard position={[0, 1.1, 0]}>
        <group
          onClick={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            onAbrir(itens);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
            corCard.current?.color.set(COR_HOVER);
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto';
            corCard.current?.color.set(COR);
          }}
        >
          <RoundedBox
            args={[largura, 1, 0.02]}
            radius={0.22}
            smoothness={3}
            renderOrder={CARD_RENDER_ORDER}
          >
            <meshBasicMaterial
              ref={corCard}
              color={COR}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </RoundedBox>
          <Text
            position={[0, 0, 0.04]}
            fontSize={0.55}
            color="#062a30"
            anchorX="center"
            anchorY="middle"
            renderOrder={CARD_RENDER_ORDER + 1}
          >
            {rotulo}
            <meshBasicMaterial
              color="#062a30"
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </Text>
        </group>
      </Billboard>
    </group>
  );
};

const BeaconMarker: FC<{
  beacon: Beacon;
  ehMeu: boolean;
  onPedirConexao: (clientId: string) => void;
}> = ({ beacon, ehMeu, onPedirConexao }) => {
  const grupo = useRef<THREE.Group>(null!);
  const anel = useRef<THREE.Mesh>(null!);
  const corCard = useRef<THREE.MeshBasicMaterial>(null);
  const { size } = useThree();

  /*
   * O PONTO É AFASTADO DO CENTRO DA REGIÃO, sempre do mesmo jeito.
   *
   * A coordenada que vem no beacon é a da região, não a da pessoa: todo mundo
   * no mesmo estado tem latitude e longitude idênticas, e os sinais ficavam um
   * exatamente em cima do outro — o de baixo sumia da vista e do clique.
   *
   * O afastamento sai do `clientId`, então é o mesmo em todo quadro e na tela
   * de todo mundo. Ver lib/geo/espalhar.ts.
   */
  const posicao = useMemo(() => {
    const p = espalharNaRegiao(beacon.lat, beacon.lon, beacon.clientId);
    return latLonToVector3(p.lat, p.lon, SPHERE_RADIUS * 1.004);
  }, [beacon.lat, beacon.lon, beacon.clientId]);
  const normal = useMemo(() => posicao.clone().normalize(), [posicao]);
  const quaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
    [normal],
  );

  const rotulo = ehMeu ? 'seu sinal' : (beacon.topic ?? 'quer conversar');
  const largura = useMemo(() => textEmWidth(rotulo) * 0.62 + 0.8, [rotulo]);

  useFrame(({ camera, clock }) => {
    const g = grupo.current;
    if (!g) return;

    const cam = camera as THREE.PerspectiveCamera;
    const distancia = cam.position.length();

    // Do outro lado do planeta: não desenha.
    const frente = normal.dot(cam.position) / distancia;
    const visivel = frente > SPHERE_RADIUS / distancia;
    if (g.visible !== visivel) g.visible = visivel;
    if (!visivel) return;

    g.scale.setScalar(
      labelWorldScale(cam.position.distanceTo(posicao), PX, cam.fov ?? 50, size.height),
    );

    // Pulso lento: chama atenção sem virar pisca-pisca.
    if (anel.current) {
      const p = 1 + Math.sin(clock.elapsedTime * 2) * 0.18;
      anel.current.scale.set(p, p, 1);
    }
  });

  const clicar = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (ehMeu) return;
    onPedirConexao(beacon.clientId);
  };

  return (
    <group ref={grupo} position={posicao}>
      <group quaternion={quaternion}>
        <mesh ref={anel} geometry={geoAnel} material={matSinal} />
        <mesh geometry={geoNucleo} material={matSinal} />
      </group>

      <Billboard position={[0, 1.1, 0]}>
        <group
          onClick={clicar}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (ehMeu) return;
            document.body.style.cursor = 'pointer';
            corCard.current?.color.set(COR_HOVER);
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto';
            corCard.current?.color.set(COR);
          }}
        >
          <RoundedBox
            args={[largura, 1, 0.02]}
            radius={0.22}
            smoothness={3}
            renderOrder={CARD_RENDER_ORDER}
          >
            <meshBasicMaterial
              ref={corCard}
              color={COR}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </RoundedBox>
          <Text
            position={[0, 0, 0.04]}
            fontSize={0.55}
            color="#062a30"
            anchorX="center"
            anchorY="middle"
            renderOrder={CARD_RENDER_ORDER + 1}
          >
            {rotulo}
            <meshBasicMaterial
              color="#062a30"
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </Text>
        </group>
      </Billboard>
    </group>
  );
};

export default BeaconMarkers;
