// app/hooks/usePopupContent.ts
'use client';


import { useState, useEffect, useCallback } from 'react';
import {
  PlaceContent,
  CountryContent,
  ContentType,
  VideoContent,
  // NewsCategoryContent não é estritamente necessário importar aqui
} from '@/app/types/globe'; // Assume que os tipos estão corretos conforme o Canvas


// --- Tipos ---


// Representa o que vem do JSON (com coordenadas)
export type RawPlaceContent = Omit<
  PlaceContent,
  'video' | 'touristVideo' | 'natureVideo'
> & {
  video: string | string[] | null;
  touristVideo?: string | string[] | null; // Tornar opcional se puder faltar no JSON
  natureVideo?: string | string[] | null; // Tornar opcional se puder faltar no JSON
  nativeLanguage?: string;
  currency?: string;
};


export type RawContentDatabase = Record<string, RawPlaceContent>;
export type TranslationDatabase = Record<string, string>; // Exporta para uso em GlobeCanvas
type ContentDatabase = Record<string, ContentType>;


// --- Estado Inicial ---
const initialContent: ContentDatabase = {
  default: {
    latitude: 0,
    longitude: 0,
    news: {},
    video: null,
    touristVideo: null,
    natureVideo: null,
    customs: 'Carregando...',
    routine: 'Carregando...',
  } as PlaceContent, // O tipo base é PlaceContent
};
const initialTranslations: TranslationDatabase = {};


// Função transformVideoString (SEM ALTERAÇÃO - assume que existe e funciona)
const transformVideoString = (
  videoEntry: string | string[] | null | undefined,
): VideoContent | VideoContent[] | null => {
  if (!videoEntry) {
    return null;
  }
  const transformSingleVideo = (videoString: string): VideoContent => {
    const isLocalVideo = videoString.startsWith('/');
    return {
      type: isLocalVideo ? 'video' : 'youtube',
      src: videoString,
      format: isLocalVideo ? 'vertical' : 'horizontal',
    };
  };
  if (Array.isArray(videoEntry)) {
    return videoEntry
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .map(transformSingleVideo);
  }
  return typeof videoEntry === 'string' && videoEntry.length > 0
    ? transformSingleVideo(videoEntry)
    : null;
};


/**
 * Hook para buscar, transformar e fornecer dados de conteúdo e traduções.
 */
export function usePopupContent() {
  const [contentDb, setContentDb] = useState<ContentDatabase>(initialContent);
  const [rawContentData, setRawContentData] =
    useState<RawContentDatabase | null>(null);
  const [translations, setTranslations] =
    useState<TranslationDatabase>(initialTranslations);
  const [isLoading, setIsLoading] = useState(true);


  useEffect(() => {
    let isMounted = true;


    Promise.all([
      // --- CORREÇÃO REMOVIDA (Arquivo 1) ---
      // Removido { cache: 'no-store' }
      fetch(`/data/content.json`).then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      }) as Promise<RawContentDatabase>,


      // --- CORREÇÃO REMOVIDA (Arquivo 2) ---
      // Removido { cache: 'no-store' }
      fetch(`/translations/pt.json`).then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      }) as Promise<TranslationDatabase>,
      // --- FIM DA CORREÇÃO ---
    ])
      .then(([fetchedRawData, translationData]) => {
        if (isMounted) {
          setRawContentData(fetchedRawData);
          setTranslations(translationData);


          // --- Inicia a transformação dos dados brutos ---
          const transformedContentDb: ContentDatabase = {};
          for (const key in fetchedRawData) {
            if (key === 'default') continue;
            const rawEntry = fetchedRawData[key];


            if (
              typeof rawEntry.latitude !== 'number' ||
              typeof rawEntry.longitude !== 'number'
            ) {
              console.warn(
                `Dados inválidos ou ausentes para a chave "${key}": coordenadas faltando.`,
              );
              continue;
            }


            const baseContent: PlaceContent = {
              latitude: rawEntry.latitude,
              longitude: rawEntry.longitude,
              news: rawEntry.news || {},
              customs: rawEntry.customs || '',
              routine: rawEntry.routine || '',
              video: transformVideoString(rawEntry.video),
              touristVideo: transformVideoString(rawEntry.touristVideo),
              natureVideo: transformVideoString(rawEntry.natureVideo),
            };


            if (rawEntry.nativeLanguage && rawEntry.currency) {
              transformedContentDb[key] = {
                ...baseContent,
                nativeLanguage: rawEntry.nativeLanguage,
                currency: rawEntry.currency,
              } as CountryContent;
            } else {
              transformedContentDb[key] = baseContent;
            }
          }
          transformedContentDb.default = initialContent.default;


          setContentDb(transformedContentDb);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error('Falha ao carregar ou processar dados de conteúdo:', error);
        if (isMounted) setIsLoading(false);
      });


    return () => {
      isMounted = false;
    };
  }, []);


  const getContentByNameKey = useCallback(
    (
      nameKey: string | null,
    ): { content: ContentType; displayName: string } => {
      if (isLoading || !nameKey || !contentDb) {
        return {
          content: initialContent.default,
          displayName: 'Carregando...',
        };
      }
      const content = contentDb[nameKey] || initialContent.default;
      const displayName = translations[nameKey] || nameKey;


      return { content, displayName };
    },
    [contentDb, translations, isLoading],
  );


  return { getContentByNameKey, rawContentData, translations, isLoading };
}
