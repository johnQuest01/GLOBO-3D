'use client';

import {
  FC,
  Suspense,
  Dispatch,
  SetStateAction,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';

import { ContinentLabelData, CountryLabelData } from '@/app/hooks/useLabelData';
import GlobeLabels from '@/components/globe/canvas/GlobeLabels';
import { useGlobeTextures } from '@/app/hooks/useGlobeTextures';
import Earth from './Earth';
import Atmosphere from './AtmosphereGlow';
import GlobeBorders from './GlobeBorders';
import CityLights from './CityLights';
import Airplane from './Airplane';
import LocationPin from './LocationPin';
import Advertisements from './Advertisements';
import { PinnedLocation, AdData, AnimationState, FlyingMessage } from '@/app/types/globe';
import Missile from './Missile';
import BeaconMarkers from './BeaconMarkers';
import PersonFocus, { type AlvoDoFoco } from './PersonFocus';
import ConnectionArc from './ConnectionArc';
import type { Beacon } from '@/realtime/shared/protocol';
import { latLonToVector3 } from '@/components/lib/utils';
import FlyingMessages from './FlyingMessages';
import type { GlobeMode } from '@/components/globe/ui/GlobeModeToggle';
import {
  EARTH_DEGREES_PER_SECOND,
  ROTATION_SPEED_MULTIPLIER,
} from '@/app/lib/globeDayNight';

interface GlobeSceneProps {
  isPopupOpen: boolean;
  popupName: string | null;
  openPopup: (name: string) => void;
  closePopup: () => void;
  flightPath: { start: THREE.Vector3; end: THREE.Vector3 } | null;
  pinnedLocations: PinnedLocation[];
  tourismPin: PinnedLocation | null;
  animationState: AnimationState;
  /** Liga/desliga o que só aparece com a câmera perto (hoje, os anúncios). */
  setIsZoomedIn: Dispatch<SetStateAction<boolean>>;
  isZoomedIn: boolean;
  activeAds: AdData[];
  countryLabels: CountryLabelData[];
  continentLabels: ContinentLabelData[];
  isLoadingLabels: boolean;
  flyingMessages: FlyingMessage[];
  onMessageComplete: (id: string) => void;
  globeMode: GlobeMode;
  /** Sinais de quem esta disponivel para conversar (vazio sem realtime). */
  beacons: Beacon[];
  meuClientId: string;
  onPedirConexao: (clientId: string) => void;
  onAbrirSinal: (sinal: Beacon) => void;
  onAbrirGrupoDeSinais: (doGrupo: Beacon[]) => void;
  /** As duas pontas da conversa em andamento, quando ha uma. */
  arco: { de: THREE.Vector3; para: THREE.Vector3 } | null;
  arcoAtivo: boolean;
  /** Alguem procurado na lupa: a camera vai ate la e o ponto fica marcado. */
  alvoDaBusca: AlvoDoFoco | null;
}

const SPHERE_RADIUS = 1.5;

/** Eixo de rotação do planeta. */
const EIXO_DA_TERRA = new THREE.Vector3(0, 1, 0);
const COORDS = {
  kiev: { lat: 50.45, lon: 30.52 },
  moscow: { lat: 55.75, lon: 37.61 },
};

const GlobeScene: FC<GlobeSceneProps> = (props) => {
  const {
    isPopupOpen,
    popupName,
    openPopup,
    flightPath,
    pinnedLocations,
    tourismPin,
    animationState,
    setIsZoomedIn,
    isZoomedIn,
    activeAds,
    countryLabels,
    continentLabels,
    isLoadingLabels,
    flyingMessages,
    onMessageComplete,
    globeMode,
    beacons,
    meuClientId,
    onPedirConexao,
    onAbrirSinal,
    onAbrirGrupoDeSinais,
    arco,
    arcoAtivo,
    alvoDaBusca,
  } = props;

  const controlsRef = useRef<OrbitControlsImpl>(null);

  const { placeholderTexture, dayTexture } = useGlobeTextures();

  const missilePaths = useMemo(() => {
    const kievVec = latLonToVector3(COORDS.kiev.lat, COORDS.kiev.lon, SPHERE_RADIUS);
    const moscowVec = latLonToVector3(COORDS.moscow.lat, COORDS.moscow.lon, SPHERE_RADIUS);
    return {
      kievToMoscow: { start: kievVec, end: moscowVec },
      moscowToKiev: { start: moscowVec, end: kievVec },
    };
  }, []);

  const isInteractive = !isPopupOpen;

  /**
   * Chaves dos lugares que estão com pino. Vai para os rótulos, que escondem o
   * nome desses lugares enquanto o card azul do pino estiver na tela.
   */
  const pinnedKeys = useMemo(() => {
    const keys = new Set(pinnedLocations.map((pin) => pin.key));
    if (tourismPin) keys.add(tourismPin.key);
    return keys;
  }, [pinnedLocations, tourismPin]);

  /**
   * Giro da Terra no modo Relógio.
   *
   * A camera e que orbita, nao o globo: visualmente e o mesmo movimento
   * relativo, mas o mundo continua parado — e rotulos, fronteiras, luzes e
   * pinos dependem disso, por estarem em coordenadas de mundo.
   *
   * Duas tentativas anteriores falharam pelo mesmo motivo, e vale registrar:
   * tanto o `autoRotate` do OrbitControls quanto o `setAzimuthalAngle` passam
   * pelo amortecimento. Com dampingFactor 0.02, so 2% do passo entra por
   * quadro, e como o passo seguinte e calculado a partir do angulo ja
   * amortecido, o giro nunca acumula: medido, saiam 1,19 graus onde eram
   * esperados 30.
   *
   * Girar o vetor de posicao resolve porque o `update()` do OrbitControls
   * deriva o angulo esferico DA POSICAO da camera a cada chamada — ele aceita
   * a posicao nova em vez de brigar com ela. A prioridade -2 garante que isto
   * rode antes do update (que o drei registra em -1).
   */
  useFrame(({ camera }, delta) => {
    if (globeMode !== 'relogio' || !isInteractive) return;

    const passo = THREE.MathUtils.degToRad(
      EARTH_DEGREES_PER_SECOND * ROTATION_SPEED_MULTIPLIER * delta,
    );
    camera.position.applyAxisAngle(EIXO_DA_TERRA, passo);
  }, -2);

  if (!placeholderTexture) {
    return null;
  }

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} />

      <Suspense fallback={null}>
        <Atmosphere />
        <Earth
          placeholderTexture={placeholderTexture}
          dayTexture={dayTexture}
          isInteractive={isInteractive}
          onZoomedInChange={setIsZoomedIn}
          mode={globeMode}
        />

        <CityLights mode={globeMode} isPopupOpen={isPopupOpen} />

        <GlobeBorders isPopupOpen={isPopupOpen} />

        <FlyingMessages
          messages={flyingMessages}
          onMessageComplete={onMessageComplete}
        />

        <GlobeLabels
          countryLabels={countryLabels}
          continentLabels={continentLabels}
          isLoadingLabels={isLoadingLabels}
          popupName={popupName}
          isPopupOpen={isPopupOpen}
          openPopup={openPopup}
          pinnedKeys={pinnedKeys}
        />

        {pinnedLocations.map((pin) => (
          <LocationPin key={pin.key} position={pin.position} name={pin.name} onInfoClick={() => openPopup(pin.key)} />
        ))}
        {tourismPin && (
          <LocationPin key={tourismPin.key} position={tourismPin.position} name={tourismPin.name} onInfoClick={() => openPopup(tourismPin.key)} />
        )}

        {/* Sinais e a linha da conversa. Fora do popup: com um popup aberto o
            quadro e do popup, e o globo inteiro sai de cena. */}
        {!isPopupOpen && (
          <>
            <PersonFocus alvo={alvoDaBusca} />
            <BeaconMarkers
              beacons={beacons}
              meuClientId={meuClientId}
              onAbrirSinal={onAbrirSinal}
              onAbrirGrupo={onAbrirGrupoDeSinais}
            />
          </>
        )}
        {arco && !isPopupOpen && (
          <ConnectionArc de={arco.de} para={arco.para} ativa={arcoAtivo} />
        )}

        {flightPath && animationState['airplane-travel'] && (
          <Airplane startVec={flightPath.start} endVec={flightPath.end} />
        )}

        {!isPopupOpen && (
          <>
            <Missile
              startVec={missilePaths.kievToMoscow.start}
              endVec={missilePaths.kievToMoscow.end}
              delay={0}
              isAnimated={animationState['missile-kiev-moscow']}
            />
            <Missile
              startVec={missilePaths.moscowToKiev.start}
              endVec={missilePaths.moscowToKiev.end}
              delay={1.5}
              isAnimated={animationState['missile-moscow-kiev']}
            />
          </>
        )}

        {isZoomedIn && !isPopupOpen && (
          <Advertisements ads={activeAds} />
        )}
      </Suspense>

      <EnquadramentoInicial />

      <OrbitControls
        ref={controlsRef}
        enableZoom={isInteractive}
        enablePan={false}
        enableRotate={isInteractive}
        minDistance={1.7}
        maxDistance={15.0}
        enableDamping={true}
        dampingFactor={0.02}
        rotateSpeed={0.5}
      />
    </>
  );
};

