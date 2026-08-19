'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { useGlobeStateAndHandlers } from '@/app/hooks/useGlobeStateAndHandlers';
import { usePopupContent } from '@/app/hooks/usePopupContent';
import { useMessageSystem } from '@/app/hooks/useMessageSystem';
import { useGeoMapping } from '@/app/hooks/useGeoMapping';
import { useBehaviorTracker } from '@/app/hooks/useBehaviorTracker';

import GlobeScene from './GlobeScene';
import StatePopup from '@/components/globe/ui/StatePopup';
import CountryPopup from '@/components/globe/ui/CountryPopup';
import TravelPopup from '@/components/globe/ui/TravelPopup';
import BaggagePopup from '@/components/globe/ui/BaggagePopup';
import VacationPopup from '@/components/globe/ui/VacationPopup';
import AdminAnimationPopup from '@/components/globe/ui/AdminAnimationPopup';
import UserProfilePopup from '@/components/globe/ui/UserProfilePopup';
import MenuPopup from '@/components/globe/ui/MenuPopup';
import MyNewsPopup from '@/components/globe/ui/MyNewsPopup';
import MyTouristSitesPopup from '@/components/globe/ui/MyTouristSitesPopup';
import DynamicNewsPopup from '@/components/globe/ui/DynamicNewsPopup';
import AdvertisePopup from '@/components/globe/ui/AdvertisePopup';
import TourismPopup from '@/components/globe/ui/TourismPopup';
import MyVacationSpotsPopup from '@/components/globe/ui/MyVacationSpotsPopup';
import MessageInputPopup from '@/components/globe/ui/MessageInputPopup';
import GlobeModeToggle, { GlobeMode } from '@/components/globe/ui/GlobeModeToggle';
import AdminLoginPopup from '@/components/globe/ui/AdminLoginPopup';
import GlobeClock from '@/components/globe/ui/GlobeClock';

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


/**
 * Abertura da camera, em graus.
 *
 * NAO aumente isto para tentar ver mais nomes — foi medido e faz o contrario.
 * O nivel de detalhe dos rotulos vem do `viewZoom()`, que mede QUANTOS GRAUS de
 * globo cabem na altura da tela. Abrir a lente faz caber mais graus, entao o
 * app se comporta como se voce tivesse afastado: passa a mostrar menos nomes e
 * mais grossos. Em 58 graus, os nomes colocados cairam de 8 para 2.
 *
 * Para ver mais nomes, os controles certos estao em app/lib/globeLabels.ts:
 * `uiBlockedRects` (area reservada a interface), o fator do horizonte em
 * `placeLabels` e `maxLabelsForViewport`.
 */
const CAMERA_FOV = 50;

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

  // Coletor do algoritmo de comportamento. Nada aqui roda por quadro: os
  // eventos vao para uma fila e sao descarregados em lote.
  const { track, startDwell, endDwell } = useBehaviorTracker();

  /**
   * Um local aberto conta duas vezes para o algoritmo: o interesse em abrir, e
   * o tempo que a pessoa ficou lendo. O segundo vale mais — abrir por engano e
   * fechar em um segundo nao e sinal de nada.
   */
  const abertoRef = useRef<string | null>(null);
  useEffect(() => {
    const atual = states.popupNameKey;
    const anterior = abertoRef.current;
    if (atual === anterior) return;

    if (anterior) endDwell(`local:${anterior}`, { regionKey: anterior });
    if (atual) {
      startDwell(`local:${atual}`);
      track({ kind: 'region_view', regionKey: atual });
    }
    abertoRef.current = atual;
  }, [states.popupNameKey, track, startDwell, endDwell]);

  /** Categoria de noticia escolhida: sinal direto de assunto preferido. */
  useEffect(() => {
    if (!states.popupNameKey || !states.newsCategory) return;
    track({
      kind: 'news_open',
      regionKey: states.popupNameKey,
      topic: states.newsCategory,
    });
  }, [states.popupNameKey, states.newsCategory, track]);

  // Modo do globo. Fica no localStorage para o usuário não ter que reescolher
  // a cada visita.
  const [globeMode, setGlobeMode] = useState<GlobeMode>('padrao');
  useEffect(() => {
    const saved = localStorage.getItem('globeMode');
    if (saved === 'padrao' || saved === 'relogio') setGlobeMode(saved);
  }, []);
  const handleGlobeModeChange = (next: GlobeMode) => {
    setGlobeMode(next);
    localStorage.setItem('globeMode', next);
  };

  // Sessão de administrador. Fica em sessionStorage (e não localStorage) para
  // acabar quando a aba fecha — o painel não é para ficar aberto por descuido.
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem('globeAdmin') === '1') setIsAdmin(true);
  }, []);
  const handleAdminSuccess = () => {
    setIsAdmin(true);
    sessionStorage.setItem('globeAdmin', '1');
    setIsAdminLoginOpen(false);
    handlers.handleOpenAdminAnimPopup();
  };
  const handleAdminExit = () => {
    setIsAdmin(false);
    sessionStorage.removeItem('globeAdmin');
  };

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
      className="w-full app-viewport bg-black relative"
      style={{ overscrollBehavior: 'none' }}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 3], fov: CAMERA_FOV, near: 0.1, far: 1000 }}
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
            continentLabels={externalData.continentLabels}
            isLoadingLabels={externalData.isLoadingLabels}
            flyingMessages={flyingMessages}
            onMessageComplete={removeMessage}
            globeMode={globeMode}
          />
        </Suspense>
      </Canvas>

      {/* A camada da interface para acima da area segura do celular, entao
          tudo que e ancorado embaixo (rodape, cadeado, limpar pinos e a coluna
          de botoes) sobe junto e deixa de ficar sob a barra do navegador. O
          canvas do globo e irmao disto e segue ocupando a tela inteira. */}
      <div className="absolute top-0 left-0 w-full z-10 pointer-events-none ui-safe-layer">
        <div className="pointer-events-auto">
          <AppHeader
            isVisible={states.isMainUiVisible}
            onMenuClick={handlers.handleOpenMenuPopup}
          />
          <AppFooter
            isVisible={states.isMainUiVisible}
            onVacationClick={() => {
              track({ kind: 'search' });
              handlers.handleOpenVacationPopup();
            }}
          />
        </div>
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <GlobeModeToggle
            mode={globeMode}
            onChange={handleGlobeModeChange}
            isVisible={states.isMainUiVisible}
            className="top-[4.5rem] left-4 pointer-events-auto"
          />
          {/* Relogio so no modo Relogio: e ele que explica de onde vem a
              posicao do terminador. */}
          <GlobeClock
            isVisible={states.isMainUiVisible && globeMode === 'relogio'}
            className="top-[7.5rem] left-4 pointer-events-none"
          />
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
          {isAdmin && (
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
                  isAdmin={isAdmin}
                  onAdminClick={() => {
                    handlers.handleCloseMenuPopup();
                    setIsAdminLoginOpen(true);
                  }}
                  onAdminExit={() => {
                    handleAdminExit();
                    handlers.handleCloseMenuPopup();
                  }}
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
          
          <AdminLoginPopup
            isOpen={isAdminLoginOpen}
            onClose={() => setIsAdminLoginOpen(false)}
            onSuccess={handleAdminSuccess}
          />

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