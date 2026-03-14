'use client';

import {
  FC,
  Suspense,
  Dispatch,
  SetStateAction,
  useMemo,
  useState,
  useRef,
  useEffect,
} from 'react';
import { OrbitControls } from '@react-three/drei';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';

import { CountryLabelData } from '@/app/hooks/useLabelData';
import StateLabels from '@/components/globe/canvas/StateLabels';
import { useGlobeTextures } from '@/app/hooks/useGlobeTextures';
import Earth from './Earth';
import CountryLabels from './CountryLabels';
import Atmosphere from './AtmosphereGlow';
import Airplane from './Airplane';
import LocationPin from './LocationPin';
import Advertisements from './Advertisements';
import { PinnedLocation, AdData, AnimationState, FlyingMessage } from '@/app/types/globe';
import Missile from './Missile';
import { latLonToVector3 } from '@/components/lib/utils';
import FlyingMessages from './FlyingMessages';

interface GlobeSceneProps {
  isPopupOpen: boolean;
  popupName: string | null;
  openPopup: (name: string) => void;
  closePopup: () => void;
  flightPath: { start: THREE.Vector3; end: THREE.Vector3 } | null;
  pinnedLocations: PinnedLocation[];
  tourismPin: PinnedLocation | null;
  animationState: AnimationState;
  setIsHighResTextureActive: Dispatch<SetStateAction<boolean>>;
  isHighResTextureActive: boolean;
  activeAds: AdData[];
  countryLabels: CountryLabelData[];
  isLoadingLabels: boolean;
  flyingMessages: FlyingMessage[];
  onMessageComplete: (id: string) => void;
}

type CountryLabelWithPosition = CountryLabelData & { position: THREE.Vector3 };

const SPHERE_RADIUS = 1.5;
const COORDS = {
  kiev: { lat: 50.45, lon: 30.52 },
  moscow: { lat: 55.75, lon: 37.61 },
};
const COUNTRY_VISIBILITY_THRESHOLD = 3.5;
const COUNTRY_VISIBLE_COUNT = 5;
const CONTINENT_KEYS = new Set([
  'south-america', 'north-america', 'europe', 'africa', 'asia', 'oceania', 'antarctica'
]);

