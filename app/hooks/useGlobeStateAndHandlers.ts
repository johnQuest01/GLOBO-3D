// app/hooks/useGlobeStateAndHandlers.ts
'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';

import { usePopupContent } from '@/app/hooks/usePopupContent';
import { useFlightLocations } from '@/app/hooks/useFlightLocations';
import { useAnimationControls } from '@/app/hooks/useAnimationControls';
import { useSavedVacationSpots } from '@/app/hooks/useSavedVacationSpots';
import { useBehaviorTracker } from '@/app/hooks/useBehaviorTracker';
// --- INÍCIO DA CORREÇÃO ---
// Agora importamos apenas 'useLabelData'
import { useLabelData } from '@/app/hooks/useLabelData';
// --- FIM DA CORREÇÃO ---
import { latLonToVector3, isCountryContent } from '@/components/lib/utils';

import { UserProfileData } from '@/app/types/user';
import {
  TabName,
  PinnedLocation,
  AdData,
  SavedNewsItem,
  GlobalNewsItem,
} from '@/app/types/globe';
import { LocalNewsCategory } from '@/components/globe/ui/statePopup/NewsTabContent';

const SPHERE_RADIUS = 1.5;

export const useGlobeStateAndHandlers = () => {
  const router = useRouter();
  const { getContentByNameKey, rawContentData, translations } = usePopupContent();
  const { locations: flightLocations, isLoading: isLoadingLocations } =
    useFlightLocations();
  const { animationState, ...animControls } = useAnimationControls();
  const { addSavedSpot } = useSavedVacationSpots();
  const { track } = useBehaviorTracker();

  // Continentes e países vêm prontos daqui; estados e cidades são carregados
  // sob demanda pelo próprio GlobeLabels, conforme o zoom pede a camada.
  const { countryLabels, continentLabels, isLoadingLabels } = useLabelData();

  // ... (O resto dos seus states e handlers permanece o mesmo) ...
  // States
  const [popupNameKey, setPopupNameKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>('news');
  const [isAdminNewsEnabled, setIsAdminNewsEnabled] = useState(true);
  const [isTravelPopupOpen, setIsTravelPopupOpen] = useState(false);
  const [flightPath, setFlightPath] =
    useState<{ start: THREE.Vector3; end: THREE.Vector3 } | null>(null);
  const [isBaggagePopupOpen, setIsBaggagePopupOpen] = useState(false);
  const [isVacationPopupOpen, setIsVacationPopupOpen] = useState(false);
  const [pinnedLocations, setPinnedLocations] = useState<PinnedLocation[]>([]);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfileData | null>(null);
  const [isMenuPopupOpen, setIsMenuPopupOpen] = useState(false);
  const [isMyNewsPopupOpen, setIsMyNewsPopupOpen] = useState(false);
  const [isMyTouristSitesPopupOpen, setIsMyTouristSitesPopupOpen] =
    useState(false);
  const [isMyVacationSpotsPopupOpen, setIsMyVacationSpotsPopupOpen] =
    useState(false);
  const [isDynamicNewsOpen, setIsDynamicNewsOpen] = useState(false);
  const [newsCategory, setNewsCategory] =
    useState<LocalNewsCategory>('menu');
  const [selectedArticleIndex, setSelectedArticleIndex] = useState<
    number | null
  >(null);
  const [isAdvertisePopupOpen, setIsAdvertisePopupOpen] = useState(false);
  const [activeAds, setActiveAds] = useState<AdData[]>([]);
  // Câmera perto o bastante para o globo mostrar o que só faz sentido de
  // perto — hoje, os anúncios. Vinha do nível de LOD da textura, que não
  // existe mais desde que o globo passou a usar uma imagem só com mipmaps.
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [isUiVisible, setIsUiVisible] = useState(true);
  const [isAdminAnimOpen, setIsAdminAnimOpen] = useState(false);
  const [isTourismPopupOpen, setIsTourismPopupOpen] = useState(false);
  const [tourismPin, setTourismPin] = useState<PinnedLocation | null>(null);

  // Handlers
  const handleShowTourismPinOnGlobe = useCallback(
    (locationKey: string) => {
      const loc = flightLocations.find((l) => l.key === locationKey);
      if (loc) {
        const position = latLonToVector3(loc.lat, loc.lon, SPHERE_RADIUS);
        const newPin: PinnedLocation = {
          key: loc.key,
          name: loc.name,
          position: position,
        };
        setTourismPin(newPin);
        track({ kind: 'tourism_view', regionKey: loc.key });
      } else {
        console.warn(
          `[handleShowTourismPinOnGlobe] Location key "${locationKey}" not found in flightLocations.`
        );
        setTourismPin(null);
      }
      setIsTourismPopupOpen(false);
    },
    [flightLocations, track]
  );
  
  const handleOpenSavedSpotOnGlobe = useCallback(
    (locationKey: string) => {
      setIsMyVacationSpotsPopupOpen(false);
      handleShowTourismPinOnGlobe(locationKey);
    },
    [handleShowTourismPinOnGlobe]
  );
  
  const closeAllPopups = useCallback(() => {
    setPopupNameKey(null);
    setNewsCategory('menu');
    setSelectedArticleIndex(null);
    setIsTravelPopupOpen(false);
    setIsBaggagePopupOpen(false);
    setIsVacationPopupOpen(false);
    setIsAdminAnimOpen(false);
    setIsUserProfileOpen(false);
    setIsMenuPopupOpen(false);
    setIsMyNewsPopupOpen(false);
    setIsMyTouristSitesPopupOpen(false);
    setIsMyVacationSpotsPopupOpen(false);
    setIsDynamicNewsOpen(false);
    setIsAdvertisePopupOpen(false);
    setFlightPath(null);
    setIsTourismPopupOpen(false);
    setTourismPin(null);
  }, []);

  const openPopup = useCallback(
    (nameKey: string) => {
      closeAllPopups();
      setPopupNameKey(nameKey);
      const { content } = getContentByNameKey(nameKey);
      const isCountry = isCountryContent(content);
      const initialTab: TabName = isCountry
        ? 'language'
        : isAdminNewsEnabled
        ? 'news'
        : 'video';
      setActiveTab(initialTab);
    },
    [closeAllPopups, getContentByNameKey, isAdminNewsEnabled]
  );

  const handleOpenTravelPopup = () => {
    closeAllPopups();
    setIsTravelPopupOpen(true);
  };
  const handleCloseTravelPopup = () => setIsTravelPopupOpen(false);
  const handleTravelSubmit = useCallback(
    ({ fromKey, toKey }: { fromKey: string; toKey: string }) => {
      const fromLoc = flightLocations.find((loc) => loc.key === fromKey);
      const toLoc = flightLocations.find((loc) => loc.key === toKey);
      if (fromLoc && toLoc) {
        const startVec = latLonToVector3(
          fromLoc.lat,
          fromLoc.lon,
          SPHERE_RADIUS
        );
        const endVec = latLonToVector3(toLoc.lat, toLoc.lon, SPHERE_RADIUS);
        setFlightPath({ start: startVec, end: endVec });
        // Plano de viagem e o sinal mais forte de interesse por um destino.
        track({ kind: 'trip_plan', regionKey: toLoc.key });
        setIsTravelPopupOpen(false);
      }
    },
    [flightLocations, track]
  );

  const handleOpenBaggagePopup = () => {
    closeAllPopups();
    setIsBaggagePopupOpen(true);
  };
  const handleCloseBaggagePopup = () => setIsBaggagePopupOpen(false);
  
  const handleOpenVacationPopup = () => {
    closeAllPopups();
    setIsVacationPopupOpen(true);
  };
  const handleCloseVacationPopup = () => setIsVacationPopupOpen(false);
  const handlePinLocationSubmit = useCallback(
    ({ locationKey }: { locationKey: string }) => {
      const loc = flightLocations.find((l) => l.key === locationKey);
      if (loc) {
        if (pinnedLocations.find((p) => p.key === locationKey)) {
          setIsVacationPopupOpen(false);
          return;
        }
        const position = latLonToVector3(loc.lat, loc.lon, SPHERE_RADIUS);
        const newPin: PinnedLocation = {
          key: loc.key,
          name: loc.name,
          position: position,
        };
        setPinnedLocations((prevPins) => [...prevPins, newPin]);
        addSavedSpot(loc.key, loc.name);
        // Marcar um lugar exige intencao: pesa muito mais que uma visita.
        track({ kind: 'pin_add', regionKey: loc.key });
        setIsVacationPopupOpen(false);
      }
    },
    [flightLocations, pinnedLocations, addSavedSpot, track]
  );
  const handleClearPins = () => {
    setPinnedLocations([]);
    setTourismPin(null);
  };

  const handleOpenAdminAnimPopup = () => {
    closeAllPopups();
    setIsAdminAnimOpen(true);
  };
  const handleCloseAdminAnimPopup = () => setIsAdminAnimOpen(false);

  const handleOpenUserProfile = () => {
    if (!currentUser) {
      router.push('/login');
      return;
    }
    closeAllPopups();
    setIsUserProfileOpen(true);
  };
  const handleCloseUserProfile = () => setIsUserProfileOpen(false);
  const handleLogout = () => {
    // Avisa o servidor para revogar a sessao: sem isto o cookie continuaria
    // valendo, e "sair" seria so apagar a tela. Nao esperamos a resposta — a
    // saida da interface e imediata de qualquer forma.
    void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('userData');
    setCurrentUser(null);
    setIsUserProfileOpen(false);
    router.push('/login');
  };

  const handleOpenMenuPopup = () => {
    closeAllPopups();
    setIsMenuPopupOpen(true);
  };
  const handleCloseMenuPopup = () => setIsMenuPopupOpen(false);
  const handleOpenMyNews = () => {
    setIsMyNewsPopupOpen(true);
    setIsMenuPopupOpen(false);
  };
  const handleCloseMyNews = () => setIsMyNewsPopupOpen(false);
  const handleOpenMyTouristSites = () => {
    setIsMyTouristSitesPopupOpen(true);
    setIsMenuPopupOpen(false);
  };
  const handleCloseMyTouristSites = () => setIsMyTouristSitesPopupOpen(false);

  const handleOpenMyVacationSpots = () => {
    setIsMyVacationSpotsPopupOpen(true);
    setIsMenuPopupOpen(false);
  };
  const handleCloseMyVacationSpots = () => setIsMyVacationSpotsPopupOpen(false);

  const handleOpenDynamicNews = () => {
    closeAllPopups();
    setIsDynamicNewsOpen(true);
  };
  const handleCloseDynamicNews = () => setIsDynamicNewsOpen(false);
  const handleDynamicNewsArticleClick = useCallback(
    (item: GlobalNewsItem) => {
      setIsDynamicNewsOpen(false);
      openPopup(item.placeKey);
      if (!isCountryContent(getContentByNameKey(item.placeKey).content)) {
        setActiveTab('news');
        setNewsCategory(item.categoryKey);
        const categoryArticles =
          getContentByNameKey(item.placeKey).content?.news?.[item.categoryKey];
        if (categoryArticles) {
          const index = categoryArticles.findIndex(
            (a) => a.title === item.article.title
          );
          if (index !== -1) setSelectedArticleIndex(index);
        }
      }
    },
    [getContentByNameKey, openPopup]
  );

  const handleOpenSavedNewsArticle = useCallback(
    (item: SavedNewsItem) => {
      setIsMyNewsPopupOpen(false);
      openPopup(item.placeKey);
      if (!isCountryContent(getContentByNameKey(item.placeKey).content)) {
        setActiveTab('news');
        setNewsCategory(item.categoryKey);
        const categoryArticles =
          getContentByNameKey(item.placeKey).content?.news?.[item.categoryKey];
        if (categoryArticles) {
          const index = categoryArticles.findIndex(
            (a) => a.title === item.article.title
          );
          if (index !== -1) setSelectedArticleIndex(index);
        }
      }
    },
    [getContentByNameKey, openPopup]
  );

  const handleOpenAdvertisePopup = () => {
    closeAllPopups();
    setIsAdvertisePopupOpen(true);
  };
  const handleCloseAdvertisePopup = () => setIsAdvertisePopupOpen(false);
  const handleAdSubmit = useCallback((adData: AdData) => {
    setActiveAds((prevAds) => {
      const updatedAds = [...prevAds, adData];
      if (updatedAds.length > 5) {
        const adToRemove = updatedAds[0];
        if (adToRemove?.imageUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(adToRemove.imageUrl);
        }
        return updatedAds.slice(-5);
      }
      return updatedAds;
    });
  }, []);

  const handleLockClick = () => setIsUiVisible((prev) => !prev);
  
  const handleOpenTourismPopup = () => {
    closeAllPopups();
    setIsTourismPopupOpen(true);
  };
  const handleCloseTourismPopup = () => {
    setIsTourismPopupOpen(false);
  };
  
  // ... (Derived states e Effects inalterados) ...
  const isAnyPopupOpen =
    isTravelPopupOpen ||
    isBaggagePopupOpen ||
    isVacationPopupOpen ||
    isAdminAnimOpen ||
    isUserProfileOpen ||
    isMenuPopupOpen ||
    isMyNewsPopupOpen ||
    isMyTouristSitesPopupOpen ||
    isMyVacationSpotsPopupOpen ||
    isDynamicNewsOpen ||
    isAdvertisePopupOpen ||
    isTourismPopupOpen ||
    !!popupNameKey;
  const isGlobeInteractive = !isAnyPopupOpen;
  const isMainUiVisible = isUiVisible;

  const popupData = useMemo(() => {
    if (!popupNameKey) return null;
    const { content, displayName } = getContentByNameKey(popupNameKey);
    return { content, displayName, isCountry: isCountryContent(content) };
  }, [popupNameKey, getContentByNameKey]);
  
  useEffect(() => {
    const storedData = localStorage.getItem('userData');
    if (storedData) {
      try {
        setCurrentUser(JSON.parse(storedData));
      } catch (e) {
        console.error('Failed to parse userData, clearing cache:', e);
        localStorage.removeItem('userData');
        router.push('/login');
      }
    } else {
      router.push('/login');
    }
  }, [router]);

  /**
   * A sessao do servidor manda mais que o localStorage.
   *
   * O `userData` diz quem esta na tela; ele NAO prova que a pessoa pode estar
   * aqui — o navegador escreve o que quiser nele. Quem prova e o cookie de
   * sessao, e e o servidor que decide se ele ainda vale.
   *
   * E e assim que um banimento chega ate a tela: o administrador bane, as
   * sessoes daquela conta sao revogadas, e na proxima checagem o `/api/auth/me`
   * responde 401 — a pessoa e mandada de volta ao login, em qualquer aparelho
   * onde estivesse.
   *
   * O INTERVALO ACOMPANHA O COOKIE_CACHE. Enquanto o cache assinado vale, a
   * resposta vem dele sem consultar o banco; so quando ele vence e que o
   * banimento aparece. Checar mais rapido que o TTL do cache nao adiantaria
   * nada e so gastaria requisicao.
   */
  useEffect(() => {
    let cancelado = false;
    let intervaloMs = 60_000;

    const conferir = async () => {
      try {
        const resposta = await fetch('/api/auth/me', { cache: 'no-store' });

        // 503 = servidor sem AUTH_SECRET ou sem banco. Nao e "deslogado": nao
        // mexe em nada, so tenta de novo depois.
        if (resposta.status === 503) return;

        if (resposta.status === 401) {
          if (cancelado) return;
          localStorage.removeItem('userData');
          setCurrentUser(null);
          router.push('/login');
          return;
        }

        const dados = await resposta.json().catch(() => null);
        if (dados?.cacheTtlSec) {
          intervaloMs = Math.max(15_000, Number(dados.cacheTtlSec) * 1000);
        }
      } catch {
        // Rede caiu. Ficar offline nao pode deslogar ninguem.
      }
    };

    void conferir();
    const timer = window.setInterval(() => void conferir(), intervaloMs);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
  }, [router]);

  useEffect(() => {
    if (
      !isAdminNewsEnabled &&
      activeTab === 'news' &&
      popupData &&
      !popupData.isCountry
    ) {
      setActiveTab('video');
    }
  }, [isAdminNewsEnabled, activeTab, popupData]);

  useEffect(() => {
    return () => {
      activeAds.forEach((ad) => {
        if (ad?.imageUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(ad.imageUrl);
        }
      });
    };
  }, [activeAds]);

  return {
    states: {
      popupNameKey,
      activeTab,
      isAdminNewsEnabled,
      isTravelPopupOpen,
      flightPath,
      isBaggagePopupOpen,
      isVacationPopupOpen,
      pinnedLocations,
      isUserProfileOpen,
      currentUser,
      isMenuPopupOpen,
      isMyNewsPopupOpen,
      isMyTouristSitesPopupOpen,
      isMyVacationSpotsPopupOpen,
      isDynamicNewsOpen,
      newsCategory,
      selectedArticleIndex,
      isAdvertisePopupOpen,
      activeAds,
      isZoomedIn,
      isUiVisible,
      isAdminAnimOpen,
      isAnyPopupOpen,
      isGlobeInteractive,
      isMainUiVisible,
      popupData,
      isTourismPopupOpen,
      tourismPin,
    },
    setters: {
      setActiveTab,
      setIsAdminNewsEnabled,
      setNewsCategory,
      setSelectedArticleIndex,
      setIsZoomedIn,
    },
    handlers: {
      closeAllPopups,
      openPopup,
      handleOpenTravelPopup,
      handleCloseTravelPopup,
      handleTravelSubmit,
      handleOpenBaggagePopup,
      handleCloseBaggagePopup,
      handleOpenVacationPopup,
      handleCloseVacationPopup,
      handlePinLocationSubmit,
      handleClearPins,
      handleOpenAdminAnimPopup,
      handleCloseAdminAnimPopup,
      handleOpenUserProfile,
      handleCloseUserProfile,
      handleLogout,
      handleOpenMenuPopup,
      handleCloseMenuPopup,
      handleOpenMyNews,
      handleCloseMyNews,
      handleOpenMyTouristSites,
      handleCloseMyTouristSites,
      handleOpenMyVacationSpots,
      handleCloseMyVacationSpots,
      handleOpenSavedSpotOnGlobe,
      handleOpenDynamicNews,
      handleCloseDynamicNews,
      handleDynamicNewsArticleClick,
      handleOpenSavedNewsArticle,
      handleOpenAdvertisePopup,
      handleCloseAdvertisePopup,
      handleAdSubmit,
      handleLockClick,
      handleOpenTourismPopup,
      handleCloseTourismPopup,
      handleShowTourismPinOnGlobe,
    },
    externalData: {
      flightLocations,
      isLoadingLocations,
      animationState,
      animControls,
      rawContentData,
      translations,
      countryLabels,
      continentLabels,
      isLoadingLabels,
    },
  };
};