export default GlobeScene;

/**
 * O tamanho do globo ao entrar — igual no computador e no celular.
 *
 * A REFERÊNCIA SÃO DUAS CAPTURAS de tela (pasta globo.tamanho/): no computador
 * o globo ocupa uns 66% da ALTURA; no celular, uns 79% da LARGURA. São
 * proporções diferentes porque a tela limita em eixos diferentes — deitada,
 * o que sobra é largura; em pé, o que sobra é altura. Uma distância fixa de
 * câmera (o `position: [0, 0, 3]` de antes) dava um globo que estourava a
 * tela no computador e ficava pequeno demais no celular.
 *
 * A CONTA: o raio angular aparente de uma esfera é asin(R / d). Queremos que
 * ele seja a fração pedida do meio-campo de visão no eixo limitante; d sai
 * disso. Roda UMA vez, ao montar — depois a câmera é de quem estiver com a
 * mão nela, e uma rotação de tela no meio do uso não deve puxá-la de volta.
 */
const FRACAO_DA_ALTURA_DEITADO = 0.66;
const FRACAO_DA_LARGURA_EM_PE = 0.79;
const RAIO_DO_GLOBO = 1.5;

function EnquadramentoInicial() {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const meioV = THREE.MathUtils.degToRad(cam.fov / 2);
    const meioH = Math.atan(Math.tan(meioV) * (size.width / Math.max(1, size.height)));
    const deitado = size.width >= size.height;
    const alvo = deitado
      ? FRACAO_DA_ALTURA_DEITADO * meioV
      : FRACAO_DA_LARGURA_EM_PE * meioH;
    const d = RAIO_DO_GLOBO / Math.sin(alvo);
    cam.position.setLength(THREE.MathUtils.clamp(d, 1.7, 15));
    cam.updateProjectionMatrix();
    /*
     * PEDIR O QUADRO. Descoberto medindo em produção: a câmera ia para a
     * distância certa e a tela ficava PRETA até a primeira interação — um
     * `resize` sintético, sem mudar nada, fazia o globo aparecer no tamanho
     * exato. Mover a câmera num efeito não avisa o laço de desenho; o
     * `invalidate` avisa. O segundo, um quadro depois, é para os controles de
     * órbita (que montam depois deste efeito) lerem a posição nova.
     */
    invalidate();
    requestAnimationFrame(() => invalidate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
