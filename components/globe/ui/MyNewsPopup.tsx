// components/globe/ui/MyNewsPopup.tsx
'use client';
import React, { FC } from 'react';
import { useSavedNews } from '@/app/hooks/useSavedNews'; // Import the new hook
import { SavedNewsItem } from '@/app/types/globe';

interface MyNewsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  // --- INÍCIO DA MODIFIFCAÇÃO ---
  onArticleClick: (item: SavedNewsItem) => void;
  // --- FIM DA MODIFICAÇÃO ---
}

const NewsItem: FC<{
  item: SavedNewsItem;
  onRemove: (title: string) => void;
  // --- INÍCIO DA MODIFICAÇÃO ---
  onClick: (item: SavedNewsItem) => void;
  // --- FIM DA MODIFICAÇÃO ---
}> = ({
  item,
  onRemove,
  // --- INÍCIO DA MODIFICAÇÃO ---
  onClick,
  // --- FIM DA MODIFICAÇÃO ---
}) => (
  // --- MODIFICAÇÃO: O div principal agora é um flex container ---
  <div className="p-3 bg-gray-700/50 rounded-lg flex items-start justify-between gap-3">
    {/* --- INÍCIO DA MODIFICAÇÃO: O conteúdo virou um botão --- */}
    <button
      type="button"
      onClick={() => onClick(item)}
      className="flex-1 overflow-hidden text-left group"
    >
      <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider group-hover:text-cyan-300 transition-colors">
        {item.categoryLabel} (em {item.placeName})
      </span>
      <h4
        className="text-base font-medium text-white truncate group-hover:underline"
        title={item.article.title}
      >
        {item.article.title}
      </h4>
      <p className="text-sm text-gray-400 truncate">{item.article.bodyText}</p>
    </button>
    {/* --- FIM DA MODIFICAÇÃO --- */}

    <button
      type="button"
      // --- INÍCIO DA MODIFICAÇÃO: Adicionado stopPropagation ---
      onClick={(e) => {
        e.stopPropagation();
        onRemove(item.article.title);
      }}
      // --- FIM DA MODIFICAÇÃO ---
      className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 flex-shrink-0"
      title="Remover"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    </button>
  </div>
);

const MyNewsPopup: FC<MyNewsPopupProps> = ({
  isOpen,
  onClose,
  // --- INÍCIO DA MODIFICAÇÃO ---
  onArticleClick,
  // --- FIM DA MODIFICAÇÃO ---
}) => {
  const { savedNews, removeSavedNews } = useSavedNews();

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-[110]">
      <div
        className="absolute inset-0 bg-black/60 z-10"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-20 w-[90vw] max-w-xl">
        {/* --- CORREÇÃO DE ALTURA --- */}
        {/* max-h-[70vh] (70% da tela) alterado para max-h-[85vh] (85% da tela) */}
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-cyan-700 animate-in fade-in zoom-in-95 duration-300 flex flex-col max-h-[85vh]">
          <div className="p-4 border-b border-cyan-700 shrink-0">
            <h2 className="text-xl font-bold text-cyan-400">
              Minhas Notícias (Ler Mais Tarde)
            </h2>
          </div>
          <div className="p-6 space-y-4 overflow-y-auto">
            {savedNews.length > 0 ? (
              savedNews.map((item) => (
                <NewsItem
                  key={item.article.title}
                  item={item}
                  onRemove={removeSavedNews}
                  // --- INÍCIO DA MODIFICAÇÃO ---
                  onClick={onArticleClick}
                  // --- FIM DA MODIFICAÇÃO ---
                />
              ))
            ) : (
              <p className="text-gray-400 text-center italic py-8">
                Você ainda não salvou nenhuma notícia para ler mais tarde.
              </p>
            )}
          </div>
          <div className="p-4 flex justify-end border-t border-gray-700 bg-gray-900 rounded-b-xl shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default MyNewsPopup;
