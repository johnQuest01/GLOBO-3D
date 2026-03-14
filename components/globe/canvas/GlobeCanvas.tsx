'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';

import { useGlobeStateAndHandlers } from '@/app/hooks/useGlobeStateAndHandlers';
import { usePopupContent } from '@/app/hooks/usePopupContent';
import { useMessageSystem } from '@/app/hooks/useMessageSystem';
import { useGeoMapping } from '@/app/hooks/useGeoMapping';

import GlobeScene from './GlobeScene';

const StatePopup = dynamic(() => import('@/components/globe/ui/StatePopup'));
const CountryPopup = dynamic(() => import('@/components/globe/ui/CountryPopup'));
const TravelPopup = dynamic(() => import('@/components/globe/ui/TravelPopup'));
const BaggagePopup = dynamic(() => import('@/components/globe/ui/BaggagePopup'));
const VacationPopup = dynamic(() => import('@/components/globe/ui/VacationPopup'));
const AdminAnimationPopup = dynamic(() => import('@/components/globe/ui/AdminAnimationPopup'));
const UserProfilePopup = dynamic(() => import('@/components/globe/ui/UserProfilePopup'));
const MenuPopup = dynamic(() => import('@/components/globe/ui/MenuPopup'));
const MyNewsPopup = dynamic(() => import('@/components/globe/ui/MyNewsPopup'));
const MyTouristSitesPopup = dynamic(() => import('@/components/globe/ui/MyTouristSitesPopup'));
const DynamicNewsPopup = dynamic(() => import('@/components/globe/ui/DynamicNewsPopup'));
const AdvertisePopup = dynamic(() => import('@/components/globe/ui/AdvertisePopup'));
const TourismPopup = dynamic(() => import('@/components/globe/ui/TourismPopup'));
const MyVacationSpotsPopup = dynamic(() => import('@/components/globe/ui/MyVacationSpotsPopup'));
// Importa o Popup de Mensagem Atualizado
const MessageInputPopup = dynamic(() => import('@/components/globe/ui/MessageInputPopup'));

import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import FlightButton from '@/components/globe/ui/FlightButton';
import BaggageButton from '@/components/globe/ui/BaggageButton';
import DynamicNewsButton from '@/components/globe/ui/DynamicNewsButton';
import UserProfileButton from '@/components/globe/ui/UserProfileButton';
import AdvertiseButton from '@/components/globe/ui/AdvertiseButton';
import ClearPinsButton from '@/components/ui/ClearPinsButton';
import LockControl from '@/components/ui/LockControl';
import SettingsIcon from '@/app/icons/SettingsIcon';
import MessageButton from '@/components/globe/ui/MessageButton';

import {
  GlobalNewsItem,
  NewsCategory,
  PlaceContent,
  CountryContent,
} from '@/app/types/globe';

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

const useAllNews = (
  rawContentData: ReturnType<typeof usePopupContent>['rawContentData'],
  translations: ReturnType<typeof usePopupContent>['translations'],
) => {
  return useMemo(() => {
    const allNews: GlobalNewsItem[] = [];
    if (!rawContentData || !translations) return allNews;
    const categoryLabels: Record<NewsCategory, string> = {
      local: 'Local',
      science: 'Ciência',
      business: 'Negócios',
      entertainment: 'Entretenimento',
      sports: 'Esportes',
      health: 'Saúde',
    };
    for (const placeKey in rawContentData) {
      if (placeKey === 'default') continue;
      const content = rawContentData[placeKey];
      if (content && content.news) {
        const placeName = translations[placeKey] || placeKey;
        for (const categoryKey in content.news) {
          const catKeyTyped = categoryKey as NewsCategory;
          const articles = content.news[catKeyTyped];
          if (articles) {
            articles.forEach((article) => {
              allNews.push({
                placeKey,
                placeName,
                categoryKey: catKeyTyped,
                categoryLabel: categoryLabels[catKeyTyped] || catKeyTyped,
                article,
              });
            });
          }
        }
      }
    }
    return allNews;
  }, [rawContentData, translations]);
};

