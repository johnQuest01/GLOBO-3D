// components/globe/ui/StatePopup.tsx
// ATUALIZADO para incluir 'natureVideo'
'use client';

import React, { FC, useState, useMemo, useCallback, useEffect } from 'react';
import TabButton from './TabButton'; // Ajuste o caminho
import {
  TabName,
  PlaceContent,
  VideoContent,
  NewsCategory,
  NewsItemContent,
  NewsCategoryContent,
} from '@/app/types/globe';
import VideoTabContent from './statePopup/VideoTabContent';
// --- INÍCIO DA MODIFICAÇÃO ---
// Importa o tipo LocalNewsCategory
import NewsTabContent, {
  LocalNewsCategory,
} from './statePopup/NewsTabContent';
// --- FIM DA MODIFICAÇÃO ---
import SimpleTextTabContent from './statePopup/SimpleTextTabContent';

// --- Tipos Auxiliares ---
type VideoFormat = 'horizontal' | 'vertical';
// ATUALIZADO: Adicionado 'nature'
type VideoCategoryType = 'general' | 'tourist' | 'nature';

// --- Props do Popup ---
interface PopupProps {
  name: string;
  onClose: () => void;
  activeTab: TabName;
  setActiveTab: (tab: TabName) => void;
  content: PlaceContent;
  isAdminNewsEnabled: boolean;
  // --- INÍCIO DA MODIFICAÇÃO ---
  placeKey: string; // Chave do local (ex: "São Paulo")
  // Estados de Notícia (Elevados para o GlobeCanvas)
  newsCategory: LocalNewsCategory;
  setNewsCategory: (category: LocalNewsCategory) => void;
  selectedArticleIndex: number | null;
  setSelectedArticleIndex: (index: number | null) => void;
  // --- FIM DA MODIFICAÇÃO ---
}

const baseTabs = [
  { key: 'news', label: 'Notícias' },
  { key: 'video', label: 'Vídeo' },
  { key: 'customs', label: 'Costumes' },
  { key: 'routine', label: 'Rotina' },
] as const;
const newsCategoriesConst = [
  { key: 'local', label: 'Local' },
  { key: 'science', label: 'Ciência/Tecnologia' },
  { key: 'business', label: 'Negócios' },
  { key: 'entertainment', label: 'Entretenimento' },
  { key: 'sports', label: 'Esportes' },
  { key: 'health', label: 'Saúde' },
] as const;

