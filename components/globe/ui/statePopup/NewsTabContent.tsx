// components/globe/ui/statePopup/NewsTabContent.tsx
import React, { FC, useState } from 'react';
import NewsPreviewCard from './NewsPreviewCard';
import {
  NewsCategory,
  NewsItemContent,
  NewsCategoryContent,
  PlaceContent,
} from '@/app/types/globe';
import { useSavedNews } from '@/app/hooks/useSavedNews';
import PillButton from '@/components/globe/ui/PillButton';
import { FaRegThumbsUp, FaThumbsUp, FaRegBookmark, FaBookmark } from 'react-icons/fa';

export type LocalNewsCategory = NewsCategory | 'menu';

interface NewsTabContentProps {
  newsCategory: LocalNewsCategory;
  setNewsCategory: (category: LocalNewsCategory) => void;
  selectedArticleIndex: number | null;
  setSelectedArticleIndex: (index: number | null) => void;
  newsCategories: ReadonlyArray<{ key: NewsCategory; label: string }>;
  currentNewsList: NewsItemContent[] | undefined;
  currentNewsArticle: NewsItemContent | undefined;
  content: PlaceContent;
  name: string;
  placeKey: string;
}

// Subcomponente Nível 1: Menu de Categorias (SEM ALTERAÇÕES)
const NewsCategoryMenu: FC<
  Pick<
    NewsTabContentProps,
    'content' | 'newsCategories' | 'setNewsCategory' | 'name'
  >
> = ({ content, newsCategories, setNewsCategory, name }) => (
  <div className="p-6">
    <h3 className="text-xl font-bold text-gray-900 mb-4 w-full">
      Categorias de Notícias
    </h3>
    <div className="flex flex-wrap gap-3 content-start">
      {content.news && Object.keys(content.news).length > 0 ? (
        newsCategories.map((cat) => {
          const categoryContent = (content.news as NewsCategoryContent)[cat.key];
          const hasContent =
            Array.isArray(categoryContent) && categoryContent.length > 0;
          const buttonClass = hasContent
            ? 'bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200'
            : 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed';
          return (
            <button
              key={cat.key}
              onClick={() => hasContent && setNewsCategory(cat.key)}
              className={`p-3 text-sm font-semibold rounded-full transition-colors duration-200 border w-full sm:w-auto grow text-center ${buttonClass}`}
            >
              {cat.label}
            </button>
          );
        })
      ) : (
        <p className="text-gray-600 w-full text-center py-10">
          Nenhum conteúdo de notícia para {name}.
        </p>
      )}
    </div>
  </div>
);

// Subcomponente Nível 2: Lista de Artigos (SEM ALTERAÇÕES)
const NewsArticleList: FC<
  Pick<
    NewsTabContentProps,
    | 'currentNewsList'
    | 'setSelectedArticleIndex'
    | 'setNewsCategory'
    | 'newsCategory'
    | 'newsCategories'
    | 'placeKey'
    | 'name'
  >
> = ({
  currentNewsList,
  setSelectedArticleIndex,
  setNewsCategory,
  newsCategory,
  newsCategories,
  placeKey,
  name,
}) => {
  const currentCategoryKey = newsCategory as NewsCategory;
  const currentCategoryLabel =
    newsCategories.find((c) => c.key === currentCategoryKey)?.label ||
    currentCategoryKey;

  return (
    <div>
      <div className="px-6 pt-4 pb-3 border-b border-gray-200 sticky top-0 bg-white z-10">
        <button
          onClick={() => setNewsCategory('menu')}
          className="px-4 py-2 mb-3 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors"
        >
          &larr; Voltar às Categorias
        </button>
        <h3 className="text-xl font-bold text-gray-900 capitalize">
          {currentCategoryLabel}
        </h3>
      </div>
      <div className="p-6">
        {currentNewsList && currentNewsList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentNewsList.map((item, index) => (
              <NewsPreviewCard
                key={index}
                item={item}
                onClick={() => setSelectedArticleIndex(index)}
                isMain={index === 0}
                categoryKey={currentCategoryKey}
                categoryLabel={currentCategoryLabel}
                placeKey={placeKey}
                placeName={name}
              />
            ))}
          </div>
        ) : (
          <p className="text-gray-600 text-center py-10">
            Nenhum artigo encontrado.
          </p>
        )}
      </div>
    </div>
  );
};

