// app/hooks/useSavedNews.ts
'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  SavedNewsItem,
  NewsItemContent,
  NewsCategory,
} from '@/app/types/globe';

const STORAGE_KEY = 'saved-news-items';

/**
 * Hook para gerenciar notícias salvas (Ler mais tarde)
 * Sincronizado com o localStorage.
 */
export function useSavedNews() {
  const [savedNews, setSavedNews] = useState<SavedNewsItem[]>([]);

  // 1. Carrega do localStorage na montagem E Ouve por mudanças
  useEffect(() => {
    // Função para ler o estado atual
    const loadStateFromStorage = () => {
      try {
        const storedState = localStorage.getItem(STORAGE_KEY);
        if (storedState) {
          setSavedNews(JSON.parse(storedState));
        }
      } catch (error) {
        console.error("Falha ao carregar 'saved-news' do localStorage:", error);
      }
    };

    // Carrega o estado inicial
    loadStateFromStorage();

    // --- NOVO: Listener para sincronizar entre instâncias/abas ---
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          // Atualiza o estado se o localStorage mudou
          setSavedNews(JSON.parse(event.newValue));
        } catch (error) {
          console.error(
            "Falha ao parsear 'saved-news' do evento de storage:",
            error
          );
        }
      }
    };

    // Adiciona o listener
    window.addEventListener('storage', handleStorageChange);

    // Remove o listener ao desmontar
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
    // --- FIM DA MODIFICAÇÃO ---
  }, []); // Roda apenas na montagem

  // 2. Helper para atualizar estado e localStorage
  const updateStateAndStorage = useCallback((newState: SavedNewsItem[]) => {
    // Ordena por data, mais novo primeiro
    newState.sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );

    // Atualiza o estado local (para resposta imediata da UI)
    setSavedNews(newState);

    // Atualiza o localStorage (o que vai disparar o evento para outras instâncias)
    try {
      const newStateJSON = JSON.stringify(newState);
      localStorage.setItem(STORAGE_KEY, newStateJSON);

      // --- MODIFICAÇÃO: Dispara manualmente o evento para a janela ATUAL ---
      // O evento 'storage' nativo só dispara em OUTRAS abas.
      // Para garantir que a instância no MyNewsPopup (se aberta) atualize,
      // disparamos nosso próprio evento.
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: newStateJSON,
        })
      );
      // --- FIM DA MODIFICAÇÃO ---
    } catch (error) {
      console.error("Falha ao salvar 'saved-news' no localStorage:", error);
    }
  }, []); // Removido [savedNews] para evitar loops

  // 3. Adicionar item
  const addSavedNews = useCallback(
    (
      article: NewsItemContent,
      categoryKey: NewsCategory,
      categoryLabel: string,
      // --- INÍCIO DA MODIFICAÇÃO ---
      placeKey: string,
      placeName: string
      // --- FIM DA MODIFICAÇÃO ---
    ) => {
      const newItem: SavedNewsItem = {
        // --- INÍCIO DA MODIFICAÇÃO ---
        placeKey,
        placeName,
        // --- FIM DA MODIFICAÇÃO ---
        categoryKey,
        categoryLabel,
        article,
        savedAt: new Date().toISOString(),
      };

      // Lê o estado mais recente (usando a função de callback do setState)
      // para evitar problemas de concorrência se 'savedNews' estiver obsoleto
      setSavedNews((currentNews) => {
        const updatedNews = [
          ...currentNews.filter(
            (item) => item.article.title !== article.title
          ),
          newItem,
        ];
        updateStateAndStorage(updatedNews);
        return updatedNews;
      });
    },
    [updateStateAndStorage]
  );

  // 4. Remover item (pelo título)
  const removeSavedNews = useCallback(
    (articleTitle: string) => {
      setSavedNews((currentNews) => {
        const updatedNews = currentNews.filter(
          (item) => item.article.title !== articleTitle
        );
        updateStateAndStorage(updatedNews);
        return updatedNews;
      });
    },
    [updateStateAndStorage]
  );

  // 5. Verificar se está salvo
  const isNewsSaved = useCallback(
    (articleTitle: string): boolean => {
      return savedNews.some((item) => item.article.title === articleTitle);
    },
    [savedNews]
  );

  return { savedNews, addSavedNews, removeSavedNews, isNewsSaved };
}