// --- Componente Popup Principal ---
const StatePopup: FC<PopupProps> = ({
  name,
  onClose,
  activeTab,
  setActiveTab,
  content,
  isAdminNewsEnabled,
  // --- INÍCIO DA MODIFICAÇÃO ---
  placeKey,
  newsCategory,
  setNewsCategory,
  selectedArticleIndex,
  setSelectedArticleIndex,
  // --- FIM DA MODIFICAÇÃO ---
}) => {
  // --- Estados ---
  // ATUALIZADO: Tipo do estado videoType
  const [videoType, setVideoType] = useState<VideoCategoryType>('general');
  // [REMOVIDO] const [newsCategory, setNewsCategory] = useState<LocalNewsCategory>('menu');
  // [REMOVIDO] const [selectedArticleIndex, setSelectedArticleIndex] = useState<number | null>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [currentVideoFormat, setCurrentVideoFormat] =
    useState<VideoFormat>('horizontal');

  // --- Memos e Callbacks ---
  // ATUALIZADO: getVideoField agora busca 'natureVideo'
  const getVideoField = useCallback(
    (type: VideoCategoryType): VideoContent | VideoContent[] | null => {
      switch (type) {
        case 'general':
          return content.video;
        case 'tourist':
          return content.touristVideo;
        // Acessa o campo opcional 'natureVideo' de content
        case 'nature':
          return content.natureVideo ?? null; // Usa ?? null para fallback
        default:
          return null;
      }
    },
    [content.video, content.touristVideo, content.natureVideo]
  ); // Adicionada dependência

  // ATUALIZADO: videos agora usa getVideoField com o tipo correto
  const videos = useMemo((): VideoContent[] | null => {
    if (activeTab !== 'video') return null;
    const vf = getVideoField(videoType); // Passa o videoType atual
    if (!vf) return null;
    const va = Array.isArray(vf) ? vf : [vf];
    // Filtra itens potencialmente inválidos no array
    return va.filter(
      (v) => v && typeof v === 'object' && v.src
    ) as VideoContent[];
  }, [activeTab, videoType, getVideoField]); // Agora depende de videoType

  const videoToRender =
    videos && videos.length > currentVideoIndex ? videos[currentVideoIndex] : null;
  const hasMultipleVideos = Boolean(videos && videos.length > 1);
  // Notícias
  const newsCategories = useMemo(() => newsCategoriesConst, []);
  const currentNewsList = useMemo((): NewsItemContent[] | undefined => {
    if (newsCategory === 'menu' || !content.news) return undefined;
    const ck = newsCategory as NewsCategory;
    const arts = (content.news as NewsCategoryContent)[ck];
    return Array.isArray(arts)
      ? arts.filter((a) => a && a.title && a.bodyText)
      : undefined;
  }, [newsCategory, content.news]);
  const currentNewsArticle = useMemo((): NewsItemContent | undefined => {
    if (
      selectedArticleIndex === null ||
      !currentNewsList ||
      currentNewsList.length <= selectedArticleIndex
    )
      return undefined;
    return currentNewsList[selectedArticleIndex];
  }, [selectedArticleIndex, currentNewsList]);
  // Abas visíveis
  const visibleTabs = useMemo(() => {
    if (isAdminNewsEnabled) return baseTabs;
    return baseTabs.filter((tab) => tab.key !== 'news');
  }, [isAdminNewsEnabled]);

  // --- Effects ---
  useEffect(() => {
    setVideoType('general');
    // Não resetamos mais o estado de notícia aqui, pois é controlado pelo GlobeCanvas
    // setNewsCategory('menu');
    setCurrentVideoIndex(0);
    // setSelectedArticleIndex(null);
  }, [activeTab, content]); // Removida dependência dos setters de notícia
  useEffect(() => {
    setCurrentVideoFormat(
      videoToRender?.format === 'vertical' ? 'vertical' : 'horizontal'
    );
  }, [videoToRender]);
  useEffect(() => {
    if (!isAdminNewsEnabled && activeTab === 'news') {
      const fallbackTab =
        visibleTabs.length > 0 ? visibleTabs[0].key : 'video';
      setActiveTab(fallbackTab as TabName);
    }
  }, [isAdminNewsEnabled, activeTab, setActiveTab, visibleTabs]);

  // --- Renderização ---
  return (
    <>
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-50">
        <div className="w-full max-w-3xl sm:max-w-4xl rounded-xl shadow-2xl border border-gray-700 animate-in fade-in zoom-in duration-300 my-auto bg-gray-900 flex flex-col max-h-[90vh] overflow-hidden">
          {/* Cabeçalho Fixo */}
          <div className="shrink-0 p-4 border-b border-gray-700">
            <h2 className="text-2xl font-extrabold text-white">{name}</h2>
            <p className="text-sm text-cyan-400 mt-0.5">
              Informações Interativas
            </p>
          </div>
          {/* Abas Fixas */}
          <div className="shrink-0 flex justify-between p-2 border-b border-gray-700 overflow-x-auto bg-gray-800">
            {visibleTabs.map((tab) => (
              <TabButton
                key={tab.key}
                tabKey={tab.key}
                label={tab.label}
                activeTab={activeTab}
                onClick={(key) => setActiveTab(key as TabName)}
              />
            ))}
          </div>
          {/* Conteúdo Scrollável */}
          <div className="flex-1 overflow-y-auto bg-gray-800">
            {activeTab === 'video' && (
              <VideoTabContent
                // Passa o tipo atualizado
                videoType={videoType}
                setVideoType={setVideoType} // Setter aceita o novo tipo
                // ...resto das props
                currentVideoIndex={currentVideoIndex}
                setCurrentVideoIndex={setCurrentVideoIndex}
                currentVideoFormat={currentVideoFormat}
                setCurrentVideoFormat={setCurrentVideoFormat}
                videos={videos}
                videoToRender={videoToRender}
                hasMultipleVideos={hasMultipleVideos}
              />
            )}
            {activeTab === 'news' && isAdminNewsEnabled && (
              <NewsTabContent
                name={name}
                content={content}
                // --- INÍCIO DA MODIFICAÇÃO ---
                placeKey={placeKey}
                newsCategory={newsCategory}
                setNewsCategory={setNewsCategory}
                selectedArticleIndex={selectedArticleIndex}
                setSelectedArticleIndex={setSelectedArticleIndex}
                // --- FIM DA MODIFICAÇÃO ---
                newsCategories={newsCategories}
                currentNewsList={currentNewsList}
                currentNewsArticle={currentNewsArticle}
              />
            )}
            {(activeTab === 'customs' || activeTab === 'routine') && (
              <SimpleTextTabContent
                title={baseTabs.find((t) => t.key === activeTab)?.label || ''}
                text={content[activeTab as 'customs' | 'routine']}
              />
            )}
          </div>
          {/* Rodapé Fixo */}
          <div className="shrink-0 p-4 border-t border-gray-700 bg-gray-900 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default StatePopup;