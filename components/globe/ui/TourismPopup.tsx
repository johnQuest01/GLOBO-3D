// components/globe/ui/TourismPopup.tsx
'use client';

import React, { useState, FC } from 'react';
import Image from 'next/image';
import { tourismContent } from '@/app/data/tourismContent';
import type { TourismMedia } from '@/app/data/tourismContent';
import {
  ArrowLeftIcon,
  XMarkIcon,
  VideoCameraIcon,
  PhotoIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/solid';

type VideoFormat = 'horizontal' | 'vertical';

// --- Props do Componente ---
interface TourismPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onShowOnGlobe: (locationKey: string) => void;
}

// --- Componente de Card (Lista Principal) ---
interface TourismCardProps {
  item: TourismMedia;
  onClick: () => void;
}

const TourismCard: FC<TourismCardProps> = ({ item, onClick }) => (
  <button
    onClick={onClick}
    className="relative aspect-square rounded-lg overflow-hidden group shadow-lg transition-all duration-300 ease-in-out hover:shadow-cyan-500/30 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-900"
  >
    <Image
      src={item.thumbnailUrl}
      alt={item.title}
      layout="fill"
      objectFit="cover"
      className="transition-transform duration-300 group-hover:scale-110"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
    <div className="absolute bottom-0 left-0 p-3">
      {item.type === 'video' ? (
        <VideoCameraIcon className="w-5 h-5 text-cyan-300 mb-1" />
      ) : (
        <PhotoIcon className="w-5 h-5 text-cyan-300 mb-1" />
      )}
      <h3 className="text-white text-sm font-semibold text-left">
        {item.title}
      </h3>
    </div>
  </button>
);

// --- Componente de Player de Vídeo Simples ---
interface SimpleVideoPlayerProps {
  src: string;
  format: VideoFormat;
}

const SimpleVideoPlayer: FC<SimpleVideoPlayerProps> = ({ src, format }) => (
  <div
    className={`w-full bg-black rounded-lg overflow-hidden transition-all duration-300 ${
      format === 'vertical' ? 'aspect-[9/16]' : 'aspect-video'
    }`}
  >
    <video
      key={src} // Garante que o player recarregue ao trocar a fonte
      className="w-full h-full object-contain"
      controls
      autoPlay
      loop
      muted
      playsInline
    >
      <source src={src} type="video/mp4" />
      Seu navegador não suporta a tag de vídeo.
    </video>
  </div>
);

// --- Componente Principal do Popup ---
const TourismPopup: FC<TourismPopupProps> = ({
  isOpen,
  onClose,
  onShowOnGlobe,
}) => {
  const [selectedMedia, setSelectedMedia] = useState<TourismMedia | null>(null);
  const [videoFormat, setVideoFormat] = useState<VideoFormat>('horizontal');

  // Reseta a view ao fechar
  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setSelectedMedia(null);
      setVideoFormat('horizontal');
    }, 300); // Aguarda a animação de saída
  };

  // Ação do botão "Ver no Globo"
  const handleShowOnGlobeClick = () => {
    if (selectedMedia) {
      onShowOnGlobe(selectedMedia.locationKey);
      // O estado interno será resetado no próximo fechamento
      // Mas podemos forçar o reset aqui se quisermos
      setTimeout(() => {
        setSelectedMedia(null);
        setVideoFormat('horizontal');
      }, 300);
    }
  };

  if (!isOpen) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      aria-modal="true"
      role="dialog"
    >
      {/* Container "Safe Area" que respeita Header e Footer */}
      {/* Em telas móveis (sm), usamos pt-16 e pb-16. Em telas maiores, damos mais espaço. */}
      <div className="absolute inset-0 w-full h-full pt-16 pb-16 sm:pt-20 sm:pb-20 flex justify-center items-center p-4">
        {/* Painel de Conteúdo */}
        <div className="w-full max-w-2xl h-full bg-gray-900/90 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
          {/* Cabeçalho do Popup */}
          <header className="relative flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
            {/* Botão de Voltar (na tela de detalhe) */}
            {selectedMedia && (
              <button
                onClick={() => setSelectedMedia(null)}
                className="absolute left-4 p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
                title="Voltar"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
            )}

            {/* Título */}
            <h2 className="text-xl font-bold text-white text-center w-full">
              {selectedMedia ? selectedMedia.title : 'Destinos de Férias'}
            </h2>

            {/* Botão de Fechar (sempre visível) */}
            <button
              onClick={handleClose}
              className="absolute right-4 p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
              title="Fechar"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </header>

          {/* Conteúdo (Scrollável) */}
          <main className="flex-1 overflow-y-auto p-4">
            {!selectedMedia ? (
              // --- TELA 1: Lista Principal ---
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {tourismContent.map((item) => (
                  <TourismCard
                    key={item.id}
                    item={item}
                    onClick={() => setSelectedMedia(item)}
                  />
                ))}
              </div>
            ) : (
              // --- TELA 2: Detalhe ---
              <div className="flex flex-col gap-4">
                {/* Visualizador de Mídia */}
                {selectedMedia.type === 'video' ? (
                  // --- Detalhe de VÍDEO ---
                  <div className="flex flex-col gap-4">
                    <SimpleVideoPlayer
                      src={selectedMedia.fullUrl}
                      format={videoFormat}
                    />
                    {/* Botões de Orientação */}
                    <div className="flex justify-center gap-4">
                      <button
                        onClick={() => setVideoFormat('horizontal')}
                        className={`py-2 px-4 text-sm font-semibold rounded-lg transition-colors duration-200 w-1/2 ${
                          videoFormat === 'horizontal'
                            ? 'bg-cyan-600 text-white border-2 border-cyan-500'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        Horizontal
                      </button>
                      <button
                        onClick={() => setVideoFormat('vertical')}
                        className={`py-2 px-4 text-sm font-semibold rounded-lg transition-colors duration-200 w-1/2 ${
                          videoFormat === 'vertical'
                            ? 'bg-cyan-600 text-white border-2 border-cyan-500'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        Vertical
                      </button>
                    </div>
                  </div>
                ) : (
                  // --- Detalhe de IMAGEM ---
                  <div className="w-full aspect-video bg-black rounded-lg overflow-hidden">
                    <Image
                      src={selectedMedia.fullUrl}
                      alt={selectedMedia.title}
                      width={1280}
                      height={720}
                      objectFit="contain"
                      className="w-full h-full"
                    />
                  </div>
                )}
              </div>
            )}
          </main>

          {/* Rodapé (Apenas na tela de detalhe) */}
          {selectedMedia && (
            <footer className="p-4 border-t border-gray-700 shrink-0">
              <button
                onClick={handleShowOnGlobeClick}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
              >
                <GlobeAltIcon className="w-5 h-5" />
                Ver no Globo
              </button>
            </footer>
          )}
        </div>
      </div>
    </div>
  );
};

export default TourismPopup;