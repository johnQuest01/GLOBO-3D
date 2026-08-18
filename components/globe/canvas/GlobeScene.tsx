'use client';

import {
  FC,
  Suspense,
  Dispatch,
  SetStateAction,
  useMemo,
  useRef,
} from 'react';
import { OrbitControls } from '@react-three/drei';
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
import { latLonToVector3 } from '@/components/lib/utils';
import FlyingMessages from './FlyingMessages';
import type { GlobeMode } from '@/components/globe/ui/GlobeModeToggle';

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
  continentLabels: ContinentLabelData[];
  isLoadingLabels: boolean;
  flyingMessages: FlyingMessage[];
  onMessageComplete: (id: string) => void;
  globeMode: GlobeMode;
}

const SPHERE_RADIUS = 1.5;
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
    setIsHighResTextureActive,
    isHighResTextureActive,
    activeAds,
    countryLabels,
    continentLabels,
    isLoadingLabels,
    flyingMessages,
    onMessageComplete,
    globeMode,
  } = props;

  const controlsRef = useRef<OrbitControlsImpl>(null);

  const {
    placeholderTexture,
    lodTextures,
    areLodTexturesReady,
    lodConfig,
    requestLevel,
  } = useGlobeTextures();

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
          requestLevel={requestLevel}
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
        />

        {pinnedLocations.map((pin) => (
          <LocationPin key={pin.key} position={pin.position} name={pin.name} onInfoClick={() => openPopup(pin.key)} />
        ))}
        {tourismPin && (
          <LocationPin key={tourismPin.key} position={tourismPin.position} name={tourismPin.name} onInfoClick={() => openPopup(tourismPin.key)} />
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
      />
    </>
  );
};

export default GlobeScene;
