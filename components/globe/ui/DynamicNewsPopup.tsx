// components/globe/ui/DynamicNewsPopup.tsx
'use client';
import React, { FC, useState, useMemo } from 'react';
import { GlobalNewsItem, NewsCategory } from '@/app/types/globe';
import NewsPreviewCard from './statePopup/NewsPreviewCard'; // Reutiliza o card

// Define as categorias, assim como em StatePopup
const NEWS_CATEGORIES = [
  { key: 'local', label: 'Local' },
  { key: 'science', label: 'Ciência/Tecnologia' },
  { key: 'business', label: 'Negócios' },
  { key: 'entertainment', label: 'Entretenimento' },
  { key: 'sports', label: 'Esportes' },
  { key: 'health', label: 'Saúde' },
] as const;

// Tipo para o filtro de categoria, incluindo 'all'
type CategoryFilter = NewsCategory | 'all';

interface DynamicNewsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  allNews: GlobalNewsItem[];
  onArticleClick: (item: GlobalNewsItem) => void;
}

const DynamicNewsPopup: FC<DynamicNewsPopupProps> = ({
  isOpen,
  onClose,
  allNews,
  onArticleClick,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] =
    useState<CategoryFilter>('all');

  // 1. Filtra as notícias com base na categoria ativa e no termo de busca
  const filteredNews = useMemo(() => {
    let news = allNews;

    // Filtra por categoria
    if (activeCategory !== 'all') {
      news = news.filter((item) => item.categoryKey === activeCategory);
    }

    // Filtra pelo termo de busca (no título, corpo ou local)
    if (searchTerm.trim() !== '') {
      const lowerSearchTerm = searchTerm.toLowerCase();
      news = news.filter(
        (item) =>
          item.article.title.toLowerCase().includes(lowerSearchTerm) ||
          item.article.bodyText.toLowerCase().includes(lowerSearchTerm) ||
          item.placeName.toLowerCase().includes(lowerSearchTerm)
      );
    }

    // Ordena por data (implícito, já que são adicionados)
    // Para robustez, poderíamos ordenar por data se tivéssemos
    // data de publicação, mas por enquanto a ordem de agregação serve.
    return news;
  }, [allNews, activeCategory, searchTerm]);

  if (!isOpen) return null;

  // Função auxiliar para classes dos botões de categoria
  const getCategoryButtonClass = (key: CategoryFilter) => {
    const base =
      'px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-full transition-colors duration-200 border whitespace-nowrap';
    if (activeCategory === key) {
      return `${base} bg-cyan-600 text-white border-cyan-500`;
    }
    return `${base} bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600`;
  };

  const handleClose = () => {
    // Reseta o estado ao fechar
    setSearchTerm('');
    setActiveCategory('all');
    onClose();
  };

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-[110]">
      <div
        className="absolute inset-0 bg-black/60 z-10"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div className="relative z-20 w-[90vw] max-w-4xl">
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-cyan-700 animate-in fade-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]">
          {/* Cabeçalho */}
          <div className="p-4 border-b border-cyan-700 shrink-0">
            <h2 className="text-xl font-bold text-cyan-400">
              Notícias Dinâmicas
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Explore artigos de todo o mundo.
            </p>
          </div>

          {/* Filtros (Busca e Categorias) */}
          <div className="p-4 space-y-4 shrink-0 border-b border-gray-700 bg-gray-800">
            {/* Barra de Busca */}
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por título, conteúdo ou local..."
              className="w-full px-4 py-2 rounded-lg bg-gray-900 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            {/* Botões de Categoria (com scroll horizontal) */}
            <div className="flex space-x-2 overflow-x-auto pb-2">
              <button
                onClick={() => setActiveCategory('all')}
                className={getCategoryButtonClass('all')}
              >
                Todas
              </button>
              {NEWS_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={getCategoryButtonClass(cat.key)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conteúdo (Área de Scroll) */}
          <div className="p-4 sm:p-6 overflow-y-auto">
            {filteredNews.length > 0 ? (
              // Layout de grid idêntico ao StatePopup
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredNews.map((item, index) => (
                  <NewsPreviewCard
                    // Usamos uma chave composta para garantir unicidade
                    key={`${item.placeKey}-${item.categoryKey}-${item.article.title.slice(
                      0,
                      10
                    )}`}
                    item={item.article}
                    // Ao clicar, usamos a função onArticleClick (que abrirá o StatePopup)
                    onClick={() => onArticleClick(item)}
                    // A primeira notícia (isMain) tem layout maior
                    isMain={index === 0}
                    categoryKey={item.categoryKey}
                    categoryLabel={item.categoryLabel}
                    placeKey={item.placeKey}
                    placeName={item.placeName}
                  />
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center italic py-10">
                Nenhum artigo encontrado para os filtros selecionados.
              </p>
            )}
          </div>

          {/* Rodapé */}
          <div className="p-4 flex justify-end border-t border-gray-700 bg-gray-900 rounded-b-xl shrink-0">
            <button
              type="button"
              onClick={handleClose}
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
export default DynamicNewsPopup;