// Subcomponente Nível 3: Detalhe do Artigo (ALTERADO)
const NewsArticleDetail: FC<
  Pick<
    NewsTabContentProps,
    | 'currentNewsArticle'
    | 'setSelectedArticleIndex'
    | 'newsCategory'
    | 'newsCategories'
    | 'placeKey'
    | 'name'
  >
> = ({
  currentNewsArticle,
  setSelectedArticleIndex,
  newsCategory,
  newsCategories,
  placeKey,
  name,
}) => {
  const { addSavedNews, removeSavedNews, isNewsSaved } = useSavedNews();
  const [isLiked, setIsLiked] = useState(false);

  if (!currentNewsArticle) return null;

  const isSaved = isNewsSaved(currentNewsArticle.title);
  const currentCategoryKey = newsCategory as NewsCategory;
  const currentCategoryLabel =
    newsCategories.find((c) => c.key === currentCategoryKey)?.label ||
    currentCategoryKey;

  const handleSaveClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isSaved) {
      removeSavedNews(currentNewsArticle.title);
    } else {
      addSavedNews(
        currentNewsArticle,
        currentCategoryKey,
        currentCategoryLabel,
        placeKey,
        name
      );
    }
  };

  const handleLikeClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsLiked((prev) => !prev);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    target.onerror = null;
    target.src = `https://placehold.co/600x400/1E293B/94A3B8?text=Imagem Ausente`;
  };

  const iconSize = 'w-5 h-5';

  return (
    <div>
      <div className="px-6 pt-4 pb-2 border-b border-gray-200 sticky top-0 bg-white z-10">
        <button
          onClick={() => setSelectedArticleIndex(null)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors"
        >
          &larr; Voltar para a Lista
        </button>
      </div>
      <div className="px-6 pb-6 pt-4">
        <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-5">
          {currentNewsArticle.title}
        </h3>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentNewsArticle.imageUrl}
          alt={currentNewsArticle.imageCaption || currentNewsArticle.title}
          className="w-full rounded-lg mb-4 shadow-lg object-cover max-h-60 sm:max-h-80"
          onError={handleImageError}
        />
        <p className="text-sm text-gray-500 italic mb-6">
          {currentNewsArticle.imageCaption}
        </p>
        <div className="prose prose-sm sm:prose-base max-w-none text-gray-800">
          {currentNewsArticle.bodyText
            .split('\n')
            .filter((p) => p.trim())
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
        </div>

        {/* --- Botões de Ação (Detail) usando PillButton --- */}
        <div className="p-4 mt-6 border-t border-gray-200 flex gap-3">
          <PillButton
            onClick={handleLikeClick} // Passa a função (e) => void
            isActive={isLiked}
            icon={<FaRegThumbsUp className={iconSize} />}
            activeIcon={<FaThumbsUp className={iconSize} />}
            variant="like"
            className="text-sm"
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
            className="text-sm"
            title={isSaved ? 'Remover dos salvos' : 'Ler mais tarde'}
          >
            {isSaved ? 'Salvo' : 'Ler mais tarde'}
          </PillButton>
        </div>
      </div>
    </div>
  );
};

// Componente Principal da Aba de Notícias (SEM ALTERAÇÕES)
const NewsTabContent: FC<NewsTabContentProps> = (props) => {
  const { newsCategory, selectedArticleIndex, currentNewsArticle } = props;

  return (
    <div className="bg-white text-gray-900 min-h-full">
      {newsCategory === 'menu' && <NewsCategoryMenu {...props} />}
      {newsCategory !== 'menu' && selectedArticleIndex === null && (
        <NewsArticleList {...props} />
      )}
      {newsCategory !== 'menu' &&
        selectedArticleIndex !== null &&
        currentNewsArticle && <NewsArticleDetail {...props} />}
    </div>
  );
};

export default NewsTabContent;