const GlobeScene: FC<GlobeSceneProps> = (props) => {
  const {
    isPopupOpen,
    popupName,
    openPopup,
    flightPath,
    pinnedLocations,
    tourismPin,
    animationState,
    setIsHighResTextureActive,
    isHighResTextureActive,
    activeAds,
    countryLabels,
    isLoadingLabels,
    flyingMessages,
    onMessageComplete,
  } = props;

  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const [top5CountryLabels, setTop5CountryLabels] = useState<CountryLabelWithPosition[]>([]);
  const [countriesInView, setCountriesInView] = useState<CountryLabelWithPosition[]>([]);
  const [cameraDistance, setCameraDistance] = useState(3);

  const {
    placeholderTexture,
    lodTextures,
    areLodTexturesReady,
    lodConfig,
  } = useGlobeTextures();

  const allProcessedCountryLabels = useMemo(() => {
    if (!countryLabels) return [];
    return countryLabels.map((label) => ({
      ...label,
      position: latLonToVector3(label.lat, label.lon, SPHERE_RADIUS),
    }));
  }, [countryLabels]);

  const updateVisibleLabels = (camera: THREE.Camera) => {
    const distance = camera.position.length();
    setCameraDistance(distance);

    if (isPopupOpen) {
      if (top5CountryLabels.length > 0) setTop5CountryLabels([]);
      if (countriesInView.length > 0) setCountriesInView([]);
      return;
    }

    const sortedInView = allProcessedCountryLabels
      .map((label) => ({
        ...label,
        dotProduct: label.position.clone().normalize().dot(camera.position.clone().normalize()),
      }))
      .filter((label) => label.dotProduct > 0.1)
      .sort((a, b) => b.dotProduct - a.dotProduct);

    // Evita sobreposição de labels na tela:
    // percorre na ordem de relevância e só aceita um label
    // se ele estiver "longe o suficiente" em coordenadas de tela (NDC) dos já aceitos.
    const nonOverlapping: typeof sortedInView = [];
    const occupiedScreenPositions: { x: number; y: number }[] = [];
    const MIN_SCREEN_DIST = 0.08; // distância mínima em NDC (0..1) entre labels

    for (const label of sortedInView) {
      const projected = label.position.clone().project(camera);
      const x = projected.x;
      const y = projected.y;

      let tooClose = false;
      for (const p of occupiedScreenPositions) {
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy < MIN_SCREEN_DIST * MIN_SCREEN_DIST) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        occupiedScreenPositions.push({ x, y });
        nonOverlapping.push(label);
      }
    }

    setCountriesInView(nonOverlapping);

    const visibleNow = nonOverlapping.filter(label => {
      if (CONTINENT_KEYS.has(label.key)) {
        return distance < COUNTRY_VISIBILITY_THRESHOLD && distance > 1.9;
      }
      return distance < COUNTRY_VISIBILITY_THRESHOLD;
    });

    setTop5CountryLabels(visibleNow.slice(0, COUNTRY_VISIBLE_COUNT));
  };

  useEffect(() => {
    if (!isLoadingLabels && controlsRef.current) {
      updateVisibleLabels(camera);
    }
  }, [isLoadingLabels, camera, allProcessedCountryLabels]);

  useEffect(() => {
    if (!isPopupOpen && controlsRef.current) {
      updateVisibleLabels(camera);
    }
  }, [isPopupOpen]);

  const missilePaths = useMemo(() => {
    const kievVec = latLonToVector3(COORDS.kiev.lat, COORDS.kiev.lon, SPHERE_RADIUS);
    const moscowVec = latLonToVector3(COORDS.moscow.lat, COORDS.moscow.lon, SPHERE_RADIUS);
    return {
      kievToMoscow: { start: kievVec, end: moscowVec },
      moscowToKiev: { start: moscowVec, end: kievVec },
    };
  }, []);

  const isInteractive = !isPopupOpen;

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
          lodTextures={lodTextures}
          lodConfig={lodConfig}
          areLodTexturesReady={areLodTexturesReady}
          isInteractive={isInteractive}
          onLODChange={setIsHighResTextureActive}
        />
        
        {/* --- AQUI ESTÁ O BLOCO DE MENSAGENS --- */}
        {/* Ele renderiza independente das outras condições de animação */}
        <FlyingMessages 
            messages={flyingMessages} 
            onMessageComplete={onMessageComplete} 
        />

        <CountryLabels visibleLabels={top5CountryLabels} openPopup={openPopup} />
        {isHighResTextureActive && (
          <StateLabels
            visibleCountries={countriesInView}
            cameraDistance={cameraDistance}
            popupName={popupName}
            openPopup={openPopup}
          />
        )}

        {pinnedLocations.map((pin) => (
          <LocationPin key={pin.key} position={pin.position} name={pin.name} onInfoClick={() => openPopup(pin.key)} />
        ))}
        {tourismPin && (
          <LocationPin key={tourismPin.key} position={tourismPin.position} name={tourismPin.name} onInfoClick={() => openPopup(tourismPin.key)} />
        )}

        {/* Avião: Verifica se há rota E se a animação está ligada */}
        {flightPath && animationState['airplane-travel'] && (
          <Airplane startVec={flightPath.start} endVec={flightPath.end} />
        )}

        {/* Mísseis: Apenas se popup fechado E animação ligada */}
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

        {isHighResTextureActive && !isPopupOpen && (
          <Advertisements ads={activeAds} />
        )}
      </Suspense>

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
        onEnd={() => {
          if (controlsRef.current?.object) {
            updateVisibleLabels(controlsRef.current.object as THREE.Camera);
          }
        }}
      />
    </>
  );
};

export default GlobeScene;