// Logger da câmera
const CameraStateLogger = ({ cameraStateRef }: { cameraStateRef: React.MutableRefObject<{ position: THREE.Vector3, quaternion: THREE.Quaternion }> }) => {
    const { camera } = useThree();
    useFrame(() => {
        cameraStateRef.current.position.copy(camera.position);
        cameraStateRef.current.quaternion.copy(camera.quaternion);
    });
    return null;
};

export default function GlobeCanvas() {
  const { states, setters, handlers, externalData } =
    useGlobeStateAndHandlers();

  const allNewsItems = useAllNews(
    externalData.rawContentData,
    externalData.translations,
  );

  const {
    isMessagePopupOpen,
    handleOpenMessagePopup,
    handleCloseMessagePopup,
    flyingMessages,
    addMessage,
    removeMessage,
  } = useMessageSystem();

  const { keyToVector3 } = useGeoMapping();

  const cameraStateRef = useRef({
      position: new THREE.Vector3(0, 0, 3),
      quaternion: new THREE.Quaternion(),
  });

  // --- LÓGICA DE DESTINO INTELIGENTE ---
  const handleSendMessage = (text: string, destination: string) => {
    let targetVector: THREE.Vector3 | null = null;
    
    // Se o usuário digitou um destino
    if (destination && destination.trim() !== '') {
        const lowerDest = destination.toLowerCase().trim();
        
        // Procura nos locais disponíveis (flightLocations)
        // 1. Tenta correspondência exata primeiro (Nome ou Chave)
        let foundLoc = externalData.flightLocations.find(
            loc => loc.name.toLowerCase() === lowerDest || loc.key.toLowerCase() === lowerDest
        );

        // 2. Se não achar exato, tenta "contém" (ex: "Paulo" acha "São Paulo")
        if (!foundLoc) {
            foundLoc = externalData.flightLocations.find(
                loc => loc.name.toLowerCase().includes(lowerDest)
            );
        }

        if (foundLoc) {
            // Converte para coordenada 3D
            const vec = keyToVector3(foundLoc.key, 1.5);
            if (vec) {
                targetVector = vec;
                console.log(`Mensagem viajando para: ${foundLoc.name}`);
            }
        } else {
            console.log(`Destino "${destination}" não encontrado, enviando para o centro.`);
        }
    }

    // Adiciona a mensagem ao sistema (com ou sem alvo específico)
    addMessage(text, cameraStateRef.current, targetVector);
  };

  return (
    <div
      className="w-full h-screen bg-black relative"
      style={{ overscrollBehavior: 'none' }}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 3], fov: 50, near: 0.1, far: 1000 }}
        gl={{
          powerPreference: 'high-performance',
          antialias: true,
          stencil: false,
          depth: true,
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      >
        <CameraStateLogger cameraStateRef={cameraStateRef} />

        <Suspense fallback={null}>
          <GlobeScene
            isPopupOpen={states.isAnyPopupOpen || isMessagePopupOpen}
            popupName={states.popupNameKey}
            openPopup={handlers.openPopup}
            closePopup={handlers.closeAllPopups}
            flightPath={states.flightPath}
            pinnedLocations={states.pinnedLocations}
            tourismPin={states.tourismPin}
            animationState={externalData.animationState}
            setIsHighResTextureActive={setters.setIsHighResTextureActive}
            isHighResTextureActive={states.isHighResTextureActive}
            activeAds={states.activeAds}
            countryLabels={externalData.countryLabels}
            isLoadingLabels={externalData.isLoadingLabels}
            flyingMessages={flyingMessages}
            onMessageComplete={removeMessage}
          />
        </Suspense>
      </Canvas>

      <div className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none">
        <div className="pointer-events-auto">
          <AppHeader
            isVisible={states.isMainUiVisible}
            onMenuClick={handlers.handleOpenMenuPopup}
          />
          <AppFooter
            isVisible={states.isMainUiVisible}
            onVacationClick={handlers.handleOpenTourismPopup}
          />
        </div>
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <LockControl
            isVisible={states.isUiVisible}
            onLockClick={handlers.handleLockClick}
            className="pointer-events-auto"
          />
          <AdvertiseButton
            onClick={handlers.handleOpenAdvertisePopup}
            disabled={states.isAnyPopupOpen}
            isVisible={states.isMainUiVisible}
            className="bottom-[4.5rem] pointer-events-auto"
          />
          <FlightButton
            onClick={handlers.handleOpenTravelPopup}
            disabled={states.isAnyPopupOpen || externalData.isLoadingLocations}
            isVisible={states.isMainUiVisible}
            className="bottom-[8.5rem] pointer-events-auto"
          />
          <BaggageButton
            onClick={handlers.handleOpenBaggagePopup}
            disabled={states.isAnyPopupOpen}
            isVisible={states.isMainUiVisible}
            className="bottom-[12.5rem] pointer-events-auto"
          />
          <DynamicNewsButton
            onClick={handlers.handleOpenDynamicNews}
            disabled={states.isAnyPopupOpen || allNewsItems.length === 0}
            isVisible={states.isMainUiVisible}
            className="bottom-[16.5rem] pointer-events-auto"
          />
          <UserProfileButton
            onClick={handlers.handleOpenUserProfile}
            disabled={states.isAnyPopupOpen}
            isVisible={states.isMainUiVisible}
            className="bottom-[20.5rem] pointer-events-auto"
          />
         
          <MessageButton
            onClick={handleOpenMessagePopup}
            disabled={states.isAnyPopupOpen}
            isVisible={states.isMainUiVisible}
            className="bottom-[24.5rem] pointer-events-auto"
          />

          <ClearPinsButton
            onClick={handlers.handleClearPins}
            isVisible={
              states.isMainUiVisible &&
              (states.pinnedLocations.length > 0 || !!states.tourismPin)
            }
            className="bottom-4 left-4 pointer-events-auto"
          />
          {IS_DEVELOPMENT && (
            <>
              <button
                onClick={() => setters.setIsAdminNewsEnabled((prev) => !prev)}
                title={states.isAdminNewsEnabled ? 'Desabilitar Notícias' : 'Habilitar Notícias'}
                className={`absolute right-4 z-40 px-5 py-3 text-base font-bold rounded-full shadow-lg transition-all duration-300 w-32 ${
                  states.isAdminNewsEnabled
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                } text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                  states.isAdminNewsEnabled
                    ? 'focus:ring-red-500'
                    : 'focus:ring-green-500'
                } bottom-[32.5rem] pointer-events-auto`}
              >
                {states.isAdminNewsEnabled ? 'News: ON' : 'News: OFF'}
              </button>
              <button
                onClick={handlers.handleOpenAdminAnimPopup}
                disabled={states.isAnyPopupOpen}
                title="Configurar Animações"
                className="absolute right-4 z-40 p-4 rounded-full shadow-lg bg-cyan-600 text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-cyan-500 disabled:bg-gray-600 disabled:opacity-50 bottom-[28.5rem] pointer-events-auto"
              >
                <SettingsIcon />
              </button>
            </>
          )}
        </div>
        <Suspense fallback={null}>
          {states.isAnyPopupOpen && (
            <div className="absolute top-0 left-0 w-full h-full z-50 pointer-events-auto">
              {states.popupData && !states.popupData.isCountry && (
                <StatePopup
                  name={states.popupData.displayName}
                  onClose={handlers.closeAllPopups}
                  activeTab={states.activeTab}
                  setActiveTab={setters.setActiveTab}
                  content={states.popupData.content as PlaceContent}
                  isAdminNewsEnabled={states.isAdminNewsEnabled}
                  placeKey={states.popupNameKey!}
                  newsCategory={states.newsCategory}
                  setNewsCategory={setters.setNewsCategory}
                  selectedArticleIndex={states.selectedArticleIndex}
                  setSelectedArticleIndex={setters.setSelectedArticleIndex}
                />
              )}
              {states.popupData && states.popupData.isCountry && (
                <CountryPopup
                  name={states.popupData.displayName}
                  onClose={handlers.closeAllPopups}
                  content={states.popupData.content as CountryContent}
                />
              )}
              {states.isDynamicNewsOpen && (
                <DynamicNewsPopup
                  isOpen={states.isDynamicNewsOpen}
                  onClose={handlers.handleCloseDynamicNews}
                  allNews={allNewsItems}
                  onArticleClick={handlers.handleDynamicNewsArticleClick}
                />
              )}
              {states.isTourismPopupOpen && (
                <TourismPopup
                  isOpen={states.isTourismPopupOpen}
                  onClose={handlers.handleCloseTourismPopup}
                  onShowOnGlobe={handlers.handleShowTourismPinOnGlobe}
                />
              )}
              {states.isTravelPopupOpen && (
                <TravelPopup
                  isOpen={states.isTravelPopupOpen}
                  onClose={handlers.handleCloseTravelPopup}
                  onSubmit={handlers.handleTravelSubmit}
                  locations={externalData.flightLocations}
                />
              )}
              {states.isBaggagePopupOpen && (
                <BaggagePopup
                  isOpen={states.isBaggagePopupOpen}
                  onClose={handlers.handleCloseBaggagePopup}
                />
              )}
              {states.isVacationPopupOpen && (
                <VacationPopup
                  isOpen={states.isVacationPopupOpen}
                  onClose={handlers.handleCloseVacationPopup}
                  onSubmit={handlers.handlePinLocationSubmit}
                  locations={externalData.flightLocations}
                />
              )}
              {states.isAdminAnimOpen && (
                <AdminAnimationPopup
                  isOpen={states.isAdminAnimOpen}
                  onClose={handlers.handleCloseAdminAnimPopup}
                  animationState={externalData.animationState}
                  toggleAnimation={externalData.animControls.toggleAnimation}
                  stopAllAnimations={
                    externalData.animControls.stopAllAnimations
                  }
                  startAllAnimations={
                    externalData.animControls.startAllAnimations
                  }
                />
              )}
              {states.isUserProfileOpen && (
                <UserProfilePopup
                  isOpen={states.isUserProfileOpen}
                  onClose={handlers.handleCloseUserProfile}
                  onLogout={handlers.handleLogout}
                  user={states.currentUser}
                />
              )}
              {states.isMenuPopupOpen && (
                <MenuPopup
                  isOpen={states.isMenuPopupOpen}
                  onClose={handlers.handleCloseMenuPopup}
                  onMyNewsClick={handlers.handleOpenMyNews}
                  onMyTouristSitesClick={handlers.handleOpenMyTouristSites}
                  onMyVacationSpotsClick={handlers.handleOpenMyVacationSpots}
                />
              )}
              {states.isMyNewsPopupOpen && (
                <MyNewsPopup
                  isOpen={states.isMyNewsPopupOpen}
                  onClose={handlers.handleCloseMyNews}
                  onArticleClick={handlers.handleOpenSavedNewsArticle}
                />
              )}
              {states.isMyTouristSitesPopupOpen && (
                <MyTouristSitesPopup
                  isOpen={states.isMyTouristSitesPopupOpen}
                  onClose={handlers.handleCloseMyTouristSites}
                />
              )}
              {states.isAdvertisePopupOpen && (
                <AdvertisePopup
                  isOpen={states.isAdvertisePopupOpen}
                  onClose={handlers.handleCloseAdvertisePopup}
                  onAdSubmit={handlers.handleAdSubmit}
                />
              )}
              {states.isMyVacationSpotsPopupOpen && (
                <MyVacationSpotsPopup
                  isOpen={states.isMyVacationSpotsPopupOpen}
                  onClose={handlers.handleCloseMyVacationSpots}
                  onSpotClick={handlers.handleOpenSavedSpotOnGlobe}
                />
              )}
            </div>
          )}
          
          {isMessagePopupOpen && (
            <div className="absolute top-0 left-0 w-full h-full z-[120] pointer-events-auto">
              <MessageInputPopup
                isOpen={isMessagePopupOpen}
                onClose={handleCloseMessagePopup}
                onSend={handleSendMessage}
              />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}