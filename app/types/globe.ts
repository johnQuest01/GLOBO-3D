// app/types/globe.ts

import * as THREE from 'three';

/**
 * Define a estrutura para um local fixado (pino) no globo 3D.
 */
export type PinnedLocation = {
  key: string;
  name: string;
  position: THREE.Vector3;
};

/**
 * Define a estrutura para o conteúdo de vídeo.
 */
export interface VideoContent {
  type: 'youtube' | 'video';
  src: string;
  format: 'horizontal' | 'vertical';
}

// Tipos para o Conteúdo de Notícias por Categoria
export type NewsCategory =
  | 'local'
  | 'science'
  | 'business'
  | 'entertainment'
  | 'sports'
  | 'health';

// Estrutura do conteúdo de uma única notícia
export interface NewsItemContent {
  title: string;
  imageUrl: string;
  imageCaption: string;
  bodyText: string;
}

// Estrutura do campo 'news'
export type NewsCategoryContent = Partial<Record<NewsCategory, NewsItemContent[]>>;

/**
 * Estrutura de conteúdo BASE para o popup (pode ser Estado ou País).
 * Inclui coordenadas geográficas.
 */
export interface PlaceContent {
  latitude: number;
  longitude: number;
  news: NewsCategoryContent;
  video: VideoContent | VideoContent[] | null;
  touristVideo: VideoContent | VideoContent[] | null;
  natureVideo?: VideoContent | VideoContent[] | null;
  customs: string;
  routine: string;
}

/**
 * Estrutura Específica para Conteúdo de PAÍSES (Herda de PlaceContent)
 */
export interface CountryContent extends PlaceContent {
  nativeLanguage: string;
  currency: string;
}

// Tipo de União para facilitar o uso no gancho de dados
export type ContentType = PlaceContent | CountryContent;

// Define os nomes das abas válidas
export type TabName =
  | 'news'
  | 'video'
  | 'customs'
  | 'routine'
  | 'language'
  | 'currency';

// Tipo para Notícias Salvas
export interface SavedNewsItem {
  placeKey: string;
  placeName: string;
  categoryKey: NewsCategory;
  categoryLabel: string;
  article: NewsItemContent;
  savedAt: string; // ISO string data
}

// --- Tipo para Notícias Dinâmicas Globais ---
export interface GlobalNewsItem {
  placeKey: string;
  placeName: string;
  categoryKey: NewsCategory;
  categoryLabel: string;
  article: NewsItemContent;
}

// --- Tipo para Vídeos de Turismo Salvos ---
export interface SavedTouristVideo {
  placeKey: string;
  placeName: string;
  video: VideoContent;
  savedAt: string; // ISO string data
}

// --- Tipo para Locais de Férias Salvos ---
export interface SavedVacationSpot {
  placeKey: string;
  placeName: string;
  savedAt: string; // ISO string data
}

// --- Tipo para Dados de Anúncio ---
export type AdLayer = 'layer3' | 'layer2' | 'layer1';

export interface AdData {
  id: string; // Identificador único
  title: string;
  imageUrl: string; // URL (geralmente object URL)
  layer: AdLayer;
  websiteUrl: string;
  locationKey: string; // CHAVE DO LOCAL
}

// --- Tipo para Mensagens Voadoras ---
export interface FlyingMessage {
  id: string;
  text: string;
  startPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  createdAt: number;
}

// --- CORREÇÃO: AnimationState movido para cá para evitar erro de importação ---
export interface AnimationState {
  'missile-kiev-moscow': boolean;
  'missile-moscow-kiev': boolean;
  'airplane-travel': boolean;
  // Adicione mais chaves aqui conforme necessário
}