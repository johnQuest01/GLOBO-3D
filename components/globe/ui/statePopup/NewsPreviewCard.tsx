// components/globe/ui/statePopup/NewsPreviewCard.tsx
import React, { FC, useState } from 'react';
import { NewsItemContent, NewsCategory } from '@/app/types/globe';
import { useSavedNews } from '@/app/hooks/useSavedNews';
import PillButton from '@/components/globe/ui/PillButton';
import { FaRegThumbsUp, FaThumbsUp, FaRegBookmark, FaBookmark } from 'react-icons/fa';

interface NewsPreviewCardProps {
  item: NewsItemContent;
  onClick: () => void;
  isMain: boolean;
  categoryKey: NewsCategory;
  categoryLabel: string;
  placeKey: string;
  placeName: string;
}

const NewsPreviewCard: FC<NewsPreviewCardProps> = ({
  item,
  onClick,
  isMain,
  categoryKey,
  categoryLabel,
  placeKey,
  placeName,
}) => {
  const { addSavedNews, removeSavedNews, isNewsSaved } = useSavedNews();
  const isSaved = isNewsSaved(item.title);
  const [isLiked, setIsLiked] = useState(false);

  // Esta função (e a próxima) PRECISA do 'e' para o e.stopPropagation()
  const handleSaveClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isSaved) {
      removeSavedNews(item.title);
    } else {
      addSavedNews(item, categoryKey, categoryLabel, placeKey, placeName);
    }
  };

  const handleLikeClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsLiked((prev) => !prev);
  };

  const cardBaseClasses =
    'w-full text-left rounded-lg transition-colors duration-200 border border-gray-200 overflow-hidden flex';
  const hoverClasses = 'hover:bg-gray-100 hover:border-gray-300';

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    target.onerror = null;
    const placeholderSize = isMain ? '600x300' : '80x80';
    const placeholderText = isMain ? 'Imagem Principal' : 'Img';
    target.src = `https://placehold.co/${placeholderSize}/334155/94A3B8?text=${placeholderText}`;
  };

  const iconSize = 'w-4 h-4';

  if (isMain) {
    // Layout Principal
    return (
      <div className={`${cardBaseClasses} flex-col md:col-span-2`}>
        <button onClick={onClick} className={`w-full ${hoverClasses}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={item.title || 'Imagem notícia'}
            className="w-full h-40 sm:h-48 object-cover bg-gray-200"
            onError={handleImageError}
          />
          <div className="p-3 sm:p-4">
            <h4 className="text-lg sm:text-xl font-bold text-gray-800 mb-1 line-clamp-2">
              {item.title || 'Notícia'}
            </h4>
            <p className="text-sm text-gray-600 line-clamp-3">
              {item.bodyText}
            </p>
          </div>
        </button>
        {/* --- Botões de Ação (Main) usando PillButton --- */}
        <div className="p-3 border-t border-gray-200 bg-gray-50 flex gap-2">
          <PillButton
            onClick={handleLikeClick} // Passa a função (e) => void
            isActive={isLiked}
            icon={<FaRegThumbsUp className={iconSize} />}
            activeIcon={<FaThumbsUp className={iconSize} />}
            variant="like"
            className="text-xs"
            title={isLiked ? 'Descurtir' : 'Gostei'}
          >
            Gostei
          </PillButton>
          <PillButton
            onClick={handleSaveClick} // Passa a função (e) => void
            isActive={isSaved}
            icon={<FaRegBookmark className={iconSize} />}
            activeIcon={<FaBookmark className={iconSize} />}
            variant="save"
            className="text-xs"
            title={isSaved ? 'Remover dos salvos' : 'Ler mais tarde'}
          >
            {isSaved ? 'Salvo' : 'Ler mais tarde'}
          </PillButton>
        </div>
      </div>
    );
  }
  // Layout Secundário
  return (
    <div className={`${cardBaseClasses} flex-col`}>
      <button
        onClick={onClick}
        className={`w-full ${hoverClasses} items-center gap-3 p-2 h-full flex`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt={item.title || 'Imagem notícia'}
          className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-md flex-shrink-0 bg-gray-200"
          onError={handleImageError}
        />
        <div className="flex-1 overflow-hidden">
          <h4 className="text-sm sm:text-base font-semibold text-gray-800 line-clamp-3">
            {item.title || 'Notícia'}
          </h4>
        </div>
        <span className="text-gray-400 ml-auto text-lg flex-shrink-0">
          &rarr;
        </span>
      </button>
      {/* --- Botões de Ação (Secondary) usando PillButton --- */}
      <div className="p-2 border-t border-gray-200 bg-gray-50 flex gap-2">
        <PillButton
          onClick={handleLikeClick} // Passa a função (e) => void
          isActive={isLiked}
          icon={<FaRegThumbsUp className={iconSize} />}
          activeIcon={<FaThumbsUp className={iconSize} />}
          variant="like"
          className="text-xs"
          title={isLiked ? 'Descurtir' : 'Gostei'}
        >
          Gostei
        </PillButton>
        <PillButton
          onClick={handleSaveClick} // Passa a função (e) => void
          isActive={isSaved}
          icon={<FaRegBookmark className={iconSize} />}
          activeIcon={<FaBookmark className={iconSize} />}
          variant="save"
          className="text-xs"
          title={isSaved ? 'Remover dos salvos' : 'Ler mais tarde'}
        >
          {isSaved ? 'Salvo' : 'Ler mais tarde'}
        </PillButton>
      </div>
    </div>
  );
};

export default NewsPreviewCard;