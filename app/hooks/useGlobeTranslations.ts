// app/hooks/useGlobeTranslations.ts
'use client';

import { useState, useEffect } from 'react';

/**
 * Define o tipo do dicionário de tradução.
 * Ex: { "Brazil": "Brasil", "Spain": "Espanha" }
 */
interface TranslationDictionary {
  [key: string]: string;
}

// Idioma Padrão de Fallback (geralmente inglês, pois os dados-chave são em inglês)
const FALLBACK_LANGUAGE_CODE = 'en';

/**
 * Hook para buscar dinamicamente o arquivo de tradução baseado no idioma do navegador do usuário.
 */
export function useGlobeTranslations() {
  const [translations, setTranslations] = useState<TranslationDictionary>({});
  const [isLoadingTranslations, setIsLoadingTranslations] = useState(true);

  useEffect(() => {
    // 1. Detecta o idioma do navegador
    const userLanguage = navigator.language.split('-')[0].toLowerCase();

    // 2. Define os caminhos dos arquivos JSON
    const primaryUrl = `/translations/${userLanguage}.json`;
    const fallbackUrl = `/translations/${FALLBACK_LANGUAGE_CODE}.json`;

    const fetchTranslations = async (url: string, isFallback = false) => {
      // Declara a variável 'res' aqui
      let res: Response | undefined; 

      try {
        // --- CORREÇÃO: Removido { cache: 'no-store' } ---
        res = await fetch(url);

        if (!res.ok) {
          if (!isFallback) {
            // Se falhar o idioma primário, tenta o fallback
            console.warn(`Arquivo de tradução para ${userLanguage} não encontrado. Tentando fallback...`);
            // Evita a busca redundante se o idioma for o mesmo que o fallback
            if (userLanguage !== FALLBACK_LANGUAGE_CODE) {
                await fetchTranslations(fallbackUrl, true);
            } else {
                // Se o idioma primário é o fallback e falha, define vazio e encerra o loading.
                setTranslations({});
                setIsLoadingTranslations(false);
            }
          } else {
            // Se o fallback também falhar, usa um dicionário vazio e encerra o loading.
            setTranslations({});
            console.error('Falha ao carregar o arquivo de tradução fallback.');
            setIsLoadingTranslations(false);
          }
          return;
        }

        const data: TranslationDictionary = await res.json();
        setTranslations(data);
        // Se a busca foi bem-sucedida, define isLoadingTranslations como false.
        setIsLoadingTranslations(false); 

      } catch (error) {
        console.error('Erro ao buscar o arquivo de tradução:', error);
        setTranslations({});
        // Em caso de erro de rede, etc., garante que o loading seja encerrado.
        setIsLoadingTranslations(false); 
      }
    };

    fetchTranslations(primaryUrl);
  }, []); // Executa apenas uma vez

  /**
   * Função que traduz uma chave (o nome em inglês, ex: "Spain").
   * Se não encontrar no dicionário carregado, retorna a chave original.
   */
  const translate = (key: string): string => {
    // Retorna a tradução se existir, senão retorna a chave original (em inglês)
    return translations[key] || key;
  };

  return { translate, isLoadingTranslations };
}